import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Layers,
  Megaphone,
  PlayCircle,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react';
import { useApp } from '../../app/AppContext';
import { EmptyState } from '../../components/EmptyState';
import {
  formatISTDateTime,
  getTestScheduleStatus,
  isScheduleActiveNow,
} from '../../lib/date';
import { isValidInternalDeepLink, matchesStudentExamAndClass } from '../../lib/validation';
import type {
  BatchMetadata,
  CourseCatalogItem,
  EventBannerImage,
  EventMetadata,
  GoalMetadata,
  LectureMetadata,
  TestMetadata,
} from '../../types';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const {
    user,
    profile,
    content,
    announcements,
    broadcasts,
    isEnrolled,
    bootstrapLoading,
  } = useApp();

  const [bannerIndex, setBannerIndex] = useState(0);
  const [completedGoalIds, setCompletedGoalIds] = useState<Record<string, boolean>>({});

  // Load local daily goal checkmark status for the student (UI helper on top of server goals)
  useEffect(() => {
    if (!user) return;
    try {
      const todayKey = new Date().toLocaleDateString('en-CA', {
        timeZone: 'Asia/Kolkata',
      });
      const raw = localStorage.getItem(`ec_goals_done_${user.uid}_${todayKey}`);
      if (raw) {
        setCompletedGoalIds(JSON.parse(raw));
      } else {
        setCompletedGoalIds({});
      }
    } catch {
      setCompletedGoalIds({});
    }
  }, [user]);

  const toggleGoalDone = (goalId: string) => {
    if (!user) return;
    const todayKey = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Kolkata',
    });
    setCompletedGoalIds((prev) => {
      const next = { ...prev, [goalId]: !prev[goalId] };
      try {
        localStorage.setItem(
          `ec_goals_done_${user.uid}_${todayKey}`,
          JSON.stringify(next)
        );
      } catch {
        // Ignore storage quota issues
      }
      return next;
    });
  };

  const nowMs = Date.now();

  // Filter content strictly by student's exam and class
  const targetedContent = useMemo(() => {
    if (!profile) return [];
    return content.filter(
      (item) =>
        item.active !== false &&
        matchesStudentExamAndClass(item, profile.exam, profile.class_level)
    );
  }, [content, profile]);

  // Active Goals within schedule window (startsAt <= now <= endsAt)
  const activeGoals = useMemo(() => {
    return (
      targetedContent.filter((item) => {
        if (item.kind !== 'goal') return false;
        const meta = (item.metadata || {}) as GoalMetadata;
        const startsAt = meta.startsAt || (meta as { starts_at?: string }).starts_at;
        const endsAt = meta.endsAt || (meta as { ends_at?: string }).ends_at;
        return isScheduleActiveNow(startsAt, endsAt, nowMs);
      }) as CourseCatalogItem<GoalMetadata>[]
    ).sort((a, b) => Number(b.metadata?.priority || 0) - Number(a.metadata?.priority || 0));
  }, [targetedContent, nowMs]);

  // Active Event Banners within schedule window
  const bannerSlides = useMemo(() => {
    const events = targetedContent.filter((item) => {
      if (item.kind !== 'event') return false;
      const meta = (item.metadata || {}) as EventMetadata;
      const startsAt = meta.startsAt || (meta as { starts_at?: string }).starts_at;
      const endsAt = meta.endsAt || (meta as { ends_at?: string }).ends_at;
      return isScheduleActiveNow(startsAt, endsAt, nowMs);
    }) as CourseCatalogItem<EventMetadata>[];

    const slides: Array<{
      eventId: string;
      title: string;
      description: string;
      imageUrl: string;
      caption?: string;
      deepLink?: string | null;
      ctaLabel?: string;
      endsAt?: string | null;
    }> = [];

    for (const ev of events) {
      const meta = ev.metadata || {};
      const imgs: EventBannerImage[] = Array.isArray(meta.images) ? meta.images : [];
      if (imgs.length > 0) {
        imgs.forEach((img) => {
          if (img && img.url) {
            const candidateLink = img.deepLink || meta.deepLink || null;
            slides.push({
              eventId: ev.id,
              title: ev.title,
              description: img.caption || ev.description,
              imageUrl: img.url,
              caption: img.caption,
              deepLink:
                candidateLink && isValidInternalDeepLink(candidateLink)
                  ? candidateLink
                  : null,
              ctaLabel: meta.ctaLabel || 'Explore Now',
              endsAt: meta.endsAt || null,
            });
          }
        });
      } else if (meta.thumbnailUrl) {
        slides.push({
          eventId: ev.id,
          title: ev.title,
          description: ev.description,
          imageUrl: meta.thumbnailUrl,
          deepLink:
            meta.deepLink && isValidInternalDeepLink(meta.deepLink)
              ? meta.deepLink
              : null,
          ctaLabel: meta.ctaLabel || 'Explore Now',
          endsAt: meta.endsAt || null,
        });
      }
    }

    return slides;
  }, [targetedContent, nowMs]);

  // Live & Upcoming Tests
  const { liveTests, upcomingTests } = useMemo(() => {
    const tests = targetedContent.filter(
      (item) => item.kind === 'test'
    ) as CourseCatalogItem<TestMetadata>[];

    const live: CourseCatalogItem<TestMetadata>[] = [];
    const upcoming: CourseCatalogItem<TestMetadata>[] = [];

    for (const t of tests) {
      const meta = t.metadata || {};
      const status = getTestScheduleStatus(
        {
          scheduledAt: meta.scheduledAt || (meta as { scheduled_at?: string }).scheduled_at,
          endsAt: meta.endsAt || (meta as { ends_at?: string }).ends_at,
          isLive: meta.isLive,
        },
        nowMs
      );
      if (status === 'live') live.push(t);
      else if (status === 'upcoming') upcoming.push(t);
    }

    return { liveTests: live, upcomingTests: upcoming };
  }, [targetedContent, nowMs]);

  // Enrolled Batches & Recent Lectures
  const enrolledBatches = useMemo(() => {
    return (
      targetedContent.filter(
        (item) => item.kind === 'batch' && isEnrolled('batch', item.id)
      ) as CourseCatalogItem<BatchMetadata>[]
    ).slice(0, 4);
  }, [targetedContent, isEnrolled]);

  const recentLectures = useMemo(() => {
    return (
      targetedContent.filter(
        (item) => item.kind === 'lecture'
      ) as CourseCatalogItem<LectureMetadata>[]
    ).slice(0, 6);
  }, [targetedContent]);

  const visibleBroadcasts = useMemo(() => {
    if (!profile) return [];
    return broadcasts.filter((b) =>
      matchesStudentExamAndClass(
        { exam: b.exam, classes: b.classes },
        profile.exam,
        profile.class_level
      )
    );
  }, [broadcasts, profile]);

  const currentSlide =
    bannerSlides.length > 0 ? bannerSlides[bannerIndex % bannerSlides.length] : null;

  return (
    <div className="space-y-7">
      {/* Greeting Banner */}
      <div className="flex flex-col justify-between gap-4 rounded-3xl bg-gradient-to-r from-indigo-900 via-indigo-800 to-violet-900 p-6 text-white shadow-lg sm:flex-row sm:items-center sm:p-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-amber-300">
            <Flame className="h-3.5 w-3.5" />
            <span>
              {profile?.exam} • Class {profile?.class_level}th Track
            </span>
          </div>
          <h1 className="mt-2.5 text-2xl font-extrabold tracking-tight sm:text-3xl">
            Welcome back, {profile?.display_name || 'Aspirant'}!
          </h1>
          <p className="mt-1 text-sm text-indigo-100">
            All schedules and live tests are displayed in India Standard Time (Asia/Kolkata).
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <Link
            to="/lectures"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs sm:text-sm font-bold text-indigo-900 shadow-xs transition hover:bg-indigo-50"
          >
            <BookOpen className="h-4 w-4 text-indigo-600" />
            <span>Explore Batches &amp; Lectures</span>
          </Link>
          <Link
            to="/tests"
            className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-xs sm:text-sm font-bold text-white transition hover:bg-white/20"
          >
            <Trophy className="h-4 w-4 text-amber-300" />
            <span>Mock Tests</span>
          </Link>
        </div>
      </div>

      {/* Prominent "+ Today's Goal" Section / Card at Top */}
      <section aria-labelledby="todays-goal-heading">
        <div className="overflow-hidden rounded-3xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm">
                <Target className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-lg bg-indigo-600 px-2.5 py-0.5 text-xs font-extrabold tracking-wide text-white">
                    + Today&apos;s Goal
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    {profile?.exam} Class {profile?.class_level}th
                  </span>
                </div>
                <h2
                  id="todays-goal-heading"
                  className="mt-1 text-base font-extrabold text-slate-900 sm:text-lg"
                >
                  Daily Study Milestones &amp; Targets
                </h2>
              </div>
            </div>

            {activeGoals.length > 0 && (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                {activeGoals.filter((g) => completedGoalIds[g.id]).length} /{' '}
                {activeGoals.length} Completed Today
              </span>
            )}
          </div>

          {activeGoals.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-indigo-200 bg-white/80 p-5 text-sm text-slate-600">
              <p className="font-semibold text-slate-800">
                No active goals scheduled for your {profile?.exam} Class{' '}
                {profile?.class_level}th track right now.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Administrators can add and schedule daily goals from the{' '}
                <span className="font-semibold text-indigo-700">
                  Admin Panel (/admin → Today&apos;s Goals)
                </span>{' '}
                with start/end windows and exam/class targeting. Goals scheduled for the future will automatically appear here once their start time arrives.
              </p>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {activeGoals.map((goal) => {
                const meta = goal.metadata || {};
                const done = Boolean(completedGoalIds[goal.id]);
                const displayText = meta.displayText || goal.description || goal.title;
                const safeLink =
                  meta.deepLink && isValidInternalDeepLink(meta.deepLink)
                    ? meta.deepLink
                    : null;

                return (
                  <div
                    key={goal.id}
                    className={`flex flex-col justify-between rounded-2xl border p-4 transition ${
                      done
                        ? 'border-emerald-200 bg-emerald-50/60'
                        : 'border-indigo-100 bg-white shadow-2xs hover:border-indigo-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => toggleGoalDone(goal.id)}
                          className="flex items-start gap-2.5 text-left"
                        >
                          <div
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                              done
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : 'border-slate-300 bg-white hover:border-indigo-500'
                            }`}
                          >
                            {done && <CheckCircle2 className="h-3.5 w-3.5" />}
                          </div>
                          <div>
                            <h3
                              className={`text-sm font-bold ${
                                done
                                  ? 'line-through text-slate-500'
                                  : 'text-slate-900'
                              }`}
                            >
                              {goal.title}
                            </h3>
                            <p className="mt-1 text-xs leading-relaxed text-slate-600 break-words">
                              {displayText}
                            </p>
                          </div>
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
                      <span>
                        {meta.endsAt
                          ? `Ends: ${formatISTDateTime(meta.endsAt)}`
                          : 'Active today (IST)'}
                      </span>
                      {safeLink && (
                        <button
                          type="button"
                          onClick={() => navigate(safeLink)}
                          className="inline-flex items-center gap-1 font-bold text-indigo-600 hover:text-indigo-800"
                        >
                          <span>{meta.ctaLabel || 'Start Now'}</span>
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Event / Banner Carousel */}
      {currentSlide && (
        <section aria-label="Featured events and banners">
          <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-900 shadow-md">
            <div className="aspect-[16/7] min-h-[200px] w-full relative">
              <img
                src={currentSlide.imageUrl}
                alt={currentSlide.title}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-7 text-white">
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600/90 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider">
                  <Sparkles className="h-3 w-3" />
                  <span>Featured Event</span>
                </span>
                <h2 className="mt-2 text-lg font-extrabold sm:text-2xl">
                  {currentSlide.title}
                </h2>
                {currentSlide.description && (
                  <p className="mt-1 max-w-2xl text-xs sm:text-sm text-slate-200 line-clamp-2">
                    {currentSlide.description}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {currentSlide.deepLink && (
                    <button
                      type="button"
                      onClick={() => navigate(currentSlide.deepLink!)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-bold text-slate-900 shadow-xs hover:bg-indigo-50"
                    >
                      <span>{currentSlide.ctaLabel || 'Open Destination'}</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {currentSlide.endsAt && (
                    <span className="text-[11px] text-slate-300">
                      Valid till {formatISTDateTime(currentSlide.endsAt)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {bannerSlides.length > 1 && (
              <div className="absolute right-4 top-4 flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Previous banner"
                  onClick={() =>
                    setBannerIndex(
                      (prev) => (prev - 1 + bannerSlides.length) % bannerSlides.length
                    )
                  }
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/70 text-white hover:bg-slate-900"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="rounded-full bg-slate-900/70 px-2.5 py-1 text-[11px] font-bold text-white">
                  {(bannerIndex % bannerSlides.length) + 1} / {bannerSlides.length}
                </span>
                <button
                  type="button"
                  aria-label="Next banner"
                  onClick={() =>
                    setBannerIndex((prev) => (prev + 1) % bannerSlides.length)
                  }
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/70 text-white hover:bg-slate-900"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Live & Upcoming Scheduled Tests */}
      <section aria-labelledby="home-tests-heading" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="home-tests-heading" className="text-lg font-extrabold text-slate-900">
              Live &amp; Upcoming Tests
            </h2>
            <p className="text-xs text-slate-500">
              Official CBT mock tests for {profile?.exam} Class {profile?.class_level}th
            </p>
          </div>
          <Link
            to="/tests"
            className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800"
          >
            <span>All Tests</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {liveTests.length === 0 && upcomingTests.length === 0 ? (
          <EmptyState
            icon={<Trophy className="h-6 w-6" />}
            title="No Live or Upcoming Tests Right Now"
            description={`There are currently no active or upcoming tests scheduled for ${profile?.exam} Class ${profile?.class_level}th.`}
            adminGuidance="Open /admin → Tests & Schedules, fill in test metadata, paste or upload a validated JSON question bank, and save with kind=test."
            actionLabel="Browse Past Tests"
            onAction={() => navigate('/tests')}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {liveTests.map((test) => {
              const meta = test.metadata || {};
              const qCount = Array.isArray(meta.questions)
                ? meta.questions.length
                : Number(meta.totalQuestions || 0);
              return (
                <div
                  key={test.id}
                  className="flex flex-col justify-between rounded-2xl border-2 border-emerald-200 bg-white p-5 shadow-xs"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                        <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
                        <span>LIVE NOW</span>
                      </span>
                      {meta.subject && (
                        <span className="text-xs font-semibold text-slate-500">
                          {meta.subject}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-2.5 text-base font-bold text-slate-900">
                      {test.title}
                    </h3>
                    {test.description && (
                      <p className="mt-1 text-xs text-slate-600 line-clamp-2">
                        {test.description}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-indigo-600" />
                        <span>{meta.durationMinutes || 60} mins</span>
                      </span>
                      <span>• {qCount} Questions</span>
                      {meta.endsAt && (
                        <span>• Ends {formatISTDateTime(meta.endsAt)}</span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                    <Link
                      to={`/leaderboard?testId=${encodeURIComponent(test.id)}`}
                      className="text-xs font-semibold text-slate-600 hover:text-indigo-600"
                    >
                      Leaderboard
                    </Link>
                    <Link
                      to={`/tests/${test.id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700"
                    >
                      <span>Attempt Live Test</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}

            {upcomingTests.map((test) => {
              const meta = test.metadata || {};
              const qCount = Array.isArray(meta.questions)
                ? meta.questions.length
                : Number(meta.totalQuestions || 0);
              return (
                <div
                  key={test.id}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                        <CalendarClock className="h-3.5 w-3.5" />
                        <span>UPCOMING</span>
                      </span>
                      {meta.subject && (
                        <span className="text-xs font-semibold text-slate-500">
                          {meta.subject}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-2.5 text-base font-bold text-slate-900">
                      {test.title}
                    </h3>
                    <p className="mt-1 text-xs text-slate-600">
                      Starts: <strong className="text-slate-800">{formatISTDateTime(meta.scheduledAt)}</strong>
                    </p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                      <span>{meta.durationMinutes || 60} mins</span>
                      <span>• {qCount} Questions</span>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-end border-t border-slate-100 pt-3">
                    <Link
                      to="/tests"
                      className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800"
                    >
                      <span>View Schedule</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Enrolled Batches & Recent Lectures Continuation */}
      <section aria-labelledby="home-learning-heading" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="home-learning-heading" className="text-lg font-extrabold text-slate-900">
              Continue Learning
            </h2>
            <p className="text-xs text-slate-500">
              Your enrolled batches and recent video lectures
            </p>
          </div>
          <Link
            to="/lectures"
            className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800"
          >
            <span>Open Lectures Hub</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {enrolledBatches.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {enrolledBatches.map((batch) => {
              const meta = batch.metadata || {};
              return (
                <Link
                  key={batch.id}
                  to={`/batches/${batch.id}`}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs transition hover:border-indigo-300 hover:shadow-md"
                >
                  <div className="aspect-video w-full overflow-hidden bg-slate-100 relative">
                    {meta.thumbnailUrl ? (
                      <img
                        src={meta.thumbnailUrl}
                        alt={batch.title}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-600 to-violet-700 text-white">
                        <Layers className="h-8 w-8 opacity-80" />
                      </div>
                    )}
                    <span className="absolute left-2.5 top-2.5 rounded-lg bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                      Enrolled
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col justify-between p-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 line-clamp-1">
                        {batch.title}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                        {batch.description || 'Tap to continue watching batch lectures'}
                      </p>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs font-semibold text-indigo-600">
                      <span>Continue Batch</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {recentLectures.length === 0 && enrolledBatches.length === 0 ? (
          !bootstrapLoading && (
            <EmptyState
              icon={<PlayCircle className="h-6 w-6" />}
              title="No Enrolled Batches or Lectures Yet"
              description={`Enroll in an active ${profile?.exam} Class ${profile?.class_level}th batch from the Lectures tab to start watching lessons.`}
              adminGuidance="In /admin → Batches and /admin → Lectures, create a batch for JEE/NEET Class 11/12 and attach single YouTube videos or imported public playlists."
              actionLabel="Browse Batches"
              onAction={() => navigate('/lectures')}
            />
          )
        ) : (
          recentLectures.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recentLectures.map((lecture) => {
                const meta = lecture.metadata || {};
                return (
                  <Link
                    key={lecture.id}
                    to={`/lectures/watch/${lecture.id}`}
                    className="group flex items-center gap-3.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs transition hover:border-indigo-300 hover:shadow-md"
                  >
                    <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-xl bg-slate-900">
                      {meta.thumbnailUrl ? (
                        <img
                          src={meta.thumbnailUrl}
                          alt={lecture.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-indigo-900 text-white">
                          <PlayCircle className="h-7 w-7" />
                        </div>
                      )}
                      {meta.duration && (
                        <span className="absolute bottom-1 right-1 rounded bg-slate-950/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {meta.duration}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {meta.lesson && (
                        <span className="block truncate text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                          {meta.lesson}
                        </span>
                      )}
                      <h3 className="mt-0.5 line-clamp-2 text-sm font-bold text-slate-900 group-hover:text-indigo-600">
                        {lecture.title}
                      </h3>
                      <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                        <PlayCircle className="h-3.5 w-3.5 text-indigo-600" />
                        <span>Watch Lesson</span>
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )
        )}
      </section>

      {/* Relevant Announcements & Broadcasts */}
      <section aria-labelledby="home-announcements-heading" className="space-y-3">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-indigo-600" />
          <h2 id="home-announcements-heading" className="text-lg font-extrabold text-slate-900">
            Announcements &amp; Academic Notices
          </h2>
        </div>

        {announcements.length === 0 && visibleBroadcasts.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500">
            No active announcements for {profile?.exam} Class {profile?.class_level}th at this time. Administrators can post notices from{' '}
            <span className="font-semibold text-slate-700">/admin → Announcements</span>.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {visibleBroadcasts.map((b) => (
              <div
                key={`b-${b.id}`}
                className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-md bg-amber-200/80 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                    Live Broadcast
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {formatISTDateTime(b.createdAt)}
                  </span>
                </div>
                <h3 className="mt-2 text-sm font-bold text-slate-900">{b.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-700 break-words">
                  {b.body}
                </p>
              </div>
            ))}

            {announcements.map((a) => (
              <div
                key={a.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-700">
                    {a.audience || 'All Students'}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {formatISTDateTime(a.scheduled_at || a.created_at)}
                  </span>
                </div>
                <h3 className="mt-2 text-sm font-bold text-slate-900">{a.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 break-words">
                  {a.body}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
