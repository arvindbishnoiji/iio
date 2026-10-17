import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileCheck2,
  HelpCircle,
  RefreshCw,
  Trophy,
} from 'lucide-react';
import { useApp } from '../../app/AppContext';
import { EmptyState } from '../../components/EmptyState';
import { getStudentAnalysis, getStudentTests } from '../../lib/api';
import { formatISTDateTime, getTestScheduleStatus } from '../../lib/date';
import type { ExamAttempt, TestCardItem } from '../../types';

export const TestsPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useApp();

  const [tests, setTests] = useState<TestCardItem[]>([]);
  const [attemptsByTestId, setAttemptsByTestId] = useState<
    Record<string, ExamAttempt>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'live' | 'upcoming' | 'completed'>('live');

  const loadTestsData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [testItems, analysisData] = await Promise.all([
        getStudentTests(),
        getStudentAnalysis().catch(() => null),
      ]);
      setTests(testItems);

      const map: Record<string, ExamAttempt> = {};
      if (analysisData && Array.isArray(analysisData.attempts)) {
        for (const a of analysisData.attempts) {
          if (a.test_id && !map[a.test_id]) {
            map[a.test_id] = a;
          }
        }
      }
      setAttemptsByTestId(map);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load tests right now.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTestsData();
  }, [loadTestsData]);

  const nowMs = Date.now();

  const { liveTests, upcomingTests, completedTests } = useMemo(() => {
    const live: TestCardItem[] = [];
    const upcoming: TestCardItem[] = [];
    const completed: TestCardItem[] = [];

    for (const t of tests) {
      const status = getTestScheduleStatus(t, nowMs);
      const hasAttempt = Boolean(attemptsByTestId[t.id]);
      if (status === 'completed' || hasAttempt) {
        completed.push(t);
      }
      if (status === 'live') {
        live.push(t);
      } else if (status === 'upcoming') {
        upcoming.push(t);
      }
    }

    return {
      liveTests: live,
      upcomingTests: upcoming,
      completedTests: completed,
    };
  }, [tests, attemptsByTestId, nowMs]);

  const displayedList =
    activeTab === 'live'
      ? liveTests
      : activeTab === 'upcoming'
      ? upcomingTests
      : completedTests;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-2xs sm:flex-row sm:items-center sm:p-6">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">
            Mock Tests &amp; Exam Schedules
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Targeted for <strong className="text-indigo-700">{profile?.exam}</strong> •{' '}
            <strong className="text-indigo-700">Class {profile?.class_level}th</strong>. All test schedules are shown in India Standard Time (Asia/Kolkata).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadTestsData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <Link
            to="/leaderboard"
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3.5 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
          >
            <Trophy className="h-3.5 w-3.5" />
            <span>Test Leaderboards</span>
          </Link>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('live')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition ${
            activeTab === 'live'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-current" />
          <span>Live Tests ({liveTests.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('upcoming')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition ${
            activeTab === 'upcoming'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          <CalendarClock className="h-4 w-4" />
          <span>Upcoming Scheduled ({upcomingTests.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('completed')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition ${
            activeTab === 'completed'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileCheck2 className="h-4 w-4" />
          <span>Completed &amp; Attempted ({completedTests.length})</span>
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

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          <p className="mt-3 text-sm text-slate-600">Loading test series...</p>
        </div>
      ) : displayedList.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-6 w-6" />}
          title={
            activeTab === 'live'
              ? 'No Live Tests Running Right Now'
              : activeTab === 'upcoming'
              ? 'No Upcoming Scheduled Tests'
              : 'No Completed or Past Tests Yet'
          }
          description={`There are no ${activeTab} tests for ${profile?.exam} Class ${profile?.class_level}th at this moment.`}
          adminGuidance="Open /admin → Tests & Schedules, enter the test title, exam, class, start/end schedule in IST, duration, marks per question, and paste or upload a validated JSON question bank."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {displayedList.map((test) => {
            const status = getTestScheduleStatus(test, nowMs);
            const attempt = attemptsByTestId[test.id];
            const totalMarks =
              test.totalMarks || (test.totalQuestions ? test.totalQuestions * 4 : null);

            return (
              <div
                key={test.id}
                className="flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6"
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {status === 'live' && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                          <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
                          <span>LIVE</span>
                        </span>
                      )}
                      {status === 'upcoming' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                          <CalendarClock className="h-3.5 w-3.5" />
                          <span>UPCOMING</span>
                        </span>
                      )}
                      {status === 'completed' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                          <span>ENDED</span>
                        </span>
                      )}
                      {attempt && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>
                            Scored {attempt.score} / {attempt.max_score}
                          </span>
                        </span>
                      )}
                    </div>

                    {test.subject && (
                      <span className="rounded-lg bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                        {test.subject}
                      </span>
                    )}
                  </div>

                  <h2 className="mt-3 text-base sm:text-lg font-extrabold text-slate-900">
                    {test.title}
                  </h2>
                  {test.description && (
                    <p className="mt-1 text-xs sm:text-sm text-slate-600 line-clamp-2">
                      {test.description}
                    </p>
                  )}

                  {/* Metadata Badges */}
                  <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-3">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-indigo-600" />
                      <span>
                        <strong>{test.durationMinutes || 60}</strong> mins
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <HelpCircle className="h-4 w-4 text-indigo-600" />
                      <span>
                        <strong>{test.totalQuestions || 0}</strong> Questions
                      </span>
                    </div>
                    {totalMarks !== null && (
                      <div className="flex items-center gap-1.5">
                        <Trophy className="h-4 w-4 text-indigo-600" />
                        <span>
                          <strong>{totalMarks}</strong> Marks
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 space-y-1 text-xs text-slate-500">
                    {test.scheduledAt && (
                      <p>
                        Starts:{' '}
                        <span className="font-semibold text-slate-700">
                          {formatISTDateTime(test.scheduledAt)}
                        </span>
                      </p>
                    )}
                    {test.endsAt && (
                      <p>
                        Ends:{' '}
                        <span className="font-semibold text-slate-700">
                          {formatISTDateTime(test.endsAt)}
                        </span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
                  <Link
                    to={`/leaderboard?testId=${encodeURIComponent(test.id)}`}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <Trophy className="h-3.5 w-3.5 text-amber-500" />
                    <span>Leaderboard</span>
                  </Link>

                  <div className="flex items-center gap-2">
                    {attempt && (
                      <button
                        type="button"
                        onClick={() => navigate(`/tests/${test.id}?mode=result`)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3.5 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                      >
                        <span>Review Result &amp; Solutions</span>
                      </button>
                    )}

                    {status === 'live' && (
                      <button
                        type="button"
                        onClick={() => navigate(`/tests/${test.id}`)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700"
                      >
                        <span>{attempt ? 'Re-Attempt / Open' : 'Start Test'}</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
