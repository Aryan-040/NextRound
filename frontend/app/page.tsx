'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getToken } from '../lib/auth';

export default function HomePage() {
  const router = useRouter();
  useEffect(() => { if (getToken()) router.replace('/dashboard'); }, [router]);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg-base px-6">
      <div className="max-w-2xl text-center">
        <h1 className="animate-fade-up mb-6 font-sans text-5xl font-extrabold leading-tight text-text-primary md:text-6xl" style={{ letterSpacing: '-0.02em' }}>
          Know the company.<br />Own the room.
        </h1>
        <p className="mb-10 font-sans text-lg font-normal leading-relaxed text-text-secondary">
          Paste a job description. Get a personalised prep kit in minutes.
        </p>
        <Link href="/register" className="inline-block rounded-lg bg-accent px-8 py-3 font-sans text-base font-bold text-bg-base transition-colors duration-150 hover:bg-[#7AAAF4] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base">
          Start preparing →
        </Link>
      </div>
    </main>
  );
}
