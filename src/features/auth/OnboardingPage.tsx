import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Atom,
  CheckCircle2,
  GraduationCap,
  LogOut,
  Stethoscope,
  User,
} from 'lucide-react';
import { useApp } from '../../app/AppContext';
import { saveStudentProfile } from '../../lib/api';
import { updateFirebaseUserProfile } from '../../lib/firebase';
import type { ClassLevel, ExamTrack } from '../../types';

export const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, needsOnboarding, setProfileState, logout } = useApp();

  const [displayName, setDisplayName] = useState(
    profile?.display_name || user?.displayName || ''
  );
  const [exam, setExam] = useState<ExamTrack | ''>(profile?.exam || '');
  const [classLevel, setClassLevel] = useState<ClassLevel | ''>(
    profile?.class_level || ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile && !needsOnboarding) {
      navigate('/', { replace: true });
    }
  }, [profile, needsOnboarding, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = displayName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      setError('Please enter your display name (2 to 80 characters).');
      return;
    }
    if (exam !== 'JEE' && exam !== 'NEET') {
      setError('Please choose your exam track: JEE or NEET.');
      return;
    }
    if (classLevel !== '11' && classLevel !== '12') {
      setError('Please choose your class: 11th or 12th.');
      return;
    }

    setSaving(true);
    try {
      await updateFirebaseUserProfile({ displayName: trimmedName }).catch(() => {});
      const saved = await saveStudentProfile({
        displayName: trimmedName,
        exam,
        classLevel,
        avatarUrl: user?.photoURL || null,
      });
      setProfileState(saved);
      navigate('/', { replace: true });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Failed to save your onboarding profile. Please try again.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 flex flex-col justify-center py-10 px-4 sm:px-6">
      <div className="mx-auto w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl sm:p-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">
                Complete Your Student Profile
              </h1>
              <p className="text-xs text-slate-500">
                Personalise your Exam Cracker batches, lectures, and test series
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            title="Sign out"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          {/* 1. Display Name */}
          <div>
            <label
              htmlFor="onboarding-name"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700"
            >
              1. Your Full Name
            </label>
            <div className="relative mt-2">
              <User className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <input
                id="onboarding-name"
                type="text"
                required
                minLength={2}
                maxLength={80}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your display name (e.g. Rohan Verma)"
                className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
              />
            </div>
          </div>

          {/* 2. Exam Track: JEE or NEET */}
          <div>
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              2. Target Exam Track
            </span>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setExam('JEE')}
                aria-pressed={exam === 'JEE'}
                className={`flex flex-col items-start rounded-2xl border-2 p-4 text-left transition ${
                  exam === 'JEE'
                    ? 'border-indigo-600 bg-indigo-50/70'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
                    <Atom className="h-5 w-5" />
                  </div>
                  {exam === 'JEE' && (
                    <CheckCircle2 className="h-5 w-5 text-indigo-600" />
                  )}
                </div>
                <span className="mt-3 text-base font-extrabold text-slate-900">
                  IIT-JEE
                </span>
                <span className="mt-0.5 text-xs text-slate-500">
                  Physics, Chemistry &amp; Mathematics (Main + Advanced)
                </span>
              </button>

              <button
                type="button"
                onClick={() => setExam('NEET')}
                aria-pressed={exam === 'NEET'}
                className={`flex flex-col items-start rounded-2xl border-2 p-4 text-left transition ${
                  exam === 'NEET'
                    ? 'border-emerald-600 bg-emerald-50/70'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
                    <Stethoscope className="h-5 w-5" />
                  </div>
                  {exam === 'NEET' && (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  )}
                </div>
                <span className="mt-3 text-base font-extrabold text-slate-900">
                  NEET-UG
                </span>
                <span className="mt-0.5 text-xs text-slate-500">
                  Physics, Chemistry &amp; Biology (Botany + Zoology)
                </span>
              </button>
            </div>
          </div>

          {/* 3. Class Level: 11th or 12th */}
          <div>
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              3. Current Class
            </span>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {(['11', '12'] as const).map((cls) => (
                <button
                  key={cls}
                  type="button"
                  onClick={() => setClassLevel(cls)}
                  aria-pressed={classLevel === cls}
                  className={`flex items-center justify-between rounded-2xl border-2 p-4 text-left transition ${
                    classLevel === cls
                      ? 'border-indigo-600 bg-indigo-50/70'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div>
                    <span className="block text-base font-extrabold text-slate-900">
                      Class {cls}th
                    </span>
                    <span className="block text-xs text-slate-500">
                      {cls === '11'
                        ? 'Foundation & Core Syllabus'
                        : 'Board + Final Target Track'}
                    </span>
                  </div>
                  {classLevel === cls && (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-indigo-600" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-2xl bg-indigo-600 px-5 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving
              ? 'Saving your personalised profile...'
              : 'Save & Open My Personalised Dashboard'}
          </button>
        </form>
      </div>
    </div>
  );
};
