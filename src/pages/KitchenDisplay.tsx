import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, ChefHat, CheckCircle2, Flame, AlertTriangle } from 'lucide-react';
import { apiRequest, useZayqoraSocket } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { KitchenTicket } from '../types/zayqora';

interface KitchenDisplayProps {
  onOpenAuth: () => void;
}

const ALLERGY_REGEX = /(allergy|allergies|nut|peanut|gluten|dairy|lactose|shellfish|vegan|celiac)/i;

export function KitchenDisplay({ onOpenAuth }: KitchenDisplayProps) {
  const { user, token, demoLogin } = useAuth();
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [stationFilter, setStationFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState<'ACTIVE' | 'HISTORY'>('ACTIVE');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [wsLive, setWsLive] = useState(false);

  const targetRestaurantId =
    user?.restaurantId || (user?.roleCode === 'PLATFORM_SUPER_ADMIN' ? '11111111-1111-4111-8111-111111111101' : null);

  const loadTickets = useCallback(async () => {
    if (!token || !targetRestaurantId) {
      setLoading(false);
      return;
    }
    setError('');
    try {
      const res = await apiRequest<{ tickets: KitchenTicket[] }>(`/api/kds/${targetRestaurantId}/tickets`);
      setTickets(res.tickets);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load KDS queue');
    } finally {
      setLoading(false);
    }
  }, [token, targetRestaurantId]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useZayqoraSocket(
    { token, enabled: Boolean(token && targetRestaurantId) },
    (msg) => {
      if (msg.type === 'ws:connected') setWsLive(true);
      if (['order:created', 'order:updated', 'kds:ticket_updated'].includes(msg.type)) {
        loadTickets();
      }
    }
  );

  const updateTicketStatus = async (ticketId: string, status: KitchenTicket['status']) => {
    if (!targetRestaurantId) return;
    await apiRequest(`/api/kds/${targetRestaurantId}/tickets/${ticketId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    loadTickets();
  };

  const getElapsedMinutes = (iso: string) => Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 60000));

  const formatElapsed = (iso: string) => {
    const diffSec = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 1000));
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const stations = useMemo(() => {
    const set = new Set(tickets.map((t) => t.station));
    return ['ALL', ...Array.from(set)];
  }, [tickets]);

  const visibleTickets = useMemo(() => {
    return tickets.filter((t) => {
      const modeMatch = viewMode === 'ACTIVE' ? t.status !== 'SERVED' : t.status === 'SERVED';
      const stMatch = stationFilter === 'ALL' || t.station === stationFilter;
      return modeMatch && stMatch;
    });
  }, [tickets, viewMode, stationFilter]);

  if (!user || (!user.restaurantId && user.roleCode !== 'PLATFORM_SUPER_ADMIN')) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20 text-center space-y-4">
        <ChefHat className="w-10 h-10 text-[#0D9488] mx-auto" />
        <h1 className="text-2xl font-bold text-[#0F172A] dark:text-white">Kitchen Display System (KDS)</h1>
        <p className="text-sm text-[#64748B] dark:text-slate-400">
          Authenticate as a Chef, Manager, or Restaurant Owner to view live kitchen preparation tickets.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button onClick={onOpenAuth} className="px-5 py-2.5 bg-[#101D35] text-white text-xs font-semibold rounded-lg cursor-pointer">
            Sign In
          </button>
          <button onClick={() => demoLogin('chef@saffronhearth.demo')} className="px-5 py-2.5 bg-[#0D9488] text-white text-xs font-semibold rounded-lg cursor-pointer">
            Explore as Head Chef
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-[#0B1426] text-white p-6 space-y-6">
      {/* KDS Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div>
          <div className="text-xs text-slate-400 font-data flex items-center gap-2">
            <span>ZAYQORA KDS</span>
            <span aria-hidden="true">·</span>
            <span>{wsLive ? 'WebSocket Connected' : 'Connecting...'}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight mt-0.5">Kitchen Station Queue</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex p-1 bg-slate-900 border border-slate-800 rounded-lg">
            <button
              onClick={() => setViewMode('ACTIVE')}
              className={`px-4 py-2 text-xs font-semibold rounded-md cursor-pointer ${
                viewMode === 'ACTIVE' ? 'bg-[#0D9488] text-white' : 'text-slate-300'
              }`}
            >
              Active Queue ({tickets.filter((t) => t.status !== 'SERVED').length})
            </button>
            <button
              onClick={() => setViewMode('HISTORY')}
              className={`px-4 py-2 text-xs font-semibold rounded-md cursor-pointer ${
                viewMode === 'HISTORY' ? 'bg-[#0D9488] text-white' : 'text-slate-300'
              }`}
            >
              Completed ({tickets.filter((t) => t.status === 'SERVED').length})
            </button>
          </div>

          <select
            aria-label="Filter by kitchen station"
            value={stationFilter}
            onChange={(e) => setStationFilter(e.target.value)}
            className="px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-semibold text-white"
          >
            {stations.map((s) => (
              <option key={s} value={s}>
                Station: {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="p-4 rounded-lg bg-red-900/40 border border-red-700 text-xs text-red-200">{error}</div>}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 rounded-xl bg-slate-900 animate-pulse" />
          ))}
        </div>
      ) : visibleTickets.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-sm text-slate-400">
          No {viewMode.toLowerCase()} kitchen tickets for this station filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {visibleTickets.map((ticket) => {
            const elapsedMins = getElapsedMinutes(ticket.created_at);
            const hasAllergy = Boolean(
              ticket.items?.some((i) => i.special_instructions && ALLERGY_REGEX.test(i.special_instructions))
            );
            const isHighPriority = ticket.order_type === 'DINE_IN' || elapsedMins >= 10;

            const headerBg =
              ticket.status === 'NEW'
                ? 'bg-[#E9B44C] text-[#101D35]'
                : ticket.status === 'PREPARING'
                ? 'bg-[#0D9488] text-white'
                : ticket.status === 'READY'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-200';

            return (
              <div
                key={ticket.id}
                className="bg-[#101D35] border border-slate-800 rounded-xl overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className={`px-4 py-3.5 flex items-center justify-between ${headerBg}`}>
                    <div>
                      <div className="font-data font-bold text-lg leading-none">{ticket.order_number}</div>
                      <div className="text-[11px] font-bold mt-1 opacity-90">
                        {ticket.order_type} {ticket.table_number ? `· ${ticket.table_number}` : ''} ·{' '}
                        {isHighPriority ? 'PRIORITY' : 'STANDARD'}
                      </div>
                    </div>
                    <div className="text-right font-data">
                      <div className="text-sm font-bold flex items-center gap-1 justify-end">
                        <Clock className="w-4 h-4" />
                        {formatElapsed(ticket.created_at)}
                      </div>
                      <div className="text-[11px] font-bold uppercase">{ticket.status}</div>
                    </div>
                  </div>

                  {hasAllergy && (
                    <div className="px-4 py-2 bg-red-600 text-white text-xs font-bold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>ALLERGY / DIETARY ALERT — VERIFY BEFORE PLATING</span>
                    </div>
                  )}

                  <div className="p-4 space-y-3">
                    <div className="text-[11px] font-data text-slate-400">
                      Station: {ticket.station} · Guest: {ticket.customer_name}
                    </div>
                    <div className="divide-y divide-slate-800">
                      {ticket.items?.map((item) => {
                        const itemAllergy = Boolean(
                          item.special_instructions && ALLERGY_REGEX.test(item.special_instructions)
                        );
                        return (
                          <div key={item.id} className="py-2.5 space-y-1">
                            <div className="text-base font-bold text-white">
                              {item.quantity}× {item.item_name}
                            </div>
                            {item.variant_name && <div className="text-xs text-slate-300">{item.variant_name}</div>}
                            {item.modifiers && item.modifiers.length > 0 && (
                              <div className="text-xs font-medium text-[#E9B44C]">+ {item.modifiers.join(', ')}</div>
                            )}
                            {item.special_instructions && (
                              <div
                                className={`text-xs font-semibold rounded px-2.5 py-1.5 mt-1 ${
                                  itemAllergy
                                    ? 'bg-red-950/80 border border-red-600 text-red-200'
                                    : 'bg-amber-950/60 border border-amber-700/60 text-amber-200'
                                }`}
                              >
                                Note: {item.special_instructions}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {ticket.status !== 'SERVED' && (
                  <div className="p-4 pt-0 flex gap-2">
                    {ticket.status === 'NEW' && (
                      <button
                        onClick={() => updateTicketStatus(ticket.id, 'PREPARING')}
                        className="w-full min-h-[44px] py-3 bg-[#0D9488] hover:bg-[#0F766E] text-white text-sm font-bold rounded-lg inline-flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Flame className="w-4 h-4" /> Start Preparing
                      </button>
                    )}
                    {ticket.status === 'PREPARING' && (
                      <button
                        onClick={() => updateTicketStatus(ticket.id, 'READY')}
                        className="w-full min-h-[44px] py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg inline-flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Mark Ready
                      </button>
                    )}
                    {ticket.status === 'READY' && (
                      <button
                        onClick={() => updateTicketStatus(ticket.id, 'SERVED')}
                        className="w-full min-h-[44px] py-3 bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold rounded-lg cursor-pointer"
                      >
                        Complete Hand-Off
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
