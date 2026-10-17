import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eraser,
  HelpCircle,
  Send,
  Trophy,
  XCircle,
} from 'lucide-react';
import { useApp } from '../../app/AppContext';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { MathText } from '../../components/MathText';
import {
  ApiError,
  getSubmittedTestResult,
  getTestForAttempt,
  submitTestAttempt,
} from '../../lib/api';
import { formatCountdown, formatISTDateTime } from '../../lib/date';
import type {
  ExamAttempt,
  QuestionReviewItem,
  TestCardItem,
  TestMetadata,
  TestQuestion,
  TestResultSummary,
} from '../../types';

export const TestAttemptPage: React.FC = () => {
  const { testId } = useParams<{ testId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, content } = useApp();

  const initialMode = searchParams.get('mode') === 'result' ? 'result' : 'attempt';

  const [viewMode, setViewMode] = useState<'loading' | 'attempt' | 'result' | 'error'>(
    'loading'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [startsAtHint, setStartsAtHint] = useState<string | null>(null);

  const [testInfo, setTestInfo] = useState<TestCardItem | null>(null);
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [markedForReview, setMarkedForReview] = useState<Record<string, boolean>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number>(3600);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Official server result state
  const [attemptRecord, setAttemptRecord] = useState<ExamAttempt | null>(null);
  const [resultSummary, setResultSummary] = useState<TestResultSummary | null>(null);
  const [reviewItems, setReviewItems] = useState<QuestionReviewItem[]>([]);

  const draftStorageKey = useMemo(
    () => (user && testId ? `ec_test_draft_${user.uid}_${testId}` : null),
    [user, testId]
  );

  // Fallback sanitized question text from bootstrap content when viewing past result of an ended test
  const fallbackCatalogQuestions = useMemo(() => {
    if (!testId) return [];
    const item = content.find((c) => c.id === testId && c.kind === 'test');
    const meta = (item?.metadata || {}) as TestMetadata;
    return Array.isArray(meta.questions) ? meta.questions : [];
  }, [content, testId]);

  const loadExistingResult = useCallback(async () => {
    if (!testId) return false;
    try {
      const res = await getSubmittedTestResult(testId);
      setAttemptRecord(res.attempt);
      setResultSummary(res.result);
      setReviewItems(res.review || []);
      if (questions.length === 0 && fallbackCatalogQuestions.length > 0) {
        setQuestions(fallbackCatalogQuestions);
      }
      setViewMode('result');
      return true;
    } catch {
      return false;
    }
  }, [testId, questions.length, fallbackCatalogQuestions]);

  useEffect(() => {
    if (!testId) return;
    let active = true;

    async function init() {
      setViewMode('loading');
      setErrorMessage(null);
      setStartsAtHint(null);

      if (initialMode === 'result') {
        try {
          const [res, attemptData] = await Promise.all([
            getSubmittedTestResult(testId!),
            getTestForAttempt(testId!).catch(() => null),
          ]);
          if (!active) return;
          setAttemptRecord(res.attempt);
          setResultSummary(res.result);
          setReviewItems(res.review || []);
          if (attemptData) {
            setTestInfo(attemptData.test);
            setQuestions(attemptData.questions);
          } else if (fallbackCatalogQuestions.length > 0) {
            setQuestions(fallbackCatalogQuestions);
          }
          setViewMode('result');
          return;
        } catch {
          // If no result yet, fall through to attempt loading
        }
      }

      try {
        const data = await getTestForAttempt(testId!);
        if (!active) return;
        setTestInfo(data.test);
        setQuestions(data.questions || []);

        // Restore draft answers from localStorage if available
        if (draftStorageKey) {
          try {
            const rawDraft = localStorage.getItem(draftStorageKey);
            if (rawDraft) {
              const parsed = JSON.parse(rawDraft);
              if (parsed && typeof parsed.answers === 'object') {
                setAnswers(parsed.answers);
              }
            }
          } catch {
            // Ignore corrupt draft
          }
        }

        const durationSecs = Math.max(1, Number(data.test.durationMinutes || 60)) * 60;
        if (data.test.endsAt) {
          const untilEndSecs = Math.floor(
            (new Date(data.test.endsAt).getTime() - Date.now()) / 1000
          );
          setRemainingSeconds(
            untilEndSecs > 0 ? Math.min(durationSecs, untilEndSecs) : durationSecs
          );
        } else {
          setRemainingSeconds(durationSecs);
        }

        setViewMode('attempt');
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError) {
          if (err.status === 410) {
            // Test has ended -> check if student has a submitted result to review
            const hadResult = await loadExistingResult();
            if (hadResult) return;
          }
          if (err.data && typeof err.data.startsAt === 'string') {
            setStartsAtHint(err.data.startsAt);
          }
          setErrorMessage(err.message);
        } else {
          setErrorMessage(
            err instanceof Error ? err.message : 'Unable to load test.'
          );
        }
        setViewMode('error');
      }
    }

    init();
    return () => {
      active = false;
    };
  }, [testId, initialMode, draftStorageKey, fallbackCatalogQuestions, loadExistingResult]);

  // Autosave in-progress answers locally
  useEffect(() => {
    if (viewMode !== 'attempt' || !draftStorageKey) return;
    try {
      localStorage.setItem(
        draftStorageKey,
        JSON.stringify({
          answers,
          updatedAt: new Date().toISOString(),
        })
      );
    } catch {
      // Ignore quota errors
    }
  }, [answers, viewMode, draftStorageKey]);

  const handleFinalSubmit = useCallback(async () => {
    if (!testId || submitting) return;
    setSubmitting(true);
    setConfirmSubmitOpen(false);
    setErrorMessage(null);

    try {
      const res = await submitTestAttempt(testId, answers);
      if (draftStorageKey) {
        localStorage.removeItem(draftStorageKey);
      }
      setAttemptRecord(res.attempt);
      setResultSummary(res.result);
      setReviewItems(res.review || []);
      setViewMode('result');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Duplicate attempt or already submitted -> load existing result
        const loaded = await loadExistingResult();
        if (!loaded) {
          setErrorMessage(err.message);
        }
      } else {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Failed to submit test answers. Please try again.'
        );
      }
    } finally {
      setSubmitting(false);
    }
  }, [testId, submitting, answers, draftStorageKey, loadExistingResult]);

  const autoSubmitTriggered = useRef(false);

  // Countdown timer during attempt
  useEffect(() => {
    if (viewMode !== 'attempt') return;
    autoSubmitTriggered.current = false;

    const timer = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          if (!autoSubmitTriggered.current) {
            autoSubmitTriggered.current = true;
            handleFinalSubmit();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [viewMode, handleFinalSubmit]);

  if (viewMode === 'loading') {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-xs">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
        <p className="mt-4 text-sm font-semibold text-slate-700">
          Preparing your CBT examination environment...
        </p>
      </div>
    );
  }

  if (viewMode === 'error') {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-xl font-extrabold text-slate-900">
          {errorMessage || 'Test Unavailable'}
        </h1>
        {startsAtHint && (
          <p className="mt-2 text-sm text-slate-600">
            Scheduled Start Time:{' '}
            <strong className="text-indigo-700">
              {formatISTDateTime(startsAtHint)}
            </strong>
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/tests')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to All Tests</span>
          </button>
          {testId && (
            <Link
              to={`/leaderboard?testId=${encodeURIComponent(testId)}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <Trophy className="h-4 w-4 text-amber-500" />
              <span>View Test Leaderboard</span>
            </Link>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RESULT & EXPLANATION REVIEW SCREEN
  // ---------------------------------------------------------------------------
  if (viewMode === 'result' && resultSummary) {
    const attemptedCount = resultSummary.correct + resultSummary.incorrect;
    const accuracy =
      attemptedCount > 0
        ? Math.round((resultSummary.correct / attemptedCount) * 1000) / 10
        : 0;

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/tests"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Tests</span>
          </Link>

          {testId && (
            <Link
              to={`/leaderboard?testId=${encodeURIComponent(testId)}`}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700"
            >
              <Trophy className="h-4 w-4 text-amber-300" />
              <span>Open Official Test Leaderboard</span>
            </Link>
          )}
        </div>

        {/* Official Backend Score Summary Card */}
        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-900 p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Official Backend-Verified Score</span>
              </span>
              <h1 className="mt-2.5 text-2xl font-extrabold sm:text-3xl">
                {testInfo?.title || 'Test Result & Detailed Analysis'}
              </h1>
              {attemptRecord?.submitted_at && (
                <p className="mt-1 text-xs text-indigo-200">
                  Submitted on {formatISTDateTime(attemptRecord.submitted_at)}
                </p>
              )}
            </div>

            <div className="flex items-center gap-4 rounded-2xl bg-white/10 px-6 py-4 backdrop-blur-xs">
              <div>
                <span className="block text-xs uppercase tracking-wider text-indigo-200">
                  Total Score
                </span>
                <span className="text-3xl font-black text-white">
                  {resultSummary.score}{' '}
                  <span className="text-lg font-semibold text-indigo-200">
                    / {resultSummary.maxScore}
                  </span>
                </span>
              </div>
              <div className="h-10 w-px bg-white/20" />
              <div>
                <span className="block text-xs uppercase tracking-wider text-indigo-200">
                  Percentage
                </span>
                <span className="text-2xl font-extrabold text-amber-300">
                  {resultSummary.percentage}%
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-white/10 p-3.5">
              <span className="text-xs text-indigo-200">Correct Answers</span>
              <p className="mt-1 text-xl font-extrabold text-emerald-300">
                {resultSummary.correct}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 p-3.5">
              <span className="text-xs text-indigo-200">Incorrect Answers</span>
              <p className="mt-1 text-xl font-extrabold text-rose-300">
                {resultSummary.incorrect}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 p-3.5">
              <span className="text-xs text-indigo-200">Unanswered</span>
              <p className="mt-1 text-xl font-extrabold text-slate-200">
                {resultSummary.unanswered}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 p-3.5">
              <span className="text-xs text-indigo-200">Attempt Accuracy</span>
              <p className="mt-1 text-xl font-extrabold text-amber-300">
                {accuracy}%
              </p>
            </div>
          </div>
        </div>

        {/* Question-by-Question Solution & Explanation Review */}
        <div className="space-y-4">
          <h2 className="text-lg font-extrabold text-slate-900">
            Answer Key &amp; Step-by-Step Explanations ({reviewItems.length})
          </h2>

          {reviewItems.map((rev, idx) => {
            const qObj =
              questions.find((q) => String(q.id) === String(rev.questionId)) ||
              questions[idx];
            const isUnanswered =
              rev.answer === null || rev.answer === undefined || rev.answer === '';

            return (
              <div
                key={rev.questionId || idx}
                className={`rounded-3xl border bg-white p-5 shadow-2xs sm:p-6 ${
                  isUnanswered
                    ? 'border-slate-200'
                    : rev.isCorrect
                    ? 'border-emerald-200'
                    : 'border-rose-200'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-bold text-white">
                      Question {idx + 1}
                    </span>
                    {isUnanswered ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                        <HelpCircle className="h-3.5 w-3.5" />
                        <span>Unanswered (0 marks)</span>
                      </span>
                    ) : rev.isCorrect ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Correct (+{rev.marksAwarded} marks)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800">
                        <XCircle className="h-3.5 w-3.5" />
                        <span>Incorrect ({rev.marksAwarded} marks)</span>
                      </span>
                    )}
                  </div>

                  {qObj?.subject && (
                    <span className="text-xs font-semibold text-slate-500">
                      {qObj.subject}
                      {qObj.topic ? ` • ${qObj.topic}` : ''}
                    </span>
                  )}
                </div>

                {qObj ? (
                  <>
                    <div className="mt-4 text-sm sm:text-base font-semibold text-slate-900">
                      <MathText text={qObj.text} />
                    </div>

                    {qObj.imageUrl && (
                      <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-2 max-w-md">
                        <img
                          src={qObj.imageUrl}
                          alt={`Question ${idx + 1} figure`}
                          className="max-h-64 w-auto object-contain mx-auto"
                        />
                      </div>
                    )}

                    <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {(qObj.options || []).map((opt) => {
                        const isUserChoice =
                          String(rev.answer || '').toUpperCase() ===
                          String(opt.id).toUpperCase();
                        const isCorrectChoice =
                          String(rev.correctAnswer || '').toUpperCase() ===
                          String(opt.id).toUpperCase();

                        return (
                          <div
                            key={opt.id}
                            className={`flex items-start gap-3 rounded-2xl border p-3.5 text-xs sm:text-sm ${
                              isCorrectChoice
                                ? 'border-emerald-500 bg-emerald-50/70 text-emerald-950 font-semibold'
                                : isUserChoice
                                ? 'border-rose-400 bg-rose-50/70 text-rose-950 font-semibold'
                                : 'border-slate-200 bg-slate-50/50 text-slate-700'
                            }`}
                          >
                            <span
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                                isCorrectChoice
                                  ? 'bg-emerald-600 text-white'
                                  : isUserChoice
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {opt.id}
                            </span>
                            <div className="flex-1">
                              <MathText text={opt.text} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="mt-3 text-xs text-slate-600">
                    Your Answer: <strong>{rev.answer || 'Unanswered'}</strong> •
                    Correct Answer: <strong>{rev.correctAnswer}</strong>
                  </div>
                )}

                <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 text-xs sm:text-sm text-slate-800">
                  <div className="flex flex-wrap items-center gap-4 font-bold text-indigo-950">
                    <span>Your Answer: {rev.answer || 'Not Answered'}</span>
                    <span>•</span>
                    <span className="text-emerald-700">
                      Correct Option: {rev.correctAnswer}
                    </span>
                  </div>
                  {rev.explanation && (
                    <div className="mt-2 border-t border-indigo-100 pt-2 text-slate-700">
                      <span className="font-bold text-indigo-900">Explanation: </span>
                      <MathText text={rev.explanation} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // ACTIVE CBT TEST ATTEMPT INTERFACE
  // ---------------------------------------------------------------------------
  const currentQuestion = questions[currentIdx];
  const answeredCount = Object.keys(answers).filter(
    (k) => answers[k] !== undefined && answers[k] !== ''
  ).length;
  const unansweredCount = Math.max(0, questions.length - answeredCount);

  const selectOption = (qId: string, optionId: string) => {
    setAnswers((prev) => ({
      ...prev,
      [qId]: optionId,
    }));
  };

  const clearCurrentOption = (qId: string) => {
    setAnswers((prev) => {
      const copy = { ...prev };
      delete copy[qId];
      return copy;
    });
  };

  const toggleMarkReview = (qId: string) => {
    setMarkedForReview((prev) => ({
      ...prev,
      [qId]: !prev[qId],
    }));
  };

  return (
    <div className="space-y-5">
      {/* Top CBT Sticky Exam Bar */}
      <div className="sticky top-16 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-900 px-4 py-3 text-white shadow-lg sm:px-6">
        <div className="min-w-0">
          <h1 className="truncate text-sm sm:text-base font-extrabold">
            {testInfo?.title || 'Live Examination'}
          </h1>
          <p className="text-[11px] text-slate-300">
            Answered: <strong>{answeredCount}</strong> / {questions.length} • Autosaved
            locally
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 font-mono text-sm font-extrabold ${
              remainingSeconds < 300
                ? 'bg-rose-600 text-white animate-pulse'
                : 'bg-slate-800 text-amber-300'
            }`}
          >
            <Clock className="h-4 w-4" />
            <span>{formatCountdown(remainingSeconds)}</span>
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={() => setConfirmSubmitOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            <span>{submitting ? 'Submitting...' : 'Submit Test'}</span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700"
        >
          {errorMessage}
        </div>
      )}

      {questions.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-base font-bold text-slate-900">
            This test does not contain any questions yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: Active Question Card */}
          <div className="lg:col-span-8">
            {currentQuestion && (
              <div className="flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-xs sm:p-7 min-h-[420px]">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-2">
                      <span className="rounded-xl bg-indigo-600 px-3 py-1 text-xs font-extrabold text-white">
                        Question {currentIdx + 1} of {questions.length}
                      </span>
                      {currentQuestion.subject && (
                        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                          {currentQuestion.subject}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-emerald-700">
                        +{currentQuestion.marks ?? 4} Marks
                      </span>
                      <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-rose-700">
                        -{currentQuestion.negativeMarks ?? 1} Negative
                      </span>
                    </div>
                  </div>

                  {/* Question Statement with Math/LaTeX Support */}
                  <div className="mt-5 text-base sm:text-lg font-semibold text-slate-900">
                    <MathText text={currentQuestion.text} />
                  </div>

                  {currentQuestion.imageUrl && (
                    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-3 max-w-lg">
                      <img
                        src={currentQuestion.imageUrl}
                        alt={`Question ${currentIdx + 1}`}
                        className="max-h-72 w-auto object-contain mx-auto"
                      />
                    </div>
                  )}

                  {/* Options List */}
                  <div className="mt-6 space-y-3">
                    {(currentQuestion.options || []).map((opt) => {
                      const qKey = String(currentQuestion.id || currentIdx);
                      const selected = answers[qKey] === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => selectOption(qKey, opt.id)}
                          aria-pressed={selected}
                          className={`flex w-full items-start gap-3.5 rounded-2xl border-2 p-4 text-left transition ${
                            selected
                              ? 'border-indigo-600 bg-indigo-50/80 shadow-2xs'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold ${
                              selected
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {opt.id}
                          </span>
                          <div className="flex-1 text-sm sm:text-base font-medium text-slate-900">
                            <MathText text={opt.text} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Bottom Action Controls */}
                <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        clearCurrentOption(String(currentQuestion.id || currentIdx))
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <Eraser className="h-3.5 w-3.5" />
                      <span>Clear Response</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        toggleMarkReview(String(currentQuestion.id || currentIdx))
                      }
                      className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
                        markedForReview[String(currentQuestion.id || currentIdx)]
                          ? 'border-amber-400 bg-amber-50 text-amber-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Bookmark className="h-3.5 w-3.5" />
                      <span>
                        {markedForReview[String(currentQuestion.id || currentIdx)]
                          ? 'Marked for Review'
                          : 'Mark for Review'}
                      </span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={currentIdx === 0}
                      onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span>Previous</span>
                    </button>

                    {currentIdx < questions.length - 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))
                        }
                        className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
                      >
                        <span>Save &amp; Next</span>
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmSubmitOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span>Finish &amp; Submit</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right: Question Palette */}
          <div className="lg:col-span-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs">
              <h2 className="text-sm font-extrabold text-slate-900">
                Question Palette
              </h2>
              <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-semibold text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded bg-emerald-600" />
                  <span>Answered ({answeredCount})</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded bg-amber-500" />
                  <span>Review</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded bg-slate-200" />
                  <span>Unanswered ({unansweredCount})</span>
                </span>
              </div>

              <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-6 lg:grid-cols-5">
                {questions.map((q, idx) => {
                  const qKey = String(q.id || idx);
                  const isAnswered = Boolean(answers[qKey]);
                  const isMarked = Boolean(markedForReview[qKey]);
                  const isCurrent = idx === currentIdx;

                  return (
                    <button
                      key={qKey}
                      type="button"
                      onClick={() => setCurrentIdx(idx)}
                      className={`flex h-10 items-center justify-center rounded-xl text-xs font-extrabold transition ${
                        isCurrent ? 'ring-2 ring-indigo-600 ring-offset-2' : ''
                      } ${
                        isMarked
                          ? 'bg-amber-500 text-white'
                          : isAnswered
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setConfirmSubmitOpen(true)}
                disabled={submitting}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                <span>Submit Final Test</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmSubmitOpen}
        title="Submit Final Test Attempt?"
        message={`You have answered ${answeredCount} out of ${questions.length} questions (${unansweredCount} unanswered). Once submitted, your answers will be scored officially on the server.`}
        confirmLabel="Yes, Submit Test Now"
        cancelLabel="Continue Attempting"
        loading={submitting}
        onConfirm={handleFinalSubmit}
        onCancel={() => setConfirmSubmitOpen(false)}
      />
    </div>
  );
};
