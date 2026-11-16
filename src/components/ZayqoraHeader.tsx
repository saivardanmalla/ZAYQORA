import React from 'react';
import { useAuth } from '../context/AuthContext';

interface ZayqoraHeaderProps {
  currentPath: string;
  navigate: (to: string) => void;
  onOpenAuth: () => void;
}

export function ZayqoraHeader({ currentPath, navigate, onOpenAuth }: ZayqoraHeaderProps) {
  const { user, logout } = useAuth();

  const handleNav = (e: React.MouseEvent, to: string) => {
    e.preventDefault();
    navigate(to);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#0B1426]/95 backdrop-blur border-b border-[#E2E8F0] dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <a
          href="/"
          onClick={(e) => handleNav(e, '/')}
          className="font-heading text-xl font-bold tracking-tight text-[#101D35] dark:text-white whitespace-nowrap shrink-0"
        >
          ZAYQORA
        </a>

        {/* Zone 2: 5 single-line navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#64748B] dark:text-slate-300">
          <a
            href="/r/saffron-hearth"
            onClick={(e) => handleNav(e, '/r/saffron-hearth')}
            className={`hover:text-[#0F172A] dark:hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              currentPath.startsWith('/r/') ? 'text-[#0D9488] dark:text-[#0D9488] font-semibold' : ''
            }`}
          >
            Storefronts
          </a>
          <a
            href="/dashboard"
            onClick={(e) => handleNav(e, '/dashboard')}
            className={`hover:text-[#0F172A] dark:hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              currentPath.startsWith('/dashboard') ? 'text-[#0D9488] dark:text-[#0D9488] font-semibold' : ''
            }`}
          >
            Owner Dashboard
          </a>
          <a
            href="/kds"
            onClick={(e) => handleNav(e, '/kds')}
            className={`hover:text-[#0F172A] dark:hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              currentPath.startsWith('/kds') ? 'text-[#0D9488] dark:text-[#0D9488] font-semibold' : ''
            }`}
          >
            Kitchen Display
          </a>
          <a
            href="/admin"
            onClick={(e) => handleNav(e, '/admin')}
            className={`hover:text-[#0F172A] dark:hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              currentPath.startsWith('/admin') ? 'text-[#0D9488] dark:text-[#0D9488] font-semibold' : ''
            }`}
          >
            VIRELEO Admin
          </a>
          <a
            href="/onboarding"
            onClick={(e) => handleNav(e, '/onboarding')}
            className={`hover:text-[#0F172A] dark:hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              currentPath.startsWith('/onboarding') ? 'text-[#0D9488] dark:text-[#0D9488] font-semibold' : ''
            }`}
          >
            Launch Restaurant
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          {user ? (
            <button
              onClick={logout}
              className="px-4 py-2 text-xs font-semibold text-[#0F172A] dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title={`Signed in as ${user.email} (${user.roleCode})`}
            >
              Sign Out ({user.fullName.split(' ')[0]})
            </button>
          ) : (
            <button
              onClick={onOpenAuth}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#101D35] hover:bg-[#1A2B4B] dark:bg-[#0D9488] dark:hover:bg-[#0F766E] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
