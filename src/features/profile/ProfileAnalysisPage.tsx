import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  Edit3,
  LogOut,
  PlayCircle,
  RefreshCw,
  Save,
  TrendingUp,
  Trophy,
  User,
} from 'lucide-react';
import { useApp } from '../../app/AppContext';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { getStudentAnalysis, saveStudentProfile } from '../../lib/api';
import { formatISTDateTime, formatWatchDuration } from '../../lib/date';
import { updateFirebaseUserProfile } from '../../lib/firebase';
import { isSafeHttpUrl } from '../../lib/validation';
import type { AnalysisResponse, ClassLevel, ExamTrack } from '../../types';

export const ProfileAnalysisPage: React.FC = () => {
  const { profile, content, setProfileState, logout } = useApp();

  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Profile Editor State
  const [editingProfile, setEditingProfile] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [exam, setExam] = useState<ExamTrack>(profile?.exam || 'JEE');
  const [classLevel, setClassLevel] = useState<ClassLevel>(
    profile?.class_level || '11'
  );
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState<string | null>(null);

  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);

  const loadAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getStudentAnalysis();
      setAnalysis(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load your learning analysis right now.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalysis();
  }, [loadAnalysis]);

  useEffect(() => {
    if (profile && !editingProfile) {
      setDisplayName(profile.display_name);
      setAvatarUrl(profile.avatar_url || '');
      setExam(profile.exam);
      setClassLevel(profile.class_level);
    }
  }, [profile, editingProfile]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaveError(null);
    setProfileSaveSuccess(null);

    const trimmedName = displayName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      setProfileSaveError('Display name must be between 2 and 80 characters.');
      return;
    }

    const trimmedAvatar = avatarUrl.trim();
    if (trimmedAvatar && !isSafeHttpUrl(trimmedAvatar)) {
      setProfileSaveError('Avatar URL must be a valid http:// or https:// image link.');
      return;
    }

    setSavingProfile(true);
    try {
      await updateFirebaseUserProfile({
        displayName: trimmedName,
        photoURL: trimmedAvatar || null,
      }).catch(() => {});

      const updated = await saveStudentProfile({
        displayName: trimmedName,
        exam,
        classLevel,
        avatarUrl: trimmedAvatar || null,
      });

      // Only update app profile state after backend confirms save
      setProfileState(updated);
      setEditingProfile(false);
      setProfileSaveSuccess('Your student profile has been updated.');
      loadAnalysis();
    } catch (err) {
      // Do not silently change exam/class content if profile save fails
      if (profile) {
        setExam(profile.exam);
        setClassLevel(profile.class_level);
      }
      setProfileSaveError(
        err instanceof Error
          ? err.message
          : 'Profile update failed. Your active exam/class track was not changed.'
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const levelBadgeColor = (lvl?: string) => {
    switch (lvl) {
      case 'Expert':
        return 'bg-amber-100 text-amber-900 border-amber-300';
      case 'Advanced':
        return 'bg-emerald-100 text-emerald-900 border-emerald-300';
      case 'Intermediate':
        return 'bg-indigo-100 text-indigo-900 border-indigo-300';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Student Profile & Track Header */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.display_name}
                className="h-16 w-16 rounded-2xl object-cover border border-slate-200 shadow-2xs"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-sm">
                <User className="h-8 w-8" />
              </div>
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">
                  {profile?.display_name || 'Student'}
                </h1>
                <span className="rounded-full bg-indigo-50 px-3 py-0.5 text-xs font-bold text-indigo-700">
                  {profile?.exam} • Class {profile?.class_level}th
                </span>
              </div>
              {profile?.email && (
                <p className="mt-0.5 text-xs text-slate-500">{profile.email}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setEditingProfile((prev) => !prev);
                setProfileSaveError(null);
                setProfileSaveSuccess(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>{editingProfile ? 'Cancel Edit' : 'Edit Profile'}</span>
            </button>

            <button
              type="button"
              onClick={() => setConfirmLogoutOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>

        {profileSaveError && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs sm:text-sm font-medium text-rose-700"
          >
            {profileSaveError}
          </div>
        )}

        {profileSaveSuccess && (
          <div
            role="status"
            className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs sm:text-sm font-medium text-emerald-800"
          >
            {profileSaveSuccess}
          </div>
        )}

        {editingProfile && (
          <form
            onSubmit={handleSaveProfile}
            className="mt-6 border-t border-slate-100 pt-6 space-y-4"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="edit-profile-name"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  Display Name
                </label>
                <input
                  id="edit-profile-name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={80}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-profile-avatar"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  Avatar Image URL (Optional https://)
                </label>
                <input
                  id="edit-profile-avatar"
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://example.com/avatar.jpg"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-profile-exam"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  Exam Track
                </label>
                <select
                  id="edit-profile-exam"
                  value={exam}
                  onChange={(e) => setExam(e.target.value as ExamTrack)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                >
                  <option value="JEE">IIT-JEE</option>
                  <option value="NEET">NEET-UG</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="edit-profile-class"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  Class
                </label>
                <select
                  id="edit-profile-class"
                  value={classLevel}
                  onChange={(e) => setClassLevel(e.target.value as ClassLevel)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                >
                  <option value="11">Class 11th</option>
                  <option value="12">Class 12th</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2.5">
              <button
                type="submit"
                disabled={savingProfile}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                <span>{savingProfile ? 'Saving Changes...' : 'Save Profile'}</span>
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Learning Analysis Section */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">
            Personalised Learning Analysis
          </h2>
          <p className="text-xs text-slate-500">
            Computed from your real lesson progress and submitted test attempts
          </p>
        </div>
        <button
          type="button"
          onClick={loadAnalysis}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {error}
        </div>
      )}

      {loading && !analysis ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          <p className="mt-3 text-sm text-slate-600">Loading your study analytics...</p>
        </div>
      ) : (
        analysis && (
          <>
            {/* Learning Level Indicator Banner */}
            <div className="rounded-3xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-violet-50 p-5 shadow-2xs sm:p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-xs">
                    <Award className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                        Current Learning Indicator
                      </span>
                      <span
                        className={`rounded-full border px-3 py-0.5 text-xs font-extrabold ${levelBadgeColor(
                          analysis.level
                        )}`}
                      >
                        {analysis.level}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                      <strong>Note:</strong> Your learning level ({analysis.level}) is a
                      personal learning indicator calculated from your saved test attempts
                      and study consistency in Exam Cracker, not an official JEE/NEET exam rank.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-bold uppercase">Completed Lessons</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="mt-2 text-2xl font-extrabold text-slate-900">
                  {analysis.completedLessons}
                </p>
                <span className="text-[11px] text-slate-500">
                  {analysis.lessonProgress.length} total started
                </span>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-bold uppercase">Total Watched Time</span>
                  <Clock className="h-4 w-4 text-indigo-600" />
                </div>
                <p className="mt-2 text-2xl font-extrabold text-slate-900">
                  {formatWatchDuration(analysis.watchedSeconds)}
                </p>
                <span className="text-[11px] text-slate-500">
                  Synced across devices
                </span>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-bold uppercase">Tests Taken</span>
                  <Trophy className="h-4 w-4 text-amber-500" />
                </div>
                <p className="mt-2 text-2xl font-extrabold text-slate-900">
                  {analysis.testsTaken}
                </p>
                <span className="text-[11px] text-slate-500">
                  Total score: {analysis.totalScore} / {analysis.totalMaxScore}
                </span>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-bold uppercase">Average Score %</span>
                  <TrendingUp className="h-4 w-4 text-indigo-600" />
                </div>
                <p className="mt-2 text-2xl font-extrabold text-slate-900">
                  {analysis.averagePercentage}%
                </p>
                <span className="text-[11px] text-slate-500">
                  Across submitted mock tests
                </span>
              </div>
            </div>

            {/* Recent Test Results & Recent Lesson Progress */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Recent Test Results */}
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-2xs sm:p-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-base font-extrabold text-slate-900">
                    Recent Test Results ({analysis.attempts.length})
                  </h3>
                  <Link
                    to="/tests"
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
                  >
                    All Tests →
                  </Link>
                </div>

                {analysis.attempts.length === 0 ? (
                  <p className="mt-4 text-xs text-slate-500">
                    You have not submitted any tests yet. Take a live test from the Tests page to see your score history here.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {analysis.attempts.slice(0, 8).map((att) => {
                      const testObj = content.find((c) => c.id === att.test_id);
                      const pct =
                        Number(att.max_score) > 0
                          ? Math.round((Number(att.score) / Number(att.max_score)) * 100)
                          : 0;
                      return (
                        <div
                          key={att.id}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-900">
                              {testObj?.title || `Test #${att.test_id.slice(0, 8)}`}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              {formatISTDateTime(att.submitted_at)} • Correct:{' '}
                              {att.correct_count} • Wrong: {att.incorrect_count}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="rounded-lg bg-indigo-100 px-2.5 py-1 text-xs font-extrabold text-indigo-800">
                              {att.score}/{att.max_score} ({pct}%)
                            </span>
                            <Link
                              to={`/tests/${att.test_id}?mode=result`}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100"
                            >
                              Review
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Recent Lesson Progress */}
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-2xs sm:p-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-base font-extrabold text-slate-900">
                    Lesson Watch History ({analysis.lessonProgress.length})
                  </h3>
                  <Link
                    to="/lectures?tab=lectures"
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
                  >
                    Lectures →
                  </Link>
                </div>

                {analysis.lessonProgress.length === 0 ? (
                  <p className="mt-4 text-xs text-slate-500">
                    No lecture watch progress recorded yet. Open any video lecture to start tracking your study time.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {analysis.lessonProgress.slice(0, 8).map((prog) => {
                      const lecObj = content.find((c) => c.id === prog.lecture_id);
                      return (
                        <div
                          key={prog.lecture_id}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-900">
                              {lecObj?.title || `Lecture #${prog.lecture_id.slice(0, 8)}`}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              Watched: {formatWatchDuration(prog.watched_seconds)} •{' '}
                              {prog.completed ? 'Completed' : 'In Progress'}
                            </p>
                          </div>
                          <Link
                            to={`/lectures/watch/${prog.lecture_id}`}
                            className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                          >
                            <PlayCircle className="h-3.5 w-3.5" />
                            <span>{prog.completed ? 'Rewatch' : 'Resume'}</span>
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )
      )}

      <ConfirmDialog
        open={confirmLogoutOpen}
        title="Sign Out of Exam Cracker?"
        message="You can sign back in anytime with your email/password or Google account to access your saved batches, progress, and test scores."
        confirmLabel="Sign Out"
        variant="danger"
        onConfirm={logout}
        onCancel={() => setConfirmLogoutOpen(false)}
      />
    </div>
  );
};
