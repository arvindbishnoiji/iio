import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import {
  BookOpen,
  CheckCircle2,
  GraduationCap,
  KeyRound,
  LogIn,
  Mail,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { useApp } from '../../app/AppContext';
import {
  formatFirebaseAuthError,
  onRedirectAuthError,
  registerWithEmail,
  requestPasswordReset,
  signInWithEmail,
  signInWithGoogle,
} from '../../lib/firebase';

export const AuthPage: React.FC = () => {
  const { user, authLoading, profile, needsOnboarding } = useApp();
  const location = useLocation();

  const [mode, setMode] = useState<'signin' | 'register' | 'reset'>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onRedirectAuthError((msg) => {
      setError(msg);
    });
    return unsub;
  }, []);

  if (!authLoading && user) {
    if (needsOnboarding || !profile) {
      return <Navigate to="/onboarding" replace />;
    }
    const fromPath =
      (location.state as { from?: { pathname?: string } })?.from?.pathname || '/';
    return <Navigate to={fromPath} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setLoading(true);

    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
      } else if (mode === 'register') {
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }
        await registerWithEmail(email, password, displayName);
      } else if (mode === 'reset') {
        await requestPasswordReset(email);
        setInfoMessage(
          'Password reset instructions have been sent to your email address.'
        );
        setMode('signin');
      }
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async (forceRedirect = false) => {
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      await signInWithGoogle({ forceRedirect });
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Left Brand Hero */}
        <div className="lg:col-span-5 bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-8 text-white flex flex-col justify-between">
          <div>
            <div className="inline-flex items-center gap-2.5 rounded-2xl bg-white/15 px-3.5 py-2 backdrop-blur-xs">
              <GraduationCap className="h-6 w-6 text-amber-300" />
              <span className="text-base font-extrabold tracking-tight">Exam Cracker</span>
            </div>

            <h1 className="mt-6 text-2xl sm:text-3xl font-extrabold leading-tight">
              Crack JEE &amp; NEET with Structured Daily Mastery
            </h1>
            <p className="mt-3 text-sm text-indigo-100 leading-relaxed">
              Personalised study tracks for Class 11th &amp; 12th aspirants. Access curated batches, lecture playlists, timed mock tests, and real-time mentor guidance.
            </p>
          </div>

          <div className="mt-8 space-y-3 text-xs sm:text-sm text-indigo-100">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
              <span>Targeted JEE &amp; NEET batches for Class 11 &amp; 12</span>
            </div>
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
              <span>Timed CBT Mock Tests with LaTeX &amp; detailed solutions</span>
            </div>
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
              <span>Distraction-free lecture player with progress sync</span>
            </div>
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
              <span>1-on-1 live doubt resolution with Exam Cracker mentors</span>
            </div>
          </div>
        </div>

        {/* Right Auth Form */}
        <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-center">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setError(null);
                }}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                  mode === 'signin'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                  mode === 'register'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Create Account
              </button>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-indigo-600">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Student Portal</span>
            </span>
          </div>

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs sm:text-sm text-rose-700"
            >
              {error}
            </div>
          )}

          {infoMessage && (
            <div
              role="status"
              className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs sm:text-sm text-emerald-800"
            >
              {infoMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {mode === 'register' && (
              <div>
                <label
                  htmlFor="auth-display-name"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  Full Name (Optional now — confirmed in onboarding)
                </label>
                <input
                  id="auth-display-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Aarav Sharma"
                  maxLength={80}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="auth-email"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                Email Address
              </label>
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  id="auth-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@example.com"
                  className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                />
              </div>
            </div>

            {mode !== 'reset' && (
              <div>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="auth-password"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                  >
                    Password
                  </label>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('reset');
                        setError(null);
                      }}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative mt-1.5">
                  <KeyRound className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    id="auth-password"
                    type="password"
                    required
                    minLength={6}
                    autoComplete={
                      mode === 'register' ? 'new-password' : 'current-password'
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {mode === 'signin' && <LogIn className="h-4 w-4" />}
              {mode === 'register' && <UserPlus className="h-4 w-4" />}
              <span>
                {loading
                  ? 'Please wait...'
                  : mode === 'signin'
                  ? 'Sign In with Email'
                  : mode === 'register'
                  ? 'Create Student Account'
                  : 'Send Password Reset Email'}
              </span>
            </button>
          </form>

          {mode !== 'reset' && (
            <>
              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-xs font-semibold text-slate-400">
                  OR CONTINUE WITH
                </span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <button
                type="button"
                onClick={() => handleGoogleSignIn(false)}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-2xs transition hover:bg-slate-50 disabled:opacity-60"
              >
                <BookOpen className="h-4 w-4 text-indigo-600" />
                <span>Continue with Google</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
