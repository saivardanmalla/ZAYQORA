'use client';

import { useAuth } from '@clerk/nextjs';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fastapiFetch } from '@/lib/api-client';

interface OverviewResponse {
  todayRevenueCents: number;
  totalOrders: number;
  upcomingReservations: number;
  activeCustomers: number;
  revenueTrend: Array<{ date: string; revenueDollars: number; orders: number }>;
}

export function RestaurantOverview() {
  const { getToken, orgId } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ['restaurant-overview', orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const token = await getToken();
      return fastapiFetch<OverviewResponse>('/api/v1/restaurants/overview', { token, orgId });
    },
  });

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-xl border border-[#E2E8F0] bg-white" />;
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error instanceof Error ? error.message : 'Unable to load restaurant overview'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Today's Revenue", val: `$${(data.todayRevenueCents / 100).toFixed(2)}` },
          { label: 'Total Orders', val: String(data.totalOrders) },
          { label: 'Upcoming Reservations', val: String(data.upcomingReservations) },
          { label: 'Active Customers', val: String(data.activeCustomers) },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-[#E2E8F0] bg-white p-5">
            <div className="text-xs font-medium text-[#64748B]">{kpi.label}</div>
            <div className="mt-2 font-mono text-2xl font-bold text-[#101D35]">{kpi.val}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-[#E2E8F0] bg-white p-6">
        <h3 className="mb-4 text-sm font-bold text-[#101D35]">Revenue &amp; Order Trend</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.revenueTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Area type="monotone" dataKey="revenueDollars" stroke="#0D9488" fill="#0D9488" fillOpacity={0.14} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
