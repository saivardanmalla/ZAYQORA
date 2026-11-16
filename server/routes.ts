import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  authenticate,
  enforceTenantAccess,
  optionalAuthenticate,
  recordAuditLog,
  requireRoles,
  signSandboxWebhook,
  signToken,
  verifySandboxWebhook,
  type AuthenticatedRequest,
  type RoleCode,
} from './auth.ts';
import { db } from './db.ts';
import { GeminiServiceError, searchRestaurantSaasTrends } from './gemini.ts';
import { broadcastToOrder, broadcastToPlatformAdmin, broadcastToTenant } from './ws.ts';

export const apiRouter = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again shortly.' },
});

const orderLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Order rate limit reached, please wait a moment.' },
});

// ==========================================
// 1. AUTHENTICATION & DEMO ROLE EXPLORER
// ==========================================

const registerSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(120),
  roleCode: z.enum(['RESTAURANT_OWNER', 'CUSTOMER']).optional().default('CUSTOMER'),
});

apiRouter.post('/auth/register', authLimiter, (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid registration data' });
    return;
  }
  const { fullName, email, password, roleCode } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists' });
    return;
  }

  const userId = crypto.randomUUID();
  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare(
    'INSERT INTO users (id, email, password_hash, full_name, role_code, restaurant_id, email_verified, is_active) VALUES (?, ?, ?, ?, ?, NULL, 0, 1)'
  ).run(userId, normalizedEmail, passwordHash, fullName.trim(), roleCode);

  const claims = {
    userId,
    email: normalizedEmail,
    fullName: fullName.trim(),
    roleCode: roleCode as RoleCode,
    restaurantId: null,
  };
  const token = signToken(claims);
  recordAuditLog({
    actorUserId: userId,
    actorEmail: normalizedEmail,
    actorRole: roleCode,
    action: 'USER_REGISTERED',
    resourceType: 'USER',
    resourceId: userId,
  });

  res.status(201).json({ token, user: { ...claims, emailVerified: false } });
});

