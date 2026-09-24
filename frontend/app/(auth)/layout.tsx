'use client';

import { GuestGuard } from '@/components/layout/GuestGuard';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <GuestGuard>{children}</GuestGuard>;
}


