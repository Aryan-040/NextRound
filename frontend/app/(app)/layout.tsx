/**
 * Authenticated app layout — fixed 260px sidebar + fluid main content.
 * All routes inside (app)/ are wrapped with AppShell.
 */
import { AppShell } from '@/components/layout/AppShell';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
