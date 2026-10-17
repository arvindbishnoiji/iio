import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  Maximize2,
  Play,
  PlayCircle,
} from 'lucide-react';
import { useApp } from '../../app/AppContext';
import { PdfViewerModal, openSafeExternalPdf } from '../../components/PdfViewerModal';
import {
  getCatalogContent,
  getStudentAnalysis,
  saveLessonProgress,
} from '../../lib/api';
import { formatWatchDuration } from '../../lib/date';
import {
  extractYoutubeVideoId,
  getYoutubeEmbedUrl,
  getYoutubeWatchUrl,
} from '../../lib/mediaProxy';
import { isSafeHttpUrl } from '../../lib/validation';
import type {
  CourseCatalogItem,
  LectureMetadata,
  ResourceMetadata,
} from '../../types';

export const LecturePlayerPage: React.FC = () => {
  const { lectureId } = useParams<{ lectureId: string }>();
  const navigate = useNavigate();
  const { content } = useApp();

  const [siblingLectures, setSiblingLectures] = useState<
    CourseCatalogItem<LectureMetadata>[]
  >([]);
  const [relatedResources, setRelatedResources] = useState<
    CourseCatalogItem<ResourceMetadata>[]
  >([]);

  const [watchedSeconds, setWatchedSeconds] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [isPlayingSession, setIsPlayingSession] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [activePdf, setActivePdf] = useState<{
    title: string;
    pdfUrl: string;
  } | null>(null);

  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const watchedRef = useRef(0);
  const completedRef = useRef(false);

  const lecture = useMemo(() => {
    const fromBootstrap = content.find(
      (c) => c.id === lectureId && c.kind === 'lecture'
    ) as CourseCatalogItem<LectureMetadata> | undefined;
    if (fromBootstrap) return fromBootstrap;
    return siblingLectures.find((c) => c.id === lectureId);
  }, [content, siblingLectures, lectureId]);

  const meta = (lecture?.metadata || {}) as LectureMetadata;
  const parentId = String(meta.parentId || '');
  const parentItem = useMemo(
    () => content.find((c) => c.id === parentId),
    [content, parentId]
  );

  const videoId = useMemo(
    () => extractYoutubeVideoId(meta.videoId || meta.youtubeUrl || ''),
    [meta.videoId, meta.youtubeUrl]
  );

  // Load saved progress for this lecture from GET /analysis
  useEffect(() => {
    if (!lectureId) return;
    let active = true;
    setWatchedSeconds(0);
    setCompleted(false);
    setIsPlayingSession(false);
    watchedRef.current = 0;
    completedRef.current = false;

    getStudentAnalysis()
      .then((analysis) => {
        if (!active) return;
        const found = (analysis.lessonProgress || []).find(
          (p) => p.lecture_id === lectureId
        );
        if (found) {
          const secs = Number(found.watched_seconds || 0);
          const done = Boolean(found.completed);
          setWatchedSeconds(secs);
          setCompleted(done);
          watchedRef.current = secs;
          completedRef.current = done;
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [lectureId]);

  // Load sibling lectures and PDFs from parent batch/series
  useEffect(() => {
    if (parentId) {
      Promise.all([
        getCatalogContent({ kind: 'lecture', parentId }),
        getCatalogContent({ kind: 'resource', parentId }),
      ])
        .then(([lecs, resList]) => {
          setSiblingLectures(
            (lecs as CourseCatalogItem<LectureMetadata>[]).sort(
              (a, b) =>
                Number(a.metadata?.position || 0) - Number(b.metadata?.position || 0)
            )
          );
          setRelatedResources(resList as CourseCatalogItem<ResourceMetadata>[]);
        })
        .catch(() => {});
    } else {
      const allLecs = (
        content.filter((c) => c.kind === 'lecture') as CourseCatalogItem<LectureMetadata>[]
      ).sort(
        (a, b) => Number(a.metadata?.position || 0) - Number(b.metadata?.position || 0)
      );
      setSiblingLectures(allLecs);
      setRelatedResources(
        content.filter(
          (c) => c.kind === 'resource'
        ) as CourseCatalogItem<ResourceMetadata>[]
      );
    }
  }, [parentId, content]);

  const syncProgressToServer = useCallback(
    async (secs: number, isDone: boolean) => {
      if (!lectureId) return;
      setSavingProgress(true);
      try {
        const saved = await saveLessonProgress({
          lectureId,
          watchedSeconds: secs,
          completed: isDone,
        });
        setWatchedSeconds(saved.watched_seconds);
        setCompleted(saved.completed);
        watchedRef.current = saved.watched_seconds;
        completedRef.current = saved.completed;
        setLastSyncedAt(new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }));
      } catch {
        // Ignore transient network error during background progress ping
      } finally {
        setSavingProgress(false);
      }
    },
    [lectureId]
  );

  // Increment watch timer locally and persist to POST /progress every 15 seconds (never every second)
  useEffect(() => {
    if (!isPlayingSession || !lectureId) return;

    const tickInterval = window.setInterval(() => {
      setWatchedSeconds((prev) => {
        const next = prev + 1;
        watchedRef.current = next;
        return next;
      });
    }, 1000);

    const syncInterval = window.setInterval(() => {
      syncProgressToServer(watchedRef.current, completedRef.current);
    }, 15000);

    return () => {
      window.clearInterval(tickInterval);
      window.clearInterval(syncInterval);
      if (watchedRef.current > 0) {
        saveLessonProgress({
          lectureId,
          watchedSeconds: watchedRef.current,
          completed: completedRef.current,
        }).catch(() => {});
      }
    };
  }, [isPlayingSession, lectureId, syncProgressToServer]);

  const handleMarkCompleted = async () => {
    const nextDone = true;
    const nextSecs = Math.max(watchedRef.current, 60);
    setCompleted(nextDone);
    completedRef.current = nextDone;
    await syncProgressToServer(nextSecs, nextDone);
  };

  const handleFullscreen = () => {
    const el = playerContainerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    }
  };

  const currentIndex = useMemo(
    () => siblingLectures.findIndex((l) => l.id === lectureId),
    [siblingLectures, lectureId]
  );
  const prevLecture =
    currentIndex > 0 ? siblingLectures[currentIndex - 1] : null;
  const nextLecture =
    currentIndex >= 0 && currentIndex < siblingLectures.length - 1
      ? siblingLectures[currentIndex + 1]
      : null;

  if (!lecture) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xs">
        <h2 className="text-lg font-bold text-slate-900">Lecture Not Found</h2>
        <p className="mt-1 text-sm text-slate-600">
          Make sure you are enrolled in the parent batch or series for this lesson.
        </p>
        <Link
          to="/lectures"
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Lectures Hub</span>
        </Link>
      </div>
    );
  }

  const embedUrl = videoId
    ? `${getYoutubeEmbedUrl(videoId)}${
        watchedSeconds > 5 ? `&start=${Math.floor(watchedSeconds)}` : ''
      }${isPlayingSession ? '&autoplay=1' : ''}`
    : '';

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              parentItem
                ? navigate(
                    parentItem.kind === 'series'
                      ? `/series/${parentItem.id}`
                      : `/batches/${parentItem.id}`
                  )
                : navigate('/lectures?tab=lectures')
            }
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>
              {parentItem ? `Back to ${parentItem.title}` : 'All Lectures'}
            </span>
          </button>

          {meta.lesson && (
            <span className="rounded-lg bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
              {meta.lesson}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Clock className="h-3.5 w-3.5 text-indigo-600" />
          <span>Watched: {formatWatchDuration(watchedSeconds)}</span>
          {lastSyncedAt && (
            <span className="hidden sm:inline text-slate-400">
              • Synced at {lastSyncedAt}
            </span>
          )}
        </div>
      </div>

      {/* Main Player + Upcoming Playlist Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Video Player & Controls */}
        <div className="lg:col-span-8 space-y-4">
          <div
            ref={playerContainerRef}
            className="overflow-hidden rounded-3xl bg-slate-950 shadow-xl ring-1 ring-slate-800"
          >
            <div className="relative aspect-video w-full bg-slate-950">
              {!videoId ? (
                <div className="flex h-full flex-col items-center justify-center p-6 text-center text-white">
                  <PlayCircle className="h-12 w-12 text-slate-500" />
                  <p className="mt-3 text-base font-bold">
                    Video ID Unavailable for This Lesson
                  </p>
                  <p className="mt-1 max-w-md text-xs text-slate-400">
                    The administrator can update this lecture&apos;s YouTube link in /admin → Lectures.
                  </p>
                </div>
              ) : (
                <>
                  <iframe
                    src={embedUrl}
                    title={lecture.title}
                    className="h-full w-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                    allowFullScreen
                  />
                  {!isPlayingSession && (
                    <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-center justify-between rounded-xl bg-slate-900/90 px-3.5 py-2 text-xs text-slate-200 backdrop-blur-xs">
                      <span>
                        {watchedSeconds > 5
                          ? `Resuming from ${formatWatchDuration(watchedSeconds)}. Tap Start Tracking or press Play inside the video.`
                          : 'Browsers may block unmuted autoplay. Press Play in the video player if playback does not start automatically.'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsPlayingSession(true)}
                        className="pointer-events-auto ml-3 inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500"
                      >
                        <Play className="h-3.5 w-3.5" />
                        <span>Play &amp; Track Progress</span>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Lecture Details & Action Bar */}
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
                    {lecture.exam} • Class {lecture.classes.join('/')}
                  </span>
                  {parentItem && (
                    <span className="text-xs font-semibold text-slate-500">
                      {parentItem.title}
                    </span>
                  )}
                </div>
                <h1 className="mt-2 text-lg sm:text-xl font-extrabold text-slate-900">
                  {lecture.title}
                </h1>
                {lecture.description && (
                  <p className="mt-2 text-xs sm:text-sm leading-relaxed text-slate-600 whitespace-pre-line">
                    {lecture.description}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsPlayingSession((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                    isPlayingSession
                      ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                      : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                  }`}
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>
                    {isPlayingSession ? 'Pause Watch Timer' : 'Start Watch Timer'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleMarkCompleted}
                  disabled={savingProgress}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
                    completed
                      ? 'bg-emerald-600 text-white'
                      : 'border border-emerald-600 bg-white text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{completed ? 'Completed' : 'Mark Completed'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleFullscreen}
                  title="Toggle Fullscreen"
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Fullscreen</span>
                </button>

                {videoId && (
                  <button
                    type="button"
                    onClick={() => openSafeExternalPdf(getYoutubeWatchUrl(videoId))}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    title="Open on YouTube if embedded playback is restricted"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">YouTube</span>
                  </button>
                )}
              </div>
            </div>

            {/* Previous / Next Navigation + Lecture Notes */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!prevLecture}
                  onClick={() =>
                    prevLecture && navigate(`/lectures/watch/${prevLecture.id}`)
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Previous Lesson</span>
                </button>
                <button
                  type="button"
                  disabled={!nextLecture}
                  onClick={() =>
                    nextLecture && navigate(`/lectures/watch/${nextLecture.id}`)
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-40"
                >
                  <span>Next Lesson</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {meta.notesPdfUrl && isSafeHttpUrl(meta.notesPdfUrl) && (
                <button
                  type="button"
                  onClick={() =>
                    setActivePdf({
                      title: `${lecture.title} — Lecture Notes`,
                      pdfUrl: meta.notesPdfUrl!,
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                >
                  <FileText className="h-4 w-4" />
                  <span>Open Lecture Notes (PDF)</span>
                </button>
              )}
            </div>
          </div>

          {/* Related PDFs from Parent Batch/Series */}
          {relatedResources.length > 0 && (
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-500">
                Related PDFs &amp; Study Material
              </h2>
              <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {relatedResources.map((resItem) => {
                  const rMeta = resItem.metadata || {};
                  const pdfUrl = String(rMeta.pdfUrl || '');
                  return (
                    <div
                      key={resItem.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-3"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 shrink-0 text-indigo-600" />
                        <span className="truncate text-xs font-bold text-slate-800">
                          {resItem.title}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={!isSafeHttpUrl(pdfUrl)}
                        onClick={() =>
                          setActivePdf({ title: resItem.title, pdfUrl })
                        }
                        className="shrink-0 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                      >
                        Open PDF
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Scrollable Upcoming / Playlist Lesson List */}
        <div className="lg:col-span-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-extrabold text-slate-900">
                  Course Lessons
                </h2>
                <p className="text-xs text-slate-500">
                  {siblingLectures.length} lesson
                  {siblingLectures.length === 1 ? '' : 's'} in playlist
                </p>
              </div>
            </div>

            <div className="mt-3 max-h-[540px] overflow-y-auto space-y-2 pr-1">
              {siblingLectures.map((item, idx) => {
                const iMeta = item.metadata || {};
                const isCurrent = item.id === lecture.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(`/lectures/watch/${item.id}`)}
                    className={`flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition ${
                      isCurrent
                        ? 'border-indigo-600 bg-indigo-50/80'
                        : 'border-slate-100 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold ${
                        isCurrent
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {iMeta.position || idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`line-clamp-2 text-xs font-bold ${
                          isCurrent ? 'text-indigo-950' : 'text-slate-800'
                        }`}
                      >
                        {item.title}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                        {iMeta.lesson && <span className="truncate">{iMeta.lesson}</span>}
                        {iMeta.duration && <span>• {iMeta.duration}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <PdfViewerModal
        open={Boolean(activePdf)}
        title={activePdf?.title || 'Lecture Notes'}
        pdfUrl={activePdf?.pdfUrl || null}
        onClose={() => setActivePdf(null)}
      />
    </div>
  );
};
