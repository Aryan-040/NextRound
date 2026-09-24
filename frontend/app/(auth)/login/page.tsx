import { LandingPage } from '@/components/auth/LandingPage';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Sign in — PrepKit',
};

export default function LoginPage() {
  return <LandingPage initialMode="login" />;
}




