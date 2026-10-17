import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FileText,
  FolderKanban,
  KeyRound,
  Layers,
  Lock,
  PlayCircle,
  Search,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { useApp } from '../../app/AppContext';
import { EmptyState } from '../../components/EmptyState';
import { PdfViewerModal, openSafeExternalPdf } from '../../components/PdfViewerModal';
import { ApiError, enrollInBatchOrSeries } from '../../lib/api';
import { isSafeHttpUrl, matchesStudentExamAndClass } from '../../lib/validation';
import type {
  BatchMetadata,
  CourseCatalogItem,
  LectureMetadata,
  ResourceMetadata,
  SeriesMetadata,
} from '../../types';

type HubTab =
  | 'all-batches'
  | 'my-batches'
  | 'all-series'
  | 'my-series'
  | 'lectures'
  | 'resources';

export const LecturesHubPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as HubTab) || 'all-batches';

  const { profile, content, isEnrolled, markEnrolled } = useApp();

  const [activeTab, setActiveTab] = useState<HubTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');

  // Enrollment modal state for access-code protected items
  const [codeTarget, setCodeTarget] = useState<{
    id: string;
    title: string;
    itemType: 'batch' | 'series';
  } | null>(null);
  const [accessCodeInput, setAccessCodeInput] = useState('');
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [enrollSuccess, setEnrollSuccess] = useState<string | null>(null);

  // PDF viewer modal state
  const [activePdf, setActivePdf] = useState<{
    title: string;
    pdfUrl: string;
  } | null>(null);

  const handleTabChange = (tab: HubTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
    setEnrollError(null);
    setEnrollSuccess(null);
  };

  // Strictly filter by student's exam and class
  const targetedContent = useMemo(() => {
    if (!profile) return [];
    return content.filter(
      (item) =>
        item.active !== false &&
        matchesStudentExamAndClass(item, profile.exam, profile.class_level)
    );
  }, [content, profile]);

  const qLower = searchQuery.trim().toLowerCase();
  const matchesSearch = (item: CourseCatalogItem) => {
    if (!qLower) return true;
    const meta = (item.metadata || {}) as Record<string, unknown>;
    const hay = [
      item.title,
      item.description,
      meta.codeDisplay,
      meta.instructor,
      meta.lesson,
      meta.topic,
      meta.subject,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(qLower);
  };

  const allBatches = useMemo(
    () =>
      targetedContent.filter(
        (c) => c.kind === 'batch' && matchesSearch(c)
      ) as CourseCatalogItem<BatchMetadata>[],
    [targetedContent, qLower]
  );

  const myBatches = useMemo(
    () => allBatches.filter((b) => isEnrolled('batch', b.id)),
    [allBatches, isEnrolled]
  );

  const allSeries = useMemo(
    () =>
      targetedContent.filter(
        (c) => c.kind === 'series' && matchesSearch(c)
      ) as CourseCatalogItem<SeriesMetadata>[],
    [targetedContent, qLower]
  );

  const mySeries = useMemo(
    () => allSeries.filter((s) => isEnrolled('series', s.id)),
    [allSeries, isEnrolled]
  );

  const visibleLectures = useMemo(() => {
    return (
      targetedContent.filter((c) => {
        if (c.kind !== 'lecture' || !matchesSearch(c)) return false;
        const meta = (c.metadata || {}) as LectureMetadata;
        const parentId = String(meta.parentId || '');
        if (!parentId) return true;
        return isEnrolled('batch', parentId) || isEnrolled('series', parentId);
      }) as CourseCatalogItem<LectureMetadata>[]
    ).sort(
      (a, b) => Number(a.metadata?.position || 0) - Number(b.metadata?.position || 0)
    );
  }, [targetedContent, isEnrolled, qLower]);

  const visibleResources = useMemo(() => {
    return targetedContent.filter((c) => {
      if (c.kind !== 'resource' || !matchesSearch(c)) return false;
      const meta = (c.metadata || {}) as ResourceMetadata;
      const parentId = String(meta.parentId || '');
      if (!parentId) return true;
      return isEnrolled('batch', parentId) || isEnrolled('series', parentId);
    }) as CourseCatalogItem<ResourceMetadata>[];
  }, [targetedContent, isEnrolled, qLower]);

  const handleEnrollClick = async (
    item: CourseCatalogItem<BatchMetadata | SeriesMetadata>,
    itemType: 'batch' | 'series'
  ) => {
    setEnrollError(null);
    setEnrollSuccess(null);

    const requiresCode = Boolean(
      item.hasAccessCode ||
        item.metadata?.requiresAccessCode ||
        (item.metadata as Record<string, unknown>)?.hasAccessCode
    );

    if (requiresCode) {
      setCodeTarget({ id: item.id, title: item.title, itemType });
      setAccessCodeInput('');
      return;
    }

    setEnrollingId(item.id);
    try {
      await enrollInBatchOrSeries({
        itemType,
        itemId: item.id,
      });
      markEnrolled(itemType, item.id);
      setEnrollSuccess(`Successfully enrolled in "${item.title}"!`);
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 403 &&
        err.message.toLowerCase().includes('code')
      ) {
        // Server indicates an access code is required on this item
        setCodeTarget({ id: item.id, title: item.title, itemType });
        setAccessCodeInput('');
      } else {
        setEnrollError(
          err instanceof Error ? err.message : 'Could not complete enrollment.'
        );
      }
    } finally {
      setEnrollingId(null);
    }
  };

  const handleCodeEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeTarget) return;
    setEnrollError(null);
    const trimmedCode = accessCodeInput.trim();
    if (!trimmedCode) {
      setEnrollError('Please enter the access code provided by your instructor.');
      return;
    }

    setEnrollingId(codeTarget.id);
    try {
      await enrollInBatchOrSeries({
        itemType: codeTarget.itemType,
        itemId: codeTarget.id,
        accessCode: trimmedCode,
      });
      markEnrolled(codeTarget.itemType, codeTarget.id);
      setEnrollSuccess(`Successfully enrolled in "${codeTarget.title}"!`);
      setCodeTarget(null);
      setAccessCodeInput('');
    } catch (err) {
      setEnrollError(
        err instanceof Error
          ? err.message
          : 'Incorrect access code. Enrollment was not created.'
      );
    } finally {
      setEnrollingId(null);
    }
  };

  const tabs: Array<{ id: HubTab; label: string; count: number }> = [
    { id: 'all-batches', label: 'All Batches', count: allBatches.length },
    { id: 'my-batches', label: 'My Batches', count: myBatches.length },
    { id: 'all-series', label: 'All Series', count: allSeries.length },
    { id: 'my-series', label: 'My Series', count: mySeries.length },
    { id: 'lectures', label: 'Video Lectures', count: visibleLectures.length },
    { id: 'resources', label: 'Resources / PDFs', count: visibleResources.length },
  ];

  const renderBatchGrid = (list: CourseCatalogItem<BatchMetadata>[], isMyTab = false) => {
    if (list.length === 0) {
      return (
        <EmptyState
          icon={<Layers className="h-6 w-6" />}
          title={
            isMyTab
              ? 'You Have Not Enrolled in Any Batches Yet'
              : `No Batches Found for ${profile?.exam} Class ${profile?.class_level}th`
          }
          description={
            isMyTab
              ? 'Switch to All Batches to enroll with 1 tap or your batch access code.'
              : 'When administrators publish batches for your exam and class, they appear here.'
          }
          adminGuidance="Open /admin → Batches, enter the batch title, code display, instructor, features, thumbnail URL, exam (JEE/NEET/Both), class (11/12), and optional secret access code, then save."
          actionLabel={isMyTab ? 'Browse All Batches' : undefined}
          onAction={isMyTab ? () => handleTabChange('all-batches') : undefined}
        />
      );
    }

    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((batch) => {
          const meta = batch.metadata || {};
          const enrolled = isEnrolled('batch', batch.id);
          const requiresCode = Boolean(
            batch.hasAccessCode ||
              meta.requiresAccessCode ||
              (meta as Record<string, unknown>).hasAccessCode
          );
          const subjects = Array.isArray(meta.subjects) ? meta.subjects : [];
          const features = Array.isArray(meta.features) ? meta.features : [];

          return (
            <div
              key={batch.id}
              className="flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs transition hover:border-indigo-300 hover:shadow-md"
            >
              {/* Fixed 16:9 aspect ratio with object-fit: cover */}
              <Link
                to={`/batches/${batch.id}`}
                className="relative aspect-video w-full overflow-hidden bg-slate-900"
              >
                {meta.thumbnailUrl ? (
                  <img
                    src={meta.thumbnailUrl}
                    alt={batch.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-700 to-violet-800 text-white">
                    <Layers className="h-10 w-10 opacity-75" />
                  </div>
                )}
                <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                  <span className="rounded-lg bg-slate-950/80 px-2.5 py-0.5 text-[11px] font-bold text-white backdrop-blur-xs">
                    {batch.exam} • Class {batch.classes.join('/')}
                  </span>
                  {meta.codeDisplay && (
                    <span className="rounded-lg bg-indigo-600/90 px-2.5 py-0.5 text-[11px] font-bold text-white">
                      {meta.codeDisplay}
                    </span>
                  )}
                </div>
                <div className="absolute right-3 top-3">
                  {enrolled ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Enrolled</span>
                    </span>
                  ) : requiresCode ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-slate-950 shadow-xs">
                      <Lock className="h-3 w-3" />
                      <span>Code Protected</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs">
                      <Sparkles className="h-3 w-3" />
                      <span>Open Batch</span>
                    </span>
                  )}
                </div>
              </Link>

              <div className="flex flex-1 flex-col justify-between p-5">
                <div>
                  <Link to={`/batches/${batch.id}`}>
                    <h3 className="text-base font-extrabold text-slate-900 hover:text-indigo-600">
                      {batch.title}
                    </h3>
                  </Link>
                  {meta.instructor && (
                    <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700">
                      <User className="h-3.5 w-3.5" />
                      <span>{meta.instructor}</span>
                    </p>
                  )}
                  <p className="mt-2 text-xs leading-relaxed text-slate-600 line-clamp-2">
                    {batch.description || 'Complete structured syllabus coverage.'}
                  </p>

                  {subjects.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {subjects.map((subj, idx) => (
                        <span
                          key={idx}
                          className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                        >
                          {subj}
                        </span>
                      ))}
                    </div>
                  )}

                  {features.length > 0 && (
                    <ul className="mt-3 space-y-1 text-xs text-slate-600">
                      {features.slice(0, 3).map((feat, idx) => (
                        <li key={idx} className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          <span className="truncate">{feat}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-100 pt-3.5">
                  <Link
                    to={`/batches/${batch.id}`}
                    className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    View Details
                  </Link>

                  {enrolled ? (
                    <Link
                      to={`/batches/${batch.id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700"
                    >
                      <span>Open Batch Lessons</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled={enrollingId === batch.id}
                      onClick={() => handleEnrollClick(batch, 'batch')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {requiresCode && <KeyRound className="h-3.5 w-3.5" />}
                      <span>
                        {enrollingId === batch.id
                          ? 'Enrolling...'
                          : requiresCode
                          ? 'Enter Code to Enroll'
                          : 'Enroll Now (1-Tap)'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderSeriesGrid = (
    list: CourseCatalogItem<SeriesMetadata>[],
    isMyTab = false
  ) => {
    if (list.length === 0) {
      return (
        <EmptyState
          icon={<FolderKanban className="h-6 w-6" />}
          title={
            isMyTab
              ? 'You Have Not Enrolled in Any Series Yet'
              : `No Lecture Series Found for ${profile?.exam} Class ${profile?.class_level}th`
          }
          description={
            isMyTab
              ? 'Switch to All Series to enroll in a topic or revision series.'
              : 'Structured chapter-wise and revision series created by administrators will appear here.'
          }
          adminGuidance="Open /admin → Series to create a series with title, about, thumbnail URL, exam, classes, features, and optional access code, then attach ordered lectures."
          actionLabel={isMyTab ? 'Browse All Series' : undefined}
          onAction={isMyTab ? () => handleTabChange('all-series') : undefined}
        />
      );
    }

    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((series) => {
          const meta = series.metadata || {};
          const enrolled = isEnrolled('series', series.id);
          const requiresCode = Boolean(
            series.hasAccessCode ||
              meta.requiresAccessCode ||
              (meta as Record<string, unknown>).hasAccessCode
          );
          const features = Array.isArray(meta.features) ? meta.features : [];

          return (
            <div
              key={series.id}
              className="flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs transition hover:border-indigo-300 hover:shadow-md"
            >
              <Link
                to={`/series/${series.id}`}
                className="relative aspect-video w-full overflow-hidden bg-slate-900"
              >
                {meta.thumbnailUrl ? (
                  <img
                    src={meta.thumbnailUrl}
                    alt={series.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-700 to-indigo-800 text-white">
                    <FolderKanban className="h-10 w-10 opacity-75" />
                  </div>
                )}
                <div className="absolute left-3 top-3 flex gap-1.5">
                  <span className="rounded-lg bg-slate-950/80 px-2.5 py-0.5 text-[11px] font-bold text-white">
                    {series.exam} • Class {series.classes.join('/')}
                  </span>
                </div>
                <div className="absolute right-3 top-3">
                  {enrolled ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Enrolled</span>
                    </span>
                  ) : requiresCode ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-slate-950">
                      <Lock className="h-3 w-3" />
                      <span>Code Required</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white">
                      <span>Open Series</span>
                    </span>
                  )}
                </div>
              </Link>

              <div className="flex flex-1 flex-col justify-between p-5">
                <div>
                  <Link to={`/series/${series.id}`}>
                    <h3 className="text-base font-extrabold text-slate-900 hover:text-indigo-600">
                      {series.title}
                    </h3>
                  </Link>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600 line-clamp-2">
                    {series.description || 'Ordered chapter-wise lesson series.'}
                  </p>
                  {features.length > 0 && (
                    <ul className="mt-3 space-y-1 text-xs text-slate-600">
                      {features.slice(0, 3).map((feat, idx) => (
                        <li key={idx} className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
                          <span className="truncate">{feat}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-100 pt-3.5">
                  <Link
                    to={`/series/${series.id}`}
                    className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Series Details
                  </Link>
                  {enrolled ? (
                    <Link
                      to={`/series/${series.id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                    >
                      <span>Watch Series</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled={enrollingId === series.id}
                      onClick={() => handleEnrollClick(series, 'series')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {requiresCode && <KeyRound className="h-3.5 w-3.5" />}
                      <span>
                        {enrollingId === series.id
                          ? 'Enrolling...'
                          : requiresCode
                          ? 'Enter Code'
                          : 'Enroll (1-Tap)'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header + Search */}
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-2xs sm:flex-row sm:items-center sm:p-6">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">
            Batches, Series &amp; Lectures
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Filtered for <strong className="text-indigo-700">{profile?.exam}</strong> •{' '}
            <strong className="text-indigo-700">Class {profile?.class_level}th</strong>. Enroll in a batch or series to unlock its lessons and PDF notes.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search batches, topics, PDFs..."
            aria-label="Search batches, series, lectures, or PDFs"
            className="w-full rounded-xl border border-slate-300 bg-slate-50 pl-10 pr-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex overflow-x-auto gap-2 pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => handleTabChange(t.id)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition ${
              activeTab === t.id
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>{t.label}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] ${
                activeTab === t.id
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Feedback Banners */}
      {enrollError && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs sm:text-sm font-medium text-rose-700"
        >
          {enrollError}
        </div>
      )}
      {enrollSuccess && (
        <div
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs sm:text-sm font-medium text-emerald-800"
        >
          {enrollSuccess}
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'all-batches' && renderBatchGrid(allBatches, false)}
      {activeTab === 'my-batches' && renderBatchGrid(myBatches, true)}
      {activeTab === 'all-series' && renderSeriesGrid(allSeries, false)}
      {activeTab === 'my-series' && renderSeriesGrid(mySeries, true)}

      {activeTab === 'lectures' && (
        <div>
          {visibleLectures.length === 0 ? (
            <EmptyState
              icon={<PlayCircle className="h-6 w-6" />}
              title="No Unlocked Video Lectures Found"
              description="Lectures attached to a batch or series remain hidden until you enroll in that batch or series."
              adminGuidance="Open /admin → Lectures to add single YouTube video URLs or import a full public YouTube playlist via the Cloudflare metadata proxy."
              actionLabel="View All Batches"
              onAction={() => handleTabChange('all-batches')}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleLectures.map((lecture, idx) => {
                const meta = lecture.metadata || {};
                const parentObj = targetedContent.find((c) => c.id === meta.parentId);
                return (
                  <div
                    key={lecture.id}
                    className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs transition hover:border-indigo-300 hover:shadow-md"
                  >
                    <Link
                      to={`/lectures/watch/${lecture.id}`}
                      className="relative aspect-video w-full overflow-hidden bg-slate-900"
                    >
                      {meta.thumbnailUrl ? (
                        <img
                          src={meta.thumbnailUrl}
                          alt={lecture.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-indigo-950 text-white">
                          <PlayCircle className="h-10 w-10" />
                        </div>
                      )}
                      <span className="absolute left-2.5 top-2.5 rounded-md bg-slate-950/80 px-2 py-0.5 text-[10px] font-bold text-white">
                        #{meta.position || idx + 1}
                      </span>
                      {meta.duration && (
                        <span className="absolute bottom-2 right-2 rounded-md bg-slate-950/85 px-2 py-0.5 text-[11px] font-semibold text-white">
                          {meta.duration}
                        </span>
                      )}
                    </Link>

                    <div className="flex flex-1 flex-col justify-between p-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-indigo-600">
                          {parentObj && <span>{parentObj.title}</span>}
                          {meta.lesson && <span>• {meta.lesson}</span>}
                        </div>
                        <Link to={`/lectures/watch/${lecture.id}`}>
                          <h3 className="mt-1 text-sm font-bold text-slate-900 hover:text-indigo-600 line-clamp-2">
                            {lecture.title}
                          </h3>
                        </Link>
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                        {meta.notesPdfUrl && isSafeHttpUrl(meta.notesPdfUrl) ? (
                          <button
                            type="button"
                            onClick={() =>
                              setActivePdf({
                                title: `${lecture.title} — Notes`,
                                pdfUrl: meta.notesPdfUrl!,
                              })
                            }
                            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-indigo-600"
                          >
                            <FileText className="h-3.5 w-3.5 text-indigo-600" />
                            <span>Lecture PDF</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">Video Lesson</span>
                        )}

                        <button
                          type="button"
                          onClick={() => navigate(`/lectures/watch/${lecture.id}`)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                        >
                          <PlayCircle className="h-3.5 w-3.5" />
                          <span>Watch</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'resources' && (
        <div>
          {visibleResources.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-6 w-6" />}
              title="No Study PDFs or Notes Available Yet"
              description="PDF notes attached to a restricted batch require enrollment in that batch first."
              adminGuidance="Open /admin → Lectures (Resources / PDFs section) to add study material with a valid https:// PDF URL, title, description, and optional parent batch/series."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleResources.map((resItem) => {
                const meta = resItem.metadata || {};
                const pdfUrl = String(meta.pdfUrl || '');
                const parentObj = targetedContent.find((c) => c.id === meta.parentId);

                return (
                  <div
                    key={resItem.id}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                          <FileText className="h-5 w-5" />
                        </div>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                          {resItem.exam} • Class {resItem.classes.join('/')}
                        </span>
                      </div>
                      <h3 className="mt-3 text-base font-bold text-slate-900">
                        {resItem.title}
                      </h3>
                      {parentObj && (
                        <p className="mt-0.5 text-xs font-semibold text-indigo-600">
                          From: {parentObj.title}
                        </p>
                      )}
                      {resItem.description && (
                        <p className="mt-1.5 text-xs text-slate-600 line-clamp-2">
                          {resItem.description}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        disabled={!isSafeHttpUrl(pdfUrl)}
                        onClick={() =>
                          setActivePdf({
                            title: resItem.title,
                            pdfUrl,
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                        <span>Preview in App</span>
                      </button>
                      <button
                        type="button"
                        disabled={!isSafeHttpUrl(pdfUrl)}
                        onClick={() => openSafeExternalPdf(pdfUrl)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Download / Open
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Access Code Enrollment Modal */}
      {codeTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="access-code-dialog-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <h3
                    id="access-code-dialog-title"
                    className="text-base font-bold text-slate-900"
                  >
                    Enter Access Code
                  </h3>
                  <p className="text-xs text-slate-500">{codeTarget.title}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCodeTarget(null);
                  setEnrollError(null);
                }}
                aria-label="Close modal"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {enrollError && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700"
              >
                {enrollError}
              </div>
            )}

            <form onSubmit={handleCodeEnrollSubmit} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="enrollment-access-code"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  Batch / Series Access Code
                </label>
                <input
                  id="enrollment-access-code"
                  type="text"
                  required
                  autoFocus
                  value={accessCodeInput}
                  onChange={(e) => setAccessCodeInput(e.target.value)}
                  placeholder="Enter secret enrollment code"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Access codes are verified on the server. Enrollment is only unlocked after the backend accepts the code.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setCodeTarget(null);
                    setEnrollError(null);
                  }}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={enrollingId === codeTarget.id}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {enrollingId === codeTarget.id ? 'Verifying...' : 'Verify & Enroll'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <PdfViewerModal
        open={Boolean(activePdf)}
        title={activePdf?.title || 'Study Resource'}
        pdfUrl={activePdf?.pdfUrl || null}
        onClose={() => setActivePdf(null)}
      />
    </div>
  );
};
