'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';
import type { KitDocument } from '@/types';

export interface KitSummary {
  _id: string; 
  status: KitDocument['status'];
  source: { role: string; company: string; company_url?: string; };
  createdAt: string;
  questionCount?: number; 
  flashcardCount?: number; 
  totalMinutes?: number; 
  daysAvailable?: number;
}

export interface KitRowProps { 
  kit: KitSummary; 
  onDelete: (id: string) => void; 
  isDeleting?: boolean; 
}

function statusBadgeVariant(s: KitDocument['status']): BadgeVariant {
  return s === 'ready' ? 'success' : s === 'generating' ? 'warning' : s === 'failed' ? 'danger' : 'muted';
}

function statusLabel(s: KitDocument['status']): string {
  return s === 'ready' ? 'Ready' : s === 'generating' ? 'Generating' : s === 'failed' ? 'Failed' : 'Pending';
}

function formatDate(iso: string) {
  try { 
    return new Date(iso).toLocaleDateString(undefined, { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    }); 
  } catch { 
    return iso; 
  }
}

function ConfirmDeleteDialog({ 
  kitTitle, 
  onConfirm, 
  onCancel, 
  isDeleting 
}: { 
  kitTitle: string; 
  onConfirm: () => void; 
  onCancel: () => void; 
  isDeleting: boolean 
}) {
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-base/80 backdrop-blur-sm" 
      role="dialog" 
      aria-modal="true" 
      aria-labelledby="confirm-delete-title"
    >
      <div className="bg-bg-surface border border-bg-raised rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <h2 id="confirm-delete-title" className="text-text-primary font-sans font-bold text-lg mb-3">
          Delete Kit?
        </h2>
        <p className="text-text-secondary text-sm leading-relaxed">
          <span className="text-text-primary font-medium">{kitTitle}</span> and all its practice progress will be permanently deleted. This cannot be undone.
        </p>
        <div className="flex gap-3 mt-6 justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm} loading={isDeleting}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

export function KitRow({ kit, onDelete, isDeleting = false }: KitRowProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const title = (kit.source && kit.source.role) ? kit.source.role : 'Untitled role';
  const company = (kit.source && kit.source.company) ? kit.source.company : 'Unknown company';
  const totalHours = kit.totalMinutes && kit.totalMinutes > 0 
    ? (kit.totalMinutes / 60).toFixed(1) + 'h' 
    : null;

  return (
    <>
      <div className="group relative flex items-center gap-6 px-6 py-5 bg-bg-surface border border-bg-raised rounded-lg hover:border-accent/30 hover:shadow-sm transition-all duration-150">
        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Title and company */}
          <div>
            <h3 className="text-text-primary font-semibold text-base leading-tight">
              {title}
            </h3>
            <p className="text-text-secondary text-sm mt-1">
              {company}
            </p>
          </div>

          {/* Stats row - only show when ready */}
          {kit.status === 'ready' && (kit.questionCount !== undefined || totalHours) && (
            <div className="flex items-center gap-6 text-xs">
              {kit.questionCount !== undefined && (
                <div className="flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-text-secondary">
                    <path fillRule="evenodd" d="M10 2a.75.75 0 01.75.75v7.5a.75.75 0 11-1.5 0v-7.5A.75.75 0 0110 2zM5.404 4.343a.75.75 0 010 1.06 6.5 6.5 0 109.192 0 .75.75 0 111.06-1.06 8 8 0 11-11.313 0 .75.75 0 011.06 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-text-secondary">
                    <span className="text-text-primary font-medium">{kit.questionCount}</span> questions
                  </span>
                </div>
              )}
              {kit.flashcardCount !== undefined && kit.flashcardCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-text-secondary">
                    <path d="M10.75 16.82A7.462 7.462 0 0115 15.5c.71 0 1.396.098 2.046.282A.75.75 0 0018 15.06v-11a.75.75 0 00-.546-.721A9.006 9.006 0 0015 3a8.963 8.963 0 00-4.25 1.065V16.82zM9.25 4.065A8.963 8.963 0 005 3c-.85 0-1.673.118-2.454.339A.75.75 0 002 4.06v11a.75.75 0 00.954.721A7.506 7.506 0 015 15.5c1.579 0 3.042.487 4.25 1.32V4.065z" />
                  </svg>
                  <span className="text-text-secondary">
                    <span className="text-text-primary font-medium">{kit.flashcardCount}</span> flashcards
                  </span>
                </div>
              )}
              {totalHours && (
                <div className="flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-text-secondary">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
                  </svg>
                  <span className="text-text-secondary">
                    <span className="text-text-primary font-medium">{totalHours}</span> study time
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Status badge */}
        <div className="shrink-0">
          <Badge variant={statusBadgeVariant(kit.status)}>
            {statusLabel(kit.status)}
          </Badge>
        </div>

        {/* Date */}
        <time 
          dateTime={kit.createdAt} 
          className="shrink-0 text-text-secondary text-xs tabular-nums min-w-[90px] text-right hidden sm:block"
        >
          {formatDate(kit.createdAt)}
        </time>

        {/* Actions */}
        <div className="shrink-0 flex items-center gap-2">
          {kit._id ? (
            <Link 
              href={`/kits/${kit._id}`} 
              aria-label={`Open kit: ${title}`}
              className="inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium bg-bg-raised text-text-primary border border-bg-raised hover:border-accent hover:text-accent transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Open
            </Link>
          ) : (
            <button
              disabled
              className="inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium bg-bg-raised text-text-secondary border border-bg-raised opacity-50 cursor-not-allowed"
            >
              Open
            </button>
          )}
          <button
            onClick={() => setShowConfirm(true)}
            aria-label={`Delete kit: ${title}`}
            disabled={isDeleting}
            className="inline-flex items-center justify-center p-2 rounded-md text-text-secondary hover:text-danger hover:bg-danger/10 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger disabled:opacity-50 disabled:pointer-events-none"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {showConfirm && (
        <ConfirmDeleteDialog 
          kitTitle={`${title} — ${company}`} 
          onConfirm={() => onDelete(kit._id)} 
          onCancel={() => setShowConfirm(false)} 
          isDeleting={isDeleting} 
        />
      )}
    </>
  );
}

