import { AuthForm } from '@/components/auth/AuthForm';

export const metadata = {
  title: 'Create account — PrepKit',
};

/**
 * Register page — rendered inside the unauthenticated (auth) layout.
 * Delegates all form logic to the shared AuthForm component.
 */
export default function RegisterPage() {
  return <AuthForm mode="register" />;
}
