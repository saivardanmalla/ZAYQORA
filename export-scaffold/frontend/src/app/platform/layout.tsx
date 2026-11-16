import React from 'react';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims?.metadata as { platformRole?: string } | undefined)?.platformRole;
  if (!userId || role !== 'PLATFORM_SUPER_ADMIN') {
    redirect('/dashboard/overview');
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <header className="border-b border-[#E2E8F0] bg-[#101D35] px-6 py-4 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <span className="text-sm font-bold tracking-wide">VIRELEO · ZAYQORA Platform Governance</span>
          <span className="text-xs text-[#E9B44C]">Super Admin</span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
