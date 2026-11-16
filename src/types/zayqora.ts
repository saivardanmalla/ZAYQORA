export type RoleCode =
  | 'PLATFORM_SUPER_ADMIN'
  | 'RESTAURANT_OWNER'
  | 'RESTAURANT_MANAGER'
  | 'CASHIER'
  | 'CHEF'
  | 'WAITER'
  | 'DELIVERY_RIDER'
  | 'ACCOUNTANT'
  | 'CUSTOMER';

export interface AuthUser {
  userId: string;
  email: string;
  fullName: string;
  roleCode: RoleCode;
  restaurantId: string | null;
  emailVerified: boolean;
  isDemoSession?: boolean;
}

export interface RestaurantSummary {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  cover_url: string;
  primary_color: string;
  accent_color: string;
  address: string;
  delivery_enabled: number;
  pickup_enabled: number;
  dine_in_enabled: number;
  is_demo: number;
  status: 'ACTIVE' | 'TRIAL' | 'SUSPENDED';
}

export interface RestaurantSectionsConfig {
  showFeatured: boolean;
  showStory: boolean;
  showGallery: boolean;
  showReviews: boolean;
  showOffers: boolean;
}

export interface RestaurantFull extends RestaurantSummary {
  logo_url: string;
  tagline?: string;
  seo_title?: string;
  seo_description?: string;
  theme_style: string;
  is_published: number;
  phone: string;
  email: string;
  tax_rate: number;
  delivery_fee_cents: number;
  social_links: Record<string, string>;
  gallery: string[];
  opening_hours: Record<string, string>;
  sections_config?: RestaurantSectionsConfig;
}

export interface MenuCategory {
  id: string;
  restaurant_id: string;
  name: string;
  description: string;
  sort_order: number;
  is_active: number;
}

export interface MenuVariant {
  id: string;
  menu_item_id: string;
  name: string;
  price_delta_cents: number;
}

export interface MenuModifier {
  id: string;
  menu_item_id: string;
  name: string;
  price_cents: number;
  is_required: number;
}

export interface MenuItem {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description: string;
  price_cents: number;
  image_url: string;
  is_available: number;
  is_featured: number;
  prep_minutes: number;
  dietary_tags: string[];
  station: string;
  variants: MenuVariant[];
  modifiers: MenuModifier[];
}

export interface CartItem {
  cartLineId: string;
  menuItem: MenuItem;
  variant: MenuVariant | null;
  modifiers: MenuModifier[];
  quantity: number;
  specialInstructions: string;
}

export interface OrderItemRecord {
  id: string;
  order_id: string;
  menu_item_id: string;
  item_name: string;
  variant_name: string;
  modifiers_json: string;
  modifiers?: string[];
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  special_instructions: string;
}

export interface OrderRecord {
  id: string;
  restaurant_id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  delivery_address: string;
  order_type: 'DELIVERY' | 'PICKUP' | 'DINE_IN';
  table_number: string;
  status: 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  delivery_fee_cents: number;
  total_cents: number;
  coupon_code: string;
  payment_status: string;
  payment_method: string;
  is_demo: number;
  created_at: string;
  items?: OrderItemRecord[];
  restaurant_name?: string;
  restaurant_slug?: string;
}

export interface KitchenTicket {
  id: string;
  restaurant_id: string;
  order_id: string;
  order_number: string;
  station: string;
  status: 'NEW' | 'PREPARING' | 'READY' | 'SERVED';
  started_at: string | null;
  ready_at: string | null;
  created_at: string;
  order_type?: string;
  table_number?: string;
  customer_name?: string;
  items?: OrderItemRecord[];
}

export interface ReservationRecord {
  id: string;
  restaurant_id: string;
  table_id: string | null;
  table_number?: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  reservation_date: string;
  time_slot: string;
  party_size: number;
  status: 'CONFIRMED' | 'SEATED' | 'COMPLETED' | 'CANCELLED';
  notes: string;
  is_demo: number;
  created_at: string;
}

export interface TableRecord {
  id: string;
  restaurant_id: string;
  table_number: string;
  capacity: number;
  zone: string;
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED';
  qr_code_token: string;
}

export interface CustomerRecord {
  id: string;
  restaurant_id: string;
  name: string;
  email: string;
  phone: string;
  total_orders: number;
  total_spent_cents: number;
  loyalty_points: number;
}

export interface StaffRecord {
  id: string;
  restaurant_id: string;
  full_name: string;
  email: string;
  role_code: RoleCode;
  shift_schedule: string;
  hourly_rate_cents: number;
  status: string;
}

export interface InventoryRecord {
  id: string;
  restaurant_id: string;
  sku: string;
  item_name: string;
  category: string;
  quantity_on_hand: number;
  unit: string;
  reorder_level: number;
  cost_per_unit_cents: number;
}

export interface CouponRecord {
  id: string;
  restaurant_id: string;
  code: string;
  description: string;
  discount_type: 'PERCENT' | 'FIXED';
  discount_value: number;
  min_order_cents: number;
  used_count: number;
  is_active: number;
  expires_at: string;
}

export interface NotificationRecord {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: number;
  created_at: string;
}

export interface SubscriptionRecord {
  id: string;
  restaurant_id: string;
  plan_code: 'STARTER' | 'GROWTH' | 'ENTERPRISE';
  plan_name: string;
  monthly_price_cents: number;
  status: string;
  current_period_end: string;
}

export interface AuditLogRecord {
  id: string;
  restaurant_id: string | null;
  actor_email: string;
  actor_role: string;
  action: string;
  resource_type: string;
  resource_id: string;
  metadata_json: string;
  created_at: string;
}
