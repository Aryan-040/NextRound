'use client';
import { useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { KitRow } from './KitRow';
import type { KitSummary } from './KitRow';

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-text-secondary text-sm mb-4">No kits yet — start preparing</p>
      <a href="/create" className="inline-flex items-center gap-1 text-accent text-sm hover:underline">Create your first kit →</a>
    </div>
  );
}

export function KitList({ initialKits }: { initialKits: KitSummary[] }) {
  const [kits, setKits] = useState<KitSummary[]>(initialKits);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const handleDelete = async (id: string) => {
    setDeletingId(id); setDeleteError(null);
    try {
      await apiFetch(`/kits/${id}`, { method: 'DELETE' });
      setKits(prev => prev.filter(k => k._id !== id));
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Failed to delete kit. Please try again.');
    } finally { setDeletingId(null); }
  };
  if (kits.length === 0) return <EmptyState />;
  return (
    <div>
      {deleteError && <div role="alert" className="mb-4 px-4 py-3 rounded bg-[#7f1d1d] text-danger text-sm border border-danger/30">{deleteError}</div>}
      <div className="rounded-lg border border-bg-raised overflow-hidden bg-bg-surface">
        {kits.map(kit => <KitRow key={kit._id} kit={kit} onDelete={handleDelete} isDeleting={deletingId === kit._id} />)}
      </div>
    </div>
  );
}
