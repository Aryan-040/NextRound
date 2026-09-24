'use client';
import { Sidebar } from './Sidebar';
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-bg-base">
      <aside className="fixed inset-y-0 left-0 z-30 w-[260px] flex-shrink-0 border-r border-bg-raised"><Sidebar /></aside>
      <main className="ml-[260px] flex-1 flex flex-col min-w-0">
        <div className="flex-1 w-full px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
