'use client';
import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { setToken } from '@/lib/auth';
import { register, login, ApiError } from '@/lib/api';

export type AuthMode = 'login' | 'register';
interface FieldErrors { email?: string; password?: string; general?: string; }
export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const isRegister = mode === 'register';
  function validate(): FieldErrors {
    const e: FieldErrors = {};
    if (!email.trim()) e.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'Enter a valid email address.';
    if (!password) e.password = 'Password is required.';
    else if (isRegister && (password.length < 8 || password.length > 128)) e.password = 'Password must be between 8 and 128 characters.';
    return e;
  }
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErrors({});
    const ve = validate();
    if (Object.keys(ve).length > 0) { setErrors(ve); return; }
    setLoading(true);
    try {
      const res = isRegister ? await register({ email: email.trim(), password }) : await login({ email: email.trim(), password });
      setToken(res.token); router.replace('/dashboard');
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 400)) {
        if (err.field === 'email') setErrors({ email: err.message });
        else if (err.field === 'password') setErrors({ password: err.message });
        else setErrors({ general: err.message });
      } else { setErrors({ general: 'Something went wrong. Please try again.' }); }
    } finally { setLoading(false); }
  }
  const title = isRegister ? 'Create an account' : 'Welcome back';
  const subtitle = isRegister ? 'Start building your prep kit' : 'Sign in to your prep kit';
  return (
    <div className="px-8 py-10">
      <div className="mb-8">
        <h1 className="text-text-primary font-bold text-2xl tracking-tight leading-tight">{title}</h1>
        <p className="text-text-secondary text-sm mt-1">{subtitle}</p>
      </div>
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <Input type="email" label="Email" id="auth-email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} error={!!errors.email} errorMessage={errors.email} disabled={loading} />
        <Input type="password" label="Password" id="auth-password" autoComplete={isRegister ? 'new-password' : 'current-password'} placeholder={isRegister ? 'At least 8 characters' : '••••••••'} value={password} onChange={e => setPassword(e.target.value)} error={!!errors.password} errorMessage={errors.password} disabled={loading} />
        {errors.general && <p role="alert" className="text-sm text-danger">{errors.general}</p>}
        <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full mt-2">{isRegister ? 'Create account' : 'Sign in'}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-text-secondary">
        <Link href={isRegister ? '/login' : '/register'} className="text-accent hover:underline">{isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}</Link>
      </p>
    </div>
  );
}
