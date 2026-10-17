import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  FileText,
  FolderKanban,
  KeyRound,
  Lock,
  PlayCircle,
} from 'lucide-react';
import { useApp } from '../../app/AppContext';
import { PdfViewerModal } from '../../components/PdfViewerModal';
import {
  ApiError,
  enrollInBatchOrSeries,
  getCatalogContent,
} from '../../lib/api';
import { isSafeHttpUrl } from '../../lib/validation';
import type {
  CourseCatalogItem,
  LectureMetadata,
  ResourceMetadata,
  SeriesMetadata,
} from '../../types';

export const SeriesDetailPage: React.FC = () => {
  const { seriesId } = useParams<{ seriesId: string }>();
  const navigate = useNavigate();
  const { content, isEnrolled, markEnrolled } = useApp();

  const series = useMemo(
    () =>
      content.find(
        (c) => c.id === seriesId && c.kind === 'series'
      ) as CourseCatalogItem<SeriesMetadata> | undefined,
    [content, seriesId]
  );

  const enrolled = seriesId ? isEnrolled('series', seriesId) : false;

  const [lectures, setLectures] = useState<CourseCatalogItem<LectureMetadata>[]>([]);
  const [resources, setResources] = useState<CourseCatalogItem<ResourceMetadata>[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(false);

  const [needsCodeInput, setNeedsCodeInput] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  const [activePdf, setActivePdf] = useState<{
    title: string;
    pdfUrl: string;
  } | null>(null);

  const requiresCode = useMemo(() => {
    if (!series) return false;
    const meta = series.metadata || {};
    return Boolean(
      series.hasAccessCode ||
        meta.requiresAccessCode ||
        (meta as Record<string, unknown>).hasAccessCode ||
        needsCodeInput
    );
  }, [series, needsCodeInput]);

  const loadSeriesChildren = useCallback(async () => {
    if (!seriesId) return;
    setLoadingChildren(true);
    try {
      const [lecItems, resItems] = await Promise.all([
        getCatalogContent({ kind: 'lecture', parentId: seriesId }),
        getCatalogContent({ kind: 'resource', parentId: seriesId }),
      ]);
      setLectures(
        (lecItems as CourseCatalogItem<LectureMetadata>[]).sort(
          (a, b) => Number(a.metadata?.position || 0) - Number(b.metadata?.position || 0)
        )
      );
      setResources(resItems as CourseCatalogItem<ResourceMetadata>[]);
    } catch {
      setLectures([]);
      setResources([]);
    } finally {
      setLoadingChildren(false);
    }
  }, [seriesId]);

  useEffect(() => {
    if (enrolled && seriesId) {
      loadSeriesChildren();
    } else {
      setLectures([]);
      setResources([]);
    }
  }, [enrolled, seriesId, loadSeriesChildren]);

  if (!series) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xs">
        <h2 className="text-lg font-bold text-slate-900">Series Not Found</h2>
        <p className="mt-1 text-sm text-slate-600">
          This series may not exist or is not targeted to your selected exam and class.
        </p>
        <Link
          to="/lectures?tab=all-series"
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Series</span>
        </Link>
      </div>
    );
  }

  const meta = series.metadata || {};
  const features = Array.isArray(meta.features) ? meta.features : [];

  const handleEnroll = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!seriesId) return;
    setEnrollError(null);

    if (requiresCode && !accessCode.trim()) {
      setEnrollError('Please enter the series access code to enroll.');
      return;
    }

    setEnrolling(true);
    try {
      await enrollInBatchOrSeries({
        itemType: 'series',
        itemId: seriesId,
        accessCode: requiresCode ? accessCode.trim() : undefined,
      });
      markEnrolled('series', seriesId);
      await loadSeriesChildren();
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 403 &&
        err.message.toLowerCase().includes('code') &&
        !requiresCode
      ) {
        setNeedsCodeInput(true);
        setEnrollError('This series requires an access code. Enter the code below.');
      } else {
        setEnrollError(
          err instanceof Error ? err.message : 'Could not enroll in series.'
        );
      }
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/lectures?tab=all-series')}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>All Series</span>
        </button>
        {enrolled && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3.5 py-1 text-xs font-bold text-emerald-800">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>Enrolled in Series</span>
          </span>
        )}
      </div>

      {/* Series Header */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-12">
          <div className="lg:col-span-5 aspect-video lg:aspect-auto bg-slate-900 relative min-h-[200px]">
            {meta.thumbnailUrl ? (
              <img
                src={meta.thumbnailUrl}
                alt={series.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-700 to-indigo-800 text-white">
                <FolderKanban className="h-14 w-14 opacity-75" />
              </div>
            )}
            <div className="absolute left-4 top-4 flex gap-2">
              <span className="rounded-lg bg-slate-950/85 px-2.5 py-1 text-xs font-bold text-white">
                {series.exam} • Class {series.classes.join(' & ')}
              </span>
            </div>
          </div>

          <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                {series.title}
              </h1>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-600 whitespace-pre-line">
                {series.description || 'Ordered chapter-wise lecture series.'}
              </p>

              {features.length > 0 && (
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {features.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs font-medium text-slate-700"
                    >
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-indigo-600" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {!enrolled && (
              <div className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
                {enrollError && (
                  <div
                    role="alert"
                    className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700"
                  >
                    {enrollError}
                  </div>
                )}

                {requiresCode ? (
                  <form
                    onSubmit={handleEnroll}
                    className="flex flex-col gap-3 sm:flex-row sm:items-end"
                  >
                    <div className="flex-1">
                      <label
                        htmlFor="series-detail-code"
                        className="block text-xs font-bold uppercase tracking-wider text-indigo-950"
                      >
                        Enter Series Access Code
                      </label>
                      <input
                        id="series-detail-code"
                        type="text"
                        required
                        value={accessCode}
                        onChange={(e) => setAccessCode(e.target.value)}
                        placeholder="Enter access code"
                        className="mt-1.5 w-full rounded-xl border border-indigo-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={enrolling}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      <KeyRound className="h-4 w-4" />
                      <span>{enrolling ? 'Verifying...' : 'Unlock Series'}</span>
                    </button>
                  </form>
                ) : (
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                      <p className="text-sm font-bold text-indigo-950">Open Series</p>
                      <p className="text-xs text-indigo-700">
                        Enroll with 1 tap to unlock all ordered lessons in this series.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={enrolling}
                      onClick={() => handleEnroll()}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      <span>{enrolling ? 'Enrolling...' : 'Enroll Now (1-Tap)'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ordered Lessons */}
      {!enrolled ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <Lock className="mx-auto h-8 w-8 text-amber-600" />
          <h2 className="mt-3 text-base font-bold text-slate-900">
            Series Lessons Are Locked
          </h2>
          <p className="mx-auto mt-1 max-w-md text-xs sm:text-sm text-slate-600">
            Enroll in this series above to view and play its ordered video lessons.
          </p>
        </div>
      ) : loadingChildren ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          <p className="mt-3 text-sm text-slate-600">Loading series lessons...</p>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-extrabold text-slate-900">
            Ordered Lessons ({lectures.length})
          </h2>
          {lectures.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
              No lessons have been added to this series yet. Administrators can attach single videos or playlists in{' '}
              <strong className="text-indigo-700">/admin → Lectures</strong> with{' '}
              <strong>{series.title}</strong> as the parent series.
            </div>
          ) : (
            <div className="space-y-3">
              {lectures.map((lec, idx) => {
                const lMeta = lec.metadata || {};
                return (
                  <div
                    key={lec.id}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs transition hover:border-indigo-300"
                  >
                    <Link
                      to={`/lectures/watch/${lec.id}`}
                      className="flex min-w-0 flex-1 items-center gap-4"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-xs font-extrabold text-indigo-700">
                        {lMeta.position || idx + 1}
                      </span>
                      <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-xl bg-slate-900">
                        {lMeta.thumbnailUrl ? (
                          <img
                            src={lMeta.thumbnailUrl}
                            alt={lec.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-indigo-900 text-white">
                            <PlayCircle className="h-6 w-6" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        {lMeta.lesson && (
                          <span className="block truncate text-[11px] font-bold uppercase text-indigo-600">
                            {lMeta.lesson}
                          </span>
                        )}
                        <h3 className="line-clamp-1 text-sm font-bold text-slate-900 hover:text-indigo-600">
                          {lec.title}
                        </h3>
                        {lMeta.duration && (
                          <span className="text-xs text-slate-500">
                            {lMeta.duration}
                          </span>
                        )}
                      </div>
                    </Link>

                    <div className="flex shrink-0 items-center gap-2">
                      {lMeta.notesPdfUrl && isSafeHttpUrl(lMeta.notesPdfUrl) && (
                        <button
                          type="button"
                          onClick={() =>
                            setActivePdf({
                              title: `${lec.title} — Notes`,
                              pdfUrl: lMeta.notesPdfUrl!,
                            })
                          }
                          className="rounded-xl border border-slate-200 p-2 text-indigo-600 hover:bg-indigo-50"
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                      )}
                      <Link
                        to={`/lectures/watch/${lec.id}`}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-700"
                      >
                        <PlayCircle className="h-3.5 w-3.5" />
                        <span>Play</span>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {resources.length > 0 && (
            <div className="pt-4 space-y-3">
              <h3 className="text-base font-extrabold text-slate-900">
                Series PDF Notes ({resources.length})
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {resources.map((resItem) => {
                  const rMeta = resItem.metadata || {};
                  const pdfUrl = String(rMeta.pdfUrl || '');
                  return (
                    <div
                      key={resItem.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"
                    >
                      <span className="truncate text-sm font-bold text-slate-900">
                        {resItem.title}
                      </span>
                      <button
                        type="button"
                        disabled={!isSafeHttpUrl(pdfUrl)}
                        onClick={() =>
                          setActivePdf({ title: resItem.title, pdfUrl })
                        }
                        className="inline-flex items-center gap-1 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                        <span>Open PDF</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <PdfViewerModal
        open={Boolean(activePdf)}
        title={activePdf?.title || 'Series PDF'}
        pdfUrl={activePdf?.pdfUrl || null}
        onClose={() => setActivePdf(null)}
      />
    </div>
  );
};
