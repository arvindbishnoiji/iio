import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  FileText,
  KeyRound,
  Layers,
  Lock,
  PlayCircle,
  User,
} from 'lucide-react';
import { useApp } from '../../app/AppContext';
import { PdfViewerModal, openSafeExternalPdf } from '../../components/PdfViewerModal';
import {
  ApiError,
  enrollInBatchOrSeries,
  getCatalogContent,
} from '../../lib/api';
import { isSafeHttpUrl } from '../../lib/validation';
import type {
  BatchMetadata,
  CourseCatalogItem,
  LectureMetadata,
  ResourceMetadata,
} from '../../types';

export const BatchDetailPage: React.FC = () => {
  const { batchId } = useParams<{ batchId: string }>();
  const navigate = useNavigate();
  const { content, isEnrolled, markEnrolled } = useApp();

  const batch = useMemo(
    () =>
      content.find(
        (c) => c.id === batchId && c.kind === 'batch'
      ) as CourseCatalogItem<BatchMetadata> | undefined,
    [content, batchId]
  );

  const enrolled = batchId ? isEnrolled('batch', batchId) : false;

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
    if (!batch) return false;
    const meta = batch.metadata || {};
    return Boolean(
      batch.hasAccessCode ||
        meta.requiresAccessCode ||
        (meta as Record<string, unknown>).hasAccessCode ||
        needsCodeInput
    );
  }, [batch, needsCodeInput]);

  const loadBatchChildren = useCallback(async () => {
    if (!batchId) return;
    setLoadingChildren(true);
    try {
      const [lecItems, resItems] = await Promise.all([
        getCatalogContent({ kind: 'lecture', parentId: batchId }),
        getCatalogContent({ kind: 'resource', parentId: batchId }),
      ]);
      setLectures(
        (lecItems as CourseCatalogItem<LectureMetadata>[]).sort(
          (a, b) => Number(a.metadata?.position || 0) - Number(b.metadata?.position || 0)
        )
      );
      setResources(resItems as CourseCatalogItem<ResourceMetadata>[]);
    } catch {
      // If 403, student is not enrolled yet
      setLectures([]);
      setResources([]);
    } finally {
      setLoadingChildren(false);
    }
  }, [batchId]);

  useEffect(() => {
    if (enrolled && batchId) {
      loadBatchChildren();
    } else {
      setLectures([]);
      setResources([]);
    }
  }, [enrolled, batchId, loadBatchChildren]);

  if (!batch) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xs">
        <h2 className="text-lg font-bold text-slate-900">Batch Not Found</h2>
        <p className="mt-1 text-sm text-slate-600">
          This batch may not exist or is not targeted to your selected exam and class.
        </p>
        <Link
          to="/lectures"
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Batches</span>
        </Link>
      </div>
    );
  }

  const meta = batch.metadata || {};
  const subjects = Array.isArray(meta.subjects) ? meta.subjects : [];
  const features = Array.isArray(meta.features) ? meta.features : [];

  const handleEnroll = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!batchId) return;
    setEnrollError(null);

    if (requiresCode && !accessCode.trim()) {
      setEnrollError('Please enter the batch access code to enroll.');
      return;
    }

    setEnrolling(true);
    try {
      await enrollInBatchOrSeries({
        itemType: 'batch',
        itemId: batchId,
        accessCode: requiresCode ? accessCode.trim() : undefined,
      });
      markEnrolled('batch', batchId);
      await loadBatchChildren();
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 403 &&
        err.message.toLowerCase().includes('code') &&
        !requiresCode
      ) {
        setNeedsCodeInput(true);
        setEnrollError('This batch is protected by an access code. Enter the code below.');
      } else {
        setEnrollError(
          err instanceof Error
            ? err.message
            : 'Enrollment failed. Please check the access code and try again.'
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
          onClick={() => navigate('/lectures')}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>All Batches</span>
        </button>
        {enrolled && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3.5 py-1 text-xs font-bold text-emerald-800">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>Enrolled in Batch</span>
          </span>
        )}
      </div>

      {/* Batch Hero Card */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-12">
          <div className="lg:col-span-5 aspect-video lg:aspect-auto bg-slate-900 relative min-h-[220px]">
            {meta.thumbnailUrl ? (
              <img
                src={meta.thumbnailUrl}
                alt={batch.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-700 to-violet-800 text-white">
                <Layers className="h-14 w-14 opacity-75" />
              </div>
            )}
            <div className="absolute left-4 top-4 flex flex-wrap gap-2">
              <span className="rounded-lg bg-slate-950/85 px-2.5 py-1 text-xs font-bold text-white">
                {batch.exam} • Class {batch.classes.join(' & ')}
              </span>
              {meta.codeDisplay && (
                <span className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white">
                  {meta.codeDisplay}
                </span>
              )}
            </div>
          </div>

          <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                {batch.title}
              </h1>
              {meta.instructor && (
                <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-indigo-700">
                  <User className="h-4 w-4" />
                  <span>Faculty: {meta.instructor}</span>
                </p>
              )}
              <p className="mt-3 text-sm leading-relaxed text-slate-600 whitespace-pre-line">
                {batch.description || 'Complete structured syllabus and practice batch.'}
              </p>

              {subjects.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {subjects.map((s, i) => (
                    <span
                      key={i}
                      className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}

              {features.length > 0 && (
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {features.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs font-medium text-slate-700"
                    >
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Enrollment Action Box if not enrolled */}
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
                        htmlFor="batch-detail-code"
                        className="block text-xs font-bold uppercase tracking-wider text-indigo-950"
                      >
                        Enter Batch Access Code to Unlock Content
                      </label>
                      <input
                        id="batch-detail-code"
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
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50"
                    >
                      <KeyRound className="h-4 w-4" />
                      <span>{enrolling ? 'Verifying...' : 'Unlock & Enroll'}</span>
                    </button>
                  </form>
                ) : (
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                      <p className="text-sm font-bold text-indigo-950">
                        Free / Open Enrollment Batch
                      </p>
                      <p className="text-xs text-indigo-700">
                        Tap once to enroll and unlock all video lectures and PDF study notes.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={enrolling}
                      onClick={() => handleEnroll()}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50"
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

      {/* Batch Content Area (Protected until Enrolled) */}
      {!enrolled ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <Lock className="h-6 w-6" />
          </div>
          <h2 className="mt-3 text-base font-bold text-slate-900">
            Batch Lectures &amp; PDFs Are Locked
          </h2>
          <p className="mx-auto mt-1 max-w-md text-xs sm:text-sm text-slate-600">
            Content attached to this batch is hidden until your enrollment is accepted by the server. Complete enrollment above to start learning.
          </p>
        </div>
      ) : loadingChildren ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          <p className="mt-3 text-sm text-slate-600">Loading batch lectures and notes...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Video Lectures Section */}
          <div className="space-y-3">
            <h2 className="text-lg font-extrabold text-slate-900">
              Batch Video Lectures ({lectures.length})
            </h2>
            {lectures.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
                No lectures have been attached to this batch yet. Administrators can attach single YouTube videos or import a playlist in{' '}
                <strong className="text-indigo-700">/admin → Lectures</strong> and select{' '}
                <strong>{batch.title}</strong> as the parent batch.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {lectures.map((lec, idx) => {
                  const lMeta = lec.metadata || {};
                  return (
                    <div
                      key={lec.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs transition hover:border-indigo-300"
                    >
                      <Link
                        to={`/lectures/watch/${lec.id}`}
                        className="flex min-w-0 flex-1 items-center gap-3.5"
                      >
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
                          <span className="absolute left-1.5 top-1.5 rounded bg-slate-950/80 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            #{lMeta.position || idx + 1}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          {lMeta.lesson && (
                            <span className="block truncate text-[11px] font-bold uppercase text-indigo-600">
                              {lMeta.lesson}
                            </span>
                          )}
                          <h3 className="line-clamp-2 text-sm font-bold text-slate-900 hover:text-indigo-600">
                            {lec.title}
                          </h3>
                          {lMeta.duration && (
                            <span className="text-[11px] text-slate-500">
                              Duration: {lMeta.duration}
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
                            title="Open Lecture PDF Notes"
                            className="rounded-xl border border-slate-200 p-2 text-indigo-600 hover:bg-indigo-50"
                          >
                            <FileText className="h-4 w-4" />
                          </button>
                        )}
                        <Link
                          to={`/lectures/watch/${lec.id}`}
                          className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700"
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
          </div>

          {/* Attached PDFs / Study Materials */}
          <div className="space-y-3">
            <h2 className="text-lg font-extrabold text-slate-900">
              Batch Study Materials &amp; PDFs ({resources.length})
            </h2>
            {resources.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500">
                No standalone PDF resources attached to this batch yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {resources.map((resItem) => {
                  const rMeta = resItem.metadata || {};
                  const pdfUrl = String(rMeta.pdfUrl || '');
                  return (
                    <div
                      key={resItem.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs"
                    >
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-bold text-slate-900">
                          {resItem.title}
                        </h3>
                        {resItem.description && (
                          <p className="mt-0.5 truncate text-xs text-slate-500">
                            {resItem.description}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          disabled={!isSafeHttpUrl(pdfUrl)}
                          onClick={() =>
                            setActivePdf({ title: resItem.title, pdfUrl })
                          }
                          className="inline-flex items-center gap-1 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                        >
                          <BookOpen className="h-3.5 w-3.5" />
                          <span>View</span>
                        </button>
                        <button
                          type="button"
                          disabled={!isSafeHttpUrl(pdfUrl)}
                          onClick={() => openSafeExternalPdf(pdfUrl)}
                          className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                          PDF
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <PdfViewerModal
        open={Boolean(activePdf)}
        title={activePdf?.title || 'Batch Resource'}
        pdfUrl={activePdf?.pdfUrl || null}
        onClose={() => setActivePdf(null)}
      />
    </div>
  );
};
