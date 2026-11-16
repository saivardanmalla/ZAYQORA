import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dbPath = process.env.SQLITE_DB_PATH || path.resolve(process.cwd(), 'data', 'zayqora.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      permissions_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS restaurants (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      logo_url TEXT NOT NULL DEFAULT '',
      cover_url TEXT NOT NULL DEFAULT '',
      primary_color TEXT NOT NULL DEFAULT '#101D35',
      accent_color TEXT NOT NULL DEFAULT '#0D9488',
      theme_style TEXT NOT NULL DEFAULT 'editorial',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      is_published INTEGER NOT NULL DEFAULT 1,
      address TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      social_links_json TEXT NOT NULL DEFAULT '{}',
      gallery_json TEXT NOT NULL DEFAULT '[]',
      opening_hours_json TEXT NOT NULL DEFAULT '{}',
      delivery_enabled INTEGER NOT NULL DEFAULT 1,
      pickup_enabled INTEGER NOT NULL DEFAULT 1,
      dine_in_enabled INTEGER NOT NULL DEFAULT 1,
      tax_rate REAL NOT NULL DEFAULT 0.085,
      delivery_fee_cents INTEGER NOT NULL DEFAULT 499,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role_code TEXT NOT NULL,
      restaurant_id TEXT REFERENCES restaurants(id) ON DELETE SET NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      is_primary INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS restaurant_settings (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT UNIQUE NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      auto_accept_orders INTEGER NOT NULL DEFAULT 0,
      kds_sound_enabled INTEGER NOT NULL DEFAULT 1,
      prep_time_minutes INTEGER NOT NULL DEFAULT 20,
      reservation_slot_minutes INTEGER NOT NULL DEFAULT 90,
      payment_region TEXT NOT NULL DEFAULT 'US',
      currency TEXT NOT NULL DEFAULT 'USD'
    );

    CREATE TABLE IF NOT EXISTS menu_categories (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price_cents INTEGER NOT NULL,
      image_url TEXT NOT NULL DEFAULT '',
      is_available INTEGER NOT NULL DEFAULT 1,
      is_featured INTEGER NOT NULL DEFAULT 0,
      prep_minutes INTEGER NOT NULL DEFAULT 15,
      dietary_tags_json TEXT NOT NULL DEFAULT '[]',
      station TEXT NOT NULL DEFAULT 'MAIN_GRILL'
    );

    CREATE TABLE IF NOT EXISTS variants (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      menu_item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      price_delta_cents INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS modifiers (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      menu_item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      price_cents INTEGER NOT NULL DEFAULT 0,
      is_required INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      total_orders INTEGER NOT NULL DEFAULT 0,
      total_spent_cents INTEGER NOT NULL DEFAULT 0,
      loyalty_points INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tables (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
      table_number TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      zone TEXT NOT NULL DEFAULT 'Main Dining',
      status TEXT NOT NULL DEFAULT 'AVAILABLE',
      qr_code_token TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
      table_id TEXT REFERENCES tables(id) ON DELETE SET NULL,
      customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT NOT NULL DEFAULT '',
      reservation_date TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      party_size INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'CONFIRMED',
      notes TEXT NOT NULL DEFAULT '',
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
      order_number TEXT NOT NULL,
      customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT NOT NULL DEFAULT '',
      delivery_address TEXT NOT NULL DEFAULT '',
      order_type TEXT NOT NULL,
      table_number TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'PENDING',
      subtotal_cents INTEGER NOT NULL,
      discount_cents INTEGER NOT NULL DEFAULT 0,
      tax_cents INTEGER NOT NULL DEFAULT 0,
      delivery_fee_cents INTEGER NOT NULL DEFAULT 0,
      total_cents INTEGER NOT NULL,
      coupon_code TEXT NOT NULL DEFAULT '',
      payment_status TEXT NOT NULL DEFAULT 'PENDING',
      payment_method TEXT NOT NULL DEFAULT 'CARD_SANDBOX',
      idempotency_key TEXT NOT NULL,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(restaurant_id, idempotency_key)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      menu_item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
      item_name TEXT NOT NULL,
      variant_name TEXT NOT NULL DEFAULT '',
      modifiers_json TEXT NOT NULL DEFAULT '[]',
      quantity INTEGER NOT NULL,
      unit_price_cents INTEGER NOT NULL,
      line_total_cents INTEGER NOT NULL,
      special_instructions TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      provider TEXT NOT NULL DEFAULT 'ZAYQORA_SANDBOX_PAY',
      provider_ref TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'INITIATED',
      webhook_verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS kitchen_tickets (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      order_number TEXT NOT NULL,
      station TEXT NOT NULL DEFAULT 'MAIN_GRILL',
      status TEXT NOT NULL DEFAULT 'NEW',
      started_at TEXT,
      ready_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      role_code TEXT NOT NULL,
      shift_schedule TEXT NOT NULL DEFAULT 'Tue–Sat 14:00–22:00',
      hourly_rate_cents INTEGER NOT NULL DEFAULT 2200,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      sku TEXT NOT NULL,
      item_name TEXT NOT NULL,
      category TEXT NOT NULL,
      quantity_on_hand REAL NOT NULL,
      unit TEXT NOT NULL,
      reorder_level REAL NOT NULL,
      cost_per_unit_cents INTEGER NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS coupons (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      discount_type TEXT NOT NULL DEFAULT 'PERCENT',
      discount_value INTEGER NOT NULL,
      min_order_cents INTEGER NOT NULL DEFAULT 0,
      max_uses INTEGER NOT NULL DEFAULT 500,
      used_count INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT NOT NULL,
      UNIQUE(restaurant_id, code)
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT UNIQUE NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      plan_code TEXT NOT NULL DEFAULT 'GROWTH',
      plan_name TEXT NOT NULL DEFAULT 'Growth Kitchen',
      monthly_price_cents INTEGER NOT NULL DEFAULT 14900,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      current_period_end TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT REFERENCES restaurants(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'INFO',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT,
      actor_user_id TEXT,
      actor_email TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT REFERENCES restaurants(id) ON DELETE SET NULL,
      restaurant_name TEXT NOT NULL,
      subject TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'NORMAL',
      status TEXT NOT NULL DEFAULT 'OPEN',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reservations_slot ON reservations(restaurant_id, reservation_date, time_slot);
    CREATE INDEX IF NOT EXISTS idx_kds_restaurant ON kitchen_tickets(restaurant_id, status);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
  `);

  // Safe additive migrations for Website Builder SEO & sections config
  const cols = db.prepare("PRAGMA table_info(restaurants)").all() as Array<{ name: string }>;
  const existingCols = new Set(cols.map((c) => c.name));
  if (!existingCols.has('tagline')) {
    db.exec("ALTER TABLE restaurants ADD COLUMN tagline TEXT NOT NULL DEFAULT 'Crafted daily with seasonal provenance'");
  }
  if (!existingCols.has('seo_title')) {
    db.exec("ALTER TABLE restaurants ADD COLUMN seo_title TEXT NOT NULL DEFAULT ''");
  }
  if (!existingCols.has('seo_description')) {
    db.exec("ALTER TABLE restaurants ADD COLUMN seo_description TEXT NOT NULL DEFAULT ''");
  }
  if (!existingCols.has('sections_config_json')) {
    db.exec(
      `ALTER TABLE restaurants ADD COLUMN sections_config_json TEXT NOT NULL DEFAULT '{"showFeatured":true,"showStory":true,"showGallery":true,"showReviews":true,"showOffers":true}'`
    );
  }
}
