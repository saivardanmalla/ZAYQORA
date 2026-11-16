import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search,
  ShoppingBag,
  Calendar,
  MapPin,
  Phone,
  Clock,
  Plus,
  Minus,
  X,
  CheckCircle2,
  ShieldCheck,
  UtensilsCrossed,
  User,
  Star,
  Tag,
} from 'lucide-react';
import { apiRequest, formatCurrency, useZayqoraSocket } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type {
  CartItem,
  MenuCategory,
  MenuItem,
  MenuModifier,
  MenuVariant,
  OrderRecord,
  RestaurantFull,
  RestaurantSummary,
} from '../types/zayqora';

interface StorefrontProps {
  slug: string;
  subRoute?: string;
  navigate: (to: string) => void;
  onOpenAuth: () => void;
}

interface Promotion {
  code: string;
  description: string;
  discount_type: 'PERCENT' | 'FIXED';
  discount_value: number;
  min_order_cents: number;
}

const SAMPLE_REVIEWS = [
  {
    author: 'Elena M.',
    context: 'Dinner · Dine-In',
    rating: 5,
    quote: 'The wood-fired plating arrived steaming and balanced, and booking our table online took under thirty seconds.',
  },
  {
    author: 'Marcus T.',
    context: 'Weekend Pickup',
    rating: 5,
    quote: 'Customizing modifiers was effortless and our pickup order status updated live from the kitchen pass.',
  },
  {
    author: 'Priya S.',
    context: 'Celebration Dinner',
    rating: 5,
    quote: 'Warm hospitality from arrival to dessert. The cardamom chocolate tart and yuzu spritz are unforgettable.',
  },
];

