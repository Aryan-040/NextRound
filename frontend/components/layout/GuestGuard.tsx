'use client';

/**
 * GuestGuard — client component that protects unauthenticated routes (e.g. /login, /register).
 *
 * On mount it reads the JWT from localStorage. If a token is present,
 * the user is redirected to /dashboard immediately so logged-in users cannot
 * access auth pages or get stuck on sign-in when pressing browser back.
 *
 * Renders null while checking to avoid a flash of auth forms.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth';

interface GuestGuardProps {
  children: React.ReactNode;
}

export function GuestGuard({ children }: GuestGuardProps) {
  const router = useRouter();
  // tri-state: null = checking, true = guest (no token), false = authenticated (has token)
  const [isGuest, setIsGuest] = useState<boolean | null>(null);

  useEffect(() => {
    const token = getToken();
    if (token) {
      router.replace('/dashboard');
      setIsGuest(false);
    } else {
      setIsGuest(true);
    }
  }, [router]);

  // Render nothing while checking or if authenticated (redirecting)
  if (isGuest === null || isGuest === false) return null;

  return <>{children}</>;
}
