'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';
import type { KitDocument } from '@/types';

export interface KitSummary {
  _id: string; status: KitDocument['status'];
  source: { role: string; company: string; company_url?: string; };
  createdAt: string;
  questionCount?: number; flashcardCount?: number; totalMinutes?: number; daysAvailable?: number;
}
export interface KitRowProps { kit: KitSummary; onDelete: (id: string) => void; isDeleting?: boolean; }

function statusBadgeVariant(s: KitDocument['status']): BadgeVariant {
  return s === 'ready' ? 'success' : s === 'generating' ? 'warning' : s === 'failed' ? 'danger' : 'muted';
}
function statusLabel(s: KitDocument['status']): string {
  return s === 'ready' ? 'Ready' : s === 'generating' ? 'Generating…' : s === 'failed' ? 'Failed' : 'Pending';
}
function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return iso; }
}

function ConfirmDeleteDialog({ kitTitle, onConfirm, onCancel, isDeleting }: { kitTitle: string; onConfirm: () => void; onCancel: () => void; isDeleting: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-base/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="confirm-delete-title">
      <div className="bg-bg-surface border border-bg-raised rounded-lg shadow-xl p-6 w-full max-w-sm mx-4">
        <h2 id="confirm-delete-title" className="text-text-primary font-sans font-bold text-base">Delete kit?</h2>
        <p className="text-text-secondary text-sm mt-2 leading-relaxed"><span className="text-text-primary font-medium">{kitTitle}</span> and all its practice progress will be permanently deleted. This cannot be undone.</p>
        <div className="flex gap-3 mt-5 justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isDeleting}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={onConfirm} loading={isDeleting}>Delete</Button>
        </div>
      </div>
    </div>
  );
}

export function KitRow({ kit, onDelete, isDeleting = false }: KitRowProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const title = kit.source.role || 'Untitled role';
  const company = kit.source.company || 'Unknown company';
  const totalHours = kit.totalMinutes && kit.totalMinutes > 0 ? (kit.totalMinutes / 60).toFixed(1) + 'h' : null;
  return (
    <>
      <div className="flex items-start gap-4 px-5 py-4 border-b border-bg-raised last:border-b-0 hover:bg-bg-raised/40 transition-colors">
        <div className="flex-1 min-w-0">
          <p className="text-text-primary font-medium text-sm truncate leading-snug">{title}</p>
          <p className="text-text-secondary text-xs mt-0.5 truncate">{company}</p>
          {kit.status === 'ready' && (kit.questionCount !== undefined || totalHours) && (
            <div className="flex items-center gap-3 mt-1.5">
              {kit.questionCount !== undefined && <span className="text-xs text-text-secondary"><span className="text-text-primary font-medium">{kit.questionCount}</span> questions</span>}
              {kit.flashcardCount !== undefined && <span className="text-xs text-text-secondary"><span className="text-text-primary font-medium">{kit.flashcardCount}</span> flashcards</span>}
              {totalHours && <span className="text-xs text-text-secondary"><span className="text-text-primary font-medium">{totalHours}</span> study time</span>}
            </div>
          )}
        </div>
        <div className="shrink-0 pt-0.5"><Badge variant={statusBadgeVariant(kit.status)}>{statusLabel(kit.status)}</Badge></div>
        <time dateTime={kit.createdAt} className="shrink-0 text-text-secondary text-xs hidden sm:block pt-0.5 tabular-nums">{formatDate(kit.createdAt)}</time>
        <div className="shrink-0 flex items-center gap-2">
          <Link href={`/kits/${kit._id}`} aria-label={`Open kit: ${title}`}><Button variant="secondary" size="sm">Open</Button></Link>
          <Button variant="danger" size="sm" onClick={() => setShowConfirm(true)} aria-label={`Delete kit: ${title}`} disabled={isDeleting}>Delete</Button>
        </div>
      </div>
      {showConfirm && <ConfirmDeleteDialog kitTitle={`${title} — ${company}`} onConfirm={() => onDelete(kit._id)} onCancel={() => setShowConfirm(false)} isDeleting={isDeleting} />}
    </>
  );
}
