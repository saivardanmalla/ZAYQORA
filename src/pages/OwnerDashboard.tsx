import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  ShoppingBag,
  Utensils,
  Calendar,
  Grid3X3,
  Users,
  UserCog,
  ChefHat,
  Package,
  Tag,
  BarChart3,
  Globe,
  Settings,
  CreditCard,
  PanelLeftClose,
  PanelLeftOpen,
  Bell,
  Search,
  ExternalLink,
  Plus,
  Sun,
  Moon,
  Monitor,
  Tablet,
  Smartphone,
  ChevronDown,
  LogOut,
  Check,
  TrendingUp,
  Clock,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { apiRequest, formatCurrency, useZayqoraSocket } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { ZCard, ZStatCard, ZButton, ZStatusText } from '../components/ui/DesignSystem';
import type {
  CouponRecord,
  CustomerRecord,
  InventoryRecord,
  KitchenTicket,
  MenuCategory,
  MenuItem,
  NotificationRecord,
  OrderRecord,
  ReservationRecord,
  RestaurantFull,
  RestaurantSectionsConfig,
  StaffRecord,
  SubscriptionRecord,
  TableRecord,
} from '../types/zayqora';

interface OwnerDashboardProps {
  navigate: (to: string) => void;
  onOpenAuth: () => void;
}

type ModuleId =
  | 'overview'
  | 'orders'
  | 'menu'
  | 'reservations'
  | 'tables'
  | 'customers'
  | 'staff'
  | 'kitchen'
  | 'inventory'
  | 'coupons'
  | 'reports'
  | 'website'
  | 'settings'
  | 'billing';

const NAV_GROUPS: Array<{
  title: string;
  items: Array<{ id: ModuleId; label: string; icon: React.ComponentType<{ className?: string }> }>;
}> = [
  {
    title: 'Operations',
    items: [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
      { id: 'orders', label: 'Orders', icon: ShoppingBag },
      { id: 'kitchen', label: 'Kitchen Management', icon: ChefHat },
      { id: 'reservations', label: 'Reservations', icon: Calendar },
      { id: 'tables', label: 'Floor & Tables', icon: Grid3X3 },
    ],
  },
  {
    title: 'Catalog & CRM',
    items: [
      { id: 'menu', label: 'Menu Management', icon: Utensils },
      { id: 'inventory', label: 'Inventory', icon: Package },
      { id: 'customers', label: 'Customers', icon: Users },
      { id: 'coupons', label: 'Offers & Coupons', icon: Tag },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { id: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
      { id: 'website', label: 'Website Builder', icon: Globe },
      { id: 'staff', label: 'Staff Management', icon: UserCog },
      { id: 'settings', label: 'Restaurant Settings', icon: Settings },
      { id: 'billing', label: 'Subscription & Billing', icon: CreditCard },
    ],
  },
];

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: '#0D9488',
  READY: '#10B981',
  PREPARING: '#E9B44C',
  CONFIRMED: '#3B82F6',
  PENDING: '#64748B',
  CANCELLED: '#EF4444',
};

const COVER_PRESETS = [
  { label: 'Candlelit Copper Hearth', url: '/src/assets/images/hero_saffron_hearth_1794828971752.jpg' },
  { label: 'Artisan Counter & Kitchen', url: '/src/assets/images/hero_kuro_ramen_1794828971544.jpg' },
  { label: 'Sunlit Coastal Terrace', url: '/src/assets/images/hero_verbena_bistro_1794828971700.jpg' },
];

interface WorkspaceData {
  restaurant: RestaurantFull;
  availableRestaurants: Array<{ id: string; name: string; slug: string; category: string; status: string }>;
  settings: {
    auto_accept_orders: number;
    kds_sound_enabled: number;
    prep_time_minutes: number;
  };
  subscription: SubscriptionRecord;
  kpis: {
    totalOrders: number;
    todayRevenueCents: number;
    pendingOrders: number;
    completedOrders: number;
    totalCustomers: number;
    avgOrderValueCents: number;
    upcomingReservations: number;
    topSellingItems: Array<{ name: string; count: number; revenueCents: number }>;
  };
  orderStatusDistribution: Array<{ status: string; count: number }>;
  revenueTrend: Array<{ label: string; revenue: number; orders: number }>;
  orders: OrderRecord[];
  categories: MenuCategory[];
  menuItems: MenuItem[];
  reservations: ReservationRecord[];
  tables: TableRecord[];
  customers: CustomerRecord[];
  staff: StaffRecord[];
  inventory: InventoryRecord[];
  coupons: CouponRecord[];
  tickets: KitchenTicket[];
  notifications: NotificationRecord[];
}

