import React from 'react';

export function ZCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-white dark:bg-[#101D35] border border-[#E2E8F0] dark:border-slate-800 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

export function ZStatCard({
  label,
  value,
  subtext,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  subtext?: string;
  icon?: React.ComponentType<{ className?: string }>;
  accent?: 'teal' | 'gold' | 'navy' | 'default';
}) {
  const accentColor =
    accent === 'teal'
      ? 'text-[#0D9488]'
      : accent === 'gold'
      ? 'text-[#D49B2A] dark:text-[#E9B44C]'
      : 'text-[#0F172A] dark:text-white';

  return (
    <ZCard className="p-5 flex flex-col justify-between gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[#64748B] dark:text-slate-400 truncate">{label}</span>
        {Icon && <Icon className="w-4 h-4 text-[#64748B] dark:text-slate-400 shrink-0" />}
      </div>
      <div className={`text-xl font-bold font-data tracking-tight truncate ${accentColor}`}>{value}</div>
      {subtext && <div className="text-xs text-[#64748B] dark:text-slate-400 truncate">{subtext}</div>}
    </ZCard>
  );
}

export function ZButton({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}) {
  const variants = {
    primary: 'bg-[#0D9488] hover:bg-[#0F766E] text-white',
    secondary: 'bg-[#101D35] hover:bg-[#1A2B4B] dark:bg-slate-800 dark:hover:bg-slate-700 text-white',
    outline:
      'bg-white dark:bg-[#101D35] border border-[#E2E8F0] dark:border-slate-700 text-[#0F172A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800',
    ghost: 'text-[#64748B] dark:text-slate-300 hover:text-[#0F172A] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-xs',
    lg: 'px-5 py-2.5 text-sm',
  };

  return (
    <button
      {...props}
      className={`font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0D9488] ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
}

export function ZStatusText({ status }: { status: string }) {
  const upper = status.toUpperCase();
  let tone = 'text-[#64748B] dark:text-slate-400';
  if (['ACTIVE', 'CONFIRMED', 'READY', 'COMPLETED', 'PAID', 'RESOLVED', 'HEALTHY'].includes(upper)) {
    tone = 'text-emerald-700 dark:text-emerald-400';
  } else if (['PREPARING', 'TRIAL', 'IN_PROGRESS', 'SEATED', 'PENDING'].includes(upper)) {
    tone = 'text-amber-700 dark:text-[#E9B44C]';
  } else if (['SUSPENDED', 'CANCELLED', 'FAILED', 'OPEN', 'HIGH'].includes(upper)) {
    tone = 'text-red-700 dark:text-red-400';
  }
  return <span className={`font-data text-xs font-semibold ${tone}`}>{upper}</span>;
}
