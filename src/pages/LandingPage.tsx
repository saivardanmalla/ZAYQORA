import React, { useEffect, useState } from 'react';
import { ArrowRight, Store, LayoutDashboard, ChefHat, Shield, CheckCircle2, UtensilsCrossed } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { RestaurantSummary } from '../types/zayqora';

interface LandingPageProps {
  navigate: (to: string) => void;
  onOpenAuth: () => void;
}

export function LandingPage({ navigate, onOpenAuth }: LandingPageProps) {
  const { demoLogin } = useAuth();
  const [restaurants, setRestaurants] = useState<RestaurantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [switchingRole, setSwitchingRole] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ restaurants: RestaurantSummary[] }>('/api/public/restaurants')
      .then((res) => setRestaurants(res.restaurants))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const exploreInterface = async (email: string | null, dest: string) => {
    if (!email) {
      navigate(dest);
      return;
    }
    setSwitchingRole(dest);
    try {
      await demoLogin(email);
      navigate(dest);
    } catch {
      onOpenAuth();
    } finally {
      setSwitchingRole(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1426] transition-colors">
      {/* Hero Section */}
      <section className="bg-[#101D35] text-white border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-16 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
          <div className="lg:col-span-7 flex flex-col justify-center space-y-6">
            <div className="text-xs font-medium tracking-wider text-[#E9B44C]">
              VIRELEO Hospitality Suite · Multi-Tenant Restaurant Platform
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold tracking-tight leading-tight text-balance">
              The Complete Digital Restaurant Platform
            </h1>
            <p className="text-base lg:text-lg text-slate-300 max-w-2xl leading-relaxed">
              ZAYQORA unifies custom restaurant storefronts, commission-free online ordering, transaction-safe table reservations, a 14-module owner dashboard, real-time WebSocket kitchen display tickets, and VIRELEO platform governance in one isolated multi-tenant architecture.
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                onClick={() => navigate('/onboarding')}
                className="px-6 py-3 bg-[#0D9488] hover:bg-[#0F766E] text-white text-sm font-semibold rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
              >
                <span>Launch New Restaurant</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigate('/r/saffron-hearth')}
                className="px-6 py-3 bg-white/10 hover:bg-white/15 text-white text-sm font-semibold rounded-lg border border-white/20 transition-colors whitespace-nowrap cursor-pointer"
              >
                Visit Demo Storefront
              </button>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="h-full min-h-[280px] rounded-xl overflow-hidden border border-white/10 relative">
              <img
                src="/src/assets/images/hero_saffron_hearth_1794828971752.jpg"
                alt="Saffron and Hearth dining room powered by ZAYQORA"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#091224]/90 via-[#091224]/25 to-transparent flex flex-col justify-end p-6">
                <div className="text-xs text-[#E9B44C] font-medium">Sample Tenant · /r/saffron-hearth</div>
                <div className="text-lg font-semibold text-white mt-1">Saffron &amp; Hearth — San Francisco</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Four Connected Interfaces Explorer */}
      <section className="max-w-7xl mx-auto px-6 py-14">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-[#101D35] dark:text-slate-100 tracking-tight">Four Connected Applications</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Explore each live surface with real backend APIs, WebSocket updates, and isolated tenant data.
            </p>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Demo sessions authenticate via signed JWT tokens
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between">
            <div>
              <Store className="w-6 h-6 text-[#0D9488] mb-4" />
              <h3 className="text-base font-bold text-[#101D35] dark:text-slate-100">Public Storefront</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                Branded `/r/slug` website with digital menu, item modifiers, checkout, sandbox payments, reservations, and live order tracking.
              </p>
            </div>
            <button
              onClick={() => exploreInterface(null, '/r/saffron-hearth')}
              className="mt-6 w-full py-2.5 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[#101D35] dark:text-slate-100 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              Open Storefront
            </button>
          </div>

          <div className="bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between">
            <div>
              <LayoutDashboard className="w-6 h-6 text-[#0D9488] mb-4" />
              <h3 className="text-base font-bold text-[#101D35] dark:text-slate-100">Owner Dashboard</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                14-module operations suite covering orders, menu builder, floor tables, staff, inventory, analytics, and website builder.
              </p>
            </div>
            <button
              disabled={switchingRole === '/dashboard'}
              onClick={() => exploreInterface('owner@saffronhearth.demo', '/dashboard')}
              className="mt-6 w-full py-2.5 px-4 bg-[#101D35] dark:bg-[#0D9488] hover:bg-[#1A2B4B] dark:hover:bg-[#0F766E] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              {switchingRole === '/dashboard' ? 'Signing in...' : 'Explore as Owner'}
            </button>
          </div>

          <div className="bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between">
            <div>
              <ChefHat className="w-6 h-6 text-[#E9B44C] mb-4" />
              <h3 className="text-base font-bold text-[#101D35] dark:text-slate-100">Kitchen Display (KDS)</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                Station-routed kitchen tickets with elapsed timers, modifier instructions, Start Preparing / Mark Ready workflow, and live sync.
              </p>
            </div>
            <button
              disabled={switchingRole === '/kds'}
              onClick={() => exploreInterface('chef@saffronhearth.demo', '/kds')}
              className="mt-6 w-full py-2.5 px-4 bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              {switchingRole === '/kds' ? 'Signing in...' : 'Explore as Chef'}
            </button>
          </div>

          <div className="bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between">
            <div>
              <Shield className="w-6 h-6 text-[#101D35] dark:text-slate-200 mb-4" />
              <h3 className="text-base font-bold text-[#101D35] dark:text-slate-100">VIRELEO Super Admin</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                Platform-wide tenant lifecycle control, subscription revenue metrics, support ticket triage, system health, and audit logs.
              </p>
            </div>
            <button
              disabled={switchingRole === '/admin'}
              onClick={() => exploreInterface('superadmin@vireleo.io', '/admin')}
              className="mt-6 w-full py-2.5 px-4 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-[#101D35] dark:text-slate-100 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              {switchingRole === '/admin' ? 'Signing in...' : 'Explore Super Admin'}
            </button>
          </div>
        </div>
      </section>

      {/* Live Sample Restaurants */}
      <section className="max-w-7xl mx-auto px-6 pb-14">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-[#101D35] dark:text-slate-100 tracking-tight">Live Restaurant Storefronts</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Sample tenants seeded with demo menus, tables, reservations, and orders, plus any new restaurants you launch.
            </p>
          </div>
          <button
            onClick={() => navigate('/onboarding')}
            className="text-sm font-semibold text-[#0D9488] hover:text-[#0F766E] whitespace-nowrap cursor-pointer"
          >
            + Register Restaurant
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((idx) => (
              <div key={idx} className="h-80 rounded-xl bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {restaurants.map((r) => (
              <div
                key={r.id}
                onClick={() => navigate(`/r/${r.slug}`)}
                className="group bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden hover:shadow-md transition-all cursor-pointer flex flex-col"
              >
                <div className="aspect-[16/10] bg-slate-100 dark:bg-slate-800 relative overflow-hidden">
                  {r.cover_url ? (
                    <img
                      src={r.cover_url}
                      alt={r.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400">
                      <UtensilsCrossed className="w-8 h-8" />
                    </div>
                  )}
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <span>{r.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>{r.is_demo ? 'Demo Tenant' : 'Live Tenant'}</span>
                    </div>
                    <h3 className="text-lg font-bold text-[#101D35] dark:text-slate-100 mt-1">{r.name}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 line-clamp-2">{r.description}</p>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className="font-data text-slate-500 dark:text-slate-400 truncate">/r/{r.slug}</span>
                    <span className="font-semibold text-[#0D9488] whitespace-nowrap">Open Website →</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Architecture & Exportable Stack Disclosure */}
      <section className="max-w-7xl mx-auto px-6 pb-16">
        <div className="bg-white dark:bg-[#101D35] border border-slate-200 dark:border-slate-800 rounded-xl p-6 lg:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="text-xs font-semibold text-[#0D9488]">
              Architecture &amp; Deployment Stack
            </div>
            <h3 className="text-lg font-bold text-[#101D35] dark:text-slate-100">
              Live Build Mode Runtime + Exportable Next.js &amp; Python FastAPI Scaffold
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              This interactive preview executes on Node.js, Express, WebSockets, React, TypeScript, and a persistent relational SQLite database inside Google AI Studio Build Mode. The repository also includes an exportable <span className="font-data text-xs text-[#101D35] dark:text-slate-200">/export-scaffold</span> bundle containing the Next.js App Router frontend (Vercel), Python FastAPI + SQLAlchemy + Alembic + Celery + S3 backend (Render), PostgreSQL schema, Redis Docker Compose configuration, and GitHub Actions CI.
            </p>
          </div>
          <div className="flex flex-col gap-2 text-xs text-slate-700 dark:text-slate-300 shrink-0">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#0D9488]" />
              <span>9-Role RBAC &amp; Tenant Isolation</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#0D9488]" />
              <span>Idempotent Orders &amp; HMAC Sandbox Pay</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#0D9488]" />
              <span>Transaction-Safe Table Reservations</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
