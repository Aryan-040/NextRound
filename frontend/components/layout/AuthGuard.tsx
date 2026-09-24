'use client';

/**
 * AuthGuard — client component that protects authenticated routes.
 *
 * On mount it reads the JWT from localStorage. If no token is present
 * the user is redirected to /login immediately, satisfying Requirement 1.5:
 * "THE Builder SHALL redirect the user to the login page."
 *
 * The component renders null while the check is in progress to avoid a
 * flash of authenticated content. Once the check passes, children render.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  // tri-state: null = checking, true = authenticated, false = unauthenticated
  const [checked, setChecked] = useState<boolean | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      setChecked(false);
    } else {
      setChecked(true);
    }
  }, [router]);

  // While the check is running, render nothing to avoid content flash.
  if (checked === null || checked === false) return null;

  return <>{children}</>;
}