apiRouter.post('/auth/verify-email', authenticate, (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(req.user.userId);
  res.json({ verified: true });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

apiRouter.post('/auth/login', authLimiter, (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid email and password are required' });
    return;
  }
  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const user = db
    .prepare('SELECT id, email, password_hash, full_name, role_code, restaurant_id, email_verified, is_active FROM users WHERE email = ?')
    .get(normalizedEmail) as
    | {
        id: string;
        email: string;
        password_hash: string;
        full_name: string;
        role_code: RoleCode;
        restaurant_id: string | null;
        email_verified: number;
        is_active: number;
      }
    | undefined;

  if (!user || !bcrypt.compareSync(parsed.data.password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }
  if (!user.is_active) {
    res.status(403).json({ error: 'Account is suspended' });
    return;
  }

  const claims = {
    userId: user.id,
    email: user.email,
    fullName: user.full_name,
    roleCode: user.role_code,
    restaurantId: user.restaurant_id,
  };
  const token = signToken(claims);
  recordAuditLog({
    restaurantId: user.restaurant_id,
    actorUserId: user.id,
    actorEmail: user.email,
    actorRole: user.role_code,
    action: 'USER_LOGIN',
    resourceType: 'SESSION',
  });
  res.json({ token, user: { ...claims, emailVerified: Boolean(user.email_verified) } });
});

// Explicit demo explorer route that issues a real signed JWT for seeded demo accounts only
apiRouter.post('/auth/demo-login', (req, res) => {
  const schema = z.object({ email: z.string().email() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Demo account email required' });
    return;
  }
  const allowedDemoEmails = [
    'superadmin@vireleo.io',
    'owner@saffronhearth.demo',
    'chef@saffronhearth.demo',
    'manager@saffronhearth.demo',
    'owner@kurorobata.demo',
    'owner@verbenaosteria.demo',
    'customer@zayqora.demo',
  ];
  const email = parsed.data.email.trim().toLowerCase();
  if (!allowedDemoEmails.includes(email)) {
    res.status(403).json({ error: 'Demo quick-explore is restricted to seeded demo personas' });
    return;
  }
  const user = db
    .prepare('SELECT id, email, full_name, role_code, restaurant_id, email_verified FROM users WHERE email = ?')
    .get(email) as
    | {
        id: string;
        email: string;
        full_name: string;
        role_code: RoleCode;
        restaurant_id: string | null;
        email_verified: number;
      }
    | undefined;
  if (!user) {
    res.status(404).json({ error: 'Demo user not found' });
    return;
  }
  const claims = {
    userId: user.id,
    email: user.email,
    fullName: user.full_name,
    roleCode: user.role_code,
    restaurantId: user.restaurant_id,
  };
  const token = signToken(claims);
  res.json({ token, user: { ...claims, emailVerified: Boolean(user.email_verified), isDemoSession: true } });
});

apiRouter.get('/auth/me', authenticate, (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const user = db
    .prepare('SELECT id, email, full_name, role_code, restaurant_id, email_verified FROM users WHERE id = ?')
    .get(req.user.userId) as
    | { id: string; email: string; full_name: string; role_code: RoleCode; restaurant_id: string | null; email_verified: number }
    | undefined;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({
    userId: user.id,
    email: user.email,
    fullName: user.full_name,
    roleCode: user.role_code,
    restaurantId: user.restaurant_id,
    emailVerified: Boolean(user.email_verified),
  });
});

// ==========================================
// 2. ONBOARDING WIZARD (ISOLATED TENANT CREATION)
// ==========================================

const onboardingSchema = z.object({
  ownerName: z.string().min(2).max(120),
  ownerEmail: z.string().email(),
  ownerPassword: z.string().min(8).max(120),
  restaurantName: z.string().min(2).max(120),
  category: z.string().min(2).max(80),
  description: z.string().max(800).optional().default(''),
  address: z.string().min(4).max(240),
  phone: z.string().min(4).max(40),
  logoUrl: z.string().max(400).optional().default(''),
  coverUrl: z.string().max(400).optional().default('/src/assets/images/hero_saffron_hearth_1794828971752.jpg'),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#101D35'),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#0D9488'),
  themeStyle: z.string().default('editorial'),
  openingHours: z.record(z.string(), z.string()),
  deliveryEnabled: z.boolean(),
  pickupEnabled: z.boolean(),
  dineInEnabled: z.boolean(),
  publishNow: z.boolean().default(true),
  initialMenuItems: z
    .array(
      z.object({
        categoryName: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional().default(''),
        priceDollars: z.number().positive(),
        station: z.string().default('MAIN_GRILL'),
      })
    )
    .min(1),
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

apiRouter.post('/onboarding/create-restaurant', (req, res) => {
  const parsed = onboardingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid onboarding payload' });
    return;
  }

  const data = parsed.data;
  const email = data.ownerEmail.trim().toLowerCase();
  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existingUser) {
    res.status(409).json({ error: 'An account with this owner email already exists' });
    return;
  }

  let slug = slugify(data.restaurantName) || 'restaurant';
  const slugConflict = db.prepare('SELECT id FROM restaurants WHERE slug = ?').get(slug);
  if (slugConflict) {
    slug = `${slug}-${crypto.randomBytes(2).toString('hex')}`;
  }

  const restaurantId = crypto.randomUUID();
  const ownerId = crypto.randomUUID();
  const branchId = crypto.randomUUID();
  const passwordHash = bcrypt.hashSync(data.ownerPassword, 10);

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO restaurants (
        id, slug, name, category, description, logo_url, cover_url, primary_color, accent_color, theme_style,
        status, is_published, address, phone, email, social_links_json, gallery_json, opening_hours_json,
        delivery_enabled, pickup_enabled, dine_in_enabled, tax_rate, delivery_fee_cents, is_demo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'TRIAL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.085, 499, 0)`
    ).run(
      restaurantId,
      slug,
      data.restaurantName.trim(),
      data.category.trim(),
      data.description.trim() || `${data.restaurantName.trim()} — crafted with ZAYQORA.`,
      data.logoUrl,
      data.coverUrl || '/src/assets/images/hero_saffron_hearth_1794828971752.jpg',
      data.primaryColor,
      data.accentColor,
      data.themeStyle,
      data.publishNow ? 1 : 0,
      data.address.trim(),
      data.phone.trim(),
      email,
      JSON.stringify({}),
      JSON.stringify([data.coverUrl || '/src/assets/images/hero_saffron_hearth_1794828971752.jpg']),
      JSON.stringify(data.openingHours),
      data.deliveryEnabled ? 1 : 0,
      data.pickupEnabled ? 1 : 0,
      data.dineInEnabled ? 1 : 0
    );

    db.prepare(
      'INSERT INTO users (id, email, password_hash, full_name, role_code, restaurant_id, email_verified, is_active) VALUES (?, ?, ?, ?, ?, ?, 1, 1)'
    ).run(ownerId, email, passwordHash, data.ownerName.trim(), 'RESTAURANT_OWNER', restaurantId);

    db.prepare(
      'INSERT INTO branches (id, restaurant_id, name, address, phone, is_primary, is_active) VALUES (?, ?, ?, ?, ?, 1, 1)'
    ).run(branchId, restaurantId, 'Main Location', data.address.trim(), data.phone.trim());

    db.prepare(
      'INSERT INTO restaurant_settings (id, restaurant_id, auto_accept_orders, kds_sound_enabled, prep_time_minutes, reservation_slot_minutes, payment_region, currency) VALUES (?, ?, 0, 1, 20, 90, ?, ?)'
    ).run(crypto.randomUUID(), restaurantId, 'US', 'USD');

    db.prepare(
      'INSERT INTO staff (id, restaurant_id, user_id, branch_id, full_name, email, role_code, shift_schedule, hourly_rate_cents, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)'
    ).run(crypto.randomUUID(), restaurantId, ownerId, branchId, data.ownerName.trim(), email, 'RESTAURANT_OWNER', 'Owner', 'ACTIVE');

    const periodEnd = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    db.prepare(
      'INSERT INTO subscriptions (id, restaurant_id, plan_code, plan_name, monthly_price_cents, status, current_period_end) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(crypto.randomUUID(), restaurantId, 'GROWTH', 'Growth Kitchen (14-Day Trial)', 14900, 'TRIAL', periodEnd);

    // Default floor tables
    for (let i = 1; i <= 4; i++) {
      db.prepare(
        'INSERT INTO tables (id, restaurant_id, branch_id, table_number, capacity, zone, status, qr_code_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(crypto.randomUUID(), restaurantId, branchId, `T-0${i}`, i % 2 === 0 ? 4 : 2, 'Main Dining', 'AVAILABLE', `qr-${slug}-0${i}`);
    }

    // Categories & items
    const catMap = new Map<string, string>();
    let sort = 1;
    for (const item of data.initialMenuItems) {
      let catId = catMap.get(item.categoryName);
      if (!catId) {
        catId = crypto.randomUUID();
        catMap.set(item.categoryName, catId);
        db.prepare('INSERT INTO menu_categories (id, restaurant_id, name, description, sort_order, is_active) VALUES (?, ?, ?, ?, ?, 1)').run(
          catId,
          restaurantId,
          item.categoryName,
          '',
          sort++
        );
      }
      db.prepare(
        'INSERT INTO menu_items (id, restaurant_id, category_id, name, description, price_cents, image_url, is_available, is_featured, prep_minutes, dietary_tags_json, station) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 15, ?, ?)'
      ).run(
        crypto.randomUUID(),
        restaurantId,
        catId,
        item.name,
        item.description || 'House signature dish',
        Math.round(item.priceDollars * 100),
        '/src/assets/images/dish_signature_plate_1794828971889.jpg',
        JSON.stringify([]),
        item.station
      );
    }
  });

  tx();

  const claims = {
    userId: ownerId,
    email,
    fullName: data.ownerName.trim(),
    roleCode: 'RESTAURANT_OWNER' as RoleCode,
    restaurantId,
  };
  const token = signToken(claims);

  recordAuditLog({
    restaurantId,
    actorUserId: ownerId,
    actorEmail: email,
    actorRole: 'RESTAURANT_OWNER',
    action: 'RESTAURANT_ONBOARDED',
    resourceType: 'RESTAURANT',
    resourceId: restaurantId,
    metadata: { slug, name: data.restaurantName },
  });
  broadcastToPlatformAdmin('tenant:created', { restaurantId, slug, name: data.restaurantName });

  res.status(201).json({
    token,
    user: { ...claims, emailVerified: true },
    restaurant: { id: restaurantId, slug, name: data.restaurantName },
  });
});

// ==========================================
// 3. PUBLIC STOREFRONTS, ORDERING & RESERVATIONS
// ==========================================

apiRouter.get('/public/restaurants', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, slug, name, category, description, cover_url, primary_color, accent_color, address,
              delivery_enabled, pickup_enabled, dine_in_enabled, is_demo, status
       FROM restaurants
       WHERE is_published = 1 AND status != 'SUSPENDED'
       ORDER BY is_demo DESC, created_at DESC`
    )
    .all();
  res.json({ restaurants: rows });
});

apiRouter.get('/public/restaurants/:slug', (req, res) => {
  const restaurant = db.prepare('SELECT * FROM restaurants WHERE slug = ?').get(req.params.slug) as Record<string, unknown> | undefined;
  if (!restaurant || restaurant.status === 'SUSPENDED') {
    res.status(404).json({ error: 'Restaurant storefront not found or unavailable' });
    return;
  }

  const restaurantId = restaurant.id as string;
  const categories = db
    .prepare('SELECT * FROM menu_categories WHERE restaurant_id = ? AND is_active = 1 ORDER BY sort_order ASC')
    .all(restaurantId);
  const items = db.prepare('SELECT * FROM menu_items WHERE restaurant_id = ?').all(restaurantId) as Array<Record<string, unknown>>;
  const variants = db.prepare('SELECT * FROM variants WHERE restaurant_id = ?').all(restaurantId) as Array<Record<string, unknown>>;
  const modifiers = db.prepare('SELECT * FROM modifiers WHERE restaurant_id = ?').all(restaurantId) as Array<Record<string, unknown>>;
  const coupons = db
    .prepare('SELECT code, description, discount_type, discount_value, min_order_cents FROM coupons WHERE restaurant_id = ? AND is_active = 1')
    .all(restaurantId);

  const enrichedItems = items.map((item) => ({
    ...item,
    dietary_tags: JSON.parse((item.dietary_tags_json as string) || '[]'),
    variants: variants.filter((v) => v.menu_item_id === item.id),
    modifiers: modifiers.filter((m) => m.menu_item_id === item.id),
  }));

  res.json({
    restaurant: {
      ...restaurant,
      social_links: JSON.parse((restaurant.social_links_json as string) || '{}'),
      gallery: JSON.parse((restaurant.gallery_json as string) || '[]'),
      opening_hours: JSON.parse((restaurant.opening_hours_json as string) || '{}'),
      sections_config: JSON.parse(
        (restaurant.sections_config_json as string) ||
          '{"showFeatured":true,"showStory":true,"showGallery":true,"showReviews":true,"showOffers":true}'
      ),
    },
    categories,
    items: enrichedItems,
    promotions: coupons,
  });
});

apiRouter.post('/public/restaurants/:slug/validate-coupon', (req, res) => {
  const schema = z.object({
    code: z.string().min(1).max(40),
    subtotalCents: z.number().int().min(0),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid coupon request' });
    return;
  }
  const restaurant = db.prepare('SELECT id FROM restaurants WHERE slug = ?').get(req.params.slug) as { id: string } | undefined;
  if (!restaurant) {
    res.status(404).json({ error: 'Restaurant not found' });
    return;
  }
  const code = parsed.data.code.trim().toUpperCase();
  const coupon = db
    .prepare('SELECT * FROM coupons WHERE restaurant_id = ? AND code = ? AND is_active = 1')
    .get(restaurant.id, code) as Record<string, unknown> | undefined;
  if (!coupon) {
    res.status(400).json({ error: `Coupon "${code}" is invalid or inactive` });
    return;
  }
  if (parsed.data.subtotalCents < (coupon.min_order_cents as number)) {
    res.status(400).json({
      error: `Minimum order of $${((coupon.min_order_cents as number) / 100).toFixed(2)} required for ${code}`,
    });
    return;
  }
  const discountCents =
    coupon.discount_type === 'PERCENT'
      ? Math.round((parsed.data.subtotalCents * (coupon.discount_value as number)) / 100)
      : Math.min(parsed.data.subtotalCents, coupon.discount_value as number);
  res.json({ valid: true, code, discountCents, description: coupon.description });
});

const placeOrderSchema = z.object({
  idempotencyKey: z.string().min(8).max(120),
  orderType: z.enum(['DELIVERY', 'PICKUP', 'DINE_IN']),
  tableNumber: z.string().max(30).optional().default(''),
  customerName: z.string().min(2).max(120),
  customerEmail: z.string().email(),
  customerPhone: z.string().min(5).max(40),
  deliveryAddress: z.string().max(300).optional().default(''),
  couponCode: z.string().max(40).optional().default(''),
  paymentMethod: z.enum(['CARD_SANDBOX', 'PAY_AT_VENUE']).default('CARD_SANDBOX'),
  items: z
    .array(
      z.object({
        menuItemId: z.string().uuid(),
        variantId: z.string().uuid().optional().nullable(),
        modifierIds: z.array(z.string().uuid()).optional().default([]),
        quantity: z.number().int().min(1).max(30),
        specialInstructions: z.string().max(240).optional().default(''),
      })
    )
    .min(1),
});

apiRouter.post('/public/restaurants/:slug/orders', orderLimiter, optionalAuthenticate, (req: AuthenticatedRequest, res) => {
  const parsed = placeOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid order payload' });
    return;
  }

  const restaurant = db.prepare('SELECT * FROM restaurants WHERE slug = ?').get(req.params.slug) as Record<string, unknown> | undefined;
  if (!restaurant || restaurant.status === 'SUSPENDED') {
    res.status(404).json({ error: 'Restaurant not accepting orders' });
    return;
  }

  const restaurantId = restaurant.id as string;
  const input = parsed.data;

  // Idempotency check
  const existingOrder = db
    .prepare('SELECT * FROM orders WHERE restaurant_id = ? AND idempotency_key = ?')
    .get(restaurantId, input.idempotencyKey) as Record<string, unknown> | undefined;

  if (existingOrder) {
    const existingItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(existingOrder.id as string);
    const existingPayment = db.prepare('SELECT * FROM payments WHERE order_id = ?').get(existingOrder.id as string);
    res.status(200).json({ order: existingOrder, items: existingItems, payment: existingPayment, deduplicated: true });
    return;
  }

  if (input.orderType === 'DELIVERY' && !restaurant.delivery_enabled) {
    res.status(400).json({ error: 'Delivery is currently disabled for this restaurant' });
    return;
  }
  if (input.orderType === 'DELIVERY' && input.deliveryAddress.trim().length < 5) {
    res.status(400).json({ error: 'Delivery address is required for delivery orders' });
    return;
  }

  // Server-authoritative pricing computation
  let subtotalCents = 0;
  const resolvedItems: Array<{
    menuItemId: string;
    itemName: string;
    variantName: string;
    modifiers: string[];
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
    specialInstructions: string;
    station: string;
  }> = [];

  for (const line of input.items) {
    const menuItem = db
      .prepare('SELECT * FROM menu_items WHERE id = ? AND restaurant_id = ?')
      .get(line.menuItemId, restaurantId) as Record<string, unknown> | undefined;
    if (!menuItem || !menuItem.is_available) {
      res.status(400).json({ error: 'One or more menu items are unavailable' });
      return;
    }

    let unitPrice = menuItem.price_cents as number;
    let variantName = '';
    if (line.variantId) {
      const variant = db
        .prepare('SELECT * FROM variants WHERE id = ? AND menu_item_id = ? AND restaurant_id = ?')
        .get(line.variantId, line.menuItemId, restaurantId) as Record<string, unknown> | undefined;
      if (!variant) {
        res.status(400).json({ error: `Invalid variant selection for ${menuItem.name}` });
        return;
      }
      unitPrice += variant.price_delta_cents as number;
      variantName = variant.name as string;
    }

    const modifierNames: string[] = [];
    for (const modId of line.modifierIds) {
      const mod = db
        .prepare('SELECT * FROM modifiers WHERE id = ? AND menu_item_id = ? AND restaurant_id = ?')
        .get(modId, line.menuItemId, restaurantId) as Record<string, unknown> | undefined;
      if (!mod) {
        res.status(400).json({ error: `Invalid add-on selection for ${menuItem.name}` });
        return;
      }
      unitPrice += mod.price_cents as number;
      modifierNames.push(mod.name as string);
    }

    const lineTotal = unitPrice * line.quantity;
    subtotalCents += lineTotal;
    resolvedItems.push({
      menuItemId: line.menuItemId,
      itemName: menuItem.name as string,
      variantName,
      modifiers: modifierNames,
      quantity: line.quantity,
      unitPriceCents: unitPrice,
      lineTotalCents: lineTotal,
      specialInstructions: line.specialInstructions,
      station: (menuItem.station as string) || 'MAIN_GRILL',
    });
  }

  let discountCents = 0;
  let appliedCoupon = '';
  if (input.couponCode.trim()) {
    const code = input.couponCode.trim().toUpperCase();
    const coupon = db
      .prepare('SELECT * FROM coupons WHERE restaurant_id = ? AND code = ? AND is_active = 1')
      .get(restaurantId, code) as Record<string, unknown> | undefined;
    if (!coupon) {
      res.status(400).json({ error: `Coupon "${code}" is invalid or inactive` });
      return;
    }
    if (subtotalCents < (coupon.min_order_cents as number)) {
      res.status(400).json({ error: `Coupon "${code}" requires a minimum order of $${((coupon.min_order_cents as number) / 100).toFixed(2)}` });
      return;
    }
    appliedCoupon = code;
    if (coupon.discount_type === 'PERCENT') {
      discountCents = Math.round((subtotalCents * (coupon.discount_value as number)) / 100);
    } else {
      discountCents = Math.min(subtotalCents, coupon.discount_value as number);
    }
  }

  const discountedSubtotal = Math.max(0, subtotalCents - discountCents);
  const taxCents = Math.round(discountedSubtotal * (restaurant.tax_rate as number));
  const deliveryFeeCents = input.orderType === 'DELIVERY' ? (restaurant.delivery_fee_cents as number) : 0;
  const totalCents = discountedSubtotal + taxCents + deliveryFeeCents;

  const orderId = crypto.randomUUID();
  const orderNumber = `ZQ-${Math.floor(1050 + Math.random() * 8900)}`;
  const paymentId = crypto.randomUUID();
  const providerRef = `sbx_intent_${crypto.randomBytes(6).toString('hex')}`;
  const isPayAtVenue = input.paymentMethod === 'PAY_AT_VENUE';
  const initialOrderStatus = isPayAtVenue ? 'CONFIRMED' : 'PENDING';
  const initialPaymentStatus = isPayAtVenue ? 'PENDING' : 'INITIATED';

  const branch = db.prepare('SELECT id FROM branches WHERE restaurant_id = ? AND is_primary = 1 LIMIT 1').get(restaurantId) as
    | { id: string }
    | undefined;

  const tx = db.transaction(() => {
    // Upsert customer record scoped to tenant
    let customer = db
      .prepare('SELECT id FROM customers WHERE restaurant_id = ? AND email = ?')
      .get(restaurantId, input.customerEmail.toLowerCase()) as { id: string } | undefined;

    if (!customer) {
      const newCustId = crypto.randomUUID();
      db.prepare(
        'INSERT INTO customers (id, restaurant_id, user_id, name, email, phone, total_orders, total_spent_cents, loyalty_points) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)'
      ).run(
        newCustId,
        restaurantId,
        req.user?.userId ?? null,
        input.customerName,
        input.customerEmail.toLowerCase(),
        input.customerPhone,
        totalCents,
        Math.floor(totalCents / 100)
      );
      customer = { id: newCustId };
    } else {
      db.prepare(
        'UPDATE customers SET total_orders = total_orders + 1, total_spent_cents = total_spent_cents + ?, loyalty_points = loyalty_points + ? WHERE id = ?'
      ).run(totalCents, Math.floor(totalCents / 100), customer.id);
    }

    db.prepare(
      `INSERT INTO orders (
        id, restaurant_id, branch_id, order_number, customer_id, customer_name, customer_email, customer_phone,
        delivery_address, order_type, table_number, status, subtotal_cents, discount_cents, tax_cents, delivery_fee_cents,
        total_cents, coupon_code, payment_status, payment_method, idempotency_key, is_demo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    ).run(
      orderId,
      restaurantId,
      branch?.id ?? null,
      orderNumber,
      customer.id,
      input.customerName,
      input.customerEmail.toLowerCase(),
      input.customerPhone,
      input.deliveryAddress,
      input.orderType,
      input.tableNumber,
      initialOrderStatus,
      subtotalCents,
      discountCents,
      taxCents,
      deliveryFeeCents,
      totalCents,
      appliedCoupon,
      isPayAtVenue ? 'PENDING' : 'PENDING',
      input.paymentMethod,
      input.idempotencyKey
    );

    const insItem = db.prepare(
      `INSERT INTO order_items (id, order_id, restaurant_id, menu_item_id, item_name, variant_name, modifiers_json, quantity, unit_price_cents, line_total_cents, special_instructions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const ri of resolvedItems) {
      insItem.run(
        crypto.randomUUID(),
        orderId,
        restaurantId,
        ri.menuItemId,
        ri.itemName,
        ri.variantName,
        JSON.stringify(ri.modifiers),
        ri.quantity,
        ri.unitPriceCents,
        ri.lineTotalCents,
        ri.specialInstructions
      );
    }

    if (appliedCoupon) {
      db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE restaurant_id = ? AND code = ?').run(restaurantId, appliedCoupon);
    }

    db.prepare(
      `INSERT INTO payments (id, restaurant_id, order_id, provider, provider_ref, amount_cents, currency, status, webhook_verified)
       VALUES (?, ?, ?, 'ZAYQORA_SANDBOX_PAY', ?, ?, 'USD', ?, 0)`
    ).run(paymentId, restaurantId, orderId, providerRef, totalCents, initialPaymentStatus);

    if (isPayAtVenue) {
      db.prepare(
        'INSERT INTO kitchen_tickets (id, restaurant_id, order_id, order_number, station, status) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(crypto.randomUUID(), restaurantId, orderId, orderNumber, resolvedItems[0].station, 'NEW');
    }

    db.prepare('INSERT INTO notifications (id, restaurant_id, user_id, title, message, type) VALUES (?, ?, NULL, ?, ?, ?)').run(
      crypto.randomUUID(),
      restaurantId,
      `New ${input.orderType} Order ${orderNumber}`,
      `${input.customerName} placed an order totaling $${(totalCents / 100).toFixed(2)}.`,
      'ORDER'
    );
  });

  tx();

  const createdOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  const createdItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  const createdPayment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId) as Record<string, unknown>;

  // Generate HMAC sandbox signature token for the client to complete sandbox authorization
  const sandboxWebhookPayload = JSON.stringify({ paymentId, orderId, providerRef, amountCents: totalCents });
  const sandboxSignature = signSandboxWebhook(sandboxWebhookPayload);

  if (isPayAtVenue) {
    broadcastToTenant(restaurantId, 'order:created', { order: createdOrder, items: createdItems });
  }

  res.status(201).json({
    order: createdOrder,
    items: createdItems,
    payment: createdPayment,
    sandboxVerification: {
      paymentId,
      providerRef,
      payload: sandboxWebhookPayload,
      signature: sandboxSignature,
    },
  });
});

// Sandbox payment webhook confirmation — never marks PAID without verified HMAC signature
apiRouter.post('/payments/sandbox/confirm', (req, res) => {
  const schema = z.object({
    payload: z.string(),
    signature: z.string(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid webhook confirmation request' });
    return;
  }

  if (!verifySandboxWebhook(parsed.data.payload, parsed.data.signature)) {
    res.status(401).json({ error: 'Invalid payment webhook HMAC signature' });
    return;
  }

  const data = JSON.parse(parsed.data.payload) as { paymentId: string; orderId: string; providerRef: string };
  const payment = db.prepare('SELECT * FROM payments WHERE id = ? AND order_id = ?').get(data.paymentId, data.orderId) as
    | Record<string, unknown>
    | undefined;
  if (!payment) {
    res.status(404).json({ error: 'Payment record not found' });
    return;
  }

  const restaurantId = payment.restaurant_id as string;

  const tx = db.transaction(() => {
    db.prepare("UPDATE payments SET status = 'CONFIRMED', webhook_verified = 1 WHERE id = ?").run(data.paymentId);
    db.prepare("UPDATE orders SET payment_status = 'PAID', status = 'CONFIRMED' WHERE id = ? AND status = 'PENDING'").run(data.orderId);

    const existingTicket = db.prepare('SELECT id FROM kitchen_tickets WHERE order_id = ?').get(data.orderId);
    if (!existingTicket) {
      const order = db.prepare('SELECT order_number FROM orders WHERE id = ?').get(data.orderId) as { order_number: string };
      const firstItem = db.prepare('SELECT menu_item_id FROM order_items WHERE order_id = ? LIMIT 1').get(data.orderId) as
        | { menu_item_id: string }
        | undefined;
      const menuItem = firstItem
        ? (db.prepare('SELECT station FROM menu_items WHERE id = ?').get(firstItem.menu_item_id) as { station: string } | undefined)
        : undefined;

      db.prepare(
        'INSERT INTO kitchen_tickets (id, restaurant_id, order_id, order_number, station, status) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(crypto.randomUUID(), restaurantId, data.orderId, order.order_number, menuItem?.station || 'MAIN_GRILL', 'NEW');
    }
  });

  tx();

  const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(data.orderId);
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(data.orderId);
  const ticket = db.prepare('SELECT * FROM kitchen_tickets WHERE order_id = ?').get(data.orderId);

  broadcastToTenant(restaurantId, 'order:created', { order: updatedOrder, items, ticket });
  broadcastToOrder(data.orderId, 'order:updated', { order: updatedOrder, ticket });

  res.json({ verified: true, order: updatedOrder, ticket });
});

apiRouter.get('/public/restaurants/:slug/orders/:orderId', (req, res) => {
  const restaurant = db.prepare('SELECT id, name, slug FROM restaurants WHERE slug = ?').get(req.params.slug) as
    | { id: string; name: string; slug: string }
    | undefined;
  if (!restaurant) {
    res.status(404).json({ error: 'Restaurant not found' });
    return;
  }
  const order = db
    .prepare('SELECT * FROM orders WHERE id = ? AND restaurant_id = ?')
    .get(req.params.orderId, restaurant.id) as Record<string, unknown> | undefined;
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(req.params.orderId);
  const ticket = db.prepare('SELECT * FROM kitchen_tickets WHERE order_id = ?').get(req.params.orderId);
  res.json({ order, items, ticket, restaurant });
});

apiRouter.get('/public/customer/orders', authenticate, (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const orders = db
    .prepare(
      `SELECT o.*, r.name as restaurant_name, r.slug as restaurant_slug
       FROM orders o
       JOIN restaurants r ON r.id = o.restaurant_id
       WHERE o.customer_email = ?
       ORDER BY o.created_at DESC
       LIMIT 30`
    )
    .all(req.user.email.toLowerCase());
  res.json({ orders });
});

// Reservations availability & transaction-safe booking
const TIME_SLOTS = ['12:00', '13:30', '17:30', '18:30', '19:30', '20:30', '21:30'];

apiRouter.get('/public/restaurants/:slug/reservations/availability', (req, res) => {
  const date = String(req.query.date || new Date().toISOString().slice(0, 10));
  const partySize = Math.max(1, Number(req.query.partySize || 2));

  const restaurant = db.prepare('SELECT id FROM restaurants WHERE slug = ?').get(req.params.slug) as { id: string } | undefined;
  if (!restaurant) {
    res.status(404).json({ error: 'Restaurant not found' });
    return;
  }

  const candidateTables = db
    .prepare('SELECT id, table_number, capacity FROM tables WHERE restaurant_id = ? AND capacity >= ? ORDER BY capacity ASC')
    .all(restaurant.id, partySize) as Array<{ id: string; table_number: string; capacity: number }>;

  const booked = db
    .prepare(
      "SELECT table_id, time_slot FROM reservations WHERE restaurant_id = ? AND reservation_date = ? AND status IN ('CONFIRMED', 'SEATED')"
    )
    .all(restaurant.id, date) as Array<{ table_id: string; time_slot: string }>;

  const slots = TIME_SLOTS.map((slot) => {
    const bookedTableIds = new Set(booked.filter((b) => b.time_slot === slot).map((b) => b.table_id));
    const availableTables = candidateTables.filter((t) => !bookedTableIds.has(t.id));
    return {
      timeSlot: slot,
      available: availableTables.length > 0,
      remainingTables: availableTables.length,
    };
  });

  res.json({ date, partySize, slots });
});

const reservationSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeSlot: z.string().min(4).max(10),
  partySize: z.number().int().min(1).max(16),
  customerName: z.string().min(2).max(120),
  customerEmail: z.string().email(),
  customerPhone: z.string().min(5).max(40),
  notes: z.string().max(300).optional().default(''),
});

apiRouter.post('/public/restaurants/:slug/reservations', (req, res) => {
  const parsed = reservationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid reservation request' });
    return;
  }

  const restaurant = db.prepare('SELECT id, name FROM restaurants WHERE slug = ?').get(req.params.slug) as
    | { id: string; name: string }
    | undefined;
  if (!restaurant) {
    res.status(404).json({ error: 'Restaurant not found' });
    return;
  }

  const input = parsed.data;
  const reservationId = crypto.randomUUID();

  try {
    const assignedTable = db.transaction(() => {
      // Transaction-safe capacity & double-booking check
      const tables = db
        .prepare('SELECT id, table_number, capacity FROM tables WHERE restaurant_id = ? AND capacity >= ? ORDER BY capacity ASC')
        .all(restaurant.id, input.partySize) as Array<{ id: string; table_number: string; capacity: number }>;

      if (tables.length === 0) {
        throw new Error('NO_CAPACITY');
      }

      const booked = db
        .prepare(
          "SELECT table_id FROM reservations WHERE restaurant_id = ? AND reservation_date = ? AND time_slot = ? AND status IN ('CONFIRMED', 'SEATED')"
        )
        .all(restaurant.id, input.date, input.timeSlot) as Array<{ table_id: string }>;
      const bookedSet = new Set(booked.map((b) => b.table_id));

      const freeTable = tables.find((t) => !bookedSet.has(t.id));
      if (!freeTable) {
        throw new Error('SLOT_FULL');
      }

      db.prepare(
        `INSERT INTO reservations (id, restaurant_id, table_id, customer_name, customer_email, customer_phone, reservation_date, time_slot, party_size, status, notes, is_demo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, 0)`
      ).run(
        reservationId,
        restaurant.id,
        freeTable.id,
        input.customerName,
        input.customerEmail.toLowerCase(),
        input.customerPhone,
        input.date,
        input.timeSlot,
        input.partySize,
        input.notes
      );

      db.prepare('INSERT INTO notifications (id, restaurant_id, user_id, title, message, type) VALUES (?, ?, NULL, ?, ?, ?)').run(
        crypto.randomUUID(),
        restaurant.id,
        `New Reservation — ${input.partySize} Guests`,
        `${input.customerName} booked ${freeTable.table_number} on ${input.date} at ${input.timeSlot}.`,
        'RESERVATION'
      );

      return freeTable;
    })();

    const created = db.prepare('SELECT * FROM reservations WHERE id = ?').get(reservationId);
    broadcastToTenant(restaurant.id, 'reservation:created', { reservation: created, table: assignedTable });
    res.status(201).json({ reservation: created, assignedTable });
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    if (code === 'NO_CAPACITY') {
      res.status(409).json({ error: `No single table accommodates ${input.partySize} guests at this venue.` });
      return;
    }
    if (code === 'SLOT_FULL') {
      res.status(409).json({ error: `All suitable tables are already reserved for ${input.date} at ${input.timeSlot}.` });
      return;
    }
    res.status(500).json({ error: 'Unable to complete reservation' });
  }
});

// ==========================================
// 4. RESTAURANT OWNER & STAFF DASHBOARD APIs
// ==========================================

const DASHBOARD_ROLES: RoleCode[] = [
  'PLATFORM_SUPER_ADMIN',
  'RESTAURANT_OWNER',
  'RESTAURANT_MANAGER',
  'CASHIER',
  'CHEF',
  'WAITER',
  'DELIVERY_RIDER',
  'ACCOUNTANT',
];

apiRouter.get('/dashboard/:restaurantId/workspace', authenticate, requireRoles(...DASHBOARD_ROLES), (req: AuthenticatedRequest, res) => {
  const restaurantId = String(req.params.restaurantId);
  if (!enforceTenantAccess(req, res, restaurantId)) return;

  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurantId) as Record<string, unknown> | undefined;
  if (!restaurant) {
    res.status(404).json({ error: 'Restaurant not found' });
    return;
  }

  const settings = db.prepare('SELECT * FROM restaurant_settings WHERE restaurant_id = ?').get(restaurantId);
  const branches = db.prepare('SELECT * FROM branches WHERE restaurant_id = ?').all(restaurantId);
  const subscription = db.prepare('SELECT * FROM subscriptions WHERE restaurant_id = ?').get(restaurantId);
  const orders = db.prepare('SELECT * FROM orders WHERE restaurant_id = ? ORDER BY created_at DESC LIMIT 100').all(restaurantId) as Array<
    Record<string, unknown>
  >;
  const orderItems = db.prepare('SELECT * FROM order_items WHERE restaurant_id = ?').all(restaurantId) as Array<Record<string, unknown>>;
  const categories = db.prepare('SELECT * FROM menu_categories WHERE restaurant_id = ? ORDER BY sort_order ASC').all(restaurantId);
  const menuItems = db.prepare('SELECT * FROM menu_items WHERE restaurant_id = ?').all(restaurantId) as Array<Record<string, unknown>>;
  const variants = db.prepare('SELECT * FROM variants WHERE restaurant_id = ?').all(restaurantId);
  const modifiers = db.prepare('SELECT * FROM modifiers WHERE restaurant_id = ?').all(restaurantId);
  const reservations = db
    .prepare(
      `SELECT r.*, t.table_number FROM reservations r LEFT JOIN tables t ON t.id = r.table_id WHERE r.restaurant_id = ? ORDER BY r.reservation_date DESC, r.time_slot ASC`
    )
    .all(restaurantId);
  const tables = db.prepare('SELECT * FROM tables WHERE restaurant_id = ? ORDER BY table_number ASC').all(restaurantId);
  const customers = db.prepare('SELECT * FROM customers WHERE restaurant_id = ? ORDER BY total_spent_cents DESC').all(restaurantId);
  const staff = db.prepare('SELECT * FROM staff WHERE restaurant_id = ? ORDER BY created_at ASC').all(restaurantId);
  const inventory = db.prepare('SELECT * FROM inventory WHERE restaurant_id = ? ORDER BY item_name ASC').all(restaurantId);
  const coupons = db.prepare('SELECT * FROM coupons WHERE restaurant_id = ?').all(restaurantId);
  const tickets = db.prepare('SELECT * FROM kitchen_tickets WHERE restaurant_id = ? ORDER BY created_at DESC').all(restaurantId);
  const notifications = db.prepare('SELECT * FROM notifications WHERE restaurant_id = ? ORDER BY created_at DESC LIMIT 25').all(restaurantId);

  const enrichedOrders = orders.map((o) => ({
    ...o,
    items: orderItems.filter((oi) => oi.order_id === o.id),
  }));

  // Compute KPI metrics
  const validOrders = orders.filter((o) => o.status !== 'CANCELLED');
  const totalRevenueCents = validOrders.reduce((acc, o) => acc + (o.total_cents as number), 0);
  const pendingOrders = orders.filter((o) => ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'].includes(o.status as string)).length;
  const completedOrders = orders.filter((o) => o.status === 'COMPLETED').length;
  const avgOrderValueCents = validOrders.length ? Math.round(totalRevenueCents / validOrders.length) : 0;

  // Top selling items
  const itemTallies = new Map<string, { name: string; count: number; revenueCents: number }>();
  for (const oi of orderItems) {
    const key = oi.item_name as string;
    const prev = itemTallies.get(key) || { name: key, count: 0, revenueCents: 0 };
    prev.count += oi.quantity as number;
    prev.revenueCents += oi.line_total_cents as number;
    itemTallies.set(key, prev);
  }
  const topSellingItems = Array.from(itemTallies.values()).sort((a, b) => b.count - a.count).slice(0, 5);

  // Order status distribution & chronological revenue trend from persisted orders
  const statusMap = new Map<string, number>();
  for (const st of ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED']) {
    statusMap.set(st, 0);
  }
  for (const o of orders) {
    const st = o.status as string;
    statusMap.set(st, (statusMap.get(st) || 0) + 1);
  }
  const orderStatusDistribution = Array.from(statusMap.entries())
    .map(([status, count]) => ({ status, count }))
    .filter((entry) => entry.count > 0);

  const trendMap = new Map<string, { label: string; revenue: number; orders: number }>();
  for (const o of [...orders].reverse()) {
    if (o.status === 'CANCELLED') continue;
    const d = new Date(o.created_at as string);
    const label = Number.isNaN(d.getTime())
      ? 'Today'
      : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const prev = trendMap.get(label) || { label, revenue: 0, orders: 0 };
    prev.revenue = Number((prev.revenue + (o.total_cents as number) / 100).toFixed(2));
    prev.orders += 1;
    trendMap.set(label, prev);
  }
  const revenueTrend = Array.from(trendMap.values());

  const availableRestaurants =
    req.user?.roleCode === 'PLATFORM_SUPER_ADMIN'
      ? db.prepare('SELECT id, name, slug, category, status FROM restaurants ORDER BY name ASC').all()
      : db.prepare('SELECT id, name, slug, category, status FROM restaurants WHERE id = ?').all(restaurantId);

  res.json({
    restaurant: {
      ...restaurant,
      social_links: JSON.parse((restaurant.social_links_json as string) || '{}'),
      gallery: JSON.parse((restaurant.gallery_json as string) || '[]'),
      opening_hours: JSON.parse((restaurant.opening_hours_json as string) || '{}'),
      sections_config: JSON.parse(
        (restaurant.sections_config_json as string) ||
          '{"showFeatured":true,"showStory":true,"showGallery":true,"showReviews":true,"showOffers":true}'
      ),
    },
    availableRestaurants,
    settings,
    branches,
    subscription,
    kpis: {
      totalOrders: orders.length,
      todayRevenueCents: totalRevenueCents,
      pendingOrders,
      completedOrders,
      totalCustomers: customers.length,
      avgOrderValueCents,
      upcomingReservations: reservations.filter((r) => (r as Record<string, unknown>).status === 'CONFIRMED').length,
      topSellingItems,
    },
    orderStatusDistribution,
    revenueTrend,
    orders: enrichedOrders,
    categories,
    menuItems: menuItems.map((m) => ({
      ...m,
      dietary_tags: JSON.parse((m.dietary_tags_json as string) || '[]'),
      variants: variants.filter((v) => (v as Record<string, unknown>).menu_item_id === m.id),
      modifiers: modifiers.filter((mod) => (mod as Record<string, unknown>).menu_item_id === m.id),
    })),
    reservations,
    tables,
    customers,
    staff,
    inventory,
    coupons,
    tickets,
    notifications,
  });
});

apiRouter.patch(
  '/dashboard/:restaurantId/notifications/read-all',
  authenticate,
  requireRoles(...DASHBOARD_ROLES),
  (req: AuthenticatedRequest, res) => {
    const restaurantId = String(req.params.restaurantId);
    if (!enforceTenantAccess(req, res, restaurantId)) return;
    db.prepare('UPDATE notifications SET is_read = 1 WHERE restaurant_id = ?').run(restaurantId);
    res.json({ ok: true });
  }
);

// Update order status
apiRouter.patch(
  '/dashboard/:restaurantId/orders/:orderId/status',
  authenticate,
  requireRoles('PLATFORM_SUPER_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_MANAGER', 'CASHIER', 'CHEF', 'WAITER', 'DELIVERY_RIDER'),
  (req: AuthenticatedRequest, res) => {
    const restaurantId = String(req.params.restaurantId);
    if (!enforceTenantAccess(req, res, restaurantId)) return;

    const schema = z.object({ status: z.enum(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED']) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND restaurant_id = ?').get(req.params.orderId, restaurantId);
    if (!order) {
      res.status(404).json({ error: 'Order not found in tenant' });
      return;
    }

    db.prepare('UPDATE orders SET status = ? WHERE id = ? AND restaurant_id = ?').run(parsed.data.status, req.params.orderId, restaurantId);

    // Sync KDS ticket status
    const kdsMap: Record<string, string> = {
      CONFIRMED: 'NEW',
      PREPARING: 'PREPARING',
      READY: 'READY',
      COMPLETED: 'SERVED',
    };
    if (kdsMap[parsed.data.status]) {
      db.prepare('UPDATE kitchen_tickets SET status = ? WHERE order_id = ? AND restaurant_id = ?').run(
        kdsMap[parsed.data.status],
        req.params.orderId,
        restaurantId
      );
    }

    const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.orderId);
    const ticket = db.prepare('SELECT * FROM kitchen_tickets WHERE order_id = ?').get(req.params.orderId);
    broadcastToTenant(restaurantId, 'order:updated', { order: updatedOrder, ticket });
    broadcastToOrder(String(req.params.orderId), 'order:updated', { order: updatedOrder, ticket });

    recordAuditLog({
      restaurantId,
      actorUserId: req.user?.userId,
      actorEmail: req.user?.email || '',
      actorRole: req.user?.roleCode || '',
      action: 'ORDER_STATUS_UPDATED',
      resourceType: 'ORDER',
      resourceId: String(req.params.orderId),
      metadata: { status: parsed.data.status },
    });

    res.json({ order: updatedOrder, ticket });
  }
);

// Menu item CRUD
apiRouter.post(
  '/dashboard/:restaurantId/menu/items',
  authenticate,
  requireRoles('PLATFORM_SUPER_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_MANAGER'),
  (req: AuthenticatedRequest, res) => {
    const restaurantId = String(req.params.restaurantId);
    if (!enforceTenantAccess(req, res, restaurantId)) return;

    const schema = z.object({
      categoryId: z.string().uuid(),
      name: z.string().min(2).max(120),
      description: z.string().max(400).optional().default(''),
      priceDollars: z.number().positive(),
      imageUrl: z.string().optional().default('/src/assets/images/dish_signature_plate_1794828971889.jpg'),
      prepMinutes: z.number().int().min(1).max(120).default(15),
      station: z.string().default('MAIN_GRILL'),
      isFeatured: z.boolean().default(false),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid menu item' });
      return;
    }

    const itemId = crypto.randomUUID();
    db.prepare(
      'INSERT INTO menu_items (id, restaurant_id, category_id, name, description, price_cents, image_url, is_available, is_featured, prep_minutes, dietary_tags_json, station) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)'
    ).run(
      itemId,
      restaurantId,
      parsed.data.categoryId,
      parsed.data.name,
      parsed.data.description,
      Math.round(parsed.data.priceDollars * 100),
      parsed.data.imageUrl,
      parsed.data.isFeatured ? 1 : 0,
      parsed.data.prepMinutes,
      JSON.stringify([]),
      parsed.data.station
    );
    const created = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(itemId);
    res.status(201).json({ item: created });
  }
);

apiRouter.patch(
  '/dashboard/:restaurantId/menu/items/:itemId/toggle',
  authenticate,
  requireRoles('PLATFORM_SUPER_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_MANAGER', 'CHEF'),
  (req: AuthenticatedRequest, res) => {
    const restaurantId = String(req.params.restaurantId);
    if (!enforceTenantAccess(req, res, restaurantId)) return;

    const existing = db.prepare('SELECT is_available FROM menu_items WHERE id = ? AND restaurant_id = ?').get(req.params.itemId, restaurantId) as
      | { is_available: number }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }
    const next = existing.is_available ? 0 : 1;
    db.prepare('UPDATE menu_items SET is_available = ? WHERE id = ? AND restaurant_id = ?').run(next, req.params.itemId, restaurantId);
    res.json({ id: req.params.itemId, is_available: next });
  }
);

// Tables & Reservations management
apiRouter.post(
  '/dashboard/:restaurantId/tables',
  authenticate,
  requireRoles('PLATFORM_SUPER_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_MANAGER'),
  (req: AuthenticatedRequest, res) => {
    const restaurantId = String(req.params.restaurantId);
    if (!enforceTenantAccess(req, res, restaurantId)) return;
    const schema = z.object({
      tableNumber: z.string().min(1).max(20),
      capacity: z.number().int().min(1).max(20),
      zone: z.string().min(1).max(60),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid table payload' });
      return;
    }
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO tables (id, restaurant_id, table_number, capacity, zone, status, qr_code_token) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id,
      restaurantId,
      parsed.data.tableNumber,
      parsed.data.capacity,
      parsed.data.zone,
      'AVAILABLE',
      `qr-${id.slice(0, 6)}`
    );
    res.status(201).json({ table: db.prepare('SELECT * FROM tables WHERE id = ?').get(id) });
  }
);

apiRouter.patch(
  '/dashboard/:restaurantId/tables/:tableId/status',
  authenticate,
  requireRoles('PLATFORM_SUPER_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_MANAGER', 'WAITER'),
  (req: AuthenticatedRequest, res) => {
    const restaurantId = String(req.params.restaurantId);
    if (!enforceTenantAccess(req, res, restaurantId)) return;
    const schema = z.object({ status: z.enum(['AVAILABLE', 'OCCUPIED', 'RESERVED']) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid table status' });
      return;
    }
    db.prepare('UPDATE tables SET status = ? WHERE id = ? AND restaurant_id = ?').run(parsed.data.status, req.params.tableId, restaurantId);
    res.json({ id: req.params.tableId, status: parsed.data.status });
  }
);

apiRouter.patch(
  '/dashboard/:restaurantId/reservations/:reservationId/status',
  authenticate,
  requireRoles('PLATFORM_SUPER_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_MANAGER', 'WAITER'),
  (req: AuthenticatedRequest, res) => {
    const restaurantId = String(req.params.restaurantId);
    if (!enforceTenantAccess(req, res, restaurantId)) return;
    const schema = z.object({ status: z.enum(['CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED']) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid reservation status' });
      return;
    }
    db.prepare('UPDATE reservations SET status = ? WHERE id = ? AND restaurant_id = ?').run(
      parsed.data.status,
      req.params.reservationId,
      restaurantId
    );
    broadcastToTenant(restaurantId, 'reservation:updated', { id: req.params.reservationId, status: parsed.data.status });
    res.json({ id: req.params.reservationId, status: parsed.data.status });
  }
);

// Staff, Inventory, Coupons, Website Builder, Settings, Subscription
apiRouter.post(
  '/dashboard/:restaurantId/staff',
  authenticate,
  requireRoles('PLATFORM_SUPER_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_MANAGER'),
  (req: AuthenticatedRequest, res) => {
    const restaurantId = String(req.params.restaurantId);
    if (!enforceTenantAccess(req, res, restaurantId)) return;
    const schema = z.object({
      fullName: z.string().min(2),
      email: z.string().email(),
      roleCode: z.enum(['RESTAURANT_MANAGER', 'CASHIER', 'CHEF', 'WAITER', 'DELIVERY_RIDER', 'ACCOUNTANT']),
      shiftSchedule: z.string().min(2),
      hourlyRateDollars: z.number().min(0),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid staff payload' });
      return;
    }
    const id = crypto.randomUUID();
    db.prepare(
      'INSERT INTO staff (id, restaurant_id, full_name, email, role_code, shift_schedule, hourly_rate_cents, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      id,
      restaurantId,
      parsed.data.fullName,
      parsed.data.email.toLowerCase(),
      parsed.data.roleCode,
      parsed.data.shiftSchedule,
      Math.round(parsed.data.hourlyRateDollars * 100),
      'ACTIVE'
    );
    res.status(201).json({ staffMember: db.prepare('SELECT * FROM staff WHERE id = ?').get(id) });
  }
);

apiRouter.post(
  '/dashboard/:restaurantId/inventory',
  authenticate,
  requireRoles('PLATFORM_SUPER_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_MANAGER', 'CHEF'),
  (req: AuthenticatedRequest, res) => {
    const restaurantId = String(req.params.restaurantId);
    if (!enforceTenantAccess(req, res, restaurantId)) return;
    const schema = z.object({
      sku: z.string().min(2),
      itemName: z.string().min(2),
      category: z.string().min(2),
      quantityOnHand: z.number().min(0),
      unit: z.string().min(1),
      reorderLevel: z.number().min(0),
      costPerUnitDollars: z.number().min(0),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid inventory payload' });
      return;
    }
    const id = crypto.randomUUID();
    db.prepare(
      'INSERT INTO inventory (id, restaurant_id, sku, item_name, category, quantity_on_hand, unit, reorder_level, cost_per_unit_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      id,
      restaurantId,
      parsed.data.sku,
      parsed.data.itemName,
      parsed.data.category,
      parsed.data.quantityOnHand,
      parsed.data.unit,
      parsed.data.reorderLevel,
      Math.round(parsed.data.costPerUnitDollars * 100)
    );
    res.status(201).json({ item: db.prepare('SELECT * FROM inventory WHERE id = ?').get(id) });
  }
);

apiRouter.patch(
  '/dashboard/:restaurantId/inventory/:itemId',
  authenticate,
  requireRoles('PLATFORM_SUPER_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_MANAGER', 'CHEF'),
  (req: AuthenticatedRequest, res) => {
    const restaurantId = String(req.params.restaurantId);
    if (!enforceTenantAccess(req, res, restaurantId)) return;
    const schema = z.object({ quantityOnHand: z.number().min(0) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid quantity' });
      return;
    }
    db.prepare("UPDATE inventory SET quantity_on_hand = ?, updated_at = datetime('now') WHERE id = ? AND restaurant_id = ?").run(
      parsed.data.quantityOnHand,
      req.params.itemId,
      restaurantId
    );
    res.json({ item: db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.itemId) });
  }
);

apiRouter.post(
  '/dashboard/:restaurantId/coupons',
  authenticate,
  requireRoles('PLATFORM_SUPER_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_MANAGER'),
  (req: AuthenticatedRequest, res) => {
    const restaurantId = String(req.params.restaurantId);
    if (!enforceTenantAccess(req, res, restaurantId)) return;
    const schema = z.object({
      code: z.string().min(3).max(24),
      description: z.string().min(2).max(200),
      discountType: z.enum(['PERCENT', 'FIXED']),
      discountValue: z.number().int().positive(),
      minOrderDollars: z.number().min(0),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid coupon payload' });
      return;
    }
    const id = crypto.randomUUID();
    db.prepare(
      'INSERT INTO coupons (id, restaurant_id, code, description, discount_type, discount_value, min_order_cents, max_uses, used_count, is_active, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, 500, 0, 1, ?)'
    ).run(
      id,
      restaurantId,
      parsed.data.code.toUpperCase(),
      parsed.data.description,
      parsed.data.discountType,
      parsed.data.discountType === 'FIXED' ? parsed.data.discountValue * 100 : parsed.data.discountValue,
      Math.round(parsed.data.minOrderDollars * 100),
      '2027-12-31'
    );
    res.status(201).json({ coupon: db.prepare('SELECT * FROM coupons WHERE id = ?').get(id) });
  }
);

apiRouter.patch(
  '/dashboard/:restaurantId/website',
  authenticate,
  requireRoles('PLATFORM_SUPER_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_MANAGER'),
  (req: AuthenticatedRequest, res) => {
    const restaurantId = String(req.params.restaurantId);
    if (!enforceTenantAccess(req, res, restaurantId)) return;
    const schema = z.object({
      name: z.string().min(2).max(120),
      tagline: z.string().max(180).optional().default(''),
      description: z.string().max(800),
      primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      coverUrl: z.string().min(1),
      logoUrl: z.string().optional().default(''),
      address: z.string().min(2),
      phone: z.string().min(2),
      email: z.string().email(),
      seoTitle: z.string().max(120).optional().default(''),
      seoDescription: z.string().max(300).optional().default(''),
      sectionsConfig: z
        .object({
          showFeatured: z.boolean(),
          showStory: z.boolean(),
          showGallery: z.boolean(),
          showReviews: z.boolean(),
          showOffers: z.boolean(),
        })
        .optional(),
      isPublished: z.boolean(),
      openingHours: z.record(z.string(), z.string()),
      socialLinks: z.record(z.string(), z.string()),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid website builder settings' });
      return;
    }
    const d = parsed.data;
    db.prepare(
      `UPDATE restaurants
       SET name = ?, tagline = ?, description = ?, primary_color = ?, accent_color = ?, cover_url = ?, logo_url = ?,
           address = ?, phone = ?, email = ?, seo_title = ?, seo_description = ?,
           sections_config_json = COALESCE(?, sections_config_json),
           is_published = ?, opening_hours_json = ?, social_links_json = ?
       WHERE id = ?`
    ).run(
      d.name,
      d.tagline,
      d.description,
      d.primaryColor,
      d.accentColor,
      d.coverUrl,
      d.logoUrl,
      d.address,
      d.phone,
      d.email,
      d.seoTitle,
      d.seoDescription,
      d.sectionsConfig ? JSON.stringify(d.sectionsConfig) : null,
      d.isPublished ? 1 : 0,
      JSON.stringify(d.openingHours),
      JSON.stringify(d.socialLinks),
      restaurantId
    );
    recordAuditLog({
      restaurantId,
      actorUserId: req.user?.userId,
      actorEmail: req.user?.email || '',
      actorRole: req.user?.roleCode || '',
      action: d.isPublished ? 'WEBSITE_PUBLISHED' : 'WEBSITE_SAVED_DRAFT',
      resourceType: 'RESTAURANT',
      resourceId: restaurantId,
      metadata: { isPublished: d.isPublished },
    });
    res.json({ updated: true, isPublished: d.isPublished });
  }
);

apiRouter.patch(
  '/dashboard/:restaurantId/settings',
  authenticate,
  requireRoles('PLATFORM_SUPER_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_MANAGER'),
  (req: AuthenticatedRequest, res) => {
    const restaurantId = String(req.params.restaurantId);
    if (!enforceTenantAccess(req, res, restaurantId)) return;
    const schema = z.object({
      autoAcceptOrders: z.boolean(),
      kdsSoundEnabled: z.boolean(),
      prepTimeMinutes: z.number().int().min(5).max(120),
      deliveryEnabled: z.boolean(),
      pickupEnabled: z.boolean(),
      dineInEnabled: z.boolean(),
      taxRate: z.number().min(0).max(0.3),
      deliveryFeeDollars: z.number().min(0).max(50),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid restaurant settings' });
      return;
    }
    const d = parsed.data;
    db.prepare(
      'UPDATE restaurant_settings SET auto_accept_orders = ?, kds_sound_enabled = ?, prep_time_minutes = ? WHERE restaurant_id = ?'
    ).run(d.autoAcceptOrders ? 1 : 0, d.kdsSoundEnabled ? 1 : 0, d.prepTimeMinutes, restaurantId);
    db.prepare(
      'UPDATE restaurants SET delivery_enabled = ?, pickup_enabled = ?, dine_in_enabled = ?, tax_rate = ?, delivery_fee_cents = ? WHERE id = ?'
    ).run(
      d.deliveryEnabled ? 1 : 0,
      d.pickupEnabled ? 1 : 0,
      d.dineInEnabled ? 1 : 0,
      d.taxRate,
      Math.round(d.deliveryFeeDollars * 100),
      restaurantId
    );
    res.json({ saved: true });
  }
);

apiRouter.patch(
  '/dashboard/:restaurantId/subscription',
  authenticate,
  requireRoles('PLATFORM_SUPER_ADMIN', 'RESTAURANT_OWNER'),
  (req: AuthenticatedRequest, res) => {
    const restaurantId = String(req.params.restaurantId);
    if (!enforceTenantAccess(req, res, restaurantId)) return;
    const schema = z.object({ planCode: z.enum(['STARTER', 'GROWTH', 'ENTERPRISE']) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid subscription plan' });
      return;
    }
    const plans = {
      STARTER: { name: 'Starter Storefront', price: 7900 },
      GROWTH: { name: 'Growth Kitchen', price: 14900 },
      ENTERPRISE: { name: 'Enterprise Multi-Branch', price: 34900 },
    };
    const p = plans[parsed.data.planCode];
    db.prepare("UPDATE subscriptions SET plan_code = ?, plan_name = ?, monthly_price_cents = ?, status = 'ACTIVE' WHERE restaurant_id = ?").run(
      parsed.data.planCode,
      p.name,
      p.price,
      restaurantId
    );
    db.prepare("UPDATE restaurants SET status = 'ACTIVE' WHERE id = ?").run(restaurantId);
    res.json({ subscription: db.prepare('SELECT * FROM subscriptions WHERE restaurant_id = ?').get(restaurantId) });
  }
);

// ==========================================
// 5. KITCHEN DISPLAY SYSTEM (KDS)
// ==========================================

apiRouter.get(
  '/kds/:restaurantId/tickets',
  authenticate,
  requireRoles('PLATFORM_SUPER_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_MANAGER', 'CHEF'),
  (req: AuthenticatedRequest, res) => {
    const restaurantId = String(req.params.restaurantId);
    if (!enforceTenantAccess(req, res, restaurantId)) return;

    const tickets = db
      .prepare(
        `SELECT kt.*, o.order_type, o.table_number, o.customer_name
         FROM kitchen_tickets kt
         JOIN orders o ON o.id = kt.order_id
         WHERE kt.restaurant_id = ?
         ORDER BY kt.created_at ASC`
      )
      .all(restaurantId) as Array<Record<string, unknown>>;

    const items = db.prepare('SELECT * FROM order_items WHERE restaurant_id = ?').all(restaurantId) as Array<Record<string, unknown>>;

    const enriched = tickets.map((t) => ({
      ...t,
      items: items
        .filter((i) => i.order_id === t.order_id)
        .map((i) => ({ ...i, modifiers: JSON.parse((i.modifiers_json as string) || '[]') })),
    }));

    res.json({ tickets: enriched });
  }
);

apiRouter.patch(
  '/kds/:restaurantId/tickets/:ticketId/status',
  authenticate,
  requireRoles('PLATFORM_SUPER_ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_MANAGER', 'CHEF'),
  (req: AuthenticatedRequest, res) => {
    const restaurantId = String(req.params.restaurantId);
    if (!enforceTenantAccess(req, res, restaurantId)) return;

    const schema = z.object({
      status: z.enum(['NEW', 'PREPARING', 'READY', 'SERVED']),
      station: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid ticket update' });
      return;
    }

    const ticket = db
      .prepare('SELECT * FROM kitchen_tickets WHERE id = ? AND restaurant_id = ?')
      .get(req.params.ticketId, restaurantId) as Record<string, unknown> | undefined;
    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    const nextStatus = parsed.data.status;
    const nowIso = new Date().toISOString();
    const orderStatusMap: Record<string, string> = {
      NEW: 'CONFIRMED',
      PREPARING: 'PREPARING',
      READY: 'READY',
      SERVED: 'COMPLETED',
    };

    db.transaction(() => {
      db.prepare(
        `UPDATE kitchen_tickets
         SET status = ?,
             station = COALESCE(?, station),
             started_at = CASE WHEN ? = 'PREPARING' AND started_at IS NULL THEN ? ELSE started_at END,
             ready_at = CASE WHEN ? = 'READY' THEN ? ELSE ready_at END
         WHERE id = ?`
      ).run(nextStatus, parsed.data.station ?? null, nextStatus, nowIso, nextStatus, nowIso, req.params.ticketId);

      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(orderStatusMap[nextStatus], ticket.order_id as string);
    })();

    const updatedTicket = db.prepare('SELECT * FROM kitchen_tickets WHERE id = ?').get(req.params.ticketId);
    const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(ticket.order_id as string);

    broadcastToTenant(restaurantId, 'kds:ticket_updated', { ticket: updatedTicket, order: updatedOrder });
    broadcastToOrder(ticket.order_id as string, 'order:updated', { order: updatedOrder, ticket: updatedTicket });

    res.json({ ticket: updatedTicket, order: updatedOrder });
  }
);

// ==========================================
// 6. VIRELEO SUPER ADMIN PLATFORM CONSOLE
// ==========================================

apiRouter.get('/admin/overview', authenticate, requireRoles('PLATFORM_SUPER_ADMIN'), (_req, res) => {
  const tenants = db
    .prepare(
      `SELECT r.*, s.plan_code, s.plan_name, s.monthly_price_cents, s.status as sub_status,
              (SELECT COUNT(*) FROM orders o WHERE o.restaurant_id = r.id) as order_count,
              (SELECT COALESCE(SUM(o.total_cents), 0) FROM orders o WHERE o.restaurant_id = r.id AND o.status != 'CANCELLED') as gmv_cents
       FROM restaurants r
       LEFT JOIN subscriptions s ON s.restaurant_id = r.id
       ORDER BY r.created_at DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const tickets = db.prepare('SELECT * FROM support_tickets ORDER BY created_at DESC').all();
  const auditLogs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 50').all();

  const activeCount = tenants.filter((t) => t.status === 'ACTIVE').length;
  const trialCount = tenants.filter((t) => t.status === 'TRIAL').length;
  const suspendedCount = tenants.filter((t) => t.status === 'SUSPENDED').length;
  const mrrCents = tenants
    .filter((t) => t.status === 'ACTIVE')
    .reduce((acc, t) => acc + ((t.monthly_price_cents as number) || 0), 0);

  res.json({
    metrics: {
      totalRestaurants: tenants.length,
      activeRestaurants: activeCount,
      trialRestaurants: trialCount,
      suspendedRestaurants: suspendedCount,
      platformMrrCents: mrrCents,
      totalPlatformGmvCents: tenants.reduce((acc, t) => acc + ((t.gmv_cents as number) || 0), 0),
    },
    tenants,
    supportTickets: tickets,
    auditLogs,
    systemHealth: {
      databaseEngine: 'SQLite WAL (Production Scaffold: PostgreSQL + Alembic)',
      websocketStatus: 'Connected & Tenant-Scoped',
      uptimeSeconds: Math.round(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
  });
});

apiRouter.patch('/admin/tenants/:restaurantId/status', authenticate, requireRoles('PLATFORM_SUPER_ADMIN'), (req: AuthenticatedRequest, res) => {
  const schema = z.object({ status: z.enum(['ACTIVE', 'TRIAL', 'SUSPENDED']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid tenant status' });
    return;
  }
  const restaurantId = String(req.params.restaurantId);
  db.prepare('UPDATE restaurants SET status = ? WHERE id = ?').run(parsed.data.status, restaurantId);
  recordAuditLog({
    restaurantId,
    actorUserId: req.user?.userId,
    actorEmail: req.user?.email || '',
    actorRole: req.user?.roleCode || '',
    action: 'TENANT_STATUS_CHANGED',
    resourceType: 'RESTAURANT',
    resourceId: restaurantId,
    metadata: { status: parsed.data.status },
  });
  res.json({ id: restaurantId, status: parsed.data.status });
});

apiRouter.patch('/admin/tenants/:restaurantId/subscription', authenticate, requireRoles('PLATFORM_SUPER_ADMIN'), (req: AuthenticatedRequest, res) => {
  const schema = z.object({ planCode: z.enum(['STARTER', 'GROWTH', 'ENTERPRISE']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid subscription plan' });
    return;
  }
  const restaurantId = String(req.params.restaurantId);
  const plans = {
    STARTER: { name: 'Starter Storefront', price: 7900 },
    GROWTH: { name: 'Growth Kitchen', price: 14900 },
    ENTERPRISE: { name: 'Enterprise Multi-Branch', price: 34900 },
  };
  const p = plans[parsed.data.planCode];
  db.prepare("UPDATE subscriptions SET plan_code = ?, plan_name = ?, monthly_price_cents = ?, status = 'ACTIVE' WHERE restaurant_id = ?").run(
    parsed.data.planCode,
    p.name,
    p.price,
    restaurantId
  );
  recordAuditLog({
    restaurantId,
    actorUserId: req.user?.userId,
    actorEmail: req.user?.email || '',
    actorRole: req.user?.roleCode || '',
    action: 'ADMIN_SUBSCRIPTION_UPDATED',
    resourceType: 'SUBSCRIPTION',
    resourceId: restaurantId,
    metadata: { planCode: parsed.data.planCode },
  });
  res.json({ id: restaurantId, planCode: parsed.data.planCode, planName: p.name, monthlyPriceCents: p.price });
});

apiRouter.patch('/admin/support-tickets/:ticketId', authenticate, requireRoles('PLATFORM_SUPER_ADMIN'), (req: AuthenticatedRequest, res) => {
  const schema = z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid ticket status' });
    return;
  }
  db.prepare('UPDATE support_tickets SET status = ? WHERE id = ?').run(parsed.data.status, req.params.ticketId);
  recordAuditLog({
    actorUserId: req.user?.userId,
    actorEmail: req.user?.email || '',
    actorRole: req.user?.roleCode || '',
    action: 'SUPPORT_TICKET_UPDATED',
    resourceType: 'SUPPORT_TICKET',
    resourceId: String(req.params.ticketId),
    metadata: { status: parsed.data.status },
  });
  res.json({ id: req.params.ticketId, status: parsed.data.status });
});

apiRouter.post('/admin/trends/search', authenticate, requireRoles('PLATFORM_SUPER_ADMIN'), async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    query: z.string().trim().min(3, 'Enter at least 3 characters to search').max(200),
    focusArea: z.string().trim().max(100).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid trends search query' });
    return;
  }

  try {
    const result = await searchRestaurantSaasTrends(parsed.data.query, parsed.data.focusArea);
    recordAuditLog({
      actorUserId: req.user?.userId,
      actorEmail: req.user?.email || '',
      actorRole: req.user?.roleCode || '',
      action: 'ADMIN_INDUSTRY_TRENDS_SEARCH',
      resourceType: 'PLATFORM_ANALYTICS',
      resourceId: 'trends-grounding',
      metadata: { query: parsed.data.query, sourcesCount: result.sources.length },
    });
    res.json(result);
  } catch (err) {
    const status = err instanceof GeminiServiceError ? err.statusCode : 502;
    const message = err instanceof Error ? err.message : 'Unable to fetch industry trends';
    res.status(status).json({ error: message });
  }
});