export function OwnerDashboard({ navigate, onOpenAuth }: OwnerDashboardProps) {
  const { user, token, demoLogin, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeModule, setActiveModule] = useState<ModuleId>('overview');
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Top nav popovers & search
  const [globalSearch, setGlobalSearch] = useState('');
  const [showNotifs, setShowNotifs] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [bannerMsg, setBannerMsg] = useState('');

  // Orders & Reservations views
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('ALL');
  const [resViewMode, setResViewMode] = useState<'calendar' | 'list'>('calendar');

  // Quick creation forms
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('22');
  const [newItemCat, setNewItemCat] = useState('');
  const [newItemStation, setNewItemStation] = useState('MAIN_GRILL');

  const [newTableNum, setNewTableNum] = useState('');
  const [newTableCap, setNewTableCap] = useState('4');
  const [newTableZone, setNewTableZone] = useState('Main Dining');

  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<
    'WAITER' | 'CHEF' | 'CASHIER' | 'RESTAURANT_MANAGER' | 'DELIVERY_RIDER' | 'ACCOUNTANT'
  >('WAITER');

  const [newInvSku, setNewInvSku] = useState('');
  const [newInvName, setNewInvName] = useState('');
  const [newInvQty, setNewInvQty] = useState('10');

  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponDesc, setNewCouponDesc] = useState('');
  const [newCouponVal, setNewCouponVal] = useState('15');

  // Part 7: Visual Website Builder state
  const [wbTab, setWbTab] = useState<'branding' | 'details' | 'sections' | 'images' | 'seo'>('branding');
  const [wbDevice, setWbDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [wbName, setWbName] = useState('');
  const [wbTagline, setWbTagline] = useState('');
  const [wbDesc, setWbDesc] = useState('');
  const [wbPrimary, setWbPrimary] = useState('#101D35');
  const [wbAccent, setWbAccent] = useState('#0D9488');
  const [wbCover, setWbCover] = useState('');
  const [wbLogo, setWbLogo] = useState('');
  const [wbAddress, setWbAddress] = useState('');
  const [wbPhone, setWbPhone] = useState('');
  const [wbEmail, setWbEmail] = useState('');
  const [wbSeoTitle, setWbSeoTitle] = useState('');
  const [wbSeoDesc, setWbSeoDesc] = useState('');
  const [wbSections, setWbSections] = useState<RestaurantSectionsConfig>({
    showFeatured: true,
    showStory: true,
    showGallery: true,
    showReviews: true,
    showOffers: true,
  });
  const [wbSaving, setWbSaving] = useState(false);

  // Settings editable state
  const [setAutoAccept, setSetAutoAccept] = useState(false);
  const [setKdsSound, setSetKdsSound] = useState(true);
  const [setPrepMins, setSetPrepMins] = useState(20);
  const [setDelivery, setSetDelivery] = useState(true);
  const [setPickup, setSetPickup] = useState(true);
  const [setDineIn, setSetDineIn] = useState(true);
  const [setTaxRate, setSetTaxRate] = useState(0.085);
  const [setDeliveryFee, setSetDeliveryFee] = useState(4.99);

  const targetRestaurantId =
    selectedTenantId ||
    user?.restaurantId ||
    (user?.roleCode === 'PLATFORM_SUPER_ADMIN' ? '11111111-1111-4111-8111-111111111101' : null);

  const loadWorkspace = useCallback(async () => {
    if (!token || !targetRestaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest<WorkspaceData>(`/api/dashboard/${targetRestaurantId}/workspace`);
      setWorkspace(data);
      setNewItemCat((prev) => prev || data.categories[0]?.id || '');

      // Hydrate Website Builder
      setWbName(data.restaurant.name);
      setWbTagline(data.restaurant.tagline || 'Crafted daily with seasonal provenance');
      setWbDesc(data.restaurant.description);
      setWbPrimary(data.restaurant.primary_color);
      setWbAccent(data.restaurant.accent_color);
      setWbCover(data.restaurant.cover_url);
      setWbLogo(data.restaurant.logo_url || '');
      setWbAddress(data.restaurant.address);
      setWbPhone(data.restaurant.phone);
      setWbEmail(data.restaurant.email);
      setWbSeoTitle(data.restaurant.seo_title || `${data.restaurant.name} — Official Website`);
      setWbSeoDesc(data.restaurant.seo_description || data.restaurant.description);
      if (data.restaurant.sections_config) {
        setWbSections(data.restaurant.sections_config);
      }

      // Hydrate Operational Settings
      setSetAutoAccept(Boolean(data.settings?.auto_accept_orders));
      setSetKdsSound(Boolean(data.settings?.kds_sound_enabled));
      setSetPrepMins(data.settings?.prep_time_minutes || 20);
      setSetDelivery(Boolean(data.restaurant.delivery_enabled));
      setSetPickup(Boolean(data.restaurant.pickup_enabled));
      setSetDineIn(Boolean(data.restaurant.dine_in_enabled));
      setSetTaxRate(data.restaurant.tax_rate);
      setSetDeliveryFee(data.restaurant.delivery_fee_cents / 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load restaurant workspace');
    } finally {
      setLoading(false);
    }
  }, [token, targetRestaurantId]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  useZayqoraSocket(
    { token, enabled: Boolean(token && targetRestaurantId) },
    (msg) => {
      if (
        ['order:created', 'order:updated', 'kds:ticket_updated', 'reservation:created', 'reservation:updated'].includes(
          msg.type
        )
      ) {
        loadWorkspace();
      }
    }
  );

  const globalSearchMatches = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q || !workspace) return [];
    const results: Array<{ kind: string; title: string; subtitle: string; module: ModuleId }> = [];
    for (const o of workspace.orders) {
      if (o.order_number.toLowerCase().includes(q) || o.customer_name.toLowerCase().includes(q)) {
        results.push({
          kind: 'Order',
          title: `${o.order_number} · ${o.customer_name}`,
          subtitle: `${o.status} · ${formatCurrency(o.total_cents)}`,
          module: 'orders',
        });
      }
    }
    for (const m of workspace.menuItems) {
      if (m.name.toLowerCase().includes(q)) {
        results.push({
          kind: 'Dish',
          title: m.name,
          subtitle: formatCurrency(m.price_cents),
          module: 'menu',
        });
      }
    }
    for (const c of workspace.customers) {
      if (c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)) {
        results.push({
          kind: 'Guest',
          title: c.name,
          subtitle: `${c.total_orders} orders · ${formatCurrency(c.total_spent_cents)}`,
          module: 'customers',
        });
      }
    }
    return results.slice(0, 6);
  }, [globalSearch, workspace]);

  const filteredOrders = useMemo(() => {
    if (!workspace) return [];
    return workspace.orders.filter((o) => {
      const stMatch = orderStatusFilter === 'ALL' || o.status === orderStatusFilter;
      const q = orderSearch.trim().toLowerCase();
      const qMatch =
        !q ||
        o.order_number.toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q) ||
        o.customer_email.toLowerCase().includes(q);
      return stMatch && qMatch;
    });
  }, [workspace, orderStatusFilter, orderSearch]);

  const channelChartData = useMemo(() => {
    if (!workspace) return [];
    const byType = new Map<string, { channel: string; revenue: number; orders: number }>();
    for (const o of workspace.orders) {
      if (o.status === 'CANCELLED') continue;
      const prev = byType.get(o.order_type) || { channel: o.order_type, revenue: 0, orders: 0 };
      prev.revenue = Number((prev.revenue + o.total_cents / 100).toFixed(2));
      prev.orders += 1;
      byType.set(o.order_type, prev);
    }
    return Array.from(byType.values());
  }, [workspace]);

  const reservationSlotsMap = useMemo(() => {
    if (!workspace) return [];
    const grouped = new Map<string, ReservationRecord[]>();
    for (const r of workspace.reservations) {
      const key = `${r.reservation_date} · ${r.time_slot}`;
      const list = grouped.get(key) || [];
      list.push(r);
      grouped.set(key, list);
    }
    return Array.from(grouped.entries());
  }, [workspace]);

  if (!user || (!user.restaurantId && user.roleCode !== 'PLATFORM_SUPER_ADMIN')) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20 text-center space-y-4">
        <h1 className="text-2xl font-bold text-[#0F172A] dark:text-white">Restaurant Owner Workspace</h1>
        <p className="text-sm text-[#64748B] dark:text-slate-400">
          Sign in with a Restaurant Owner, Manager, or Staff account to access your isolated tenant dashboard.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <ZButton variant="secondary" size="lg" onClick={onOpenAuth}>
            Sign In
          </ZButton>
          <ZButton variant="primary" size="lg" onClick={() => demoLogin('owner@saffronhearth.demo')}>
            Explore Demo Owner (Saffron &amp; Hearth)
          </ZButton>
        </div>
      </div>
    );
  }

  if (loading && !workspace) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="h-96 rounded-xl bg-white dark:bg-[#101D35] border border-[#E2E8F0] dark:border-slate-800 animate-pulse" />
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20 text-center space-y-4">
        <h2 className="text-xl font-bold text-[#0F172A] dark:text-white">Access Restricted</h2>
        <p className="text-sm text-red-600 dark:text-red-400">{error || 'Workspace unavailable for this role.'}</p>
        <ZButton variant="secondary" onClick={() => navigate('/')}>
          Return Home
        </ZButton>
      </div>
    );
  }

  const rid = workspace.restaurant.id;
  const unreadNotifCount = workspace.notifications.filter((n) => !n.is_read).length;

  const markNotificationsRead = async () => {
    await apiRequest(`/api/dashboard/${rid}/notifications/read-all`, { method: 'PATCH' });
    loadWorkspace();
  };

  const updateOrderStatus = async (orderId: string, status: OrderRecord['status']) => {
    await apiRequest(`/api/dashboard/${rid}/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    loadWorkspace();
  };

  const handleAddMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || !newItemCat) return;
    await apiRequest(`/api/dashboard/${rid}/menu/items`, {
      method: 'POST',
      body: JSON.stringify({
        categoryId: newItemCat,
        name: newItemName,
        priceDollars: Number(newItemPrice),
        station: newItemStation,
      }),
    });
    setNewItemName('');
    loadWorkspace();
  };

  const toggleMenuItem = async (itemId: string) => {
    await apiRequest(`/api/dashboard/${rid}/menu/items/${itemId}/toggle`, { method: 'PATCH' });
    loadWorkspace();
  };

  const handleAddTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableNum.trim()) return;
    await apiRequest(`/api/dashboard/${rid}/tables`, {
      method: 'POST',
      body: JSON.stringify({ tableNumber: newTableNum, capacity: Number(newTableCap), zone: newTableZone }),
    });
    setNewTableNum('');
    loadWorkspace();
  };

  const updateTableStatus = async (tableId: string, status: TableRecord['status']) => {
    await apiRequest(`/api/dashboard/${rid}/tables/${tableId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    loadWorkspace();
  };

  const updateReservationStatus = async (resId: string, status: ReservationRecord['status']) => {
    await apiRequest(`/api/dashboard/${rid}/reservations/${resId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    loadWorkspace();
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName.trim() || !newStaffEmail.trim()) return;
    await apiRequest(`/api/dashboard/${rid}/staff`, {
      method: 'POST',
      body: JSON.stringify({
        fullName: newStaffName,
        email: newStaffEmail,
        roleCode: newStaffRole,
        shiftSchedule: 'Tue–Sat 16:00–23:00',
        hourlyRateDollars: 24,
      }),
    });
    setNewStaffName('');
    setNewStaffEmail('');
    loadWorkspace();
  };

  const handleAddInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInvSku.trim() || !newInvName.trim()) return;
    await apiRequest(`/api/dashboard/${rid}/inventory`, {
      method: 'POST',
      body: JSON.stringify({
        sku: newInvSku,
        itemName: newInvName,
        category: 'Kitchen Supplies',
        quantityOnHand: Number(newInvQty),
        unit: 'units',
        reorderLevel: 5,
        costPerUnitDollars: 18,
      }),
    });
    setNewInvSku('');
    setNewInvName('');
    loadWorkspace();
  };

  const adjustStock = async (item: InventoryRecord, delta: number) => {
    const nextQty = Math.max(0, item.quantity_on_hand + delta);
    await apiRequest(`/api/dashboard/${rid}/inventory/${item.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantityOnHand: nextQty }),
    });
    loadWorkspace();
  };

  const handleAddCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCouponCode.trim()) return;
    await apiRequest(`/api/dashboard/${rid}/coupons`, {
      method: 'POST',
      body: JSON.stringify({
        code: newCouponCode.toUpperCase(),
        description: newCouponDesc || 'Seasonal discount',
        discountType: 'PERCENT',
        discountValue: Number(newCouponVal),
        minOrderDollars: 20,
      }),
    });
    setNewCouponCode('');
    setNewCouponDesc('');
    loadWorkspace();
  };

  const handleSaveWebsite = async (publishNow: boolean) => {
    setWbSaving(true);
    try {
      await apiRequest(`/api/dashboard/${rid}/website`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: wbName,
          tagline: wbTagline,
          description: wbDesc,
          primaryColor: wbPrimary,
          accentColor: wbAccent,
          coverUrl: wbCover,
          logoUrl: wbLogo,
          address: wbAddress,
          phone: wbPhone,
          email: wbEmail,
          seoTitle: wbSeoTitle,
          seoDescription: wbSeoDesc,
          sectionsConfig: wbSections,
          isPublished: publishNow,
          openingHours: workspace.restaurant.opening_hours,
          socialLinks: workspace.restaurant.social_links,
        }),
      });
      setBannerMsg(publishNow ? 'Storefront published live.' : 'Website changes saved as unpublished draft.');
      loadWorkspace();
    } finally {
      setWbSaving(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest(`/api/dashboard/${rid}/settings`, {
      method: 'PATCH',
      body: JSON.stringify({
        autoAcceptOrders: setAutoAccept,
        kdsSoundEnabled: setKdsSound,
        prepTimeMinutes: Number(setPrepMins),
        deliveryEnabled: setDelivery,
        pickupEnabled: setPickup,
        dineInEnabled: setDineIn,
        taxRate: Number(setTaxRate),
        deliveryFeeDollars: Number(setDeliveryFee),
      }),
    });
    setBannerMsg('Restaurant operational settings saved.');
    loadWorkspace();
  };

  const handleUpgradePlan = async (planCode: 'STARTER' | 'GROWTH' | 'ENTERPRISE') => {
    await apiRequest(`/api/dashboard/${rid}/subscription`, {
      method: 'PATCH',
      body: JSON.stringify({ planCode }),
    });
    setBannerMsg(`Subscription updated to ${planCode}.`);
    loadWorkspace();
  };

  const previewWidthClass =
    wbDevice === 'mobile' ? 'max-w-[375px]' : wbDevice === 'tablet' ? 'max-w-[768px]' : 'max-w-full';

  return (
    <div className="min-h-[calc(100vh-65px)] flex bg-[#F8FAFC] dark:bg-[#0B1426]">
      {/* 1. Premium Collapsible Sidebar */}
      <aside
        className={`bg-[#101D35] dark:bg-[#091020] text-slate-300 border-r border-slate-800 flex flex-col justify-between shrink-0 transition-all duration-200 ${
          sidebarCollapsed ? 'w-[72px]' : 'w-[260px]'
        }`}
      >
        <div className="p-3 space-y-4 overflow-y-auto">
          {/* Restaurant Logo & Switcher */}
          <div className="px-2 py-2.5 border-b border-white/10 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center font-heading font-bold text-xs text-white shrink-0"
                  style={{ backgroundColor: workspace.restaurant.accent_color || '#0D9488' }}
                >
                  {workspace.restaurant.name.slice(0, 2).toUpperCase()}
                </div>
                {!sidebarCollapsed && (
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{workspace.restaurant.name}</div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {workspace.restaurant.is_demo ? 'Demo Workspace' : workspace.restaurant.status}
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={() => setSidebarCollapsed((c) => !c)}
                aria-label="Toggle sidebar"
                className="p-1.5 text-slate-400 hover:text-white rounded-md cursor-pointer shrink-0"
              >
                {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
              </button>
            </div>

            {!sidebarCollapsed && workspace.availableRestaurants.length > 1 && (
              <select
                aria-label="Switch restaurant workspace"
                value={workspace.restaurant.id}
                onChange={(e) => setSelectedTenantId(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white/10 border border-white/15 rounded-lg text-xs text-white focus:outline-none cursor-pointer"
              >
                {workspace.availableRestaurants.map((r) => (
                  <option key={r.id} value={r.id} className="text-[#101D35]">
                    {r.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Grouped Navigation */}
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="space-y-1">
              {!sidebarCollapsed && (
                <div className="px-3 text-[11px] font-semibold tracking-wide text-slate-400">
                  {group.title}
                </div>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = activeModule === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveModule(item.id)}
                    title={item.label}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#0D9488] text-white'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {!sidebarCollapsed && (
          <div className="p-3 border-t border-white/10 space-y-2">
            <button
              onClick={() => navigate(`/r/${workspace.restaurant.slug}`)}
              className="w-full py-2 px-3 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Visit Storefront</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </aside>

      {/* Main Workspace Viewport */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* 2. Professional Top Navigation Bar */}
        <div className="bg-white dark:bg-[#101D35] border-b border-[#E2E8F0] dark:border-slate-800 px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0F172A] dark:text-white">
            <span className="truncate max-w-[180px]">{workspace.restaurant.name}</span>
            <span className="text-[#64748B]">/</span>
            <span className="text-[#0D9488]">
              {ALL_NAV_ITEMS.find((n) => n.id === activeModule)?.label}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Global Search */}
            <div className="relative hidden sm:block w-64">
              <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Search orders, dishes, guests..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F8FAFC] dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 text-[#0F172A] dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
              />
              {globalSearchMatches.length > 0 && (
                <div className="absolute left-0 right-0 top-10 bg-white dark:bg-[#101D35] border border-[#E2E8F0] dark:border-slate-700 rounded-xl shadow-xl p-2 z-50 space-y-1">
                  {globalSearchMatches.map((m, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setActiveModule(m.module);
                        setGlobalSearch('');
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <div className="text-xs font-semibold text-[#0F172A] dark:text-white">
                        {m.kind}: {m.title}
                      </div>
                      <div className="text-[11px] text-[#64748B] dark:text-slate-400">{m.subtitle}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Light / Dark Mode Switcher */}
            <button
              onClick={toggleTheme}
              aria-label="Toggle light and dark theme"
              className="p-2 text-[#64748B] dark:text-slate-300 hover:text-[#0F172A] dark:hover:text-white border border-[#E2E8F0] dark:border-slate-700 rounded-lg cursor-pointer"
              title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
            >
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>

            {/* Notification Center */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowNotifs((s) => !s);
                  setShowProfileMenu(false);
                }}
                aria-label="Toggle notification center"
                className="p-2 text-[#64748B] dark:text-slate-300 hover:text-[#0F172A] dark:hover:text-white border border-[#E2E8F0] dark:border-slate-700 rounded-lg relative cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#0D9488] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unreadNotifCount}
                  </span>
                )}
              </button>

              {showNotifs && (
                <div className="absolute right-0 top-11 w-80 bg-white dark:bg-[#101D35] border border-[#E2E8F0] dark:border-slate-700 rounded-xl shadow-xl p-4 z-50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#0F172A] dark:text-white">Notification Center</span>
                    {unreadNotifCount > 0 && (
                      <button
                        onClick={markNotificationsRead}
                        className="text-[11px] font-semibold text-[#0D9488] hover:underline cursor-pointer"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {workspace.notifications.length === 0 ? (
                      <p className="py-4 text-xs text-[#64748B]">No notifications yet.</p>
                    ) : (
                      workspace.notifications.map((n) => (
                        <div key={n.id} className="py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-[#0F172A] dark:text-white">{n.title}</span>
                            {!n.is_read && <span className="text-[10px] font-semibold text-[#0D9488]">NEW</span>}
                          </div>
                          <div className="text-[11px] text-[#64748B] dark:text-slate-400 mt-0.5">{n.message}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Menu */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowProfileMenu((p) => !p);
                  setShowNotifs(false);
                }}
                className="flex items-center gap-2 px-3 py-1.5 border border-[#E2E8F0] dark:border-slate-700 rounded-lg text-xs font-semibold text-[#0F172A] dark:text-white cursor-pointer"
              >
                <span className="w-6 h-6 rounded-full bg-[#101D35] dark:bg-[#0D9488] text-white flex items-center justify-center text-[11px] font-bold">
                  {user.fullName.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden md:inline truncate max-w-[110px]">{user.fullName}</span>
                <ChevronDown className="w-3.5 h-3.5 text-[#64748B]" />
              </button>

              {showProfileMenu && (
                <div className="absolute right-0 top-11 w-64 bg-white dark:bg-[#101D35] border border-[#E2E8F0] dark:border-slate-700 rounded-xl shadow-xl p-3 z-50 space-y-2">
                  <div className="pb-2 border-b border-slate-100 dark:border-slate-800">
                    <div className="text-xs font-bold text-[#0F172A] dark:text-white truncate">{user.fullName}</div>
                    <div className="text-[11px] text-[#64748B] dark:text-slate-400 truncate">{user.email}</div>
                    <div className="text-[11px] font-data font-semibold text-[#0D9488] mt-0.5">{user.roleCode}</div>
                  </div>
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      navigate('/kds');
                    }}
                    className="w-full text-left px-2.5 py-1.5 text-xs rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-[#0F172A] dark:text-slate-200 cursor-pointer"
                  >
                    Open Kitchen Display (KDS)
                  </button>
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      navigate(`/r/${workspace.restaurant.slug}`);
                    }}
                    className="w-full text-left px-2.5 py-1.5 text-xs rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-[#0F172A] dark:text-slate-200 cursor-pointer"
                  >
                    Open Public Storefront
                  </button>
                  <button
                    onClick={logout}
                    className="w-full text-left px-2.5 py-1.5 text-xs rounded-md hover:bg-red-50 dark:hover:bg-red-950/50 text-red-600 flex items-center gap-2 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Scrollable Content */}
        <div className="p-6 space-y-6">
          {bannerMsg && (
            <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs font-medium text-emerald-800 dark:text-emerald-200 flex items-center justify-between">
              <span>{bannerMsg}</span>
              <button onClick={() => setBannerMsg('')} className="font-bold cursor-pointer">
                ×
              </button>
            </div>
          )}

          {/* MODULE 1: OVERVIEW */}
          {activeModule === 'overview' && (
            <div className="space-y-6">
              {workspace.restaurant.is_demo === 1 && (
                <div className="text-xs text-[#64748B] dark:text-slate-400">
                  Demo Workspace · Metrics below reflect live database records combined with clearly marked seeded demo transactions.
                </div>
              )}

              {/* 8 Enterprise KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <ZStatCard
                  label="Today's Revenue"
                  value={formatCurrency(workspace.kpis.todayRevenueCents)}
                  subtext="Confirmed & active orders"
                  icon={TrendingUp}
                  accent="teal"
                />
                <ZStatCard
                  label="Total Orders"
                  value={String(workspace.kpis.totalOrders)}
                  subtext="All fulfillment channels"
                  icon={ShoppingBag}
                />
                <ZStatCard
                  label="Pending Orders"
                  value={String(workspace.kpis.pendingOrders)}
                  subtext="In kitchen or awaiting pickup"
                  icon={Clock}
                  accent="gold"
                />
                <ZStatCard
                  label="Completed Orders"
                  value={String(workspace.kpis.completedOrders)}
                  subtext="Delivered or handed off"
                  icon={Check}
                />
                <ZStatCard
                  label="Average Order Value"
                  value={formatCurrency(workspace.kpis.avgOrderValueCents)}
                  subtext="Net of cancelled orders"
                />
                <ZStatCard
                  label="Active Customers"
                  value={String(workspace.kpis.totalCustomers)}
                  subtext="Loyalty & repeat guests"
                />
                <ZStatCard
                  label="Upcoming Reservations"
                  value={String(workspace.kpis.upcomingReservations)}
                  subtext="Confirmed table bookings"
                />
                <ZStatCard
                  label="Best-Selling Item"
                  value={workspace.kpis.topSellingItems[0]?.name || 'No orders yet'}
                  subtext={
                    workspace.kpis.topSellingItems[0]
                      ? `${workspace.kpis.topSellingItems[0].count} sold`
                      : undefined
                  }
                />
              </div>

              {/* Charts Row: Revenue Trend + Order Status Distribution */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <ZCard className="lg:col-span-8 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-[#0F172A] dark:text-white">
                        Revenue &amp; Order Trend
                      </h3>
                      <p className="text-xs text-[#64748B] dark:text-slate-400">
                        Live transaction timeline across active orders
                      </p>
                    </div>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={workspace.revenueTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" opacity={0.4} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                        <Tooltip />
                        <Area
                          type="monotone"
                          dataKey="revenue"
                          name="Revenue ($)"
                          stroke="#0D9488"
                          fill="#0D9488"
                          fillOpacity={0.18}
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </ZCard>

                <ZCard className="lg:col-span-4 p-6 flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-[#0F172A] dark:text-white">Order Status Distribution</h3>
                    <p className="text-xs text-[#64748B] dark:text-slate-400">Real-time order pipeline</p>
                  </div>
                  <div className="h-44 my-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={workspace.orderStatusDistribution}
                          dataKey="count"
                          nameKey="status"
                          innerRadius={45}
                          outerRadius={70}
                          paddingAngle={3}
                        >
                          {workspace.orderStatusDistribution.map((entry) => (
                            <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || '#64748B'} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {workspace.orderStatusDistribution.map((entry) => (
                      <div key={entry.status} className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[#64748B] dark:text-slate-300">
                          <span
                            className="w-2.5 h-2.5 rounded-xs shrink-0"
                            style={{ backgroundColor: STATUS_COLORS[entry.status] || '#64748B' }}
                          />
                          {entry.status}
                        </span>
                        <span className="font-data font-bold text-[#0F172A] dark:text-white">{entry.count}</span>
                      </div>
                    ))}
                  </div>
                </ZCard>
              </div>

              {/* Operational Grid: Recent Orders + Upcoming Reservations + Popular Food Items + Notifications */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <ZCard className="lg:col-span-7 p-6 overflow-x-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-[#0F172A] dark:text-white">Recent Orders</h3>
                    <button
                      onClick={() => setActiveModule('orders')}
                      className="text-xs font-semibold text-[#0D9488] hover:underline cursor-pointer"
                    >
                      View all →
                    </button>
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] dark:border-slate-800 text-[#64748B] dark:text-slate-400">
                        <th className="py-2 font-semibold">Order</th>
                        <th className="py-2 font-semibold">Guest</th>
                        <th className="py-2 font-semibold">Channel</th>
                        <th className="py-2 font-semibold">Status</th>
                        <th className="py-2 font-semibold text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {workspace.orders.slice(0, 5).map((o) => (
                        <tr key={o.id}>
                          <td className="py-2.5 font-data font-bold text-[#0F172A] dark:text-white">
                            {o.order_number}
                          </td>
                          <td className="py-2.5 text-[#0F172A] dark:text-slate-200">{o.customer_name}</td>
                          <td className="py-2.5 font-data text-[#64748B] dark:text-slate-400">{o.order_type}</td>
                          <td className="py-2.5">
                            <ZStatusText status={o.status} />
                          </td>
                          <td className="py-2.5 font-data font-bold text-right text-[#0F172A] dark:text-white">
                            {formatCurrency(o.total_cents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ZCard>

                <ZCard className="lg:col-span-5 p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-[#0F172A] dark:text-white">Popular Food Items</h3>
                    <button
                      onClick={() => setActiveModule('menu')}
                      className="text-xs font-semibold text-[#0D9488] hover:underline cursor-pointer"
                    >
                      Manage Menu →
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {workspace.kpis.topSellingItems.map((item) => (
                      <div key={item.name} className="py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[#0F172A] dark:text-white truncate">{item.name}</div>
                          <div className="text-[11px] font-data text-[#64748B] dark:text-slate-400">{item.count} units ordered</div>
                        </div>
                        <div className="text-xs font-data font-bold text-[#0D9488] shrink-0">
                          {formatCurrency(item.revenueCents)}
                        </div>
                      </div>
                    ))}
                  </div>
                </ZCard>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <ZCard className="lg:col-span-6 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-[#0F172A] dark:text-white">Upcoming Reservations</h3>
                    <button
                      onClick={() => setActiveModule('reservations')}
                      className="text-xs font-semibold text-[#0D9488] hover:underline cursor-pointer"
                    >
                      Staff Calendar →
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {workspace.reservations.slice(0, 4).map((r) => (
                      <div key={r.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                        <div>
                          <div className="font-semibold text-[#0F172A] dark:text-white">
                            {r.customer_name} ({r.party_size} guests)
                          </div>
                          <div className="font-data text-[#64748B] dark:text-slate-400">
                            {r.reservation_date} · {r.time_slot} · Table {r.table_number || 'TBD'}
                          </div>
                        </div>
                        <ZStatusText status={r.status} />
                      </div>
                    ))}
                  </div>
                </ZCard>

                <ZCard className="lg:col-span-6 p-6">
                  <h3 className="text-sm font-bold text-[#0F172A] dark:text-white mb-4">Operational Notifications</h3>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {workspace.notifications.slice(0, 4).map((n) => (
                      <div key={n.id} className="py-2.5">
                        <div className="text-xs font-semibold text-[#0F172A] dark:text-white">{n.title}</div>
                        <div className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">{n.message}</div>
                      </div>
                    ))}
                  </div>
                </ZCard>
              </div>
            </div>
          )}

          {/* MODULE 2: ORDERS */}
          {activeModule === 'orders' && (
            <ZCard className="p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-x-auto">
                  {['ALL', 'PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED'].map((st) => (
                    <button
                      key={st}
                      onClick={() => setOrderStatusFilter(st)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                        orderStatusFilter === st
                          ? 'bg-white dark:bg-[#101D35] text-[#0F172A] dark:text-white shadow-xs'
                          : 'text-[#64748B] dark:text-slate-400'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    placeholder="Filter order # or guest..."
                    className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] dark:border-slate-800 text-[#64748B] dark:text-slate-400">
                      <th className="py-2.5 font-semibold">Order</th>
                      <th className="py-2.5 font-semibold">Customer</th>
                      <th className="py-2.5 font-semibold">Channel</th>
                      <th className="py-2.5 font-semibold">Status</th>
                      <th className="py-2.5 font-semibold text-right">Total</th>
                      <th className="py-2.5 font-semibold text-right">Update</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredOrders.map((o) => (
                      <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3 font-data font-bold text-[#0F172A] dark:text-white">
                          {o.order_number}
                          {o.is_demo === 1 && <span className="ml-2 text-[10px] text-[#64748B]">DEMO</span>}
                        </td>
                        <td className="py-3">
                          <div className="font-medium text-[#0F172A] dark:text-white">{o.customer_name}</div>
                          <div className="text-[#64748B] dark:text-slate-400">{o.customer_email}</div>
                        </td>
                        <td className="py-3 font-data">{o.order_type}</td>
                        <td className="py-3">
                          <ZStatusText status={o.status} />
                        </td>
                        <td className="py-3 font-data font-bold text-right">{formatCurrency(o.total_cents)}</td>
                        <td className="py-3 text-right">
                          <select
                            value={o.status}
                            onChange={(e) => updateOrderStatus(o.id, e.target.value as OrderRecord['status'])}
                            className="px-2 py-1 bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded text-xs"
                          >
                            {['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'].map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ZCard>
          )}

          {/* MODULE 3: MENU MANAGEMENT */}
          {activeModule === 'menu' && (
            <div className="space-y-6">
              <ZCard className="p-5">
                <form onSubmit={handleAddMenuItem} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-3">
                    <label className="block text-xs font-medium text-[#64748B] dark:text-slate-400 mb-1">Category</label>
                    <select
                      value={newItemCat}
                      onChange={(e) => setNewItemCat(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                    >
                      {workspace.categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-xs font-medium text-[#64748B] dark:text-slate-400 mb-1">Dish Name</label>
                    <input
                      type="text"
                      required
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      placeholder="Smoked Eggplant Curry"
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-[#64748B] dark:text-slate-400 mb-1">Price ($)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      value={newItemPrice}
                      onChange={(e) => setNewItemPrice(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-data bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-[#64748B] dark:text-slate-400 mb-1">KDS Station</label>
                    <select
                      value={newItemStation}
                      onChange={(e) => setNewItemStation(e.target.value)}
                      className="w-full px-2 py-2 text-xs bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                    >
                      <option value="WOOD_HEARTH">WOOD_HEARTH</option>
                      <option value="SAUTE_LINE">SAUTE_LINE</option>
                      <option value="PASTRY_COLD">PASTRY_COLD</option>
                      <option value="BAR_STATION">BAR_STATION</option>
                    </select>
                  </div>
                  <ZButton type="submit" className="md:col-span-1">
                    <Plus className="w-3.5 h-3.5" /> Add
                  </ZButton>
                </form>
              </ZCard>

              <ZCard className="p-6 divide-y divide-slate-100 dark:divide-slate-800">
                {workspace.menuItems.map((item) => (
                  <div key={item.id} className="py-3.5 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-[#0F172A] dark:text-white">{item.name}</div>
                      <div className="text-xs text-[#64748B] dark:text-slate-400">
                        Station: {item.station} · {item.prep_minutes}m prep
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-data font-bold">{formatCurrency(item.price_cents)}</span>
                      <button
                        onClick={() => toggleMenuItem(item.id)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
                          item.is_available
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                            : 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                        }`}
                      >
                        {item.is_available ? 'In Stock' : '86 / Sold Out'}
                      </button>
                    </div>
                  </div>
                ))}
              </ZCard>
            </div>
          )}

          {/* MODULE 4: RESERVATIONS (Staff Calendar + List View) */}
          {activeModule === 'reservations' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-[#0F172A] dark:text-white">Staff Reservation Schedule</h2>
                <div className="flex p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg">
                  <button
                    onClick={() => setResViewMode('calendar')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                      resViewMode === 'calendar'
                        ? 'bg-white dark:bg-[#101D35] text-[#0F172A] dark:text-white shadow-xs'
                        : 'text-[#64748B]'
                    }`}
                  >
                    Slot Calendar
                  </button>
                  <button
                    onClick={() => setResViewMode('list')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                      resViewMode === 'list'
                        ? 'bg-white dark:bg-[#101D35] text-[#0F172A] dark:text-white shadow-xs'
                        : 'text-[#64748B]'
                    }`}
                  >
                    Table List
                  </button>
                </div>
              </div>

              {resViewMode === 'calendar' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {reservationSlotsMap.map(([slotKey, list]) => (
                    <ZCard key={slotKey} className="p-5 space-y-3">
                      <div className="text-xs font-data font-bold text-[#0D9488] pb-2 border-b border-[#E2E8F0] dark:border-slate-800">
                        {slotKey} ({list.length} {list.length === 1 ? 'booking' : 'bookings'})
                      </div>
                      <div className="space-y-3">
                        {list.map((r) => (
                          <div key={r.id} className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-[#0F172A] dark:text-white">{r.customer_name}</span>
                              <ZStatusText status={r.status} />
                            </div>
                            <div className="text-[11px] font-data text-[#64748B] dark:text-slate-400">
                              {r.party_size} guests · Table {r.table_number || 'TBD'}
                            </div>
                            <div className="flex gap-1.5 pt-1">
                              <button
                                onClick={() => updateReservationStatus(r.id, 'SEATED')}
                                className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-[11px] font-semibold cursor-pointer"
                              >
                                Seat
                              </button>
                              <button
                                onClick={() => updateReservationStatus(r.id, 'COMPLETED')}
                                className="px-2 py-1 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 rounded text-[11px] font-semibold cursor-pointer"
                              >
                                Complete
                              </button>
                              <button
                                onClick={() => updateReservationStatus(r.id, 'CANCELLED')}
                                className="px-2 py-1 bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 rounded text-[11px] font-semibold cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ZCard>
                  ))}
                </div>
              ) : (
                <ZCard className="p-6 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] dark:border-slate-800 text-[#64748B] dark:text-slate-400">
                        <th className="py-2.5">Date &amp; Time</th>
                        <th className="py-2.5">Guest</th>
                        <th className="py-2.5">Party</th>
                        <th className="py-2.5">Table</th>
                        <th className="py-2.5">Status</th>
                        <th className="py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {workspace.reservations.map((r) => (
                        <tr key={r.id}>
                          <td className="py-3 font-data">
                            {r.reservation_date} · {r.time_slot}
                          </td>
                          <td className="py-3">
                            <div className="font-semibold text-[#0F172A] dark:text-white">{r.customer_name}</div>
                            <div className="text-[#64748B] dark:text-slate-400">{r.customer_phone}</div>
                          </td>
                          <td className="py-3 font-data">{r.party_size} guests</td>
                          <td className="py-3 font-data font-bold">{r.table_number || 'Unassigned'}</td>
                          <td className="py-3">
                            <ZStatusText status={r.status} />
                          </td>
                          <td className="py-3 text-right space-x-2">
                            <button
                              onClick={() => updateReservationStatus(r.id, 'SEATED')}
                              className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded text-xs cursor-pointer"
                            >
                              Seat
                            </button>
                            <button
                              onClick={() => updateReservationStatus(r.id, 'COMPLETED')}
                              className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 rounded text-xs cursor-pointer"
                            >
                              Complete
                            </button>
                            <button
                              onClick={() => updateReservationStatus(r.id, 'CANCELLED')}
                              className="px-2.5 py-1 bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 rounded text-xs cursor-pointer"
                            >
                              Cancel
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ZCard>
              )}
            </div>
          )}

          {/* MODULE 5: TABLES */}
          {activeModule === 'tables' && (
            <div className="space-y-6">
              <ZCard className="p-5">
                <form onSubmit={handleAddTable} className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className="block text-xs font-medium text-[#64748B] mb-1">Table #</label>
                    <input
                      type="text"
                      required
                      value={newTableNum}
                      onChange={(e) => setNewTableNum(e.target.value)}
                      placeholder="T-08"
                      className="px-3 py-2 text-xs bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#64748B] mb-1">Seats</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={newTableCap}
                      onChange={(e) => setNewTableCap(e.target.value)}
                      className="w-24 px-3 py-2 text-xs font-data bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#64748B] mb-1">Dining Zone</label>
                    <input
                      type="text"
                      value={newTableZone}
                      onChange={(e) => setNewTableZone(e.target.value)}
                      className="px-3 py-2 text-xs bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <ZButton type="submit">Add Table</ZButton>
                </form>
              </ZCard>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {workspace.tables.map((t) => (
                  <ZCard key={t.id} className="p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-data font-bold text-[#0F172A] dark:text-white">{t.table_number}</span>
                      <span className="text-xs font-data text-[#64748B]">{t.capacity} seats</span>
                    </div>
                    <div className="text-xs text-[#64748B] dark:text-slate-400">
                      {t.zone} · QR: <span className="font-data">{t.qr_code_token}</span>
                    </div>
                    <select
                      value={t.status}
                      onChange={(e) => updateTableStatus(t.id, e.target.value as TableRecord['status'])}
                      className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                    >
                      <option value="AVAILABLE">AVAILABLE</option>
                      <option value="OCCUPIED">OCCUPIED</option>
                      <option value="RESERVED">RESERVED</option>
                    </select>
                  </ZCard>
                ))}
              </div>
            </div>
          )}

          {/* MODULE 6: CUSTOMERS */}
          {activeModule === 'customers' && (
            <ZCard className="p-6 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E2E8F0] dark:border-slate-800 text-[#64748B] dark:text-slate-400">
                    <th className="py-2.5">Customer</th>
                    <th className="py-2.5">Phone</th>
                    <th className="py-2.5 text-right">Orders</th>
                    <th className="py-2.5 text-right">Loyalty Points</th>
                    <th className="py-2.5 text-right">Lifetime Spend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {workspace.customers.map((c) => (
                    <tr key={c.id}>
                      <td className="py-3">
                        <div className="font-semibold text-[#0F172A] dark:text-white">{c.name}</div>
                        <div className="text-[#64748B] dark:text-slate-400">{c.email}</div>
                      </td>
                      <td className="py-3 font-data">{c.phone}</td>
                      <td className="py-3 font-data text-right">{c.total_orders}</td>
                      <td className="py-3 font-data text-right text-[#0D9488] font-semibold">{c.loyalty_points} pts</td>
                      <td className="py-3 font-data font-bold text-right">{formatCurrency(c.total_spent_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ZCard>
          )}

          {/* MODULE 7: STAFF */}
          {activeModule === 'staff' && (
            <div className="space-y-6">
              <ZCard className="p-5">
                <form onSubmit={handleAddStaff} className="flex flex-wrap gap-3 items-end">
                  <input
                    type="text"
                    required
                    value={newStaffName}
                    onChange={(e) => setNewStaffName(e.target.value)}
                    placeholder="Staff Full Name"
                    className="px-3 py-2 text-xs bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                  />
                  <input
                    type="email"
                    required
                    value={newStaffEmail}
                    onChange={(e) => setNewStaffEmail(e.target.value)}
                    placeholder="staff@restaurant.com"
                    className="px-3 py-2 text-xs bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                  />
                  <select
                    value={newStaffRole}
                    onChange={(e) => setNewStaffRole(e.target.value as typeof newStaffRole)}
                    className="px-3 py-2 text-xs bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                  >
                    <option value="WAITER">WAITER</option>
                    <option value="CHEF">CHEF</option>
                    <option value="CASHIER">CASHIER</option>
                    <option value="RESTAURANT_MANAGER">RESTAURANT_MANAGER</option>
                    <option value="DELIVERY_RIDER">DELIVERY_RIDER</option>
                    <option value="ACCOUNTANT">ACCOUNTANT</option>
                  </select>
                  <ZButton type="submit">Add Team Member</ZButton>
                </form>
              </ZCard>

              <ZCard className="p-6 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] dark:border-slate-800 text-[#64748B] dark:text-slate-400">
                      <th className="py-2.5">Name</th>
                      <th className="py-2.5">Role</th>
                      <th className="py-2.5">Shift Schedule</th>
                      <th className="py-2.5 text-right">Hourly Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {workspace.staff.map((s) => (
                      <tr key={s.id}>
                        <td className="py-3">
                          <div className="font-semibold text-[#0F172A] dark:text-white">{s.full_name}</div>
                          <div className="text-[#64748B] dark:text-slate-400">{s.email}</div>
                        </td>
                        <td className="py-3 font-data font-semibold text-[#0D9488]">{s.role_code}</td>
                        <td className="py-3">{s.shift_schedule}</td>
                        <td className="py-3 font-data text-right">
                          {s.hourly_rate_cents ? `${formatCurrency(s.hourly_rate_cents)}/hr` : 'Salaried'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ZCard>
            </div>
          )}

          {/* MODULE 8: KITCHEN MANAGEMENT */}
          {activeModule === 'kitchen' && (
            <ZCard className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-[#0F172A] dark:text-white">Live Kitchen Ticket Queue</h3>
                  <p className="text-xs text-[#64748B] dark:text-slate-400">
                    Synchronized via WebSocket with the full-screen Kitchen Display System.
                  </p>
                </div>
                <ZButton variant="secondary" onClick={() => navigate('/kds')}>
                  Launch Full-Screen KDS
                </ZButton>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {workspace.tickets.map((t) => (
                  <ZCard key={t.id} className="p-4 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-data font-bold text-[#0F172A] dark:text-white">{t.order_number}</span>
                      <ZStatusText status={t.status} />
                    </div>
                    <div className="text-xs text-[#64748B] dark:text-slate-400">Station: {t.station}</div>
                  </ZCard>
                ))}
              </div>
            </ZCard>
          )}

          {/* MODULE 9: INVENTORY */}
          {activeModule === 'inventory' && (
            <div className="space-y-6">
              <ZCard className="p-5">
                <form onSubmit={handleAddInventory} className="flex flex-wrap gap-3 items-end">
                  <input
                    type="text"
                    required
                    value={newInvSku}
                    onChange={(e) => setNewInvSku(e.target.value)}
                    placeholder="SKU (e.g. SAF-09)"
                    className="px-3 py-2 text-xs font-data bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                  />
                  <input
                    type="text"
                    required
                    value={newInvName}
                    onChange={(e) => setNewInvName(e.target.value)}
                    placeholder="Ingredient Name"
                    className="px-3 py-2 text-xs bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                  />
                  <input
                    type="number"
                    required
                    value={newInvQty}
                    onChange={(e) => setNewInvQty(e.target.value)}
                    className="w-24 px-3 py-2 text-xs font-data bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                  />
                  <ZButton type="submit">Add Stock Item</ZButton>
                </form>
              </ZCard>

              <ZCard className="p-6 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] dark:border-slate-800 text-[#64748B] dark:text-slate-400">
                      <th className="py-2.5">SKU</th>
                      <th className="py-2.5">Item</th>
                      <th className="py-2.5">Status</th>
                      <th className="py-2.5 text-right">On Hand</th>
                      <th className="py-2.5 text-right">Adjust</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {workspace.inventory.map((inv) => {
                      const low = inv.quantity_on_hand <= inv.reorder_level;
                      return (
                        <tr key={inv.id}>
                          <td className="py-3 font-data">{inv.sku}</td>
                          <td className="py-3 font-semibold text-[#0F172A] dark:text-white">{inv.item_name}</td>
                          <td className={`py-3 font-semibold ${low ? 'text-amber-700 dark:text-[#E9B44C]' : 'text-emerald-700 dark:text-emerald-400'}`}>
                            {low ? 'Low Stock — Reorder' : 'Healthy'}
                          </td>
                          <td className="py-3 font-data font-bold text-right">
                            {inv.quantity_on_hand} {inv.unit}
                          </td>
                          <td className="py-3 text-right space-x-1">
                            <button onClick={() => adjustStock(inv, -1)} className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded cursor-pointer">
                              -1
                            </button>
                            <button onClick={() => adjustStock(inv, 1)} className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded cursor-pointer">
                              +1
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ZCard>
            </div>
          )}

          {/* MODULE 10: COUPONS */}
          {activeModule === 'coupons' && (
            <div className="space-y-6">
              <ZCard className="p-5">
                <form onSubmit={handleAddCoupon} className="flex flex-wrap gap-3 items-end">
                  <input
                    type="text"
                    required
                    value={newCouponCode}
                    onChange={(e) => setNewCouponCode(e.target.value)}
                    placeholder="PROMO CODE"
                    className="px-3 py-2 text-xs font-data bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                  />
                  <input
                    type="text"
                    required
                    value={newCouponDesc}
                    onChange={(e) => setNewCouponDesc(e.target.value)}
                    placeholder="Description"
                    className="px-3 py-2 text-xs bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                  />
                  <input
                    type="number"
                    min="1"
                    max="80"
                    value={newCouponVal}
                    onChange={(e) => setNewCouponVal(e.target.value)}
                    className="w-24 px-3 py-2 text-xs font-data bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                  />
                  <ZButton type="submit">Create % Coupon</ZButton>
                </form>
              </ZCard>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {workspace.coupons.map((c) => (
                  <ZCard key={c.id} className="p-5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-data font-bold text-base text-[#0F172A] dark:text-white">{c.code}</span>
                      <span className="text-xs font-semibold text-[#0D9488]">
                        {c.discount_type === 'PERCENT' ? `${c.discount_value}% OFF` : `${formatCurrency(c.discount_value)} OFF`}
                      </span>
                    </div>
                    <p className="text-xs text-[#64748B] dark:text-slate-400">{c.description}</p>
                    <div className="text-[11px] font-data text-[#64748B]">Used {c.used_count} times · Expires {c.expires_at}</div>
                  </ZCard>
                ))}
              </div>
            </div>
          )}

          {/* MODULE 11: REPORTS & ANALYTICS */}
          {activeModule === 'reports' && (
            <ZCard className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-[#0F172A] dark:text-white">Channel Revenue &amp; Order Analytics</h3>
                <span className="text-xs text-[#64748B] dark:text-slate-400">Persisted tenant records</span>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={channelChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" opacity={0.4} />
                    <XAxis dataKey="channel" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="revenue" name="Revenue ($)" fill="#0D9488" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="orders" name="Orders" fill="#E9B44C" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ZCard>
          )}

          {/* MODULE 12: VISUAL WEBSITE BUILDER (PART 7) */}
          {activeModule === 'website' && (
            <div className="space-y-4">
              {/* Visual Builder Toolbar */}
              <ZCard className="p-3.5 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#0F172A] dark:text-white mr-2">Visual Website Editor</span>
                  <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    {[
                      { id: 'desktop', icon: Monitor, label: 'Desktop' },
                      { id: 'tablet', icon: Tablet, label: 'Tablet' },
                      { id: 'mobile', icon: Smartphone, label: 'Mobile' },
                    ].map((d) => {
                      const Icon = d.icon;
                      return (
                        <button
                          key={d.id}
                          onClick={() => setWbDevice(d.id as typeof wbDevice)}
                          className={`px-2.5 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                            wbDevice === d.id
                              ? 'bg-white dark:bg-[#101D35] text-[#0F172A] dark:text-white shadow-xs'
                              : 'text-[#64748B]'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">{d.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <ZButton variant="outline" disabled={wbSaving} onClick={() => handleSaveWebsite(false)}>
                    Save Draft
                  </ZButton>
                  <ZButton variant="primary" disabled={wbSaving} onClick={() => handleSaveWebsite(true)}>
                    Publish Website
                  </ZButton>
                </div>
              </ZCard>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Panel: Controls */}
                <ZCard className="lg:col-span-4 p-5 space-y-5">
                  <div className="flex flex-wrap gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    {(['branding', 'details', 'sections', 'images', 'seo'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setWbTab(t)}
                        className={`flex-1 py-1.5 px-2 text-[11px] font-semibold rounded-md capitalize cursor-pointer ${
                          wbTab === t
                            ? 'bg-white dark:bg-[#101D35] text-[#0F172A] dark:text-white shadow-xs'
                            : 'text-[#64748B]'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  {wbTab === 'branding' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-[#64748B] mb-1">Restaurant Title</label>
                        <input
                          type="text"
                          value={wbName}
                          onChange={(e) => setWbName(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#64748B] mb-1">Hero Tagline</label>
                        <input
                          type="text"
                          value={wbTagline}
                          onChange={(e) => setWbTagline(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1">Primary Color</label>
                          <input type="color" value={wbPrimary} onChange={(e) => setWbPrimary(e.target.value)} className="w-full h-9 rounded cursor-pointer" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#64748B] mb-1">Accent Color</label>
                          <input type="color" value={wbAccent} onChange={(e) => setWbAccent(e.target.value)} className="w-full h-9 rounded cursor-pointer" />
                        </div>
                      </div>
                    </div>
                  )}

                  {wbTab === 'details' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-[#64748B] mb-1">Story &amp; Description</label>
                        <textarea
                          rows={3}
                          value={wbDesc}
                          onChange={(e) => setWbDesc(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#64748B] mb-1">Address</label>
                        <input
                          type="text"
                          value={wbAddress}
                          onChange={(e) => setWbAddress(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#64748B] mb-1">Phone</label>
                        <input
                          type="text"
                          value={wbPhone}
                          onChange={(e) => setWbPhone(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#64748B] mb-1">Public Email</label>
                        <input
                          type="email"
                          value={wbEmail}
                          onChange={(e) => setWbEmail(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                        />
                      </div>
                    </div>
                  )}

                  {wbTab === 'sections' && (
                    <div className="space-y-2.5">
                      {(
                        [
                          ['showOffers', 'Active Promotions Banner'],
                          ['showFeatured', 'Featured Chef Dishes'],
                          ['showStory', 'Restaurant Story & Hours'],
                          ['showGallery', 'Culinary Photography Gallery'],
                          ['showReviews', 'Guest Reviews'],
                        ] as const
                      ).map(([key, label]) => (
                        <label
                          key={key}
                          className="flex items-center justify-between p-2.5 border border-[#E2E8F0] dark:border-slate-700 rounded-lg text-xs font-medium cursor-pointer"
                        >
                          <span>{label}</span>
                          <input
                            type="checkbox"
                            checked={wbSections[key]}
                            onChange={(e) => setWbSections({ ...wbSections, [key]: e.target.checked })}
                            className="accent-[#0D9488]"
                          />
                        </label>
                      ))}
                    </div>
                  )}

                  {wbTab === 'images' && (
                    <div className="space-y-3">
                      <div className="text-xs font-medium text-[#64748B]">Hero Cover Photography</div>
                      <div className="space-y-2">
                        {COVER_PRESETS.map((p) => (
                          <button
                            key={p.url}
                            type="button"
                            onClick={() => setWbCover(p.url)}
                            className={`w-full flex items-center gap-3 p-2 rounded-lg border text-left text-xs cursor-pointer ${
                              wbCover === p.url ? 'border-[#0D9488]' : 'border-[#E2E8F0] dark:border-slate-700'
                            }`}
                          >
                            <img src={p.url} alt={p.label} referrerPolicy="no-referrer" className="w-12 h-9 rounded object-cover" />
                            <span className="font-semibold">{p.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {wbTab === 'seo' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-[#64748B] mb-1">SEO Meta Title</label>
                        <input
                          type="text"
                          value={wbSeoTitle}
                          onChange={(e) => setWbSeoTitle(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#64748B] mb-1">SEO Meta Description</label>
                        <textarea
                          rows={3}
                          value={wbSeoDesc}
                          onChange={(e) => setWbSeoDesc(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                        />
                      </div>
                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 space-y-1">
                        <div className="text-[11px] font-data text-[#0D9488]">zayqora.app/r/{workspace.restaurant.slug}</div>
                        <div className="text-xs font-bold text-blue-700 dark:text-blue-400 truncate">{wbSeoTitle || wbName}</div>
                        <div className="text-[11px] text-[#64748B] line-clamp-2">{wbSeoDesc || wbDesc}</div>
                      </div>
                    </div>
                  )}
                </ZCard>

                {/* Center: Responsive Live Website Preview */}
                <div className="lg:col-span-8 flex justify-center bg-slate-200/60 dark:bg-[#091020] rounded-xl p-4 border border-[#E2E8F0] dark:border-slate-800">
                  <div
                    className={`w-full ${previewWidthClass} bg-[#FAF9F6] text-[#101D35] rounded-xl overflow-hidden border border-slate-300 shadow-lg transition-all duration-200`}
                  >
                    <div className="px-4 py-2.5 bg-white border-b border-stone-200 flex items-center justify-between text-xs">
                      <span className="font-editorial text-lg font-bold" style={{ color: wbPrimary }}>
                        {wbName}
                      </span>
                      <span className="px-2.5 py-1 rounded text-white text-[11px] font-semibold" style={{ backgroundColor: wbAccent }}>
                        Order Online
                      </span>
                    </div>

                    <div className="h-52 relative">
                      <img src={wbCover} alt={wbName} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent p-5 flex flex-col justify-end text-white">
                        <div className="text-[11px] text-white/80">{wbTagline}</div>
                        <div className="font-editorial text-3xl font-semibold mt-0.5">{wbName}</div>
                      </div>
                    </div>

                    <div className="p-5 space-y-5">
                      {wbSections.showFeatured && (
                        <div>
                          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Featured Dishes</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {workspace.menuItems.slice(0, 2).map((m) => (
                              <div key={m.id} className="p-3 bg-white border border-stone-200 rounded-lg flex justify-between gap-2">
                                <span className="text-xs font-semibold truncate">{m.name}</span>
                                <span className="text-xs font-data font-bold shrink-0" style={{ color: wbAccent }}>
                                  {formatCurrency(m.price_cents)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {wbSections.showStory && (
                        <div className="p-4 bg-white border border-stone-200 rounded-lg">
                          <div className="text-xs font-bold text-[#101D35] mb-1">Our Story</div>
                          <p className="text-xs text-slate-600 line-clamp-2">{wbDesc}</p>
                        </div>
                      )}

                      <div className="pt-3 border-t border-stone-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                        <span>{wbAddress}</span>
                        <button
                          onClick={() => navigate(`/r/${workspace.restaurant.slug}`)}
                          className="font-semibold hover:underline cursor-pointer"
                          style={{ color: wbAccent }}
                        >
                          Open Full Storefront →
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MODULE 13: SETTINGS */}
          {activeModule === 'settings' && (
            <ZCard className="max-w-2xl p-6">
              <form onSubmit={handleSaveSettings} className="space-y-4">
                <h3 className="text-base font-bold text-[#0F172A] dark:text-white">Operations, Tax &amp; Fulfillment Settings</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="flex items-center gap-2 p-3 border border-[#E2E8F0] dark:border-slate-700 rounded-lg text-xs font-medium">
                    <input type="checkbox" checked={setDelivery} onChange={(e) => setSetDelivery(e.target.checked)} className="accent-[#0D9488]" /> Delivery Enabled
                  </label>
                  <label className="flex items-center gap-2 p-3 border border-[#E2E8F0] dark:border-slate-700 rounded-lg text-xs font-medium">
                    <input type="checkbox" checked={setPickup} onChange={(e) => setSetPickup(e.target.checked)} className="accent-[#0D9488]" /> Pickup Enabled
                  </label>
                  <label className="flex items-center gap-2 p-3 border border-[#E2E8F0] dark:border-slate-700 rounded-lg text-xs font-medium">
                    <input type="checkbox" checked={setDineIn} onChange={(e) => setSetDineIn(e.target.checked)} className="accent-[#0D9488]" /> Dine-In Enabled
                  </label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#64748B] mb-1">Default Prep (min)</label>
                    <input
                      type="number"
                      value={setPrepMins}
                      onChange={(e) => setSetPrepMins(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs font-data bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#64748B] mb-1">Tax Rate (decimal)</label>
                    <input
                      type="number"
                      step="0.0025"
                      value={setTaxRate}
                      onChange={(e) => setSetTaxRate(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs font-data bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#64748B] mb-1">Delivery Fee ($)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={setDeliveryFee}
                      onChange={(e) => setSetDeliveryFee(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs font-data bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
                    />
                  </div>
                </div>
                <ZButton type="submit">Save Configuration</ZButton>
              </form>
            </ZCard>
          )}

          {/* MODULE 14: BILLING */}
          {activeModule === 'billing' && (
            <div className="space-y-6">
              <ZCard className="p-6 flex items-center justify-between">
                <div>
                  <div className="text-xs text-[#64748B] dark:text-slate-400">Current ZAYQORA Plan</div>
                  <div className="text-xl font-bold text-[#0F172A] dark:text-white mt-0.5">{workspace.subscription.plan_name}</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-data font-bold text-[#0D9488]">
                    {formatCurrency(workspace.subscription.monthly_price_cents)}/mo
                  </div>
                  <div className="text-xs text-[#64748B]">Renews {workspace.subscription.current_period_end}</div>
                </div>
              </ZCard>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {[
                  { code: 'STARTER' as const, title: 'For single-venue storefronts', price: '$79/mo', limit: '1 branch · Up to 1,500 orders/mo' },
                  { code: 'GROWTH' as const, title: 'For growing kitchens & KDS', price: '$149/mo', limit: '3 branches · Unlimited orders & KDS' },
                  { code: 'ENTERPRISE' as const, title: 'For multi-branch dining groups', price: '$349/mo', limit: 'Unlimited branches · Dedicated SLA' },
                ].map((plan) => (
                  <ZCard key={plan.code} className="p-6 flex flex-col justify-between space-y-4">
                    <div>
                      <div className="text-xs font-semibold text-[#0D9488]">{plan.code}</div>
                      <h4 className="text-base font-bold text-[#0F172A] dark:text-white mt-1">{plan.title}</h4>
                      <div className="text-2xl font-data font-bold text-[#0F172A] dark:text-white mt-2">{plan.price}</div>
                      <div className="text-xs text-[#64748B] dark:text-slate-400 mt-2">{plan.limit}</div>
                    </div>
                    <ZButton
                      variant="secondary"
                      disabled={workspace.subscription.plan_code === plan.code}
                      onClick={() => handleUpgradePlan(plan.code)}
                      className="w-full"
                    >
                      {workspace.subscription.plan_code === plan.code ? 'Current Plan' : `Switch to ${plan.code}`}
                    </ZButton>
                  </ZCard>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
