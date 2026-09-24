'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { removeToken } from '@/lib/auth';

function SidebarLogo() {
  return (
    <div className="px-6 pt-6 pb-4">
      <Link href="/dashboard" className="block text-text-primary hover:text-accent transition-colors" aria-label="Go to dashboard">
        <span className="font-sans font-bold text-lg tracking-tight leading-none">Prep<span className="text-accent">Kit</span></span>
        <p className="text-text-secondary text-xs mt-0.5 font-normal tracking-normal">AI Interview Prep</p>
      </Link>
    </div>
  );
}

function KitSectionNav({ kitId }: { kitId?: string }) {
  const pathname = usePathname();
  const topNav = [{ label: 'Dashboard', href: '/dashboard' }, { label: 'New kit', href: '/create' }];
  const kitSections = kitId ? [
    { label: 'Brief',      href: `/kits/${kitId}#brief` },
    { label: 'Questions',  href: `/kits/${kitId}#questions` },
    { label: 'Flashcards', href: `/kits/${kitId}#flashcards` },
    { label: 'Schedule',   href: `/kits/${kitId}#schedule` },
    { label: 'Practice',   href: `/kits/${kitId}/practice` },
  ] : [];
  const isActive = (href: string) => {
    if (href.includes('#')) return pathname.startsWith(href.split('#')[0]);
    return pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
  };
  const cls = (href: string) => ['block px-3 py-2 rounded text-sm transition-colors',
    isActive(href) ? 'bg-accent-dim text-accent font-medium' : 'text-text-secondary hover:text-text-primary hover:bg-bg-raised'].join(' ');
  return (
    <nav aria-label="Site navigation" className="flex-1 px-4 py-2 space-y-0.5 overflow-y-auto">
      {topNav.map(item => <Link key={item.href} href={item.href} className={cls(item.href)}>{item.label}</Link>)}
      {kitSections.length > 0 && (
        <>
          <div className="pt-4 pb-1 px-3"><span className="text-xs font-medium text-text-secondary">This kit</span></div>
          {kitSections.map(item => <Link key={item.href} href={item.href} className={cls(item.href)}>{item.label}</Link>)}
        </>
      )}
    </nav>
  );
}

function UserMenu({ email }: { email?: string }) {
  const handleLogout = () => { removeToken(); if (typeof window !== 'undefined') window.location.href = '/login'; };
  return (
    <div className="px-4 pb-6 pt-2 border-t border-bg-raised">
      {email && <p className="text-text-secondary text-xs truncate px-3 pt-3 pb-2" title={email}>{email}</p>}
      <button type="button" onClick={handleLogout} className="w-full text-left px-3 py-2 rounded text-sm text-text-secondary hover:text-danger hover:bg-bg-raised transition-colors" aria-label="Log out">Log out</button>
    </div>
  );
}

export function Sidebar({ kitId, userEmail }: { kitId?: string; userEmail?: string } = {}) {
  return (
    <div className="h-full flex flex-col bg-bg-surface">
      <SidebarLogo />
      <KitSectionNav kitId={kitId} />
      <UserMenu email={userEmail} />
    </div>
  );
}
export { SidebarLogo, KitSectionNav, UserMenu };
