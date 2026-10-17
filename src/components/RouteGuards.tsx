import React, { useState } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  GraduationCap,
  Lock,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  ArrowLeft,
} from 'lucide-react';
import { useApp } from '../app/AppContext';
import {
  formatFirebaseAuthError,
  signInWithEmail,
  signInWithGoogle,
} from '../lib/firebase';

export const RequireStudentAuth: React.FC = () => {
  const { user, authLoading, bootstrapLoading, profile, needsOnboarding } = useApp();
  const location = useLocation();

  if (authLoading || (user && bootstrapLoading && !profile && !needsOnboarding)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
        <p className="mt-4 text-sm font-medium text-slate-600">
          Restoring your Exam Cracker session...
        </p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (needsOnboarding || !profile) {
    if (location.pathname !== '/onboarding') {
      return <Navigate to="/onboarding" replace />;
    }
  }

  return <Outlet />;
};

/**
 * Protects the `/admin` route.
 * - If signed out: shows dedicated Admin Sign-In (sign-in only, no self-registration).
 * - If signed in with any email other than `arvinddarabishnoi@gmail.com`: shows "Admin access denied."
 *   and never renders the admin dashboard.
 */
export const RequireAdminAuth: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user, isAdmin, authLoading, logout } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (authLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 p-6 text-white">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-indigo-500" />
        <p className="mt-4 text-sm font-medium text-slate-300">
          Verifying administrator session...
        </p>
      </div>
    );
  }

  // Signed out -> Show Admin Sign-In (sign-in only, no public admin registration)
  if (!user) {
    const handleAdminEmailLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSubmitting(true);
      try {
        await signInWithEmail(email, password);
      } catch (err) {
        setError(formatFirebaseAuthError(err));
      } finally {
        setSubmitting(false);
      }
    };

    const handleAdminGoogleLogin = async () => {
      setError(null);
      setSubmitting(true);
      try {
        await signInWithGoogle();
      } catch (err) {
        setError(formatFirebaseAuthError(err));
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-12 text-slate-100">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl sm:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">
                Exam Cracker Admin Sign-In
              </h1>
              <p className="text-xs text-slate-400">
                Restricted to authorized administrator account only
              </p>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-rose-500/40 bg-rose-950/60 p-3.5 text-xs text-rose-200"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleAdminEmailLogin} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="admin-login-email"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
              >
                Admin Email
              </label>
              <input
                id="admin-login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Administrator email"
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="admin-login-password"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
              >
                Password
              </label>
              <input
                id="admin-login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
            >
              <Lock className="h-4 w-4" />
              <span>{submitting ? 'Signing in...' : 'Sign In as Administrator'}</span>
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-800" />
            <span className="text-xs text-slate-500">OR</span>
            <div className="h-px flex-1 bg-slate-800" />
          </div>

          <button
            type="button"
            onClick={handleAdminGoogleLogin}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
          >
            <GraduationCap className="h-4 w-4 text-indigo-400" />
            <span>Continue with Google (Admin)</span>
          </button>

          <p className="mt-5 text-center text-[11px] leading-relaxed text-slate-400">
            Admin sign-in is strictly restricted. Public admin registration is disabled, and every admin action is verified on the backend using your signed Firebase ID token.
          </p>

          <div className="mt-5 border-t border-slate-800 pt-4 text-center">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Return to Student App</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Signed in with wrong email -> Show "Admin access denied."
  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-12 text-slate-100">
        <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-slate-900 p-6 text-center shadow-2xl sm:p-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-white">Admin access denied.</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            You are currently signed in as{' '}
            <span className="font-semibold text-slate-200">{user.email || user.uid}</span>,
            which does not have administrator privileges for Exam Cracker.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Go to Student Home</span>
            </Link>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-700"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
