/**
 * Authenticated app layout — fixed 260px sidebar + fluid main content.
 * All routes inside (app)/ are wrapped with AuthGuard (redirects to /login
 * if no token) and AppShell (sidebar + main content area).
 */
import { AuthGuard } from '@/components/layout/AuthGuard';
import { AppShell } from '@/components/layout/AppShell';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}
