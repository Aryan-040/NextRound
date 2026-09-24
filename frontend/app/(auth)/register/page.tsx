import { LandingPage } from '@/components/auth/LandingPage';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Create account — PrepKit',
};

export default function RegisterPage() {
  return <LandingPage initialMode="register" />;
}




