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
      setLoading(true); 
      setError(null);
      try {
        const data = await apiFetch<KitSummary[]>('/kits');
        if (!cancelled) setKits(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load kits. Please refresh the page.');
      } finally { 
        if (!cancelled) setLoading(false); 
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 pb-6 border-b border-bg-raised">
        <div>
          <h1 className="font-sans font-bold text-3xl text-text-primary tracking-tight">
            Your Kits
          </h1>
          <p className="text-text-secondary text-sm mt-1.5">
            {loading ? 'Loading...' : kits.length === 0 ? 'No kits yet' : `${kits.length} prep ${kits.length === 1 ? 'kit' : 'kits'}`}
          </p>
        </div>
        <a 
          href="/create" 
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent/90 active:bg-accent/80 transition-all duration-150 shadow-sm hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
          New Kit
        </a>
      </div>

      {/* Content */}
      {loading && (
        <div className="flex items-center justify-center py-32">
          <Spinner size="md" />
        </div>
      )}
      
      {!loading && error && (
        <div role="alert" className="px-5 py-4 rounded-lg bg-danger/10 text-danger text-sm border border-danger/20">
          {error}
        </div>
      )}
      
      {!loading && !error && kits.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-full bg-bg-raised flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-text-secondary">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
          <h2 className="text-text-primary font-semibold text-lg mb-2">No prep kits yet</h2>
          <p className="text-text-secondary text-sm max-w-md mb-6">
            Create your first interview prep kit to get started with company research, practice questions, and flashcards.
          </p>
          <a 
            href="/create" 
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent/90 transition-all duration-150"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            Create Your First Kit
          </a>
        </div>
      )}
      
      {!loading && !error && kits.length > 0 && (
        <KitList initialKits={kits} />
      )}
    </div>
  );
}

