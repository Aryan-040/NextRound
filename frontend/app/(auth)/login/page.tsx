import { AuthForm } from '@/components/auth/AuthForm';

export const metadata = {
  title: 'Sign in — PrepKit',
};

/**
 * Login page — rendered inside the unauthenticated (auth) layout.
 * Delegates all form logic to the shared AuthForm component.
 */
export default function LoginPage() {
  return <AuthForm mode="login" />;
}
