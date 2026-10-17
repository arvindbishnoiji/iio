import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Award,
  CheckCircle2,
  Crown,
  Medal,
  RefreshCw,
  Trophy,
  User,
} from 'lucide-react';
import { useApp } from '../../app/AppContext';
import { EmptyState } from '../../components/EmptyState';
import { getStudentTests, getTestLeaderboard } from '../../lib/api';
import { formatISTDateTime } from '../../lib/date';
import type { LeaderboardEntry, TestCardItem } from '../../types';

export const LeaderboardPage: React.FC = () => {
  const { user, profile } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTestId = searchParams.get('testId') || '';

  const [tests, setTests] = useState<TestCardItem[]>([]);
  const [loadingTests, setLoadingTests] = useState(true);

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingTests(true);
    getStudentTests()
      .then((list) => {
        if (!active) return;
        setTests(list);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof Error ? err.message : 'Unable to load test list.'
        );
      })
      .finally(() => {
        if (active) setLoadingTests(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadLeaderboard = useCallback(async (testUuid: string) => {
    if (!testUuid) {
      setEntries([]);
      return;
    }
    setLoadingBoard(true);
    setError(null);
    try {
      const res = await getTestLeaderboard(testUuid);
      setEntries(res.items || []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load leaderboard for this test.'
      );
    } finally {
      setLoadingBoard(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTestId) {
      loadLeaderboard(selectedTestId);
    } else {
      setEntries([]);
    }
  }, [selectedTestId, loadLeaderboard]);

  const selectedTest = useMemo(
    () => tests.find((t) => t.id === selectedTestId) || null,
    [tests, selectedTestId]
  );

  const handleSelectTest = (testId: string) => {
    if (testId) {
      setSearchParams({ testId });
    } else {
      setSearchParams({});
    }
  };

  return (
    <div className="space-y-6">
      {/* Header + Test Selector */}
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-2xs sm:flex-row sm:items-center sm:p-6">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-0.5 text-xs font-bold text-amber-800">
            <Trophy className="h-3.5 w-3.5 text-amber-600" />
            <span>Per-Test Official Rankings</span>
          </div>
          <h1 className="mt-1.5 text-xl font-extrabold text-slate-900 sm:text-2xl">
            Test Leaderboard
          </h1>
          <p className="mt-0.5 text-xs sm:text-sm text-slate-500">
            Select a specific test for <strong className="text-indigo-700">{profile?.exam}</strong> •{' '}
            <strong className="text-indigo-700">Class {profile?.class_level}th</strong> to view verified student rankings.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="w-full sm:w-72">
            <label htmlFor="leaderboard-test-selector" className="sr-only">
              Select a test
            </label>
            <select
              id="leaderboard-test-selector"
              value={selectedTestId}
              onChange={(e) => handleSelectTest(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 focus:border-indigo-600 focus:bg-white focus:outline-none"
            >
              <option value="">— Select a Test to View Rankings —</option>
              {tests.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} {t.subject ? `(${t.subject})` : ''}
                </option>
              ))}
            </select>
          </div>

          {selectedTestId && (
            <button
              type="button"
              onClick={() => loadLeaderboard(selectedTestId)}
              disabled={loadingBoard}
              aria-label="Refresh leaderboard"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loadingBoard ? 'animate-spin' : ''}`}
              />
              <span>Refresh</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {error}
        </div>
      )}

      {/* When no test is selected: show Test Selector cards rather than a misleading mixed ranking */}
      {!selectedTestId ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 text-xs sm:text-sm text-indigo-950">
            <strong>Choose a Test Below:</strong> Each test has its own independent leaderboard based on official server-scored submissions. Select any test below to view its rank list.
          </div>

          {loadingTests ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
              <p className="mt-3 text-sm text-slate-600">Loading available tests...</p>
            </div>
          ) : tests.length === 0 ? (
            <EmptyState
              icon={<Trophy className="h-6 w-6" />}
              title={`No Tests Available for ${profile?.exam} Class ${profile?.class_level}th`}
              description="Once tests are created by the administrator, you can select any test here to inspect its leaderboard."
              adminGuidance="Open /admin → Tests & Schedules and create a test for JEE or NEET Class 11/12."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tests.map((test) => (
                <button
                  key={test.id}
                  type="button"
                  onClick={() => handleSelectTest(test.id)}
                  className="flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-2xs transition hover:border-indigo-400 hover:shadow-md"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-lg bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
                        {test.exam} • Class {test.classes.join('/')}
                      </span>
                      {test.subject && (
                        <span className="text-xs font-semibold text-slate-500">
                          {test.subject}
                        </span>
                      )}
                    </div>
                    <h2 className="mt-3 text-base font-extrabold text-slate-900">
                      {test.title}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {test.totalQuestions || 0} Questions • {test.durationMinutes || 60}{' '}
                      mins
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-bold text-indigo-600">
                    <span>View Test Leaderboard</span>
                    <Trophy className="h-4 w-4 text-amber-500" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : loadingBoard ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          <p className="mt-3 text-sm text-slate-600">
            Loading official rankings for {selectedTest?.title || 'selected test'}...
          </p>
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <Trophy className="mx-auto h-10 w-10 text-amber-500" />
          <h2 className="mt-3 text-base font-bold text-slate-900">
            No Submissions Recorded for This Test Yet
          </h2>
          <p className="mx-auto mt-1 max-w-md text-xs sm:text-sm text-slate-600">
            Be the first student in {profile?.exam} Class {profile?.class_level}th to submit{' '}
            <strong>{selectedTest?.title || 'this test'}</strong> and claim Rank #1!
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Link
              to={`/tests/${selectedTestId}`}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
            >
              Attempt This Test
            </Link>
            <button
              type="button"
              onClick={() => handleSelectTest('')}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              Choose Another Test
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Selected Test Banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-900 px-5 py-4 text-white">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                Official Test Ranking
              </span>
              <h2 className="text-base sm:text-lg font-extrabold">
                {selectedTest?.title || 'Selected Test'}
              </h2>
            </div>
            <span className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold">
              {entries.length} Ranked Student{entries.length === 1 ? '' : 's'}
            </span>
          </div>

          {/* Ranked Table (Never exposes email or private profile fields) */}
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3.5 pl-5 pr-3">Rank</th>
                    <th className="px-3 py-3.5">Student</th>
                    <th className="px-3 py-3.5">Score</th>
                    <th className="py-3.5 pl-3 pr-5 text-right">Submitted (IST)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {entries.map((entry) => {
                    const isMe = user?.uid === entry.firebaseUid;
                    return (
                      <tr
                        key={`${entry.firebaseUid}-${entry.rank}`}
                        className={
                          isMe
                            ? 'bg-indigo-50/70 font-semibold'
                            : 'hover:bg-slate-50/80'
                        }
                      >
                        <td className="py-3.5 pl-5 pr-3 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {entry.rank === 1 ? (
                              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-700 font-extrabold">
                                <Crown className="h-4 w-4" />
                              </span>
                            ) : entry.rank === 2 ? (
                              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-slate-700 font-extrabold">
                                <Medal className="h-4 w-4" />
                              </span>
                            ) : entry.rank === 3 ? (
                              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-orange-100 text-orange-800 font-extrabold">
                                <Award className="h-4 w-4" />
                              </span>
                            ) : (
                              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                                #{entry.rank}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-3 py-3.5">
                          <div className="flex items-center gap-3">
                            {entry.avatarUrl ? (
                              <img
                                src={entry.avatarUrl}
                                alt={entry.name}
                                className="h-9 w-9 rounded-full object-cover border border-slate-200"
                              />
                            ) : (
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                                <User className="h-4 w-4" />
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-900">
                                  {entry.name}
                                </span>
                                {isMe && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">
                                    <CheckCircle2 className="h-2.5 w-2.5" />
                                    <span>You</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-3 py-3.5 whitespace-nowrap">
                          <span className="rounded-xl bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-800">
                            {entry.score} / {entry.maxScore}
                          </span>
                        </td>

                        <td className="py-3.5 pl-3 pr-5 text-right text-xs text-slate-500 whitespace-nowrap">
                          {formatISTDateTime(entry.submittedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
