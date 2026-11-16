import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from './db.ts';

const IMG_HERO_SAFFRON = '/src/assets/images/hero_saffron_hearth_1794828971752.jpg';
const IMG_HERO_KURO = '/src/assets/images/hero_kuro_ramen_1794828971544.jpg';
const IMG_HERO_VERBENA = '/src/assets/images/hero_verbena_bistro_1794828971700.jpg';
const IMG_DISH_SIGNATURE = '/src/assets/images/dish_signature_plate_1794828971889.jpg';
const IMG_DISH_RAMEN = '/src/assets/images/dish_artisan_ramen_1794828973706.jpg';
const IMG_DISH_PASTA = '/src/assets/images/dish_coastal_pasta_1794828973744.jpg';
const IMG_DISH_DESSERT = '/src/assets/images/dish_artisan_dessert_1794828974405.jpg';
const IMG_DISH_BEVERAGE = '/src/assets/images/dish_craft_beverage_1794828974858.jpg';

export function seedDemoDatabase(): void {
  const roleCount = (db.prepare('SELECT COUNT(*) as c FROM roles').get() as { c: number }).c;
  if (roleCount === 0) {
    const roles = [
      {
        code: 'PLATFORM_SUPER_ADMIN',
        name: 'VIRELEO Platform Super Admin',
        perms: ['platform:*', 'tenants:*', 'subscriptions:*', 'audit:*', 'support:*'],
      },
      {
        code: 'RESTAURANT_OWNER',
        name: 'Restaurant Owner',
        perms: ['restaurant:*', 'orders:*', 'menu:*', 'staff:*', 'billing:*', 'website:*', 'kds:*'],
      },
      {
        code: 'RESTAURANT_MANAGER',
        name: 'Restaurant Manager',
        perms: ['orders:*', 'menu:*', 'reservations:*', 'tables:*', 'inventory:*', 'staff:read'],
      },
      {
        code: 'CASHIER',
        name: 'Cashier / POS',
        perms: ['orders:read', 'orders:create', 'orders:update_payment'],
      },
      {
        code: 'CHEF',
        name: 'Chef / Kitchen Display',
        perms: ['kds:read', 'kds:update', 'menu:read'],
      },
      {
        code: 'WAITER',
        name: 'Waiter / Floor Host',
        perms: ['tables:read', 'tables:update', 'reservations:*', 'orders:create'],
      },
      {
        code: 'DELIVERY_RIDER',
        name: 'Delivery Rider',
        perms: ['orders:read_delivery', 'orders:mark_delivered'],
      },
      {
        code: 'ACCOUNTANT',
        name: 'Accountant',
        perms: ['reports:read', 'orders:read', 'payments:read'],
      },
      {
        code: 'CUSTOMER',
        name: 'Customer',
        perms: ['storefront:order', 'storefront:reserve', 'account:read'],
      },
    ];
    const insertRole = db.prepare('INSERT INTO roles (id, code, name, permissions_json) VALUES (?, ?, ?, ?)');
    for (const r of roles) {
      insertRole.run(crypto.randomUUID(), r.code, r.name, JSON.stringify(r.perms));
    }
  }

  const existingRestaurants = (db.prepare('SELECT COUNT(*) as c FROM restaurants').get() as { c: number }).c;
  if (existingRestaurants > 0) {
    return;
  }

  const demoPasswordHash = bcrypt.hashSync('ZayqoraDemo!2026', 10);

  const r1Id = '11111111-1111-4111-8111-111111111101';
  const r2Id = '22222222-2222-4222-8222-222222222202';
  const r3Id = '33333333-3333-4333-8333-333333333303';

  const insertRestaurant = db.prepare(`
    INSERT INTO restaurants (
      id, slug, name, category, description, logo_url, cover_url,
      primary_color, accent_color, theme_style, status, is_published,
      address, phone, email, social_links_json, gallery_json, opening_hours_json,
      delivery_enabled, pickup_enabled, dine_in_enabled, tax_rate, delivery_fee_cents, is_demo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  insertRestaurant.run(
    r1Id,
    'saffron-hearth',
    'Saffron & Hearth',
    'Modern Wood-Fired Indian',
    'Open-hearth wood-fired coastal Indian cuisine crafted with single-origin spices, heritage grains, and seasonal California produce.',
    '',
    IMG_HERO_SAFFRON,
    '#101D35',
    '#0D9488',
    'editorial',
    'ACTIVE',
    1,
    '428 Valencia Street, San Francisco, CA 94103',
    '+1 (415) 890-4410',
    'reservations@saffronhearth.demo',
    JSON.stringify({ instagram: '@saffronhearthsf', website: 'https://saffronhearth.demo' }),
    JSON.stringify([IMG_HERO_SAFFRON, IMG_DISH_SIGNATURE, IMG_DISH_DESSERT, IMG_DISH_BEVERAGE]),
    JSON.stringify({
      Mon: 'Closed',
      Tue: '17:00 - 22:30',
      Wed: '17:00 - 22:30',
      Thu: '17:00 - 23:00',
      Fri: '12:00 - 23:30',
      Sat: '12:00 - 23:30',
      Sun: '12:00 - 21:30',
    }),
    1,
    1,
    1,
    0.085,
    499
  );

  insertRestaurant.run(
    r2Id,
    'kuro-robata',
    'Kuro Robata & Ramen',
    'Japanese Ramen & Charcoal Grill',
    'Slow-simmered 18-hour tonkotsu broths, hand-cut alkaline noodles, and binchotan charcoal skewers served counter-side.',
    '',
    IMG_HERO_KURO,
    '#111827',
    '#E9B44C',
    'atelier',
    'ACTIVE',
    1,
    '118 Mercer Alley, Seattle, WA 98101',
    '+1 (206) 555-0192',
    'hello@kurorobata.demo',
    JSON.stringify({ instagram: '@kurorobata', website: 'https://kurorobata.demo' }),
    JSON.stringify([IMG_HERO_KURO, IMG_DISH_RAMEN, IMG_DISH_BEVERAGE]),
    JSON.stringify({
      Mon: '11:30 - 22:00',
      Tue: '11:30 - 22:00',
      Wed: '11:30 - 22:00',
      Thu: '11:30 - 22:30',
      Fri: '11:30 - 23:30',
      Sat: '12:00 - 23:30',
      Sun: '12:00 - 21:00',
    }),
    1,
    1,
    1,
    0.095,
    399
  );

  insertRestaurant.run(
    r3Id,
    'verbena-osteria',
    'Verbena Osteria',
    'Coastal Mediterranean Trattoria',
    'Sunlit handmade pasta, wood-oven sourdough, and pressed estate olive oils inspired by Ligurian coastal dining.',
    '',
    IMG_HERO_VERBENA,
    '#101D35',
    '#0D9488',
    'coastal',
    'TRIAL',
    1,
    '79 Ocean Avenue, Santa Barbara, CA 93101',
    '+1 (805) 555-0148',
    'ciao@verbenaosteria.demo',
    JSON.stringify({ instagram: '@verbenaosteria', website: 'https://verbenaosteria.demo' }),
    JSON.stringify([IMG_HERO_VERBENA, IMG_DISH_PASTA, IMG_DISH_DESSERT]),
    JSON.stringify({
      Mon: 'Closed',
      Tue: '16:30 - 22:00',
      Wed: '16:30 - 22:00',
      Thu: '16:30 - 22:30',
      Fri: '11:30 - 23:00',
      Sat: '11:30 - 23:00',
      Sun: '11:30 - 21:00',
    }),
    1,
    1,
    1,
    0.0775,
    450
  );

  // Branches & settings
  const insertBranch = db.prepare(
    'INSERT INTO branches (id, restaurant_id, name, address, phone, is_primary, is_active) VALUES (?, ?, ?, ?, ?, 1, 1)'
  );
  const b1Id = crypto.randomUUID();
  const b2Id = crypto.randomUUID();
  const b3Id = crypto.randomUUID();
  insertBranch.run(b1Id, r1Id, 'Valencia Flagship', '428 Valencia Street, San Francisco, CA', '+1 (415) 890-4410');
  insertBranch.run(b2Id, r2Id, 'Mercer Counter', '118 Mercer Alley, Seattle, WA', '+1 (206) 555-0192');
  insertBranch.run(b3Id, r3Id, 'Santa Barbara Terrace', '79 Ocean Avenue, Santa Barbara, CA', '+1 (805) 555-0148');

  const insertSettings = db.prepare(
    'INSERT INTO restaurant_settings (id, restaurant_id, auto_accept_orders, kds_sound_enabled, prep_time_minutes, reservation_slot_minutes, payment_region, currency) VALUES (?, ?, 0, 1, 20, 90, ?, ?)'
  );
  insertSettings.run(crypto.randomUUID(), r1Id, 'US', 'USD');
  insertSettings.run(crypto.randomUUID(), r2Id, 'US', 'USD');
  insertSettings.run(crypto.randomUUID(), r3Id, 'US', 'USD');

  // Demo Users
  const insertUser = db.prepare(
    'INSERT INTO users (id, email, password_hash, full_name, role_code, restaurant_id, email_verified, is_active) VALUES (?, ?, ?, ?, ?, ?, 1, 1)'
  );
  const superAdminId = crypto.randomUUID();
  const owner1Id = crypto.randomUUID();
  const chef1Id = crypto.randomUUID();
  const manager1Id = crypto.randomUUID();
  const owner2Id = crypto.randomUUID();
  const owner3Id = crypto.randomUUID();
  const customerId = crypto.randomUUID();

  insertUser.run(superAdminId, 'superadmin@vireleo.io', demoPasswordHash, 'Aria Vance (VIRELEO Admin)', 'PLATFORM_SUPER_ADMIN', null);
  insertUser.run(owner1Id, 'owner@saffronhearth.demo', demoPasswordHash, 'Vikram Malhotra', 'RESTAURANT_OWNER', r1Id);
  insertUser.run(chef1Id, 'chef@saffronhearth.demo', demoPasswordHash, 'Chef Kabir Sen', 'CHEF', r1Id);
  insertUser.run(manager1Id, 'manager@saffronhearth.demo', demoPasswordHash, 'Elena Rostova', 'RESTAURANT_MANAGER', r1Id);
  insertUser.run(owner2Id, 'owner@kurorobata.demo', demoPasswordHash, 'Kenji Takahashi', 'RESTAURANT_OWNER', r2Id);
  insertUser.run(owner3Id, 'owner@verbenaosteria.demo', demoPasswordHash, 'Sofia Moretti', 'RESTAURANT_OWNER', r3Id);
  insertUser.run(customerId, 'customer@zayqora.demo', demoPasswordHash, 'Maya Lin', 'CUSTOMER', null);

  // Staff records
  const insertStaff = db.prepare(
    'INSERT INTO staff (id, restaurant_id, user_id, branch_id, full_name, email, role_code, shift_schedule, hourly_rate_cents, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  insertStaff.run(crypto.randomUUID(), r1Id, owner1Id, b1Id, 'Vikram Malhotra', 'owner@saffronhearth.demo', 'RESTAURANT_OWNER', 'Mon–Sat Management', 0, 'ACTIVE');
  insertStaff.run(crypto.randomUUID(), r1Id, chef1Id, b1Id, 'Chef Kabir Sen', 'chef@saffronhearth.demo', 'CHEF', 'Tue–Sun 15:00–23:30', 4200, 'ACTIVE');
  insertStaff.run(crypto.randomUUID(), r1Id, manager1Id, b1Id, 'Elena Rostova', 'manager@saffronhearth.demo', 'RESTAURANT_MANAGER', 'Tue–Sat 13:00–21:30', 3600, 'ACTIVE');
  insertStaff.run(crypto.randomUUID(), r1Id, null, b1Id, 'Mateo Cruz', 'mateo@saffronhearth.demo', 'WAITER', 'Wed–Sun 16:30–23:00', 2200, 'ACTIVE');
  insertStaff.run(crypto.randomUUID(), r1Id, null, b1Id, 'Nadia Patel', 'nadia@saffronhearth.demo', 'CASHIER', 'Tue–Sat 16:00–22:30', 2100, 'ACTIVE');
  insertStaff.run(crypto.randomUUID(), r2Id, owner2Id, b2Id, 'Kenji Takahashi', 'owner@kurorobata.demo', 'RESTAURANT_OWNER', 'Mon–Sat Counter', 0, 'ACTIVE');
  insertStaff.run(crypto.randomUUID(), r3Id, owner3Id, b3Id, 'Sofia Moretti', 'owner@verbenaosteria.demo', 'RESTAURANT_OWNER', 'Tue–Sun Service', 0, 'ACTIVE');

  // Subscriptions
  const insertSub = db.prepare(
    'INSERT INTO subscriptions (id, restaurant_id, plan_code, plan_name, monthly_price_cents, status, current_period_end) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  insertSub.run(crypto.randomUUID(), r1Id, 'GROWTH', 'Growth Kitchen', 14900, 'ACTIVE', '2026-12-16');
  insertSub.run(crypto.randomUUID(), r2Id, 'ENTERPRISE', 'Enterprise Multi-Branch', 34900, 'ACTIVE', '2026-12-16');
  insertSub.run(crypto.randomUUID(), r3Id, 'STARTER', 'Starter Storefront', 7900, 'TRIAL', '2026-11-30');

  // Categories & Menu Items
  const insertCat = db.prepare('INSERT INTO menu_categories (id, restaurant_id, name, description, sort_order, is_active) VALUES (?, ?, ?, ?, ?, 1)');
  const insertItem = db.prepare(
    'INSERT INTO menu_items (id, restaurant_id, category_id, name, description, price_cents, image_url, is_available, is_featured, prep_minutes, dietary_tags_json, station) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)'
  );
  const insertVar = db.prepare('INSERT INTO variants (id, restaurant_id, menu_item_id, name, price_delta_cents) VALUES (?, ?, ?, ?, ?)');
  const insertMod = db.prepare('INSERT INTO modifiers (id, restaurant_id, menu_item_id, name, price_cents, is_required) VALUES (?, ?, ?, ?, ?, 0)');

  // Saffron & Hearth Menu
  const sCat1 = crypto.randomUUID();
  const sCat2 = crypto.randomUUID();
  const sCat3 = crypto.randomUUID();
  insertCat.run(sCat1, r1Id, 'Wood-Fired Mains', 'Charcoal tandoor & cast-iron hearth plates', 1);
  insertCat.run(sCat2, r1Id, 'Artisanal Desserts', 'Cardamom, saffron, and single-origin cacao', 2);
  insertCat.run(sCat3, r1Id, 'Botanical Zero-Proof', 'House-distilled syrups and cold-pressed citrus', 3);

  const sItem1 = crypto.randomUUID();
  const sItem2 = crypto.randomUUID();
  const sItem3 = crypto.randomUUID();
  const sItem4 = crypto.randomUUID();

  insertItem.run(sItem1, r1Id, sCat1, 'Herb-Crusted Lamb Chops & Saffron Puree', 'Pasture-raised rack of lamb seared over almond wood with Kashmiri saffron cauliflower cream and crispy curry leaf jus.', 3400, IMG_DISH_SIGNATURE, 1, 22, JSON.stringify(['Gluten-Free']), 'WOOD_HEARTH');
  insertVar.run(crypto.randomUUID(), r1Id, sItem1, '3 Chops (Standard)', 0);
  insertVar.run(crypto.randomUUID(), r1Id, sItem1, '5 Chops (Chef Cut)', 1400);
  insertMod.run(crypto.randomUUID(), r1Id, sItem1, 'Charred Garlic Naan', 550);
  insertMod.run(crypto.randomUUID(), r1Id, sItem1, 'Extra Saffron Jus', 300);

  insertItem.run(sItem2, r1Id, sCat1, 'Burrata & Blistered Heirloom Tagliolini', 'House-extruded pasta finished with smoked chili butter, Stracciatella, and wild fennel pollen.', 2600, IMG_DISH_PASTA, 1, 16, JSON.stringify(['Vegetarian']), 'SAUTE_LINE');
  insertVar.run(crypto.randomUUID(), r1Id, sItem2, 'Entree Portion', 0);
  insertVar.run(crypto.randomUUID(), r1Id, sItem2, 'Sharing Table Bowl', 1200);
  insertMod.run(crypto.randomUUID(), r1Id, sItem2, 'Black Truffle Shavings', 900);

  insertItem.run(sItem3, r1Id, sCat2, 'Cardamom Pistachio Dark Tart', '70% single-estate ganache tart with roasted Black Mission figs, crushed Iranian pistachio, and 24k gold leaf.', 1600, IMG_DISH_DESSERT, 1, 8, JSON.stringify(['Vegetarian']), 'PASTRY_COLD');
  insertMod.run(crypto.randomUUID(), r1Id, sItem3, 'Clotted Saffron Gelato Scoop', 450);

  insertItem.run(sItem4, r1Id, sCat3, 'Smoked Hibiscus & Yuzu Spritz', 'Cold-steeped hibiscus flower, charred blood orange, Japanese yuzu tonic, and rosemary smoke.', 1200, IMG_DISH_BEVERAGE, 0, 5, JSON.stringify(['Vegan', 'Zero-Proof']), 'BAR_STATION');
  insertVar.run(crypto.randomUUID(), r1Id, sItem4, 'Single Glass', 0);
  insertVar.run(crypto.randomUUID(), r1Id, sItem4, 'Table Carafe (4 Serves)', 2800);

  // Kuro Robata Menu
  const kCat1 = crypto.randomUUID();
  const kCat2 = crypto.randomUUID();
  insertCat.run(kCat1, r2Id, '18-Hour Signature Ramen', 'Slow-cooked broths with house alkaline noodles', 1);
  insertCat.run(kCat2, r2Id, 'Beverages & Sweets', 'Japanese craft spritzers and dark patisserie', 2);

  const kItem1 = crypto.randomUUID();
  const kItem2 = crypto.randomUUID();
  const kItem3 = crypto.randomUUID();
  insertItem.run(kItem1, r2Id, kCat1, 'Kuro Black Garlic Tonkotsu Ramen', 'Rich pork bone broth emulsified with roasted black garlic tare, torched belly chashu, ajitama egg, and bamboo shoots.', 2200, IMG_DISH_RAMEN, 1, 14, JSON.stringify(['House Signature']), 'NOODLE_BOILER');
  insertVar.run(crypto.randomUUID(), r2Id, kItem1, 'Classic Bowl', 0);
  insertVar.run(crypto.randomUUID(), r2Id, kItem1, 'Double Chashu + Extra Noodles', 700);
  insertMod.run(crypto.randomUUID(), r2Id, kItem1, 'Extra Ajitama Egg', 300);
  insertMod.run(crypto.randomUUID(), r2Id, kItem1, 'Crispy Chili Rayu', 200);

  insertItem.run(kItem2, r2Id, kCat2, 'Yuzu Rosemary Sparkling Tonic', 'Pressed Kochi yuzu juice with cold-brewed rosemary botanicals and crushed ice.', 1100, IMG_DISH_BEVERAGE, 0, 4, JSON.stringify(['Zero-Proof']), 'BAR_STATION');
  insertItem.run(kItem3, r2Id, kCat2, 'Roasted Fig & Matcha Cacao Tart', 'Bittersweet dark chocolate tart finished with pistachio crumble and warm figs.', 1500, IMG_DISH_DESSERT, 1, 7, JSON.stringify(['Vegetarian']), 'PASTRY_COLD');

  // Verbena Osteria Menu
  const vCat1 = crypto.randomUUID();
  const vCat2 = crypto.randomUUID();
  insertCat.run(vCat1, r3Id, 'Handmade Pasta & Hearth', 'Daily rolled pasta and seasonal coastal plates', 1);
  insertCat.run(vCat2, r3Id, 'Dolci & Aperitivo', 'Artisan sweets and botanical spritzes', 2);

  const vItem1 = crypto.randomUUID();
  const vItem2 = crypto.randomUUID();
  const vItem3 = crypto.randomUUID();
  insertItem.run(vItem1, r3Id, vCat1, 'Heirloom Tomato & Burrata Tagliolini', 'Hand-cut egg tagliolini tossed with wood-blistered early girl tomatoes, Pugliese burrata, and basil oil.', 2500, IMG_DISH_PASTA, 1, 15, JSON.stringify(['Vegetarian']), 'SAUTE_LINE');
  insertVar.run(crypto.randomUUID(), r3Id, vItem1, 'Primo', 0);
  insertVar.run(crypto.randomUUID(), r3Id, vItem1, 'Abbondante', 800);
  insertMod.run(crypto.randomUUID(), r3Id, vItem1, 'Grilled Sourdough Focaccia', 600);

  insertItem.run(vItem2, r3Id, vCat1, 'Rosemary Herb-Crusted Lamb Rack', 'Charred over olive wood with saffron puree and crispy garden herbs.', 3600, IMG_DISH_SIGNATURE, 1, 22, JSON.stringify(['Gluten-Free']), 'WOOD_HEARTH');
  insertItem.run(vItem3, r3Id, vCat2, 'Sicilian Pistachio Fig Tart', 'Dark chocolate pastry shell, toasted pistachios, caramelized figs.', 1450, IMG_DISH_DESSERT, 0, 6, JSON.stringify(['Vegetarian']), 'PASTRY_COLD');

  // Tables for all 3 restaurants
  const insertTable = db.prepare('INSERT INTO tables (id, restaurant_id, branch_id, table_number, capacity, zone, status, qr_code_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const r1Table1 = crypto.randomUUID();
  const r1Table2 = crypto.randomUUID();
  const r1Table3 = crypto.randomUUID();
  const r1Table4 = crypto.randomUUID();
  insertTable.run(r1Table1, r1Id, b1Id, 'T-01', 2, 'Window', 'AVAILABLE', 'qr-sh-01');
  insertTable.run(r1Table2, r1Id, b1Id, 'T-02', 4, 'Main Hearth', 'OCCUPIED', 'qr-sh-02');
  insertTable.run(r1Table3, r1Id, b1Id, 'T-03', 4, 'Main Hearth', 'RESERVED', 'qr-sh-03');
  insertTable.run(r1Table4, r1Id, b1Id, 'T-04', 6, 'Private Alcove', 'AVAILABLE', 'qr-sh-04');

  insertTable.run(crypto.randomUUID(), r2Id, b2Id, 'C-01', 2, 'Ramen Counter', 'AVAILABLE', 'qr-kr-01');
  insertTable.run(crypto.randomUUID(), r2Id, b2Id, 'C-02', 4, 'Robata Booth', 'AVAILABLE', 'qr-kr-02');
  insertTable.run(crypto.randomUUID(), r3Id, b3Id, 'V-01', 4, 'Olive Terrace', 'AVAILABLE', 'qr-vo-01');
  insertTable.run(crypto.randomUUID(), r3Id, b3Id, 'V-02', 6, 'Coastal Patio', 'AVAILABLE', 'qr-vo-02');

  // Customers
  const insertCust = db.prepare('INSERT INTO customers (id, restaurant_id, user_id, name, email, phone, total_orders, total_spent_cents, loyalty_points) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const c1Id = crypto.randomUUID();
  const c2Id = crypto.randomUUID();
  insertCust.run(c1Id, r1Id, customerId, 'Maya Lin', 'customer@zayqora.demo', '+1 (415) 555-0184', 4, 24800, 248);
  insertCust.run(c2Id, r1Id, null, 'Julian Mercer', 'julian.mercer@example.com', '+1 (415) 555-0133', 2, 11400, 114);

  // Coupons
  const insertCoupon = db.prepare('INSERT INTO coupons (id, restaurant_id, code, description, discount_type, discount_value, min_order_cents, max_uses, used_count, is_active, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, 500, 12, 1, ?)');
  insertCoupon.run(crypto.randomUUID(), r1Id, 'WELCOME15', '15% off your first direct order', 'PERCENT', 15, 2500, '2027-01-01');
  insertCoupon.run(crypto.randomUUID(), r1Id, 'CHEF10', '$10 off orders over $60', 'FIXED', 1000, 6000, '2027-01-01');
  insertCoupon.run(crypto.randomUUID(), r2Id, 'RAMEN10', '10% off counter pickup', 'PERCENT', 10, 2000, '2027-01-01');
  insertCoupon.run(crypto.randomUUID(), r3Id, 'COASTAL15', '15% off terrace launch menu', 'PERCENT', 15, 3000, '2027-01-01');

  // Inventory
  const insertInv = db.prepare('INSERT INTO inventory (id, restaurant_id, sku, item_name, category, quantity_on_hand, unit, reorder_level, cost_per_unit_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  insertInv.run(crypto.randomUUID(), r1Id, 'SAF-LAMB-01', 'Pasture-Raised Lamb Rack', 'Proteins', 18, 'kg', 8, 2850);
  insertInv.run(crypto.randomUUID(), r1Id, 'SAF-SPIC-04', 'Kashmiri Saffron Threads', 'Dry Spices', 420, 'g', 150, 850);
  insertInv.run(crypto.randomUUID(), r1Id, 'SAF-DAIRY-02', 'Artisanal Pugliese Burrata', 'Dairy', 6, 'cases', 8, 4200);
  insertInv.run(crypto.randomUUID(), r1Id, 'SAF-FLOUR-09', 'Stone-Milled Heirloom Atta', 'Pantry', 45, 'kg', 15, 340);

  // Demo Orders + Order Items + Kitchen Tickets + Payments
  const insertOrder = db.prepare(`
    INSERT INTO orders (
      id, restaurant_id, branch_id, order_number, customer_id, customer_name, customer_email, customer_phone,
      delivery_address, order_type, table_number, status, subtotal_cents, discount_cents, tax_cents, delivery_fee_cents,
      total_cents, coupon_code, payment_status, payment_method, idempotency_key, is_demo, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);
  const insertOrderItem = db.prepare(`
    INSERT INTO order_items (id, order_id, restaurant_id, menu_item_id, item_name, variant_name, modifiers_json, quantity, unit_price_cents, line_total_cents, special_instructions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertTicket = db.prepare(`
    INSERT INTO kitchen_tickets (id, restaurant_id, order_id, order_number, station, status, started_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertPayment = db.prepare(`
    INSERT INTO payments (id, restaurant_id, order_id, provider, provider_ref, amount_cents, currency, status, webhook_verified)
    VALUES (?, ?, ?, 'ZAYQORA_SANDBOX_PAY', ?, ?, 'USD', 'CONFIRMED', 1)
  `);

  const nowIso = new Date().toISOString();
  const minAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();

  // Order 1: Active Preparing
  const o1Id = crypto.randomUUID();
  insertOrder.run(o1Id, r1Id, b1Id, 'ZQ-1041', c1Id, 'Maya Lin', 'customer@zayqora.demo', '+1 (415) 555-0184', '742 Mission St, Apt 4B, SF', 'DELIVERY', '', 'PREPARING', 6000, 0, 510, 499, 7009, '', 'PAID', 'CARD_SANDBOX', 'demo-key-1041', minAgo(11));
  insertOrderItem.run(crypto.randomUUID(), o1Id, r1Id, sItem1, 'Herb-Crusted Lamb Chops & Saffron Puree', '3 Chops (Standard)', JSON.stringify(['Charred Garlic Naan']), 1, 3950, 3950, 'Medium rare, sauce on side');
  insertOrderItem.run(crypto.randomUUID(), o1Id, r1Id, sItem3, 'Cardamom Pistachio Dark Tart', '', JSON.stringify(['Clotted Saffron Gelato Scoop']), 1, 2050, 2050, '');
  insertTicket.run(crypto.randomUUID(), r1Id, o1Id, 'ZQ-1041', 'WOOD_HEARTH', 'PREPARING', minAgo(7), minAgo(11));
  insertPayment.run(crypto.randomUUID(), r1Id, o1Id, 'sbx_tx_1041', 7009);

  // Order 2: New incoming ticket
  const o2Id = crypto.randomUUID();
  insertOrder.run(o2Id, r1Id, b1Id, 'ZQ-1042', c2Id, 'Julian Mercer', 'julian.mercer@example.com', '+1 (415) 555-0133', '', 'DINE_IN', 'T-02', 'CONFIRMED', 5000, 0, 425, 0, 5425, '', 'PAID', 'CARD_SANDBOX', 'demo-key-1042', minAgo(3));
  insertOrderItem.run(crypto.randomUUID(), o2Id, r1Id, sItem2, 'Burrata & Blistered Heirloom Tagliolini', 'Sharing Table Bowl', JSON.stringify([]), 1, 3800, 3800, 'Nut allergy at table');
  insertOrderItem.run(crypto.randomUUID(), o2Id, r1Id, sItem4, 'Smoked Hibiscus & Yuzu Spritz', 'Single Glass', JSON.stringify([]), 1, 1200, 1200, '');
  insertTicket.run(crypto.randomUUID(), r1Id, o2Id, 'ZQ-1042', 'SAUTE_LINE', 'NEW', null, minAgo(3));
  insertPayment.run(crypto.randomUUID(), r1Id, o2Id, 'sbx_tx_1042', 5425);

  // Order 3: Ready for pickup
  const o3Id = crypto.randomUUID();
  insertOrder.run(o3Id, r1Id, b1Id, 'ZQ-1040', c1Id, 'Maya Lin', 'customer@zayqora.demo', '+1 (415) 555-0184', '', 'PICKUP', '', 'READY', 3400, 510, 246, 0, 3136, 'WELCOME15', 'PAID', 'CARD_SANDBOX', 'demo-key-1040', minAgo(22));
  insertOrderItem.run(crypto.randomUUID(), o3Id, r1Id, sItem1, 'Herb-Crusted Lamb Chops & Saffron Puree', '3 Chops (Standard)', JSON.stringify([]), 1, 3400, 3400, '');
  insertTicket.run(crypto.randomUUID(), r1Id, o3Id, 'ZQ-1040', 'WOOD_HEARTH', 'READY', minAgo(18), minAgo(22));
  insertPayment.run(crypto.randomUUID(), r1Id, o3Id, 'sbx_tx_1040', 3136);

  // Order 4 & 5: Completed historical orders
  const o4Id = crypto.randomUUID();
  insertOrder.run(o4Id, r1Id, b1Id, 'ZQ-1039', c2Id, 'Julian Mercer', 'julian.mercer@example.com', '+1 (415) 555-0133', '', 'PICKUP', '', 'COMPLETED', 4200, 0, 357, 0, 4557, '', 'PAID', 'CARD_SANDBOX', 'demo-key-1039', minAgo(140));
  insertOrderItem.run(crypto.randomUUID(), o4Id, r1Id, sItem2, 'Burrata & Blistered Heirloom Tagliolini', 'Entree Portion', JSON.stringify([]), 1, 2600, 2600, '');
  insertOrderItem.run(crypto.randomUUID(), o4Id, r1Id, sItem3, 'Cardamom Pistachio Dark Tart', '', JSON.stringify([]), 1, 1600, 1600, '');
  insertTicket.run(crypto.randomUUID(), r1Id, o4Id, 'ZQ-1039', 'SAUTE_LINE', 'SERVED', minAgo(135), minAgo(140));
  insertPayment.run(crypto.randomUUID(), r1Id, o4Id, 'sbx_tx_1039', 4557);

  // Kuro Robata sample order
  const o5Id = crypto.randomUUID();
  insertOrder.run(o5Id, r2Id, b2Id, 'KR-2011', null, 'Hana Sato', 'hana@example.com', '+1 (206) 555-0144', '', 'PICKUP', '', 'CONFIRMED', 3300, 0, 314, 0, 3614, '', 'PAID', 'CARD_SANDBOX', 'demo-key-2011', minAgo(6));
  insertOrderItem.run(crypto.randomUUID(), o5Id, r2Id, kItem1, 'Kuro Black Garlic Tonkotsu Ramen', 'Classic Bowl', JSON.stringify([]), 1, 2200, 2200, 'Extra hot broth');
  insertOrderItem.run(crypto.randomUUID(), o5Id, r2Id, kItem2, 'Yuzu Rosemary Sparkling Tonic', '', JSON.stringify([]), 1, 1100, 1100, '');
  insertTicket.run(crypto.randomUUID(), r2Id, o5Id, 'KR-2011', 'NOODLE_BOILER', 'NEW', null, minAgo(6));
  insertPayment.run(crypto.randomUUID(), r2Id, o5Id, 'sbx_tx_2011', 3614);

  // Reservations
  const today = new Date().toISOString().slice(0, 10);
  const insertRes = db.prepare(`
    INSERT INTO reservations (id, restaurant_id, branch_id, table_id, customer_id, customer_name, customer_email, customer_phone, reservation_date, time_slot, party_size, status, notes, is_demo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  insertRes.run(crypto.randomUUID(), r1Id, b1Id, r1Table3, c1Id, 'Maya Lin', 'customer@zayqora.demo', '+1 (415) 555-0184', today, '19:30', 4, 'CONFIRMED', 'Anniversary window request');
  insertRes.run(crypto.randomUUID(), r1Id, b1Id, r1Table4, c2Id, 'Julian Mercer', 'julian.mercer@example.com', '+1 (415) 555-0133', today, '20:00', 5, 'CONFIRMED', 'Tasting menu pairing');

  // Support Tickets for VIRELEO Admin
  const insertTicketSup = db.prepare('INSERT INTO support_tickets (id, restaurant_id, restaurant_name, subject, priority, status) VALUES (?, ?, ?, ?, ?, ?)');
  insertTicketSup.run(crypto.randomUUID(), r1Id, 'Saffron & Hearth', 'Configure secondary POS printer routing for Patio bar', 'HIGH', 'OPEN');
  insertTicketSup.run(crypto.randomUUID(), r3Id, 'Verbena Osteria', 'Request custom domain CNAME verification for verbenaosteria.com', 'NORMAL', 'IN_PROGRESS');
  insertTicketSup.run(crypto.randomUUID(), r2Id, 'Kuro Robata & Ramen', 'Enterprise multi-branch tax export CSV format', 'LOW', 'RESOLVED');

  // Notifications
  const insertNotif = db.prepare('INSERT INTO notifications (id, restaurant_id, user_id, title, message, type, is_read) VALUES (?, ?, ?, ?, ?, ?, 0)');
  insertNotif.run(crypto.randomUUID(), r1Id, owner1Id, 'New Dine-In Order ZQ-1042', 'Table T-02 placed a $54.25 order routed to Saute Line.', 'ORDER');
  insertNotif.run(crypto.randomUUID(), r1Id, owner1Id, 'Low Inventory Alert', 'Artisanal Pugliese Burrata is below reorder threshold (6 / 8 cases).', 'INVENTORY');

  // Audit Log
  db.prepare(
    `INSERT INTO audit_logs (id, restaurant_id, actor_user_id, actor_email, actor_role, action, resource_type, resource_id, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    r1Id,
    superAdminId,
    'superadmin@vireleo.io',
    'PLATFORM_SUPER_ADMIN',
    'DEMO_TENANT_PROVISIONED',
    'RESTAURANT',
    r1Id,
    JSON.stringify({ slug: 'saffron-hearth', isDemo: true }),
    nowIso
  );
}
