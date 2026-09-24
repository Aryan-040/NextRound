
'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { setToken } from '@/lib/auth';
import { register, login, ApiError } from '@/lib/api';

export type AuthMode = 'login' | 'register';

interface FieldErrors {
  email?: string;
  password?: string;
  general?: string;
}

export function AuthForm({ initialMode = 'register' }: { initialMode?: AuthMode; mode?: AuthMode }) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  const isRegister = mode === 'register';

  function handleModeSwitch(newMode: AuthMode) {
    setMode(newMode);
    setErrors({});
  }

  function validate(): FieldErrors {
    const e: FieldErrors = {};
    if (!email.trim()) {
      e.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      e.email = 'Enter a valid email address.';
    }

    if (!password) {
      e.password = 'Password is required.';
    } else if (isRegister && (password.length < 8 || password.length > 128)) {
      e.password = 'Password must be between 8 and 128 characters.';
    }

    return e;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    const ve = validate();
    if (Object.keys(ve).length > 0) {
      setErrors(ve);
      return;
    }

    setLoading(true);
    try {
      const res = isRegister
        ? await register({ email: email.trim(), password })
        : await login({ email: email.trim(), password });
      setToken(res.token);
      router.replace('/dashboard');
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 400)) {
        if (err.field === 'email') setErrors({ email: err.message });
        else if (err.field === 'password') setErrors({ password: err.message });
        else setErrors({ general: err.message });
      } else {
        setErrors({ general: 'Something went wrong. Please try again.' });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-bg-surface/90 backdrop-blur-md rounded-2xl border border-bg-raised/80 shadow-2xl p-6 sm:p-8 transition-all duration-200">
      {/* Segmented Tab Switcher */}
      <div className="flex bg-bg-base/80 p-1 rounded-xl mb-6 border border-bg-raised/40">
        <button
          type="button"
          onClick={() => handleModeSwitch('register')}
          className={`flex-1 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-150 ${
            isRegister
              ? 'bg-bg-surface text-text-primary shadow-sm border border-bg-raised/40'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Create account
        </button>
        <button
          type="button"
          onClick={() => handleModeSwitch('login')}
          className={`flex-1 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-150 ${
            !isRegister
              ? 'bg-bg-surface text-text-primary shadow-sm border border-bg-raised/40'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Sign in
        </button>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h2 className="text-text-primary font-bold text-xl sm:text-2xl tracking-tight">
          {isRegister ? 'Get started in seconds' : 'Welcome back'}
        </h2>
        <p className="text-text-secondary text-xs sm:text-sm mt-1">
          {isRegister
            ? 'Create a free account to build personalized prep kits'
            : 'Sign in to access your interview prep kits'}
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Input
          type="email"
          label="Email"
          id="auth-email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={!!errors.email}
          errorMessage={errors.email}
          disabled={loading}
        />

        <Input
          type="password"
          label="Password"
          id="auth-password"
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          placeholder={isRegister ? 'At least 8 characters' : '••••••••'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={!!errors.password}
          errorMessage={errors.password}
          disabled={loading}
        />

        {errors.general && (
          <div role="alert" className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-xs text-danger flex items-center gap-2">
            <span>⚠️</span>
            <span>{errors.general}</span>
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={loading}
          className="w-full mt-2 font-semibold shadow-lg shadow-accent/15"
        >
          {isRegister ? 'Create free account' : 'Sign in to dashboard'}
        </Button>
      </form>

      <p className="mt-5 text-center text-xs text-text-secondary/70">
        By continuing, you agree to generate tailored prep kits using AI.
      </p>
    </div>
  );
}

