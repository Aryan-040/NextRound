'use client';

import { GuestGuard } from '@/components/layout/GuestGuard';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <GuestGuard>
      <div className="min-h-screen bg-bg-base flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[420px] bg-bg-surface rounded-lg border border-bg-raised shadow-xl">
          {children}
        </div>
      </div>
    </GuestGuard>
  );
}

