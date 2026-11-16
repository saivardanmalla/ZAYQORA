import React, { useCallback, useEffect, useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ZayqoraHeader } from './components/ZayqoraHeader';
import { AuthModal } from './components/AuthModal';
import { LandingPage } from './pages/LandingPage';
import { OnboardingWizard } from './pages/OnboardingWizard';
import { RestaurantStorefront } from './pages/RestaurantStorefront';
import { OwnerDashboard } from './pages/OwnerDashboard';
import { KitchenDisplay } from './pages/KitchenDisplay';
import { SuperAdminDashboard } from './pages/SuperAdminDashboard';

function ZayqoraRouter() {
  const [currentPath, setCurrentPath] = useState<string>(() => window.location.pathname || '/');
  const [authModalOpen, setAuthModalOpen] = useState(false);

  useEffect(() => {
    const onPopState = () => setCurrentPath(window.location.pathname || '/');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((to: string) => {
    if (to !== window.location.pathname) {
      window.history.pushState({}, '', to);
      setCurrentPath(to);
      window.scrollTo(0, 0);
    }
  }, []);

  const handleAuthSuccess = (targetOrRole: string) => {
    if (targetOrRole.startsWith('/')) {
      navigate(targetOrRole);
      return;
    }
    if (targetOrRole === 'PLATFORM_SUPER_ADMIN') navigate('/admin');
    else if (targetOrRole === 'CHEF') navigate('/kds');
    else if (targetOrRole === 'RESTAURANT_OWNER' || targetOrRole === 'RESTAURANT_MANAGER') navigate('/dashboard');
  };

  let view: React.ReactNode;
  if (currentPath.startsWith('/r/')) {
    const restParts = currentPath.slice(3).split('/').filter(Boolean);
    const slug = restParts[0] || 'saffron-hearth';
    const subRoute = restParts[1] || '';
    view = (
      <RestaurantStorefront
        slug={slug}
        subRoute={subRoute}
        navigate={navigate}
        onOpenAuth={() => setAuthModalOpen(true)}
      />
    );
  } else if (currentPath.startsWith('/dashboard')) {
    view = <OwnerDashboard navigate={navigate} onOpenAuth={() => setAuthModalOpen(true)} />;
  } else if (currentPath.startsWith('/kds')) {
    view = <KitchenDisplay onOpenAuth={() => setAuthModalOpen(true)} />;
  } else if (currentPath.startsWith('/admin') || currentPath.startsWith('/platform')) {
    const sectionPart = currentPath.startsWith('/platform/')
      ? currentPath.slice('/platform/'.length).split('/')[0]
      : 'overview';
    const validSections = ['overview', 'tenants', 'plans', 'billing', 'support'] as const;
    const initialSection = validSections.includes(sectionPart as (typeof validSections)[number])
      ? (sectionPart as (typeof validSections)[number])
      : 'overview';
    view = (
      <SuperAdminDashboard
        initialSection={initialSection}
        navigate={navigate}
        onOpenAuth={() => setAuthModalOpen(true)}
      />
    );
  } else if (currentPath.startsWith('/onboarding')) {
    view = <OnboardingWizard navigate={navigate} />;
  } else {
    view = <LandingPage navigate={navigate} onOpenAuth={() => setAuthModalOpen(true)} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] dark:bg-[#0B1426] text-[#0F172A] dark:text-slate-100">
      <ZayqoraHeader
        currentPath={currentPath}
        navigate={navigate}
        onOpenAuth={() => setAuthModalOpen(true)}
      />
      <div className="flex-1">{view}</div>
      <footer className="bg-white dark:bg-[#101D35] border-t border-[#E2E8F0] dark:border-slate-800 py-5 px-6 text-xs text-[#64748B] dark:text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <span>ZAYQORA · Developed by VIRELEO</span>
          <span>Multi-Tenant Restaurant Management SaaS</span>
        </div>
      </footer>
      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ZayqoraRouter />
      </AuthProvider>
    </ThemeProvider>
  );
}
