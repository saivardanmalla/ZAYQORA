import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Shield, ExternalLink, Search, Activity, Building2, CreditCard, Globe, Copy, Check } from 'lucide-react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { apiRequest, formatCurrency } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { ZCard, ZStatCard, ZStatusText, ZButton } from '../components/ui/DesignSystem';
import type { AuditLogRecord } from '../types/zayqora';

interface IndustryTrendsReport {
  query: string;
  reportMarkdown: string;
  sources: Array<{ title: string; uri: string }>;
  searchQueries: string[];
  model: string;
  generatedAt: string;
}

interface SuperAdminDashboardProps {
  initialSection?: 'overview' | 'tenants' | 'plans' | 'billing' | 'support';
  navigate: (to: string) => void;
  onOpenAuth: () => void;
}

interface AdminOverview {
  metrics: {
    totalRestaurants: number;
    activeRestaurants: number;
    trialRestaurants: number;
    suspendedRestaurants: number;
    platformMrrCents: number;
    totalPlatformGmvCents: number;
  };
  tenants: Array<{
    id: string;
    slug: string;
    name: string;
    category: string;
    status: 'ACTIVE' | 'TRIAL' | 'SUSPENDED';
    plan_code: 'STARTER' | 'GROWTH' | 'ENTERPRISE';
    plan_name: string;
    monthly_price_cents: number;
    order_count: number;
    gmv_cents: number;
    is_demo: number;
  }>;
  supportTickets: Array<{
    id: string;
    restaurant_name: string;
    subject: string;
    priority: string;
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
    created_at: string;
  }>;
  auditLogs: AuditLogRecord[];
  systemHealth: {
    databaseEngine: string;
    websocketStatus: string;
    uptimeSeconds: number;
    memoryMb: number;
  };
}

const PLAN_COLORS: Record<string, string> = {
  STARTER: '#64748B',
  GROWTH: '#0D9488',
  ENTERPRISE: '#E9B44C',
};

function mapSectionToTab(
  section?: 'overview' | 'tenants' | 'plans' | 'billing' | 'support'
): 'tenants' | 'plans' | 'billing' | 'tickets' | 'audit' | 'health' {
  if (section === 'plans') return 'plans';
  if (section === 'billing') return 'billing';
  if (section === 'support') return 'tickets';
  return 'tenants';
}

const TREND_PRESETS = [
  'Latest restaurant SaaS and cloud POS trends in 2026',
  'Commission-free direct online ordering adoption benchmarks',
  'Kitchen display systems and AI prep forecasting in hospitality',
  'Restaurant SaaS churn, pricing tiers, and guest CRM trends',
];

function renderBriefLine(line: string, idx: number) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('## ')) {
    return (
      <h4 key={idx} className="text-sm font-bold text-[#0F172A] dark:text-white pt-3 first:pt-0">
        {trimmed.slice(3)}
      </h4>
    );
  }
  if (trimmed.startsWith('### ')) {
    return (
      <h5 key={idx} className="text-xs font-bold uppercase tracking-wider text-[#0D9488] pt-2">
        {trimmed.slice(4)}
      </h5>
    );
  }
  const cleanText = trimmed.replace(/^[-*•]\s+/, '');
  const isBullet = /^[-*•]\s+/.test(trimmed);
  const parts = cleanText.split(/(\*\*[^*]+\*\*)/g);
  const formatted = parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-semibold text-[#0F172A] dark:text-white">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
  if (isBullet) {
    return (
      <div key={idx} className="flex items-start gap-2.5 text-xs leading-relaxed text-[#334155] dark:text-slate-300">
        <span className="mt-1.5 h-1.5 w-1.5 rounded-xs bg-[#0D9488] shrink-0" />
        <span>{formatted}</span>
      </div>
    );
  }
  return (
    <p key={idx} className="text-xs leading-relaxed text-[#334155] dark:text-slate-300">
      {formatted}
    </p>
  );
}