export function RestaurantStorefront({ slug, subRoute = '', navigate, onOpenAuth }: StorefrontProps) {
  const { user, token } = useAuth();
  const [allRestaurants, setAllRestaurants] = useState<RestaurantSummary[]>([]);
  const [restaurant, setRestaurant] = useState<RestaurantFull | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Navigation & menu filtering
  const [activeTab, setActiveTab] = useState<'storefront' | 'reservations' | 'account'>('storefront');
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [dietaryFilter, setDietaryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Item customization modal
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<MenuVariant | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<MenuModifier[]>([]);
  const [customQty, setCustomQty] = useState(1);
  const [specialInstructions, setSpecialInstructions] = useState('');

  // Cart & Checkout Drawer
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<'DELIVERY' | 'PICKUP' | 'DINE_IN'>('DELIVERY');
  const [tableNumber, setTableNumber] = useState('');
  const [customerName, setCustomerName] = useState(user?.fullName || '');
  const [customerEmail, setCustomerEmail] = useState(user?.email || '');
  const [customerPhone, setCustomerPhone] = useState('+1 (415) 555-0190');
  const [deliveryAddress, setDeliveryAddress] = useState('742 Mission St, San Francisco, CA');
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountCents: number; description: string } | null>(null);
  const [couponError, setCouponError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CARD_SANDBOX' | 'PAY_AT_VENUE'>('CARD_SANDBOX');
  const [placingOrder, setPlacingOrder] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  // Live Order Tracking
  const [activeOrder, setActiveOrder] = useState<OrderRecord | null>(null);
  const [sandboxChallenge, setSandboxChallenge] = useState<{
    paymentId: string;
    providerRef: string;
    payload: string;
    signature: string;
  } | null>(null);
  const [confirmingSandbox, setConfirmingSandbox] = useState(false);

  // Reservations state
  const upcomingDates = useMemo(() => {
    return Array.from({ length: 6 }, (_, idx) => {
      const d = new Date(Date.now() + idx * 86400000);
      return {
        iso: d.toISOString().slice(0, 10),
        label: idx === 0 ? 'Today' : idx === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      };
    });
  }, []);

  const [resDate, setResDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [resPartySize, setResPartySize] = useState(2);
  const [resSlots, setResSlots] = useState<Array<{ timeSlot: string; available: boolean; remainingTables: number }>>([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [resName, setResName] = useState(user?.fullName || '');
  const [resEmail, setResEmail] = useState(user?.email || '');
  const [resPhone, setResPhone] = useState('+1 (415) 555-0190');
  const [resNotes, setResNotes] = useState('');
  const [resConfirmed, setResConfirmed] = useState<{ id: string; tableNumber: string; timeSlot: string; date: string } | null>(null);
  const [resError, setResError] = useState('');
  const [resSubmitting, setResSubmitting] = useState(false);

  // Customer Order History
  const [customerOrders, setCustomerOrders] = useState<OrderRecord[]>([]);

  useEffect(() => {
    if (user) {
      setCustomerName((prev) => prev || user.fullName);
      setCustomerEmail((prev) => prev || user.email);
      setResName((prev) => prev || user.fullName);
      setResEmail((prev) => prev || user.email);
    }
  }, [user]);

  const loadStorefront = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [listRes, storeRes] = await Promise.all([
        apiRequest<{ restaurants: RestaurantSummary[] }>('/api/public/restaurants'),
        apiRequest<{
          restaurant: RestaurantFull;
          categories: MenuCategory[];
          items: MenuItem[];
          promotions: Promotion[];
        }>(`/api/public/restaurants/${slug}`),
      ]);
      setAllRestaurants(listRes.restaurants);
      setRestaurant(storeRes.restaurant);
      setCategories(storeRes.categories);
      setItems(storeRes.items);
      setPromotions(storeRes.promotions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load storefront');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadStorefront();
    setCart([]);
    setActiveOrder(null);
    setSandboxChallenge(null);
    setAppliedCoupon(null);
  }, [loadStorefront]);

  useEffect(() => {
    if (subRoute === 'reservations') {
      setActiveTab('reservations');
      setCartOpen(false);
    } else if (subRoute === 'order') {
      setActiveTab('storefront');
      setCartOpen(true);
    } else if (subRoute === 'menu') {
      setActiveTab('storefront');
      setCartOpen(false);
      setTimeout(() => document.getElementById('menu-section')?.scrollIntoView({ behavior: 'smooth' }), 80);
    } else if (subRoute === 'contact') {
      setActiveTab('storefront');
      setCartOpen(false);
      setTimeout(() => document.getElementById('story-section')?.scrollIntoView({ behavior: 'smooth' }), 80);
    } else {
      setActiveTab('storefront');
    }
  }, [subRoute, slug]);

  useEffect(() => {
    if (!slug) return;
    apiRequest<{ slots: Array<{ timeSlot: string; available: boolean; remainingTables: number }> }>(
      `/api/public/restaurants/${slug}/reservations/availability?date=${encodeURIComponent(resDate)}&partySize=${resPartySize}`
    )
      .then((res) => {
        setResSlots(res.slots);
        const firstOpen = res.slots.find((s) => s.available);
        setSelectedSlot(firstOpen?.timeSlot || '');
      })
      .catch(() => {});
  }, [slug, resDate, resPartySize]);

  useEffect(() => {
    if (activeTab === 'account' && token) {
      apiRequest<{ orders: OrderRecord[] }>('/api/public/customer/orders')
        .then((res) => setCustomerOrders(res.orders))
        .catch(() => {});
    }
  }, [activeTab, token]);

  useZayqoraSocket(
    { orderId: activeOrder?.id || null, enabled: Boolean(activeOrder?.id) },
    (msg) => {
      if (msg.type === 'order:updated' && msg.payload) {
        const p = msg.payload as { order?: OrderRecord };
        if (p.order && p.order.id === activeOrder?.id) {
          setActiveOrder(p.order);
        }
      }
    }
  );

  const dietaryOptions = useMemo(() => {
    const tags = new Set<string>();
    items.forEach((i) => i.dietary_tags.forEach((t) => tags.add(t)));
    return ['ALL', ...Array.from(tags)];
  }, [items]);

  const featuredItems = useMemo(() => items.filter((i) => i.is_featured === 1), [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const catMatch = activeCategory === 'ALL' || item.category_id === activeCategory;
      const dietMatch = dietaryFilter === 'ALL' || item.dietary_tags.includes(dietaryFilter);
      const q = searchQuery.trim().toLowerCase();
      const searchMatch =
        !q || item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
      return catMatch && dietMatch && searchMatch;
    });
  }, [items, activeCategory, dietaryFilter, searchQuery]);

  const openCustomizer = (item: MenuItem) => {
    setCustomizingItem(item);
    setSelectedVariant(item.variants[0] || null);
    setSelectedModifiers([]);
    setCustomQty(1);
    setSpecialInstructions('');
  };

  const addToCart = () => {
    if (!customizingItem) return;
    setCart((prev) => [
      ...prev,
      {
        cartLineId: crypto.randomUUID(),
        menuItem: customizingItem,
        variant: selectedVariant,
        modifiers: selectedModifiers,
        quantity: customQty,
        specialInstructions,
      },
    ]);
    setCustomizingItem(null);
    setCartOpen(true);
  };

  const updateCartQty = (cartLineId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((line) => (line.cartLineId === cartLineId ? { ...line, quantity: line.quantity + delta } : line))
        .filter((line) => line.quantity > 0)
    );
  };

  const cartSubtotalCents = useMemo(() => {
    return cart.reduce((sum, line) => {
      const base = line.menuItem.price_cents + (line.variant?.price_delta_cents || 0);
      const mods = line.modifiers.reduce((mSum, m) => mSum + m.price_cents, 0);
      return sum + (base + mods) * line.quantity;
    }, 0);
  }, [cart]);

  const cartItemCount = useMemo(() => cart.reduce((acc, c) => acc + c.quantity, 0), [cart]);

  const estimatedDiscountCents = appliedCoupon ? Math.min(cartSubtotalCents, appliedCoupon.discountCents) : 0;
  const discountedSubtotal = Math.max(0, cartSubtotalCents - estimatedDiscountCents);
  const estimatedTaxCents = restaurant ? Math.round(discountedSubtotal * restaurant.tax_rate) : 0;
  const estimatedDeliveryCents =
    restaurant && orderType === 'DELIVERY' ? restaurant.delivery_fee_cents : 0;
  const estimatedTotalCents = discountedSubtotal + estimatedTaxCents + estimatedDeliveryCents;

  const handleApplyCoupon = async () => {
    if (!restaurant || !couponCode.trim()) return;
    setCouponError('');
    try {
      const res = await apiRequest<{ valid: boolean; code: string; discountCents: number; description: string }>(
        `/api/public/restaurants/${restaurant.slug}/validate-coupon`,
        {
          method: 'POST',
          body: JSON.stringify({ code: couponCode.trim(), subtotalCents: cartSubtotalCents }),
        }
      );
      setAppliedCoupon({ code: res.code, discountCents: res.discountCents, description: res.description });
    } catch (err) {
      setAppliedCoupon(null);
      setCouponError(err instanceof Error ? err.message : 'Invalid coupon');
    }
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurant || cart.length === 0) return;
    setCheckoutError('');
    setPlacingOrder(true);
    try {
      const res = await apiRequest<{
        order: OrderRecord;
        sandboxVerification?: { paymentId: string; providerRef: string; payload: string; signature: string };
      }>(`/api/public/restaurants/${restaurant.slug}/orders`, {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey,
          orderType,
          tableNumber: orderType === 'DINE_IN' ? tableNumber : '',
          customerName,
          customerEmail,
          customerPhone,
          deliveryAddress: orderType === 'DELIVERY' ? deliveryAddress : '',
          couponCode: appliedCoupon?.code || couponCode,
          paymentMethod,
          items: cart.map((line) => ({
            menuItemId: line.menuItem.id,
            variantId: line.variant?.id || null,
            modifierIds: line.modifiers.map((m) => m.id),
            quantity: line.quantity,
            specialInstructions: line.specialInstructions,
          })),
        }),
      });
      setActiveOrder(res.order);
      if (paymentMethod === 'CARD_SANDBOX' && res.sandboxVerification) {
        setSandboxChallenge(res.sandboxVerification);
      } else {
        setSandboxChallenge(null);
      }
      setCart([]);
      setAppliedCoupon(null);
      setCouponCode('');
      setIdempotencyKey(crypto.randomUUID());
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Unable to place order');
    } finally {
      setPlacingOrder(false);
    }
  };

  const handleConfirmSandboxPayment = async () => {
    if (!sandboxChallenge) return;
    setConfirmingSandbox(true);
    try {
      const res = await apiRequest<{ verified: boolean; order: OrderRecord }>('/api/payments/sandbox/confirm', {
        method: 'POST',
        body: JSON.stringify({
          payload: sandboxChallenge.payload,
          signature: sandboxChallenge.signature,
        }),
      });
      setActiveOrder(res.order);
      setSandboxChallenge(null);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Sandbox confirmation failed');
    } finally {
      setConfirmingSandbox(false);
    }
  };

  const handleBookReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurant || !selectedSlot) return;
    setResError('');
    setResSubmitting(true);
    try {
      const res = await apiRequest<{
        reservation: { id: string; reservation_date: string; time_slot: string };
        assignedTable: { table_number: string };
      }>(`/api/public/restaurants/${restaurant.slug}/reservations`, {
        method: 'POST',
        body: JSON.stringify({
          date: resDate,
          timeSlot: selectedSlot,
          partySize: resPartySize,
          customerName: resName,
          customerEmail: resEmail,
          customerPhone: resPhone,
          notes: resNotes,
        }),
      });
      setResConfirmed({
        id: res.reservation.id,
        tableNumber: res.assignedTable.table_number,
        timeSlot: res.reservation.time_slot,
        date: res.reservation.reservation_date,
      });
    } catch (err) {
      setResError(err instanceof Error ? err.message : 'Unable to complete booking');
    } finally {
      setResSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="h-80 rounded-xl bg-white border border-stone-200 animate-pulse" />
      </div>
    );
  }

  if (error || !restaurant) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center space-y-4">
        <h1 className="text-2xl font-bold text-[#101D35]">Storefront Unavailable</h1>
        <p className="text-sm text-slate-600">{error || 'This restaurant website could not be found.'}</p>
        <button
          onClick={() => navigate('/')}
          className="px-5 py-2.5 bg-[#101D35] text-white text-xs font-semibold rounded-lg cursor-pointer"
        >
          Back to ZAYQORA Directory
        </button>
      </div>
    );
  }

  const brandPrimary = restaurant.primary_color || '#101D35';
  const brandAccent = restaurant.accent_color || '#0D9488';
  const sections = restaurant.sections_config || {
    showFeatured: true,
    showStory: true,
    showGallery: true,
    showReviews: true,
    showOffers: true,
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#101D35]">
      {/* Slim Tenant Switcher & Offers Bar */}
      <div className="bg-[#0B1426] text-white text-xs py-2 px-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-slate-300">Storefront Switcher:</span>
          <select
            aria-label="Switch restaurant storefront"
            value={restaurant.slug}
            onChange={(e) => navigate(`/r/${e.target.value}`)}
            className="bg-white/10 border border-white/20 rounded px-2.5 py-1 text-xs text-white focus:outline-none cursor-pointer"
          >
            {allRestaurants.map((r) => (
              <option key={r.id} value={r.slug} className="text-[#101D35]">
                {r.name}
              </option>
            ))}
          </select>
        </div>
        {sections.showOffers && promotions[0] && (
          <div className="text-[#E9B44C] font-medium">
            Special Offer: Code <span className="font-data font-bold">{promotions[0].code}</span> · {promotions[0].description}
          </div>
        )}
      </div>

      {/* Storefront Dedicated Navigation */}
      <div className="bg-white border-b border-stone-200 sticky top-[65px] z-30">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ backgroundColor: brandPrimary }}
            >
              {restaurant.name.slice(0, 2).toUpperCase()}
            </div>
            <span className="font-editorial text-2xl font-semibold tracking-tight truncate">{restaurant.name}</span>
          </div>

          <div className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-600">
            <button
              onClick={() => {
                navigate(`/r/${restaurant.slug}/menu`);
                setActiveTab('storefront');
                setTimeout(() => document.getElementById('menu-section')?.scrollIntoView({ behavior: 'smooth' }), 50);
              }}
              className={`hover:text-[#101D35] whitespace-nowrap cursor-pointer ${
                subRoute === 'menu' ? 'text-[#0D9488]' : ''
              }`}
            >
              Menu
            </button>
            <button
              onClick={() => {
                navigate(`/r/${restaurant.slug}/reservations`);
                setActiveTab('reservations');
              }}
              className={`hover:text-[#101D35] whitespace-nowrap cursor-pointer ${
                activeTab === 'reservations' ? 'text-[#0D9488]' : ''
              }`}
            >
              Reservations
            </button>
            <button
              onClick={() => {
                navigate(`/r/${restaurant.slug}/contact`);
                setActiveTab('storefront');
                setTimeout(() => document.getElementById('story-section')?.scrollIntoView({ behavior: 'smooth' }), 50);
              }}
              className={`hover:text-[#101D35] whitespace-nowrap cursor-pointer ${
                subRoute === 'contact' ? 'text-[#0D9488]' : ''
              }`}
            >
              Contact &amp; Hours
            </button>
            <button
              onClick={() => setActiveTab('account')}
              className={`hover:text-[#101D35] whitespace-nowrap cursor-pointer ${
                activeTab === 'account' ? 'text-[#0D9488]' : ''
              }`}
            >
              My Orders
            </button>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {activeOrder && (
              <button
                onClick={() => setCartOpen(true)}
                className="px-3 py-1.5 bg-[#0D9488]/10 text-[#0D9488] rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer"
              >
                {activeOrder.order_number}: {activeOrder.status}
              </button>
            )}
            <button
              onClick={() => setCartOpen(true)}
              className="px-4 py-2 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
              style={{ backgroundColor: brandAccent }}
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Order Bag ({cartItemCount})</span>
            </button>
          </div>
        </div>
      </div>

      {/* STOREFRONT HOMEPAGE + MENU */}
      {activeTab === 'storefront' && (
        <>
          {/* Full-Width Editorial Hero */}
          <section className="relative h-[460px] lg:h-[520px] overflow-hidden">
            <img
              src={restaurant.cover_url}
              alt={restaurant.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/20" />
            <div className="absolute inset-0 max-w-7xl mx-auto px-6 py-12 flex flex-col justify-end text-white">
              <div className="max-w-3xl space-y-4">
                <div className="text-xs font-medium tracking-wider uppercase text-white/85">
                  {restaurant.category} · {restaurant.is_demo ? 'Demo Culinary Storefront' : 'Official Restaurant Website'}
                </div>
                <h1 className="font-editorial text-5xl sm:text-6xl font-semibold tracking-tight leading-none text-balance">
                  {restaurant.name}
                </h1>
                <p className="text-base sm:text-lg text-white/90 max-w-2xl leading-relaxed">
                  {restaurant.tagline || restaurant.description}
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    onClick={() => document.getElementById('menu-section')?.scrollIntoView({ behavior: 'smooth' })}
                    className="px-5 py-3 text-white text-xs font-semibold rounded-lg cursor-pointer"
                    style={{ backgroundColor: brandAccent }}
                  >
                    Explore Menu
                  </button>
                  <button
                    onClick={() => setCartOpen(true)}
                    className="px-5 py-3 bg-white text-[#101D35] hover:bg-stone-100 text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    Order Online
                  </button>
                  <button
                    onClick={() => setActiveTab('reservations')}
                    className="px-5 py-3 bg-white/15 hover:bg-white/25 text-white border border-white/30 text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    Reserve Table
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Featured Dishes Spotlight */}
          {sections.showFeatured && featuredItems.length > 0 && (
            <section className="max-w-7xl mx-auto px-6 pt-14 pb-6 space-y-6">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Chef's Selection</div>
                  <h2 className="font-editorial text-3xl sm:text-4xl font-semibold text-[#101D35] mt-1">
                    Featured Signature Plates
                  </h2>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {featuredItems.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    className="bg-white border border-stone-200 rounded-xl overflow-hidden flex flex-col justify-between"
                  >
                    <div>
                      <div className="aspect-[4/3] bg-stone-100 overflow-hidden">
                        <img src={item.image_url} alt={item.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      </div>
                      <div className="p-5">
                        <div className="text-xs text-slate-500">
                          {item.prep_minutes} min prep
                          {item.dietary_tags.length > 0 ? ` · ${item.dietary_tags.join(' · ')}` : ''}
                        </div>
                        <h3 className="text-lg font-bold text-[#101D35] mt-1">{item.name}</h3>
                        <p className="text-sm text-slate-600 mt-1.5 line-clamp-2">{item.description}</p>
                      </div>
                    </div>
                    <div className="px-5 pb-5 flex items-center justify-between">
                      <span className="text-base font-data font-bold text-[#101D35]">{formatCurrency(item.price_cents)}</span>
                      <button
                        disabled={!item.is_available}
                        onClick={() => openCustomizer(item)}
                        className="px-4 py-2 text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-40"
                        style={{ backgroundColor: brandAccent }}
                      >
                        {item.is_available ? 'Add to Order' : 'Sold Out'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Complete Digital Food Menu */}
          <section id="menu-section" className="max-w-7xl mx-auto px-6 py-12 space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-stone-200 pb-6">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Digital Menu</div>
                <h2 className="font-editorial text-3xl sm:text-4xl font-semibold text-[#101D35] mt-1">
                  Explore Every Dish
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <select
                  aria-label="Filter by dietary preference"
                  value={dietaryFilter}
                  onChange={(e) => setDietaryFilter(e.target.value)}
                  className="px-3 py-2 text-xs font-semibold bg-white border border-stone-200 rounded-lg"
                >
                  {dietaryOptions.map((d) => (
                    <option key={d} value={d}>
                      Dietary: {d}
                    </option>
                  ))}
                </select>
                <div className="relative w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search dishes..."
                    className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                  />
                </div>
              </div>
            </div>

            {/* Category Tabs */}
            <div className="flex items-center gap-1 p-1 bg-stone-200/70 rounded-lg w-fit overflow-x-auto max-w-full">
              <button
                onClick={() => setActiveCategory('ALL')}
                className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  activeCategory === 'ALL' ? 'bg-white text-[#101D35] shadow-xs' : 'text-slate-600'
                }`}
              >
                All Categories
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    activeCategory === cat.id ? 'bg-white text-[#101D35] shadow-xs' : 'text-slate-600'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {filteredItems.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-xl p-12 text-center text-sm text-slate-500">
                No dishes match your active filters.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white border border-stone-200 rounded-xl overflow-hidden hover:shadow-md transition-all flex flex-col"
                  >
                    <div className="aspect-[4/3] bg-stone-100 overflow-hidden">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-stone-400">
                          <UtensilsCrossed className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                    <div className="p-5 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="text-xs text-slate-500">
                          {item.prep_minutes} min prep
                          {item.dietary_tags.length > 0 ? ` · ${item.dietary_tags.join(' · ')}` : ''}
                        </div>
                        <h3 className="text-lg font-bold text-[#101D35] mt-1">{item.name}</h3>
                        <p className="text-sm text-slate-600 mt-1.5 line-clamp-2">{item.description}</p>
                      </div>
                      <div className="mt-5 pt-4 border-t border-stone-100 flex items-center justify-between">
                        <span className="text-base font-data font-bold text-[#101D35]">{formatCurrency(item.price_cents)}</span>
                        <button
                          disabled={!item.is_available}
                          onClick={() => openCustomizer(item)}
                          className="px-4 py-2 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-40 cursor-pointer"
                          style={{ backgroundColor: brandAccent }}
                        >
                          {item.is_available ? 'Customize & Add' : 'Sold Out'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Restaurant Story, Hours & Special Offers */}
          {sections.showStory && (
            <section id="story-section" className="bg-white border-y border-stone-200 py-14">
              <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-10">
                <div className="lg:col-span-7 space-y-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Our Culinary Story</div>
                  <h2 className="font-editorial text-4xl font-semibold text-[#101D35]">{restaurant.name}</h2>
                  <p className="text-base text-slate-600 leading-relaxed max-w-2xl">{restaurant.description}</p>

                  {sections.showOffers && promotions.length > 0 && (
                    <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {promotions.map((p) => (
                        <div key={p.code} className="p-4 rounded-xl bg-[#FAF9F6] border border-stone-200 space-y-1">
                          <div className="flex items-center gap-2 text-xs font-data font-bold" style={{ color: brandAccent }}>
                            <Tag className="w-3.5 h-3.5" /> {p.code}
                          </div>
                          <div className="text-xs text-slate-700">{p.description}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="lg:col-span-5 bg-[#FAF9F6] border border-stone-200 rounded-xl p-6 space-y-4">
                  <div className="text-sm font-bold text-[#101D35] flex items-center gap-2">
                    <Clock className="w-4 h-4" style={{ color: brandAccent }} /> Opening Hours &amp; Location
                  </div>
                  <div className="divide-y divide-stone-200 text-xs">
                    {Object.entries(restaurant.opening_hours).map(([day, hrs]) => (
                      <div key={day} className="py-2 flex justify-between">
                        <span className="font-semibold text-slate-700">{day}</span>
                        <span className="font-data text-slate-600">{hrs}</span>
                      </div>
                    ))}
                  </div>
                  <div className="pt-2 text-xs text-slate-600 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" /> {restaurant.address}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5" /> {restaurant.phone}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Food Gallery */}
          {sections.showGallery && restaurant.gallery.length > 0 && (
            <section className="max-w-7xl mx-auto px-6 py-14 space-y-6">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Atmosphere</div>
                <h2 className="font-editorial text-3xl sm:text-4xl font-semibold text-[#101D35] mt-1">Culinary Gallery</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {restaurant.gallery.map((imgUrl, idx) => (
                  <div key={idx} className="aspect-[4/3] rounded-xl overflow-hidden border border-stone-200 bg-white">
                    <img
                      src={imgUrl}
                      alt={`${restaurant.name} dish and interior ${idx + 1}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Guest Reviews */}
          {sections.showReviews && (
            <section className="max-w-7xl mx-auto px-6 pb-16 space-y-6">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Diner Feedback {restaurant.is_demo ? '· Sample Reviews' : ''}
                </div>
                <h2 className="font-editorial text-3xl sm:text-4xl font-semibold text-[#101D35] mt-1">Guest Impressions</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {SAMPLE_REVIEWS.map((rev) => (
                  <div key={rev.author} className="bg-white border border-stone-200 rounded-xl p-6 space-y-3">
                    <div className="flex items-center gap-1 text-[#E9B44C]">
                      {Array.from({ length: rev.rating }).map((_, i) => (
                        <Star key={i} className="w-4 h-4 fill-current" />
                      ))}
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">"{rev.quote}"</p>
                    <div className="text-xs text-slate-500 pt-2 border-t border-stone-100">
                      <span className="font-semibold text-[#101D35]">{rev.author}</span> · {rev.context}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Storefront Footer */}
          <footer className="bg-[#101D35] text-slate-300 py-10 px-6">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div>
                <div className="font-editorial text-2xl font-semibold text-white">{restaurant.name}</div>
                <div className="text-xs text-slate-400 mt-1">
                  {restaurant.address} · {restaurant.phone} · {restaurant.email}
                </div>
              </div>
              <div className="text-xs text-slate-400">
                Storefront powered by ZAYQORA · VIRELEO
              </div>
            </div>
          </footer>
        </>
      )}

      {/* RESERVATIONS TAB */}
      {activeTab === 'reservations' && (
        <main className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 bg-white border border-stone-200 rounded-xl p-6 lg:p-8">
            <h2 className="font-editorial text-3xl font-semibold text-[#101D35]">Reserve a Table</h2>
            <p className="text-sm text-slate-600 mt-1">
              Select your preferred date, guest count, and available seating time.
            </p>

            {resConfirmed ? (
              <div className="mt-6 p-6 rounded-xl bg-emerald-50 border border-emerald-200 space-y-3">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-base">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Reservation Confirmed</span>
                </div>
                <p className="text-sm text-emerald-900">
                  Table <span className="font-data font-bold">{resConfirmed.tableNumber}</span> reserved for{' '}
                  <span className="font-semibold">{resPartySize} guests</span> on{' '}
                  <span className="font-data">{resConfirmed.date}</span> at{' '}
                  <span className="font-data">{resConfirmed.timeSlot}</span>.
                </p>
                <button
                  onClick={() => setResConfirmed(null)}
                  className="px-4 py-2 bg-emerald-800 text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Make Another Booking
                </button>
              </div>
            ) : (
              <form onSubmit={handleBookReservation} className="mt-6 space-y-5">
                {resError && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                    {resError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-2">Choose Date</label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {upcomingDates.map((d) => (
                      <button
                        key={d.iso}
                        type="button"
                        onClick={() => setResDate(d.iso)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                          resDate === d.iso
                            ? 'bg-[#101D35] text-white border-[#101D35]'
                            : 'bg-white text-slate-700 border-stone-200'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="date"
                    required
                    value={resDate}
                    onChange={(e) => setResDate(e.target.value)}
                    className="w-full sm:w-56 px-3.5 py-2 text-sm border border-stone-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-2">Party Size</label>
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setResPartySize(n)}
                        className={`px-4 py-2 rounded-lg text-xs font-data font-semibold border cursor-pointer ${
                          resPartySize === n
                            ? 'bg-[#0D9488] text-white border-[#0D9488]'
                            : 'bg-white text-slate-700 border-stone-200'
                        }`}
                      >
                        {n} {n === 1 ? 'Guest' : 'Guests'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-2">Available Seating Times</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {resSlots.map((slot) => (
                      <button
                        key={slot.timeSlot}
                        type="button"
                        disabled={!slot.available}
                        onClick={() => setSelectedSlot(slot.timeSlot)}
                        className={`p-2.5 rounded-lg text-left border transition-colors cursor-pointer ${
                          selectedSlot === slot.timeSlot
                            ? 'bg-[#101D35] text-white border-[#101D35]'
                            : slot.available
                            ? 'bg-white text-[#101D35] border-stone-200 hover:border-[#0D9488]'
                            : 'bg-stone-100 text-slate-400 border-stone-200 cursor-not-allowed'
                        }`}
                      >
                        <div className="text-xs font-data font-bold">{slot.timeSlot}</div>
                        <div className="text-[11px] opacity-80">
                          {slot.available ? `${slot.remainingTables} tables left` : 'Booked'}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input
                    type="text"
                    required
                    value={resName}
                    onChange={(e) => setResName(e.target.value)}
                    placeholder="Guest Full Name"
                    className="w-full px-3.5 py-2.5 text-sm border border-stone-200 rounded-lg"
                  />
                  <input
                    type="email"
                    required
                    value={resEmail}
                    onChange={(e) => setResEmail(e.target.value)}
                    placeholder="Email"
                    className="w-full px-3.5 py-2.5 text-sm border border-stone-200 rounded-lg"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input
                    type="text"
                    required
                    value={resPhone}
                    onChange={(e) => setResPhone(e.target.value)}
                    placeholder="Phone"
                    className="w-full px-3.5 py-2.5 text-sm border border-stone-200 rounded-lg"
                  />
                  <input
                    type="text"
                    value={resNotes}
                    onChange={(e) => setResNotes(e.target.value)}
                    placeholder="Allergies or celebration notes"
                    className="w-full px-3.5 py-2.5 text-sm border border-stone-200 rounded-lg"
                  />
                </div>

                <button
                  type="submit"
                  disabled={resSubmitting || !selectedSlot}
                  className="w-full py-3 bg-[#0D9488] hover:bg-[#0F766E] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2"
                >
                  <Calendar className="w-4 h-4" />
                  <span>{resSubmitting ? 'Locking Table...' : 'Confirm Table Reservation'}</span>
                </button>
              </form>
            )}
          </div>

          <div className="lg:col-span-5 bg-white border border-stone-200 rounded-xl p-6 lg:p-8 space-y-6 h-fit">
            <h3 className="text-base font-bold text-[#101D35] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#0D9488]" /> Opening Hours
            </h3>
            <div className="divide-y divide-stone-100 text-sm">
              {Object.entries(restaurant.opening_hours).map(([day, hrs]) => (
                <div key={day} className="py-2 flex items-center justify-between">
                  <span className="font-medium text-slate-700">{day}</span>
                  <span className="font-data text-slate-600">{hrs}</span>
                </div>
              ))}
            </div>
          </div>
        </main>
      )}

      {/* ACCOUNT & ORDER HISTORY */}
      {activeTab === 'account' && (
        <main className="max-w-4xl mx-auto px-6 py-10">
          <div className="bg-white border border-stone-200 rounded-xl p-6 lg:p-8">
            {!user ? (
              <div className="text-center py-10 space-y-4">
                <User className="w-8 h-8 text-slate-400 mx-auto" />
                <h2 className="text-lg font-bold text-[#101D35]">Sign in to view your order history</h2>
                <button
                  onClick={onOpenAuth}
                  className="px-5 py-2.5 bg-[#0D9488] text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Sign In / Explore Customer Account
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-[#101D35]">{user.fullName} — Order History</h2>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
                {customerOrders.length === 0 ? (
                  <p className="text-sm text-slate-500">No orders placed under this email yet.</p>
                ) : (
                  <div className="divide-y divide-stone-200">
                    {customerOrders.map((o) => (
                      <div key={o.id} className="py-4 flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <div className="text-sm font-bold text-[#101D35]">
                            {o.order_number} · {o.restaurant_name}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {o.order_type} · {new Date(o.created_at).toLocaleString()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-data font-bold text-[#101D35]">{formatCurrency(o.total_cents)}</div>
                          <div className="text-xs font-semibold text-[#0D9488]">{o.status}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      )}

      {/* Dish Customization Modal */}
      {customizingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full overflow-hidden shadow-2xl">
            <div className="relative h-48 bg-stone-100">
              <img
                src={customizingItem.image_url}
                alt={customizingItem.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => setCustomizingItem(null)}
                className="absolute top-3 right-3 p-2 bg-white/90 rounded-full text-slate-700 hover:bg-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              <div>
                <h3 className="text-xl font-bold text-[#101D35]">{customizingItem.name}</h3>
                <p className="text-sm text-slate-600 mt-1">{customizingItem.description}</p>
              </div>

              {customizingItem.variants.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-slate-700 mb-2">Choose Portion / Variant</div>
                  <div className="space-y-2">
                    {customizingItem.variants.map((v) => (
                      <label
                        key={v.id}
                        className="flex items-center justify-between p-3 border border-stone-200 rounded-lg cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="radio"
                            name="variant"
                            checked={selectedVariant?.id === v.id}
                            onChange={() => setSelectedVariant(v)}
                            className="accent-[#0D9488]"
                          />
                          <span className="text-sm font-medium">{v.name}</span>
                        </div>
                        <span className="text-xs font-data text-slate-600">
                          {v.price_delta_cents > 0 ? `+${formatCurrency(v.price_delta_cents)}` : 'Included'}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {customizingItem.modifiers.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-slate-700 mb-2">Optional Add-Ons</div>
                  <div className="space-y-2">
                    {customizingItem.modifiers.map((m) => {
                      const checked = selectedModifiers.some((sm) => sm.id === m.id);
                      return (
                        <label
                          key={m.id}
                          className="flex items-center justify-between p-3 border border-stone-200 rounded-lg cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedModifiers([...selectedModifiers, m]);
                                else setSelectedModifiers(selectedModifiers.filter((sm) => sm.id !== m.id));
                              }}
                              className="accent-[#0D9488]"
                            />
                            <span className="text-sm font-medium">{m.name}</span>
                          </div>
                          <span className="text-xs font-data text-slate-600">+{formatCurrency(m.price_cents)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Special Kitchen &amp; Allergy Instructions</label>
                <input
                  type="text"
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  placeholder="Allergies, spice level, sauce on side..."
                  className="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-stone-200">
                <div className="flex items-center gap-2 border border-stone-200 rounded-lg p-1">
                  <button
                    type="button"
                    onClick={() => setCustomQty((q) => Math.max(1, q - 1))}
                    className="p-1.5 hover:bg-stone-100 rounded cursor-pointer"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-8 text-center text-sm font-data font-bold">{customQty}</span>
                  <button
                    type="button"
                    onClick={() => setCustomQty((q) => q + 1)}
                    className="p-1.5 hover:bg-stone-100 rounded cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={addToCart}
                  className="px-6 py-2.5 text-white text-sm font-semibold rounded-lg cursor-pointer"
                  style={{ backgroundColor: brandAccent }}
                >
                  Add to Bag ·{' '}
                  {formatCurrency(
                    (customizingItem.price_cents +
                      (selectedVariant?.price_delta_cents || 0) +
                      selectedModifiers.reduce((s, m) => s + m.price_cents, 0)) *
                      customQty
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Redesigned Cart & Checkout Drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/55">
          <div className="bg-white w-full max-w-md h-full flex flex-col shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-[#101D35]">
                {activeOrder ? `Order ${activeOrder.order_number}` : `Your Bag (${cartItemCount})`}
              </h3>
              <button onClick={() => setCartOpen(false)} className="p-2 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {activeOrder ? (
                <div className="space-y-5">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Live Status</span>
                      <span className="text-xs font-bold text-[#0D9488] font-data">{activeOrder.status}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Payment</span>
                      <span className="text-xs font-semibold text-[#101D35]">{activeOrder.payment_status}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Server-Verified Total</span>
                      <span className="text-sm font-data font-bold text-[#101D35]">{formatCurrency(activeOrder.total_cents)}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED'].map((st) => {
                      const stages = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED'];
                      const reached = stages.indexOf(activeOrder.status) >= stages.indexOf(st);
                      return (
                        <div key={st} className="flex items-center gap-3 text-xs">
                          <div className={`w-3 h-3 rounded-full ${reached ? 'bg-[#0D9488]' : 'bg-slate-200'}`} />
                          <span className={reached ? 'font-semibold text-[#101D35]' : 'text-slate-400'}>{st}</span>
                        </div>
                      );
                    })}
                  </div>

                  {sandboxChallenge && (
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                        <ShieldCheck className="w-4 h-4" />
                        <span>Sandbox Payment Verification Required</span>
                      </div>
                      <p className="text-xs text-amber-800">
                        Reference <span className="font-data">{sandboxChallenge.providerRef}</span> awaits verified webhook confirmation before dispatching to the kitchen display.
                      </p>
                      <button
                        disabled={confirmingSandbox}
                        onClick={handleConfirmSandboxPayment}
                        className="w-full py-2.5 bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs font-semibold rounded-lg cursor-pointer"
                      >
                        {confirmingSandbox ? 'Verifying HMAC Webhook...' : 'Authorize Sandbox Payment'}
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => setActiveOrder(null)}
                    className="w-full py-2.5 border border-slate-200 rounded-lg text-xs font-semibold text-[#101D35] cursor-pointer"
                  >
                    Start New Order
                  </button>
                </div>
              ) : cart.length === 0 ? (
                <div className="text-center py-16 text-sm text-slate-500">
                  Your bag is empty. Select dishes from the menu to start ordering.
                </div>
              ) : (
                <form id="checkout-form" onSubmit={handlePlaceOrder} className="space-y-5">
                  <div className="space-y-3">
                    {cart.map((line) => {
                      const unit =
                        line.menuItem.price_cents +
                        (line.variant?.price_delta_cents || 0) +
                        line.modifiers.reduce((s, m) => s + m.price_cents, 0);
                      return (
                        <div key={line.cartLineId} className="pb-3 border-b border-slate-100 flex justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-[#101D35] truncate">{line.menuItem.name}</div>
                            {line.variant && <div className="text-xs text-slate-500">{line.variant.name}</div>}
                            {line.modifiers.length > 0 && (
                              <div className="text-xs text-slate-500">+ {line.modifiers.map((m) => m.name).join(', ')}</div>
                            )}
                            {line.specialInstructions && (
                              <div className="text-xs text-amber-700 mt-0.5">Note: {line.specialInstructions}</div>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              <button
                                type="button"
                                onClick={() => updateCartQty(line.cartLineId, -1)}
                                className="w-6 h-6 rounded border border-slate-200 flex items-center justify-center text-xs cursor-pointer"
                              >
                                -
                              </button>
                              <span className="text-xs font-data font-bold">{line.quantity}</span>
                              <button
                                type="button"
                                onClick={() => updateCartQty(line.cartLineId, 1)}
                                className="w-6 h-6 rounded border border-slate-200 flex items-center justify-center text-xs cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-data font-semibold">{formatCurrency(unit * line.quantity)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Fulfillment Mode */}
                  <div className="flex p-1 bg-slate-100 rounded-lg">
                    {(['DELIVERY', 'PICKUP', 'DINE_IN'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setOrderType(mode)}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                          orderType === mode ? 'bg-white text-[#101D35] shadow-xs' : 'text-slate-600'
                        }`}
                      >
                        {mode.replace('_', ' ')}
                      </button>
                    ))}
                  </div>

                  {checkoutError && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{checkoutError}</div>
                  )}

                  <div className="space-y-3">
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Full Name"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                    <input
                      type="email"
                      required
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="Email Address"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                    <input
                      type="text"
                      required
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="Phone Number"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                    {orderType === 'DELIVERY' && (
                      <input
                        type="text"
                        required
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        placeholder="Delivery Street Address"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                      />
                    )}
                    {orderType === 'DINE_IN' && (
                      <input
                        type="text"
                        required
                        value={tableNumber}
                        onChange={(e) => setTableNumber(e.target.value)}
                        placeholder="Table Number (e.g. T-02)"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                      />
                    )}

                    {/* Coupon Validation */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value)}
                        placeholder="Promo Code (e.g. WELCOME15)"
                        className="flex-1 px-3 py-2 text-xs font-data border border-slate-200 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={handleApplyCoupon}
                        className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-xs font-semibold rounded-lg cursor-pointer"
                      >
                        Apply
                      </button>
                    </div>
                    {couponError && <div className="text-xs text-red-600">{couponError}</div>}
                    {appliedCoupon && (
                      <div className="text-xs text-emerald-700 font-medium">
                        Applied {appliedCoupon.code}: -{formatCurrency(appliedCoupon.discountCents)}
                      </div>
                    )}

                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as 'CARD_SANDBOX' | 'PAY_AT_VENUE')}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    >
                      <option value="CARD_SANDBOX">ZAYQORA Sandbox Card Payment</option>
                      <option value="PAY_AT_VENUE">Pay at Venue / Cash</option>
                    </select>
                  </div>

                  {/* Pricing Breakdown */}
                  <div className="pt-3 border-t border-slate-200 space-y-1.5 text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span className="font-data font-semibold text-[#101D35]">{formatCurrency(cartSubtotalCents)}</span>
                    </div>
                    {estimatedDiscountCents > 0 && (
                      <div className="flex justify-between text-emerald-700">
                        <span>Coupon Discount</span>
                        <span className="font-data font-semibold">-{formatCurrency(estimatedDiscountCents)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Tax ({(restaurant.tax_rate * 100).toFixed(1)}%)</span>
                      <span className="font-data">{formatCurrency(estimatedTaxCents)}</span>
                    </div>
                    {orderType === 'DELIVERY' && (
                      <div className="flex justify-between">
                        <span>Delivery Fee</span>
                        <span className="font-data">{formatCurrency(estimatedDeliveryCents)}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t border-slate-100 text-sm font-bold text-[#101D35]">
                      <span>Estimated Total</span>
                      <span className="font-data">{formatCurrency(estimatedTotalCents)}</span>
                    </div>
                  </div>
                </form>
              )}
            </div>

            {!activeOrder && cart.length > 0 && (
              <div className="p-6 border-t border-slate-200">
                <button
                  type="submit"
                  form="checkout-form"
                  disabled={placingOrder}
                  className="w-full py-3 bg-[#0D9488] hover:bg-[#0F766E] text-white text-sm font-semibold rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {placingOrder ? 'Validating Order...' : `Place Order (${formatCurrency(estimatedTotalCents)})`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
