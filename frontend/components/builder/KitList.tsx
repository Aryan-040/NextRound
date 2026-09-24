'use client';
import { useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { KitRow } from './KitRow';
import type { KitSummary } from './KitRow';

export function KitList({ initialKits }: { initialKits: KitSummary[] }) {
  const [kits, setKits] = useState<KitSummary[]>(initialKits);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  
  const handleDelete = async (id: string) => {
    setDeletingId(id); 
    setDeleteError(null);
    try {
      await apiFetch(`/kits/${id}`, { method: 'DELETE' });
      setKits(prev => prev.filter(k => k._id !== id));
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Failed to delete kit. Please try again.');
    } finally { 
      setDeletingId(null); 
    }
  };

  return (
    <div className="space-y-4">
      {deleteError && (
        <div role="alert" className="px-5 py-4 rounded-lg bg-danger/10 text-danger text-sm border border-danger/20">
          {deleteError}
        </div>
      )}
      
      <div className="grid gap-4">
        {kits.map(kit => (
          <KitRow 
            key={kit._id} 
            kit={kit} 
            onDelete={handleDelete} 
            isDeleting={deletingId === kit._id} 
          />
        ))}
      </div>
    </div>
  );
}