export function SuperAdminDashboard({ initialSection = 'overview', navigate, onOpenAuth }: SuperAdminDashboardProps) {
  const { user, token, demoLogin } = useAuth();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [tab, setTab] = useState<'tenants' | 'plans' | 'billing' | 'tickets' | 'audit' | 'health'>(() =>
    mapSectionToTab(initialSection)
  );
  const [tenantSearch, setTenantSearch] = useState('');
  const [tenantStatusFilter, setTenantStatusFilter] = useState('ALL');
  const [auditSearch, setAuditSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Industry Trends Google Search Grounding state
  const [trendsQuery, setTrendsQuery] = useState('Latest restaurant SaaS and cloud POS trends in 2026');
  const [trendsFocus, setTrendsFocus] = useState('All Hospitality SaaS');
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [trendsError, setTrendsError] = useState('');
  const [trendsReport, setTrendsReport] = useState<IndustryTrendsReport | null>(null);
  const [copiedReport, setCopiedReport] = useState(false);

  useEffect(() => {
    setTab(mapSectionToTab(initialSection));
  }, [initialSection]);

  const loadAdmin = useCallback(async () => {
    if (!token || user?.roleCode !== 'PLATFORM_SUPER_ADMIN') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest<AdminOverview>('/api/admin/overview');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load VIRELEO admin console');
    } finally {
      setLoading(false);
    }
  }, [token, user?.roleCode]);

  useEffect(() => {
    loadAdmin();
  }, [loadAdmin]);

  const changeTenantStatus = async (restaurantId: string, status: 'ACTIVE' | 'TRIAL' | 'SUSPENDED') => {
    await apiRequest(`/api/admin/tenants/${restaurantId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    loadAdmin();
  };

  const changeTenantPlan = async (restaurantId: string, planCode: 'STARTER' | 'GROWTH' | 'ENTERPRISE') => {
    await apiRequest(`/api/admin/tenants/${restaurantId}/subscription`, {
      method: 'PATCH',
      body: JSON.stringify({ planCode }),
    });
    loadAdmin();
  };

  const runTrendsSearch = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? trendsQuery).trim();
    if (q.length < 3) {
      setTrendsError('Enter at least 3 characters to research restaurant SaaS trends.');
      return;
    }
    if (overrideQuery) setTrendsQuery(overrideQuery);
    setTrendsLoading(true);
    setTrendsError('');
    try {
      const res = await apiRequest<IndustryTrendsReport>('/api/admin/trends/search', {
        method: 'POST',
        body: JSON.stringify({
          query: q,
          focusArea: trendsFocus === 'All Hospitality SaaS' ? undefined : trendsFocus,
        }),
      });
      setTrendsReport(res);
    } catch (err) {
      setTrendsError(err instanceof Error ? err.message : 'Unable to fetch industry trends.');
    } finally {
      setTrendsLoading(false);
    }
  };

  const handleCopyReport = async () => {
    if (!trendsReport) return;
    const sourcesText = trendsReport.sources.map((s) => `- ${s.title}: ${s.uri}`).join('\n');
    const text = `${trendsReport.reportMarkdown}\n\nSources:\n${sourcesText}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
    } catch {
      // Clipboard API unavailable
    }
  };

  const changeTicketStatus = async (ticketId: string, status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED') => {
    await apiRequest(`/api/admin/support-tickets/${ticketId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    loadAdmin();
  };

  const filteredTenants = useMemo(() => {
    if (!data) return [];
    return data.tenants.filter((t) => {
      const stMatch = tenantStatusFilter === 'ALL' || t.status === tenantStatusFilter;
      const q = tenantSearch.trim().toLowerCase();
      const qMatch = !q || t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q);
      return stMatch && qMatch;
    });
  }, [data, tenantSearch, tenantStatusFilter]);

  const subscriptionDistribution = useMemo(() => {
    if (!data) return [];
    const counts = new Map<string, number>();
    for (const t of data.tenants) {
      const p = t.plan_code || 'STARTER';
      counts.set(p, (counts.get(p) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([plan, count]) => ({ plan, count }));
  }, [data]);

  const filteredAudits = useMemo(() => {
    if (!data) return [];
    const q = auditSearch.trim().toLowerCase();
    return data.auditLogs.filter(
      (l) => !q || l.action.toLowerCase().includes(q) || l.actor_email.toLowerCase().includes(q)
    );
  }, [data, auditSearch]);

  if (!user || user.roleCode !== 'PLATFORM_SUPER_ADMIN') {
    return (
      <div className="max-w-xl mx-auto px-6 py-20 text-center space-y-4">
        <Shield className="w-10 h-10 text-[#101D35] dark:text-[#0D9488] mx-auto" />
        <h1 className="text-2xl font-bold text-[#0F172A] dark:text-white">VIRELEO Super Admin Console</h1>
        <p className="text-sm text-[#64748B] dark:text-slate-400">
          Restricted strictly to authorized VIRELEO platform administrators (`PLATFORM_SUPER_ADMIN`).
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <ZButton variant="secondary" onClick={onOpenAuth}>
            Sign In
          </ZButton>
          <ZButton variant="primary" onClick={() => demoLogin('superadmin@vireleo.io')}>
            Explore as VIRELEO Super Admin
          </ZButton>
        </div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="h-96 rounded-xl bg-white dark:bg-[#101D35] border border-[#E2E8F0] dark:border-slate-800 animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20 text-center text-sm text-red-600">
        {error || 'Unable to load platform overview'}
      </div>
    );
  }

  const gmvChartData = data.tenants.map((t) => ({
    name: t.name,
    gmv: Number((t.gmv_cents / 100).toFixed(2)),
    orders: t.order_count,
  }));

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-[#0D9488]">VIRELEO Platform Control Plane</div>
          <h1 className="text-2xl font-bold text-[#0F172A] dark:text-white mt-0.5">Super Admin Dashboard</h1>
        </div>
        <div className="text-xs text-[#64748B] dark:text-slate-400 font-data">
          {data.systemHealth.websocketStatus} · Uptime {data.systemHealth.uptimeSeconds}s
        </div>
      </div>

      {/* Platform KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <ZStatCard label="Total Tenants" value={String(data.metrics.totalRestaurants)} icon={Building2} />
        <ZStatCard label="Active Restaurants" value={String(data.metrics.activeRestaurants)} accent="teal" />
        <ZStatCard label="Trial Restaurants" value={String(data.metrics.trialRestaurants)} accent="gold" />
        <ZStatCard label="Suspended" value={String(data.metrics.suspendedRestaurants)} />
        <ZStatCard label="SaaS MRR" value={formatCurrency(data.metrics.platformMrrCents)} icon={CreditCard} accent="teal" />
        <ZStatCard label="Platform GMV" value={formatCurrency(data.metrics.totalPlatformGmvCents)} />
      </div>

      {/* Platform Analytics + Subscription Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <ZCard className="lg:col-span-8 p-6">
          <h2 className="text-sm font-bold text-[#0F172A] dark:text-white mb-4">Tenant GMV Performance ($)</h2>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gmvChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" opacity={0.4} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="gmv" fill="#0D9488" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ZCard>

        <ZCard className="lg:col-span-4 p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#0F172A] dark:text-white">Subscription Distribution</h2>
            <p className="text-xs text-[#64748B] dark:text-slate-400">Active plans across tenants</p>
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={subscriptionDistribution} dataKey="count" nameKey="plan" innerRadius={42} outerRadius={68} paddingAngle={3}>
                  {subscriptionDistribution.map((entry) => (
                    <Cell key={entry.plan} fill={PLAN_COLORS[entry.plan] || '#64748B'} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5 text-xs">
            {subscriptionDistribution.map((s) => (
              <div key={s.plan} className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: PLAN_COLORS[s.plan] || '#64748B' }} />
                  {s.plan}
                </span>
                <span className="font-data font-bold">{s.count} tenants</span>
              </div>
            ))}
          </div>
        </ZCard>
      </div>

      {/* Platform Analytics Report: Grounded Industry Trends Research */}
      <ZCard className="p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#E2E8F0] dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0D9488]">
              <Globe className="w-4 h-4" />
              <span>Platform Analytics Report · Google Search Grounding</span>
            </div>
            <h2 className="text-base font-bold text-[#0F172A] dark:text-white">
              Restaurant SaaS Industry Trends &amp; Market Intelligence
            </h2>
            <p className="text-xs text-[#64748B] dark:text-slate-400">
              Query live web intelligence with verified source citations to benchmark VIRELEO tenant growth, POS adoption, and retention.
            </p>
          </div>
          {trendsReport && (
            <button
              type="button"
              onClick={handleCopyReport}
              className="px-3.5 py-2 border border-[#E2E8F0] dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 self-start cursor-pointer"
            >
              {copiedReport ? <Check className="w-3.5 h-3.5 text-[#0D9488]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedReport ? 'Copied to Clipboard' : 'Copy Analytics Brief'}</span>
            </button>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            runTrendsSearch();
          }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-3"
        >
          <div className="lg:col-span-7 relative">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={trendsQuery}
              onChange={(e) => setTrendsQuery(e.target.value)}
              placeholder="Search restaurant SaaS trends, POS benchmarks, delivery margins..."
              className="w-full pl-10 pr-3.5 py-2.5 text-xs bg-white dark:bg-[#0B1426] text-[#0F172A] dark:text-white border border-[#E2E8F0] dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
            />
          </div>
          <div className="lg:col-span-3">
            <select
              value={trendsFocus}
              onChange={(e) => setTrendsFocus(e.target.value)}
              className="w-full px-3 py-2.5 text-xs bg-white dark:bg-[#0B1426] text-[#0F172A] dark:text-white border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
            >
              <option value="All Hospitality SaaS">All Hospitality SaaS</option>
              <option value="Online Ordering & Direct Channels">Online Ordering &amp; Direct Channels</option>
              <option value="KDS & Kitchen Automation">KDS &amp; Kitchen Automation</option>
              <option value="Table Reservations & Guest CRM">Table Reservations &amp; Guest CRM</option>
              <option value="SaaS Pricing & Retention">SaaS Pricing &amp; Retention</option>
            </select>
          </div>
          <div className="lg:col-span-2">
            <ZButton type="submit" variant="primary" disabled={trendsLoading} className="w-full py-2.5">
              {trendsLoading ? 'Searching...' : 'Search Trends'}
            </ZButton>
          </div>
        </form>

        <div className="flex flex-wrap gap-2">
          {TREND_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={trendsLoading}
              onClick={() => runTrendsSearch(preset)}
              className="px-3 py-1.5 text-xs text-[#334155] dark:text-slate-300 bg-slate-50 dark:bg-[#0B1426] hover:bg-slate-100 dark:hover:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 rounded-md transition-colors cursor-pointer disabled:opacity-50"
            >
              {preset}
            </button>
          ))}
        </div>

        {trendsError && (
          <div className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs font-medium text-red-700 dark:text-red-300">
            {trendsError}
          </div>
        )}

        {trendsLoading && (
          <div className="space-y-3 py-4">
            <div className="h-4 w-1/3 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
            <div className="h-3 w-full bg-slate-100 dark:bg-slate-800/70 rounded animate-pulse" />
            <div className="h-3 w-5/6 bg-slate-100 dark:bg-slate-800/70 rounded animate-pulse" />
            <div className="h-3 w-2/3 bg-slate-100 dark:bg-slate-800/70 rounded animate-pulse" />
          </div>
        )}

        {!trendsLoading && trendsReport && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
            <div className="lg:col-span-8 space-y-2.5 bg-slate-50/70 dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#E2E8F0] dark:border-slate-800 text-[11px] text-[#64748B] font-data">
                <span>Query: {trendsReport.query}</span>
                <span>Updated {new Date(trendsReport.generatedAt).toLocaleTimeString()}</span>
              </div>
              <div className="space-y-2">
                {trendsReport.reportMarkdown.split('\n').map((line, idx) => renderBriefLine(line, idx))}
              </div>
            </div>

            <div className="lg:col-span-4 space-y-4">
              <div className="border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-4 space-y-3">
                <div className="text-xs font-bold text-[#0F172A] dark:text-white">
                  Grounded Web Sources ({trendsReport.sources.length})
                </div>
                {trendsReport.sources.length === 0 ? (
                  <p className="text-xs text-[#64748B] dark:text-slate-400">
                    No external citations returned for this query.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {trendsReport.sources.map((src) => (
                      <a
                        key={src.uri}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-2.5 rounded-lg border border-[#E2E8F0] dark:border-slate-800 hover:border-[#0D9488] transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-semibold text-[#0F172A] dark:text-slate-100 group-hover:text-[#0D9488] line-clamp-2">
                            {src.title}
                          </span>
                          <ExternalLink className="w-3.5 h-3.5 text-[#64748B] shrink-0 mt-0.5" />
                        </div>
                        <div className="text-[11px] text-[#64748B] font-data truncate mt-1">{src.uri}</div>
                      </a>
                    ))}
                  </div>
                )}

                {trendsReport.searchQueries.length > 0 && (
                  <div className="pt-3 border-t border-[#E2E8F0] dark:border-slate-800 space-y-1.5">
                    <div className="text-[11px] font-semibold text-[#64748B]">Search Queries Used</div>
                    <div className="text-[11px] text-[#334155] dark:text-slate-400 font-data leading-relaxed">
                      {trendsReport.searchQueries.join(' · ')}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </ZCard>

      {/* Section Tabs synced with /platform/* */}
      <div className="flex flex-wrap p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg w-fit gap-1">
        {[
          { id: 'tenants', label: 'Tenants', path: '/platform/tenants' },
          { id: 'plans', label: 'Subscription Plans', path: '/platform/plans' },
          { id: 'billing', label: 'Platform Billing', path: '/platform/billing' },
          { id: 'tickets', label: 'Support Tickets', path: '/platform/support' },
          { id: 'audit', label: 'Audit Logs', path: null },
          { id: 'health', label: 'System Health', path: null },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id as typeof tab);
              if (t.path) navigate(t.path);
            }}
            className={`px-4 py-2 text-xs font-semibold rounded-md cursor-pointer ${
              tab === t.id
                ? 'bg-white dark:bg-[#101D35] text-[#0F172A] dark:text-white shadow-xs'
                : 'text-[#64748B] dark:text-slate-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'tenants' && (
        <ZCard className="p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
              {['ALL', 'ACTIVE', 'TRIAL', 'SUSPENDED'].map((st) => (
                <button
                  key={st}
                  onClick={() => setTenantStatusFilter(st)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                    tenantStatusFilter === st ? 'bg-white dark:bg-[#101D35] shadow-xs' : 'text-[#64748B]'
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
                value={tenantSearch}
                onChange={(e) => setTenantSearch(e.target.value)}
                placeholder="Search restaurant or slug..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0] dark:border-slate-800 text-[#64748B] dark:text-slate-400">
                  <th className="py-2.5">Restaurant</th>
                  <th className="py-2.5">Subscription Plan</th>
                  <th className="py-2.5 text-right">Orders</th>
                  <th className="py-2.5 text-right">GMV</th>
                  <th className="py-2.5">Status</th>
                  <th className="py-2.5 text-right">Governance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTenants.map((t) => (
                  <tr key={t.id}>
                    <td className="py-3">
                      <div className="font-bold text-[#0F172A] dark:text-white">{t.name}</div>
                      <div className="text-[#64748B] font-data">/r/{t.slug}</div>
                    </td>
                    <td className="py-3">
                      <select
                        value={t.plan_code || 'STARTER'}
                        onChange={(e) =>
                          changeTenantPlan(t.id, e.target.value as 'STARTER' | 'GROWTH' | 'ENTERPRISE')
                        }
                        className="px-2 py-1 bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded text-xs font-semibold"
                      >
                        <option value="STARTER">STARTER ($79/mo)</option>
                        <option value="GROWTH">GROWTH ($149/mo)</option>
                        <option value="ENTERPRISE">ENTERPRISE ($349/mo)</option>
                      </select>
                    </td>
                    <td className="py-3 font-data text-right">{t.order_count}</td>
                    <td className="py-3 font-data font-bold text-right">{formatCurrency(t.gmv_cents)}</td>
                    <td className="py-3">
                      <ZStatusText status={t.status} />
                    </td>
                    <td className="py-3 text-right space-x-2">
                      <select
                        value={t.status}
                        onChange={(e) =>
                          changeTenantStatus(t.id, e.target.value as 'ACTIVE' | 'TRIAL' | 'SUSPENDED')
                        }
                        className="px-2 py-1 bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded text-xs"
                      >
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="TRIAL">TRIAL</option>
                        <option value="SUSPENDED">SUSPENDED</option>
                      </select>
                      <button
                        onClick={() => navigate(`/r/${t.slug}`)}
                        className="p-1.5 border border-[#E2E8F0] dark:border-slate-700 rounded inline-flex items-center cursor-pointer"
                        title="Inspect public storefront"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ZCard>
      )}

      {tab === 'plans' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              code: 'STARTER' as const,
              name: 'Starter Storefront',
              price: '$79 / mo',
              desc: 'Public storefront, digital menu, online ordering, and 1 kitchen station.',
              tenants: data.tenants.filter((t) => (t.plan_code || 'STARTER') === 'STARTER').length,
            },
            {
              code: 'GROWTH' as const,
              name: 'Growth Kitchen',
              price: '$149 / mo',
              desc: 'Multi-station KDS, reservations, CRM coupons, inventory alerts, and custom branding.',
              tenants: data.tenants.filter((t) => t.plan_code === 'GROWTH').length,
            },
            {
              code: 'ENTERPRISE' as const,
              name: 'Enterprise Hospitality',
              price: '$349 / mo',
              desc: 'Multi-location governance, custom SLA webhooks, dedicated reporting, and priority support.',
              tenants: data.tenants.filter((t) => t.plan_code === 'ENTERPRISE').length,
            },
          ].map((plan) => (
            <ZCard key={plan.code} className="p-6 flex flex-col justify-between space-y-4">
              <div>
                <div className="text-xs font-semibold text-[#0D9488]">{plan.code}</div>
                <h3 className="text-lg font-bold text-[#0F172A] dark:text-white mt-1">{plan.name}</h3>
                <div className="text-2xl font-bold font-data text-[#101D35] dark:text-slate-100 mt-2">{plan.price}</div>
                <p className="text-xs text-[#64748B] dark:text-slate-400 mt-2 leading-relaxed">{plan.desc}</p>
              </div>
              <div className="pt-4 border-t border-[#E2E8F0] dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="text-[#64748B] dark:text-slate-400">Subscribed Tenants</span>
                <span className="font-data font-bold text-[#0F172A] dark:text-white">{plan.tenants}</span>
              </div>
            </ZCard>
          ))}
        </div>
      )}

      {tab === 'billing' && (
        <ZCard className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#0F172A] dark:text-white">Platform Subscription Billing Ledger</h2>
              <p className="text-xs text-[#64748B] dark:text-slate-400">Active MRR and tenant billing schedules across VIRELEO</p>
            </div>
            <div className="text-right">
              <div className="text-xs text-[#64748B] dark:text-slate-400">Monthly Recurring Revenue</div>
              <div className="text-lg font-bold font-data text-[#0D9488]">
                {formatCurrency(data.metrics.platformMrrCents)}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0] dark:border-slate-800 text-[#64748B] dark:text-slate-400">
                  <th className="py-2.5">Tenant</th>
                  <th className="py-2.5">Plan Tier</th>
                  <th className="py-2.5">Status</th>
                  <th className="py-2.5 text-right">Monthly Fee</th>
                  <th className="py-2.5 text-right">Processed GMV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.tenants.map((t) => (
                  <tr key={t.id}>
                    <td className="py-3 font-semibold text-[#0F172A] dark:text-white">{t.name}</td>
                    <td className="py-3 font-data">{t.plan_name || t.plan_code}</td>
                    <td className="py-3">
                      <ZStatusText status={t.status} />
                    </td>
                    <td className="py-3 font-data text-right">{formatCurrency(t.monthly_price_cents || 7900)}</td>
                    <td className="py-3 font-data font-bold text-right">{formatCurrency(t.gmv_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ZCard>
      )}

      {tab === 'tickets' && (
        <ZCard className="p-6 divide-y divide-slate-100 dark:divide-slate-800">
          {data.supportTickets.map((ticket) => (
            <div key={ticket.id} className="py-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-sm font-bold text-[#0F172A] dark:text-white">{ticket.subject}</div>
                <div className="text-xs text-[#64748B] mt-0.5">
                  {ticket.restaurant_name} · Priority: {ticket.priority}
                </div>
              </div>
              <select
                value={ticket.status}
                onChange={(e) =>
                  changeTicketStatus(ticket.id, e.target.value as 'OPEN' | 'IN_PROGRESS' | 'RESOLVED')
                }
                className="px-3 py-1.5 bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg text-xs font-semibold"
              >
                <option value="OPEN">OPEN</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="RESOLVED">RESOLVED</option>
              </select>
            </div>
          ))}
        </ZCard>
      )}

      {tab === 'audit' && (
        <ZCard className="p-6 space-y-4">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              placeholder="Filter audit action or actor..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-[#0B1426] border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0] dark:border-slate-800 text-[#64748B]">
                  <th className="py-2.5">Timestamp</th>
                  <th className="py-2.5">Actor</th>
                  <th className="py-2.5">Action</th>
                  <th className="py-2.5">Resource</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredAudits.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2.5 font-data text-[#64748B]">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="py-2.5">
                      <div className="font-medium text-[#0F172A] dark:text-white">{log.actor_email}</div>
                      <div className="text-[#64748B] font-data">{log.actor_role}</div>
                    </td>
                    <td className="py-2.5 font-data font-semibold text-[#0D9488]">{log.action}</td>
                    <td className="py-2.5 font-data text-[#64748B]">
                      {log.resource_type} {log.resource_id.slice(0, 8)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ZCard>
      )}

      {tab === 'health' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <ZStatCard label="Database Engine" value="SQLite WAL" subtext="Exportable PostgreSQL + Alembic included" icon={Activity} accent="teal" />
          <ZStatCard label="WebSocket Gateway" value="Online" subtext={data.systemHealth.websocketStatus} accent="teal" />
          <ZStatCard label="Process Uptime" value={`${data.systemHealth.uptimeSeconds}s`} subtext="Express + Vite unified server" />
          <ZStatCard label="Resident Memory" value={`${data.systemHealth.memoryMb} MB`} subtext="Node.js heap & native SQLite" />
        </div>
      )}
    </div>
  );
}
