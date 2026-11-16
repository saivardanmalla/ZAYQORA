import React from 'react';

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#101D35]">
      <main>{children}</main>
    </div>
  );
}
