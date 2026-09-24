import { LandingPage } from '@/components/auth/LandingPage';

export const dynamic = 'force-dynamic';

export default function HomePage({ searchParams }: { searchParams?: { mode?: string } }) {
  const initialMode = searchParams?.mode === 'login' ? 'login' : 'register';
  return <LandingPage initialMode={initialMode} />;
}

