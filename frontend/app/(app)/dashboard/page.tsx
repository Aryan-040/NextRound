'use client';
import { useEffect, useState, useCallback } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { KitList } from '@/components/builder/KitList';
import { Spinner } from '@/components/ui';
import type { KitSummary } from '@/components/builder/KitRow';

export default function DashboardPage() {
  const [kits, setKits] = useState<KitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const fetchKits = useCallback(async () => {
    try {
      const data = await apiFetch<KitSummary[]>('/kits');
      setKits(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load kits. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKits();
  }, [fetchKits]);

  // Poll for updates if there are any kits in 'generating' or 'pending' status
  useEffect(() => {
    const hasGeneratingKits = kits.some(kit => 
      kit.status === 'generating' || kit.status === 'pending'
    );

    if (!hasGeneratingKits) return;

    // Poll every 5 seconds
    const intervalId = setInterval(() => {
      fetchKits();
    }, 5000);

    return () => clearInterval(intervalId);
  }, [kits, fetchKits]);

  const hasGeneratingKits = kits.some(kit => 
    kit.status === 'generating' || kit.status === 'pending'
  );

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
            {hasGeneratingKits && !loading && (
              <span className="inline-flex items-center gap-1.5 ml-2 text-xs text-accent">
                <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Auto-refreshing...
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchKits()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-bg-raised transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh kits"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            Refresh
          </button>
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

