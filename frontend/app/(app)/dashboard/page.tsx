'use client';
import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { KitList } from '@/components/builder/KitList';
import { Spinner } from '@/components/ui';
import type { KitSummary } from '@/components/builder/KitRow';

export default function DashboardPage() {
  const [kits, setKits] = useState<KitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const data = await apiFetch<KitSummary[]>('/kits');
        if (!cancelled) setKits(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load kits. Please refresh the page.');
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-sans font-bold text-xl text-text-primary tracking-tight">Your kits</h1>
        <a href="/create" className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-[#7AAAF4] transition-colors">New kit →</a>
      </div>
      {loading && <div className="flex items-center justify-center py-20"><Spinner size="md" /></div>}
      {!loading && error && <div role="alert" className="px-4 py-3 rounded bg-[#7f1d1d] text-danger text-sm border border-danger/30">{error}</div>}
      {!loading && !error && <KitList initialKits={kits} />}
    </div>
  );
}
