import React, { useMemo, useState } from 'react';
import { Check, ArrowLeft, ArrowRight, Globe, Sparkles, Plus, Trash2 } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { AuthUser } from '../types/zayqora';

interface OnboardingWizardProps {
  navigate: (to: string) => void;
}

const STEPS = [
  'Owner Account',
  'Verify Email',
  'Restaurant Name',
  'Category',
  'Business Address',
  'Logo & Emblem',
  'Cover Image',
  'Opening Hours',
  'Service Modes',
  'Website Theme',
  'Menu Items',
  'Preview Website',
  'Publish Storefront',
];

const COVER_PRESETS = [
  { label: 'Candlelit Copper Hearth', url: '/src/assets/images/hero_saffron_hearth_1794828971752.jpg' },
  { label: 'Artisan Counter & Kitchen', url: '/src/assets/images/hero_kuro_ramen_1794828971544.jpg' },
  { label: 'Sunlit Coastal Terrace', url: '/src/assets/images/hero_verbena_bistro_1794828971700.jpg' },
];

export function OnboardingWizard({ navigate }: OnboardingWizardProps) {
  const { setSession } = useAuth();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [publishedResult, setPublishedResult] = useState<{ slug: string; name: string } | null>(null);

  // Step states
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [emailVerificationCode, setEmailVerificationCode] = useState('482910');
  const [emailVerified, setEmailVerified] = useState(false);

  const [restaurantName, setRestaurantName] = useState('');
  const [category, setCategory] = useState('Modern Fine Casual');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState(COVER_PRESETS[0].url);

  const [openingHours, setOpeningHours] = useState<Record<string, string>>({
    Mon: 'Closed',
    Tue: '17:00 - 22:00',
    Wed: '17:00 - 22:00',
    Thu: '17:00 - 22:30',
    Fri: '12:00 - 23:00',
    Sat: '12:00 - 23:00',
    Sun: '12:00 - 21:00',
  });

  const [deliveryEnabled, setDeliveryEnabled] = useState(true);
  const [pickupEnabled, setPickupEnabled] = useState(true);
  const [dineInEnabled, setDineInEnabled] = useState(true);

  const [themeStyle, setThemeStyle] = useState<'editorial' | 'atelier' | 'coastal'>('editorial');
  const [primaryColor, setPrimaryColor] = useState('#101D35');
  const [accentColor, setAccentColor] = useState('#0D9488');

  const [menuItems, setMenuItems] = useState([
    { categoryName: 'Signature Plates', name: 'Wood-Fired Herb Chicken', description: 'Charred citrus, roasted garlic jus', priceDollars: 26, station: 'WOOD_HEARTH' },
    { categoryName: 'Artisan Sweets', name: 'Cardamom Chocolate Tart', description: 'Pistachio crumble and sea salt', priceDollars: 14, station: 'PASTRY_COLD' },
  ]);

  const generatedSlug = useMemo(() => {
    const s = restaurantName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return s || 'your-restaurant';
  }, [restaurantName]);

  const canProceed = () => {
    if (step === 0) return ownerName.trim().length >= 2 && ownerEmail.includes('@') && ownerPassword.length >= 8;
    if (step === 1) return emailVerified;
    if (step === 2) return restaurantName.trim().length >= 2;
    if (step === 4) return address.trim().length >= 4 && phone.trim().length >= 4;
    if (step === 10) return menuItems.length >= 1 && menuItems.every((m) => m.name.trim() && m.priceDollars > 0);
    return true;
  };

  const handlePublish = async (publishNow: boolean) => {
    setError('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{
        token: string;
        user: AuthUser;
        restaurant: { id: string; slug: string; name: string };
      }>('/api/onboarding/create-restaurant', {
        method: 'POST',
        body: JSON.stringify({
          ownerName,
          ownerEmail,
          ownerPassword,
          restaurantName,
          category,
          description,
          address,
          phone,
          logoUrl,
          coverUrl,
          primaryColor,
          accentColor,
          themeStyle,
          openingHours,
          deliveryEnabled,
          pickupEnabled,
          dineInEnabled,
          publishNow,
          initialMenuItems: menuItems,
        }),
      });
      setSession(res.token, res.user);
      setPublishedResult({ slug: res.restaurant.slug, name: res.restaurant.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create restaurant workspace');
    } finally {
      setSubmitting(false);
    }
  };

  if (publishedResult) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1426] py-16 px-6">
        <div className="max-w-3xl mx-auto bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-5">
          <div className="w-12 h-12 rounded-full bg-[#0D9488]/10 text-[#0D9488] flex items-center justify-center mx-auto">
            <Check className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-[#101D35] dark:text-slate-100">
            {publishedResult.name} Workspace Provisioned
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
            Your isolated multi-tenant workspace, menu catalog, floor tables, and public storefront at{' '}
            <span className="font-data text-[#0D9488]">/r/{publishedResult.slug}</span> are live.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => navigate(`/r/${publishedResult.slug}`)}
              className="px-5 py-2.5 bg-[#0D9488] hover:bg-[#0F766E] text-white text-sm font-semibold rounded-lg cursor-pointer"
            >
              Visit Public Website
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-5 py-2.5 bg-[#101D35] dark:bg-slate-800 hover:bg-[#1A2B4B] dark:hover:bg-slate-700 text-white text-sm font-semibold rounded-lg cursor-pointer"
            >
              Open Owner Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1426] py-10 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-[#0D9488]">
              Step {step + 1} of {STEPS.length} · {STEPS[step]}
            </div>
            <h1 className="text-2xl font-bold text-[#101D35] dark:text-slate-100 mt-1">Restaurant Onboarding Wizard</h1>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-data">
            Workspace Slug: /r/{generatedSlug}
          </div>
        </div>

        {/* Progress Track */}
        <div className="grid grid-cols-13 gap-1 mb-8">
          {STEPS.map((label, idx) => (
            <button
              key={label}
              type="button"
              title={`${idx + 1}. ${label}`}
              onClick={() => idx < step && setStep(idx)}
              className={`h-2 rounded-full transition-colors ${
                idx <= step ? 'bg-[#0D9488]' : 'bg-slate-200 dark:bg-slate-800'
              } ${idx < step ? 'cursor-pointer' : 'cursor-default'}`}
            />
          ))}
        </div>

        <div className="bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 rounded-xl p-6 lg:p-8">
          {error && (
            <div className="mb-6 p-3.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs font-medium text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Step 1: Owner Account */}
          {step === 0 && (
            <div className="space-y-4 max-w-lg">
              <h2 className="text-lg font-bold text-[#101D35] dark:text-slate-100">1. Create Owner Account</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">Establish the primary owner credentials for your isolated ZAYQORA workspace.</p>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Owner Full Name</label>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Jordan Vance"
                  className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-[#0B1426] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Work Email</label>
                <input
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder="owner@myrestaurant.com"
                  className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-[#0B1426] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Password (min 8 characters)</label>
                <input
                  type="password"
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                  placeholder="Create strong password"
                  className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-[#0B1426] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>
            </div>
          )}

          {/* Step 2: Verify Email */}
          {step === 1 && (
            <div className="space-y-4 max-w-lg">
              <h2 className="text-lg font-bold text-[#101D35] dark:text-slate-100">2. Verify Owner Email</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Confirm ownership of <span className="font-semibold text-[#101D35] dark:text-slate-100">{ownerEmail}</span>. In sandbox preview, confirm using the 6-digit verification code below.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={emailVerificationCode}
                  onChange={(e) => setEmailVerificationCode(e.target.value)}
                  className="w-40 px-3.5 py-2.5 text-sm font-data bg-white dark:bg-[#0B1426] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setEmailVerified(true)}
                  className={`px-4 py-2.5 text-xs font-semibold rounded-lg cursor-pointer ${
                    emailVerified ? 'bg-[#0D9488] text-white' : 'bg-[#101D35] dark:bg-slate-800 text-white hover:bg-[#1A2B4B] dark:hover:bg-slate-700'
                  }`}
                >
                  {emailVerified ? 'Email Verified ✓' : 'Verify Code'}
                </button>
              </div>
            </div>
          )}

        {/* Step 3: Restaurant Name */}
        {step === 2 && (
          <div className="space-y-4 max-w-lg">
            <h2 className="text-lg font-bold text-[#101D35] dark:text-slate-100">3. Restaurant Name &amp; Slug</h2>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Restaurant Name</label>
              <input
                type="text"
                value={restaurantName}
                onChange={(e) => setRestaurantName(e.target.value)}
                placeholder="Ember & Sage Kitchen"
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-[#0B1426] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Short Description</label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Seasonal hearth cooking, handmade pastas, and natural wines."
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-[#0B1426] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0B1426] border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300">
              Public Storefront URL: <span className="font-data font-semibold text-[#0D9488]">/r/{generatedSlug}</span>
            </div>
          </div>
        )}

        {/* Step 4: Category */}
        {step === 3 && (
          <div className="space-y-4 max-w-xl">
            <h2 className="text-lg font-bold text-[#101D35] dark:text-slate-100">4. Select Restaurant Category</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                'Modern Fine Casual',
                'Wood-Fired Indian',
                'Japanese Ramen & Izakaya',
                'Coastal Mediterranean',
                'Artisanal Bakery & Cafe',
                'Steakhouse & Grill',
              ].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`p-3.5 rounded-lg border text-left text-xs font-semibold transition-colors cursor-pointer ${
                    category === cat
                      ? 'border-[#0D9488] bg-[#0D9488]/10 text-[#101D35] dark:text-slate-100'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 5: Business Address */}
        {step === 4 && (
          <div className="space-y-4 max-w-lg">
            <h2 className="text-lg font-bold text-[#101D35] dark:text-slate-100">5. Business Address &amp; Contact</h2>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Street Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="240 Hayes Street, San Francisco, CA 94102"
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-[#0B1426] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Public Phone Number</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (415) 555-0199"
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-[#0B1426] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg"
              />
            </div>
          </div>
        )}

        {/* Step 6: Logo */}
        {step === 5 && (
          <div className="space-y-4 max-w-lg">
            <h2 className="text-lg font-bold text-[#101D35] dark:text-slate-100">6. Restaurant Logo URL (Optional)</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">Provide a square logo URL or leave blank to use ZAYQORA's bespoke typographic monogram.</p>
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-[#0B1426] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg"
            />
          </div>
        )}

        {/* Step 7: Cover Image */}
        {step === 6 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-[#101D35] dark:text-slate-100">7. Choose Cover Banner Photography</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {COVER_PRESETS.map((preset) => (
                <button
                  key={preset.url}
                  type="button"
                  onClick={() => setCoverUrl(preset.url)}
                  className={`rounded-xl overflow-hidden border-2 text-left transition-all cursor-pointer ${
                    coverUrl === preset.url ? 'border-[#0D9488]' : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <img src={preset.url} alt={preset.label} referrerPolicy="no-referrer" className="w-full h-36 object-cover" />
                  <div className="p-3 text-xs font-semibold text-[#101D35] dark:text-slate-100">{preset.label}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 8: Opening Hours */}
        {step === 7 && (
          <div className="space-y-4 max-w-lg">
            <h2 className="text-lg font-bold text-[#101D35] dark:text-slate-100">8. Configure Opening Hours</h2>
            <div className="space-y-2">
              {Object.entries(openingHours).map(([day, hrs]) => (
                <div key={day} className="flex items-center gap-4">
                  <span className="w-14 text-xs font-semibold text-slate-700 dark:text-slate-300">{day}</span>
                  <input
                    type="text"
                    value={hrs}
                    onChange={(e) => setOpeningHours({ ...openingHours, [day]: e.target.value })}
                    className="flex-1 px-3 py-2 text-xs font-data bg-white dark:bg-[#0B1426] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 9: Service Modes */}
        {step === 8 && (
          <div className="space-y-4 max-w-lg">
            <h2 className="text-lg font-bold text-[#101D35] dark:text-slate-100">9. Delivery, Pickup &amp; Dine-In Services</h2>
            {[
              { label: 'Online Delivery Ordering', val: deliveryEnabled, set: setDeliveryEnabled },
              { label: 'Counter / Curbside Pickup', val: pickupEnabled, set: setPickupEnabled },
              { label: 'Table Reservations & QR Dine-In', val: dineInEnabled, set: setDineInEnabled },
            ].map((svc) => (
              <label key={svc.label} className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer">
                <span className="text-sm font-medium text-[#101D35] dark:text-slate-100">{svc.label}</span>
                <input
                  type="checkbox"
                  checked={svc.val}
                  onChange={(e) => svc.set(e.target.checked)}
                  className="w-4 h-4 accent-[#0D9488]"
                />
              </label>
            ))}
          </div>
        )}

        {/* Step 10: Website Theme */}
        {step === 9 && (
          <div className="space-y-5 max-w-xl">
            <h2 className="text-lg font-bold text-[#101D35] dark:text-slate-100">10. Website Theme &amp; Brand Palette</h2>
            <div className="grid grid-cols-3 gap-3">
              {(['editorial', 'atelier', 'coastal'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setThemeStyle(t)}
                  className={`p-4 rounded-lg border text-left capitalize text-sm font-semibold cursor-pointer ${
                    themeStyle === t
                      ? 'border-[#0D9488] bg-[#0D9488]/10 text-[#101D35] dark:text-slate-100'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {t} Theme
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Primary Color</label>
                <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-full h-10 rounded cursor-pointer" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Accent Color</label>
                <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="w-full h-10 rounded cursor-pointer" />
              </div>
            </div>
          </div>
        )}

        {/* Step 11: Menu Items */}
        {step === 10 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#101D35] dark:text-slate-100">11. Add Initial Menu Items</h2>
              <button
                type="button"
                onClick={() =>
                  setMenuItems([
                    ...menuItems,
                    { categoryName: 'Signature Plates', name: '', description: '', priceDollars: 18, station: 'MAIN_GRILL' },
                  ])
                }
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[#101D35] dark:text-slate-100 text-xs font-semibold rounded-lg inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Dish
              </button>
            </div>
            <div className="space-y-3">
              {menuItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-3 p-3.5 border border-slate-200 dark:border-slate-700 rounded-lg items-center">
                  <input
                    type="text"
                    value={item.categoryName}
                    onChange={(e) => {
                      const next = [...menuItems];
                      next[idx].categoryName = e.target.value;
                      setMenuItems(next);
                    }}
                    placeholder="Category"
                    className="md:col-span-3 px-3 py-2 text-xs bg-white dark:bg-[#0B1426] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md"
                  />
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => {
                      const next = [...menuItems];
                      next[idx].name = e.target.value;
                      setMenuItems(next);
                    }}
                    placeholder="Dish Name"
                    className="md:col-span-4 px-3 py-2 text-xs bg-white dark:bg-[#0B1426] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md"
                  />
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                    value={item.priceDollars}
                    onChange={(e) => {
                      const next = [...menuItems];
                      next[idx].priceDollars = Number(e.target.value);
                      setMenuItems(next);
                    }}
                    className="md:col-span-2 px-3 py-2 text-xs font-data bg-white dark:bg-[#0B1426] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md"
                  />
                  <select
                    value={item.station}
                    onChange={(e) => {
                      const next = [...menuItems];
                      next[idx].station = e.target.value;
                      setMenuItems(next);
                    }}
                    className="md:col-span-2 px-2 py-2 text-xs bg-white dark:bg-[#0B1426] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md"
                  >
                    <option value="WOOD_HEARTH">Wood Hearth</option>
                    <option value="MAIN_GRILL">Main Grill</option>
                    <option value="PASTRY_COLD">Pastry / Cold</option>
                    <option value="BAR_STATION">Bar Station</option>
                  </select>
                  <button
                    type="button"
                    disabled={menuItems.length <= 1}
                    onClick={() => setMenuItems(menuItems.filter((_, i) => i !== idx))}
                    className="md:col-span-1 p-2 text-slate-400 hover:text-red-600 disabled:opacity-30 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 12: Live Storefront Preview */}
        {step === 11 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-[#101D35] dark:text-slate-100">12. Live Storefront Preview</h2>
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="h-52 relative">
                <img src={coverUrl} alt={restaurantName} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-6 flex flex-col justify-end text-white">
                  <div className="text-xs opacity-80">{category} · {address}</div>
                  <div className="font-editorial text-3xl font-bold mt-1">{restaurantName || 'Your Restaurant'}</div>
                </div>
              </div>
              <div className="p-6 bg-white dark:bg-[#0B1426] grid grid-cols-1 md:grid-cols-2 gap-4">
                {menuItems.map((m, idx) => (
                  <div key={idx} className="p-3 border border-slate-200 dark:border-slate-800 rounded-lg flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-[#101D35] dark:text-slate-100">{m.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{m.categoryName}</div>
                    </div>
                    <div className="text-sm font-data font-semibold" style={{ color: accentColor }}>
                      ${m.priceDollars.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 13: Publish */}
        {step === 12 && (
          <div className="space-y-5 max-w-xl">
            <h2 className="text-lg font-bold text-[#101D35] dark:text-slate-100">13. Publish Your Restaurant Website</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Launching creates an isolated tenant workspace, provisions 4 dining tables with QR tokens, configures your KDS kitchen feed, and publishes{' '}
              <span className="font-data text-[#0D9488]">/r/{generatedSlug}</span>.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => handlePublish(true)}
                className="px-6 py-3 bg-[#0D9488] hover:bg-[#0F766E] text-white text-sm font-semibold rounded-lg inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Globe className="w-4 h-4" />
                <span>{submitting ? 'Provisioning Workspace...' : 'Publish Live Website'}</span>
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handlePublish(false)}
                className="px-6 py-3 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-[#101D35] dark:text-slate-100 text-sm font-semibold rounded-lg inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                <span>Save as Draft</span>
              </button>
            </div>
          </div>
        )}

        {/* Footer Controls */}
        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-[#101D35] dark:hover:text-slate-100 disabled:opacity-40 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Previous
          </button>

          {step < STEPS.length - 1 && (
            <button
              type="button"
              disabled={!canProceed()}
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              className="px-5 py-2.5 bg-[#101D35] dark:bg-[#0D9488] hover:bg-[#1A2B4B] dark:hover:bg-[#0F766E] text-white text-xs font-semibold rounded-lg disabled:opacity-40 inline-flex items-center gap-1.5 cursor-pointer"
            >
              Next Step <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
