'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth';
import { AuthForm } from '@/components/auth/AuthForm';

export function LandingPage({ initialMode = 'register' }: { initialMode?: 'register' | 'login' }) {
  const router = useRouter();

  useEffect(() => {
    if (getToken()) {
      router.replace('/dashboard');
    }
  }, [router]);

  return (
    <main className="min-h-screen bg-bg-base relative flex flex-col justify-between selection:bg-accent-dim selection:text-text-primary">
      {/* Subtle ambient lighting glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[400px] bg-gradient-to-b from-accent/10 via-accent/5 to-transparent blur-3xl pointer-events-none -z-10" />

      {/* Header Bar */}
      <header className="w-full max-w-7xl mx-auto px-6 sm:px-8 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-bg-base font-extrabold text-sm shadow-md shadow-accent/20">
            N
          </div>
          <span className="font-bold text-xl tracking-tight text-text-primary font-sans">
            NextRound
          </span>
          <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/20 ml-1">
            AI Kit
          </span>
        </div>
      </header>

      {/* Hero & Auth Section */}
      <section className="w-full max-w-7xl mx-auto px-6 sm:px-8 py-8 sm:py-12 flex-1 flex items-center">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center w-full">
          {/* Left Column: Value Proposition */}
          <div className="lg:col-span-7 space-y-6 text-left animate-fade-up">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-bg-surface border border-bg-raised/80 text-xs font-medium text-text-secondary shadow-sm">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span>Intelligent Interview Preparation</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.1] text-text-primary tracking-tight">
              Know the company.{' '}
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-accent via-[#7AAAF4] to-[#93C5FD] mt-1">
                Own the room.
              </span>
            </h1>

            <p className="text-base sm:text-lg text-text-secondary leading-relaxed max-w-xl">
              Paste a job description and company URL. Generate a tailored prep kit in minutes — complete with company briefs, key requirement breakdowns, targeted questions, study flashcards, and a day-by-day schedule.
            </p>

            {/* Feature Highlights */}
            <div className="grid sm:grid-cols-2 gap-3 pt-2 max-w-lg">
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-bg-surface/50 border border-bg-raised/40 text-xs sm:text-sm text-text-primary font-medium">
                <span className="text-accent">✦</span> Company Web Crawler
              </div>
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-bg-surface/50 border border-bg-raised/40 text-xs sm:text-sm text-text-primary font-medium">
                <span className="text-accent">✦</span> Role Requirement Extraction
              </div>
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-bg-surface/50 border border-bg-raised/40 text-xs sm:text-sm text-text-primary font-medium">
                <span className="text-accent">✦</span> Interactive Flashcards
              </div>
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-bg-surface/50 border border-bg-raised/40 text-xs sm:text-sm text-text-primary font-medium">
                <span className="text-accent">✦</span> Custom Day-by-Day Plan
              </div>
            </div>
          </div>

          {/* Right Column: Integrated Auth Form */}
          <div className="lg:col-span-5 w-full max-w-md mx-auto lg:max-w-none animate-fade-up">
            <AuthForm initialMode={initialMode} />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full max-w-7xl mx-auto px-6 sm:px-8 py-6 text-center sm:flex sm:items-center sm:justify-between border-t border-bg-raised/30 text-xs text-text-secondary/60">
        <p>© NextRound AI. All rights reserved.</p>
        <p className="mt-2 sm:mt-0 font-mono text-[11px]">Next.js 14 • Express • Gemini/Groq LLM</p>
      </footer>
    </main>
  );
}
