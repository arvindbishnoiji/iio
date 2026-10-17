import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Edit3,
  FolderKanban,
  Image as ImageIcon,
  LayoutDashboard,
  Layers,
  LogOut,
  Megaphone,
  MessageSquare,
  PlayCircle,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Target,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react';
import { useApp } from '../../app/AppContext';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import {
  ApiError,
  checkApiHealth,
  createAdminAnnouncement,
  createAdminContent,
  disableAdminContent,
  getAdminAnnouncements,
  getAdminContentList,
  getAdminOverview,
  getAdminStudents,
  updateAdminAnnouncement,
  updateAdminContent,
  type AdminContentPayload,
} from '../../lib/api';
import {
  formatISTDateTime,
  fromISTDateTimeLocalInput,
  toISTDateTimeLocalInput,
} from '../../lib/date';
import { checkMediaProxyHealth } from '../../lib/mediaProxy';
import { isSafeHttpUrl, isValidInternalDeepLink } from '../../lib/validation';
import type {
  AdminOverviewResponse,
  Announcement,
  BatchMetadata,
  ClassLevel,
  ContentExam,
  CourseCatalogItem,
  EventBannerImage,
  EventMetadata,
  GoalMetadata,
  LectureMetadata,
  SeriesMetadata,
  StudentProfile,
} from '../../types';
import {
  AdminChatAndNotificationsTab,
  AdminStudentsTab,
} from './AdminChatAndStudentsTabs';
import { AdminLecturesTab } from './AdminLecturesTab';
import { AdminTestsTab } from './AdminTestsTab';

type AdminTabId =
  | 'dashboard'
  | 'goals'
  | 'batches'
  | 'lectures'
  | 'series'
  | 'tests'
  | 'events'
  | 'announcements'
  | 'students'
  | 'chat';

export const AdminPage: React.FC = () => {
  const { user, logout, refreshBootstrap } = useApp();

  const [activeTab, setActiveTab] = useState<AdminTabId>('dashboard');
  const [serverDenied, setServerDenied] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [allCatalog, setAllCatalog] = useState<CourseCatalogItem[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);

  const [edgeHealth, setEdgeHealth] = useState<string>('Checking...');
  const [proxyHealth, setProxyHealth] = useState<string>('Checking...');

  // Global disable confirmation modal
  const [disableTarget, setDisableTarget] = useState<CourseCatalogItem | null>(null);
  const [disabling, setDisabling] = useState(false);

  // Target student for jumping from Students tab -> Chat tab
  const [chatStudentUid, setChatStudentUid] = useState<string | null>(null);

  const loadAllAdminData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, cat, anns, studs] = await Promise.all([
        getAdminOverview(),
        getAdminContentList(),
        getAdminAnnouncements(),
        getAdminStudents(),
      ]);
      setServerDenied(false);
      setOverview(ov);
      setAllCatalog(cat);
      setAnnouncements(anns);
      setStudents(studs);
      refreshBootstrap().catch(() => {});
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setServerDenied(true);
      } else {
        setError(
          err instanceof Error ? err.message : 'Failed to load admin console data.'
        );
      }
    } finally {
      setLoading(false);
    }
  }, [refreshBootstrap]);

  useEffect(() => {
    loadAllAdminData();
    checkApiHealth()
      .then((r) => setEdgeHealth(r.ok ? 'Online (darvo1 verified)' : 'Degraded'))
      .catch(() => setEdgeHealth('Offline'));
    checkMediaProxyHealth()
      .then((r) =>
        setProxyHealth(
          r.ok ? 'Online (Keyless oEmbed/Playlist Proxy)' : 'Degraded'
        )
      )
      .catch(() => setProxyHealth('Offline'));
  }, [loadAllAdminData]);

  const handleConfirmDisable = async () => {
    if (!disableTarget) return;
    setDisabling(true);
    try {
      await disableAdminContent(disableTarget.id);
      setDisableTarget(null);
      await loadAllAdminData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to disable content item.'
      );
    } finally {
      setDisabling(false);
    }
  };

  const toggleClassItem = (
    cls: ClassLevel,
    current: ClassLevel[],
    setter: (next: ClassLevel[]) => void
  ) => {
    if (current.includes(cls)) {
      if (current.length > 1) setter(current.filter((c) => c !== cls));
    } else {
      setter([...current, cls]);
    }
  };

  // ---------------------------------------------------------------------------
  // TODAY'S GOALS STATE (`kind=goal`)
  // ---------------------------------------------------------------------------
  const goalsList = useMemo(
    () =>
      allCatalog.filter(
        (c) => c.kind === 'goal'
      ) as CourseCatalogItem<GoalMetadata>[],
    [allCatalog]
  );
  const [editingGoal, setEditingGoal] =
    useState<CourseCatalogItem<GoalMetadata> | null>(null);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalDisplayText, setGoalDisplayText] = useState('');
  const [goalExam, setGoalExam] = useState<ContentExam>('Both');
  const [goalClasses, setGoalClasses] = useState<ClassLevel[]>(['11', '12']);
  const [goalStartsAtLocal, setGoalStartsAtLocal] = useState('');
  const [goalEndsAtLocal, setGoalEndsAtLocal] = useState('');
  const [goalDeepLink, setGoalDeepLink] = useState('/lectures');
  const [goalCtaLabel, setGoalCtaLabel] = useState('Start Studying');
  const [goalPriority, setGoalPriority] = useState<number>(10);
  const [goalActive, setGoalActive] = useState<boolean>(true);
  const [savingGoal, setSavingGoal] = useState(false);
  const [goalFeedback, setGoalFeedback] = useState<string | null>(null);

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setGoalFeedback(null);
    if (!goalTitle.trim() || !goalDisplayText.trim()) {
      setGoalFeedback('Goal title and display text are required.');
      return;
    }
    if (goalDeepLink.trim() && !isValidInternalDeepLink(goalDeepLink.trim())) {
      setGoalFeedback('Goal CTA link must be a valid internal route starting with /.');
      return;
    }
    setSavingGoal(true);
    try {
      const payload: AdminContentPayload = {
        kind: 'goal',
        title: goalTitle.trim(),
        description: goalDisplayText.trim(),
        exam: goalExam,
        classes: goalClasses,
        active: goalActive,
        metadata: {
          ...(editingGoal?.metadata || {}),
          displayText: goalDisplayText.trim(),
          startsAt: fromISTDateTimeLocalInput(goalStartsAtLocal),
          endsAt: fromISTDateTimeLocalInput(goalEndsAtLocal),
          deepLink: goalDeepLink.trim() || '/lectures',
          ctaLabel: goalCtaLabel.trim() || 'Start Now',
          priority: Number(goalPriority) || 1,
        },
      };
      if (editingGoal) {
        await updateAdminContent(editingGoal.id, payload);
        setGoalFeedback(`Updated goal "${payload.title}".`);
      } else {
        await createAdminContent(payload);
        setGoalFeedback(`Created goal "${payload.title}".`);
      }
      setEditingGoal(null);
      setGoalTitle('');
      setGoalDisplayText('');
      setGoalStartsAtLocal('');
      setGoalEndsAtLocal('');
      await loadAllAdminData();
    } catch (err) {
      setGoalFeedback(err instanceof Error ? err.message : 'Failed to save goal.');
    } finally {
      setSavingGoal(false);
    }
  };

  // ---------------------------------------------------------------------------
  // BATCHES STATE (`kind=batch`)
  // ---------------------------------------------------------------------------
  const batchesList = useMemo(
    () =>
      allCatalog.filter(
        (c) => c.kind === 'batch'
      ) as CourseCatalogItem<BatchMetadata>[],
    [allCatalog]
  );
  const [editingBatch, setEditingBatch] =
    useState<CourseCatalogItem<BatchMetadata> | null>(null);
  const [batchTitle, setBatchTitle] = useState('');
  const [batchCodeDisplay, setBatchCodeDisplay] = useState('');
  const [batchAbout, setBatchAbout] = useState('');
  const [batchInstructor, setBatchInstructor] = useState('');
  const [batchSubjectsText, setBatchSubjectsText] = useState(
    'Physics, Chemistry, Mathematics'
  );
  const [batchFeaturesText, setBatchFeaturesText] = useState(
    'Live + Recorded Lectures\nChapter-wise DPPs & PDF Notes\nScheduled CBT Mock Tests'
  );
  const [batchThumbnailUrl, setBatchThumbnailUrl] = useState('');
  const [batchAccessCode, setBatchAccessCode] = useState('');
  const [batchExam, setBatchExam] = useState<ContentExam>('JEE');
  const [batchClasses, setBatchClasses] = useState<ClassLevel[]>(['11', '12']);
  const [batchActive, setBatchActive] = useState<boolean>(true);
  const [savingBatch, setSavingBatch] = useState(false);
  const [batchFeedback, setBatchFeedback] = useState<string | null>(null);

  const handleSaveBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setBatchFeedback(null);
    if (!batchTitle.trim()) {
      setBatchFeedback('Batch title is required.');
      return;
    }
    if (batchThumbnailUrl.trim() && !isSafeHttpUrl(batchThumbnailUrl.trim())) {
      setBatchFeedback('Batch thumbnail must be a valid http(s) URL.');
      return;
    }

    const subjects = batchSubjectsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const features = batchFeaturesText
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);
    const trimmedSecretCode = batchAccessCode.trim();

    setSavingBatch(true);
    try {
      const payload: AdminContentPayload = {
        kind: 'batch',
        title: batchTitle.trim(),
        description: batchAbout.trim(),
        exam: batchExam,
        classes: batchClasses,
        active: batchActive,
        accessCode: trimmedSecretCode || null,
        metadata: {
          ...(editingBatch?.metadata || {}),
          codeDisplay: batchCodeDisplay.trim(),
          instructor: batchInstructor.trim(),
          subjects,
          features,
          thumbnailUrl: batchThumbnailUrl.trim(),
          requiresAccessCode: Boolean(trimmedSecretCode),
        },
      };

      if (editingBatch) {
        await updateAdminContent(editingBatch.id, payload);
        setBatchFeedback(`Updated batch "${payload.title}".`);
      } else {
        await createAdminContent(payload);
        setBatchFeedback(`Created batch "${payload.title}".`);
      }
      setEditingBatch(null);
      setBatchTitle('');
      setBatchCodeDisplay('');
      setBatchAbout('');
      setBatchInstructor('');
      setBatchThumbnailUrl('');
      setBatchAccessCode('');
      await loadAllAdminData();
    } catch (err) {
      setBatchFeedback(err instanceof Error ? err.message : 'Failed to save batch.');
    } finally {
      setSavingBatch(false);
    }
  };

  // ---------------------------------------------------------------------------
  // SERIES STATE (`kind=series`)
  // ---------------------------------------------------------------------------
  const seriesList = useMemo(
    () =>
      allCatalog.filter(
        (c) => c.kind === 'series'
      ) as CourseCatalogItem<SeriesMetadata>[],
    [allCatalog]
  );
  const [editingSeries, setEditingSeries] =
    useState<CourseCatalogItem<SeriesMetadata> | null>(null);
  const [seriesTitle, setSeriesTitle] = useState('');
  const [seriesAbout, setSeriesAbout] = useState('');
  const [seriesThumbnailUrl, setSeriesThumbnailUrl] = useState('');
  const [seriesAccessCode, setSeriesAccessCode] = useState('');
  const [seriesFeaturesText, setSeriesFeaturesText] = useState(
    'Ordered Revision Lectures\nTopic-wise Practice Notes'
  );
  const [seriesExam, setSeriesExam] = useState<ContentExam>('JEE');
  const [seriesClasses, setSeriesClasses] = useState<ClassLevel[]>(['11', '12']);
  const [seriesActive, setSeriesActive] = useState<boolean>(true);
  const [savingSeries, setSavingSeries] = useState(false);
  const [seriesFeedback, setSeriesFeedback] = useState<string | null>(null);

  const handleSaveSeries = async (e: React.FormEvent) => {
    e.preventDefault();
    setSeriesFeedback(null);
    if (!seriesTitle.trim()) {
      setSeriesFeedback('Series title is required.');
      return;
    }
    const features = seriesFeaturesText
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);
    const trimmedCode = seriesAccessCode.trim();

    setSavingSeries(true);
    try {
      const payload: AdminContentPayload = {
        kind: 'series',
        title: seriesTitle.trim(),
        description: seriesAbout.trim(),
        exam: seriesExam,
        classes: seriesClasses,
        active: seriesActive,
        accessCode: trimmedCode || null,
        metadata: {
          ...(editingSeries?.metadata || {}),
          thumbnailUrl: seriesThumbnailUrl.trim(),
          features,
          requiresAccessCode: Boolean(trimmedCode),
        },
      };
      if (editingSeries) {
        await updateAdminContent(editingSeries.id, payload);
        setSeriesFeedback(`Updated series "${payload.title}".`);
      } else {
        await createAdminContent(payload);
        setSeriesFeedback(`Created series "${payload.title}".`);
      }
      setEditingSeries(null);
      setSeriesTitle('');
      setSeriesAbout('');
      setSeriesThumbnailUrl('');
      setSeriesAccessCode('');
      await loadAllAdminData();
    } catch (err) {
      setSeriesFeedback(
        err instanceof Error ? err.message : 'Failed to save series.'
      );
    } finally {
      setSavingSeries(false);
    }
  };

  const handleMoveChildLecture = async (
    seriesId: string,
    lecture: CourseCatalogItem<LectureMetadata>,
    direction: 'up' | 'down'
  ) => {
    const children = (
      allCatalog.filter(
        (c) => c.kind === 'lecture' && c.metadata?.parentId === seriesId
      ) as CourseCatalogItem<LectureMetadata>[]
    ).sort(
      (a, b) => Number(a.metadata?.position || 0) - Number(b.metadata?.position || 0)
    );
    const idx = children.findIndex((c) => c.id === lecture.id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= children.length) return;

    const other = children[swapIdx];
    const posA = idx + 1;
    const posB = swapIdx + 1;

    await Promise.all([
      updateAdminContent(lecture.id, {
        kind: 'lecture',
        title: lecture.title,
        description: lecture.description,
        exam: lecture.exam,
        classes: lecture.classes,
        active: lecture.active !== false,
        metadata: { ...lecture.metadata, position: posB },
      }),
      updateAdminContent(other.id, {
        kind: 'lecture',
        title: other.title,
        description: other.description,
        exam: other.exam,
        classes: other.classes,
        active: other.active !== false,
        metadata: { ...other.metadata, position: posA },
      }),
    ]);
    await loadAllAdminData();
  };

  // ---------------------------------------------------------------------------
  // EVENTS / BANNERS STATE (`kind=event`)
  // ---------------------------------------------------------------------------
  const eventsList = useMemo(
    () =>
      allCatalog.filter(
        (c) => c.kind === 'event'
      ) as CourseCatalogItem<EventMetadata>[],
    [allCatalog]
  );
  const [editingEvent, setEditingEvent] =
    useState<CourseCatalogItem<EventMetadata> | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventText, setEventText] = useState('');
  const [eventExam, setEventExam] = useState<ContentExam>('Both');
  const [eventClasses, setEventClasses] = useState<ClassLevel[]>(['11', '12']);
  const [eventStartsLocal, setEventStartsLocal] = useState('');
  const [eventEndsLocal, setEventEndsLocal] = useState('');
  const [eventDeepLink, setEventDeepLink] = useState('/lectures');
  const [eventCtaLabel, setEventCtaLabel] = useState('Explore Batch');
  const [eventActive, setEventActive] = useState<boolean>(true);
  const [eventImages, setEventImages] = useState<EventBannerImage[]>([
    { url: '', caption: '', deepLink: '/lectures' },
  ]);
  const [savingEvent, setSavingEvent] = useState(false);
  const [eventFeedback, setEventFeedback] = useState<string | null>(null);

  const moveBannerRow = (idx: number, dir: 'up' | 'down') => {
    setEventImages((prev) => {
      const copy = [...prev];
      const target = dir === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= copy.length) return prev;
      const tmp = copy[idx];
      copy[idx] = copy[target];
      copy[target] = tmp;
      return copy;
    });
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setEventFeedback(null);
    if (!eventTitle.trim()) {
      setEventFeedback('Event/banner title is required.');
      return;
    }
    const validImages = eventImages
      .map((img) => ({
        url: img.url.trim(),
        caption: (img.caption || '').trim(),
        deepLink: (img.deepLink || eventDeepLink || '/').trim(),
      }))
      .filter((img) => img.url.length > 0);

    if (validImages.length === 0) {
      setEventFeedback('Add at least one banner image URL.');
      return;
    }
    for (const img of validImages) {
      if (!isSafeHttpUrl(img.url)) {
        setEventFeedback(`Invalid banner image URL: ${img.url}`);
        return;
      }
      if (img.deepLink && !isValidInternalDeepLink(img.deepLink)) {
        setEventFeedback(
          `Deep link "${img.deepLink}" must be a valid internal route starting with /.`
        );
        return;
      }
    }

    setSavingEvent(true);
    try {
      const payload: AdminContentPayload = {
        kind: 'event',
        title: eventTitle.trim(),
        description: eventText.trim(),
        exam: eventExam,
        classes: eventClasses,
        active: eventActive,
        metadata: {
          ...(editingEvent?.metadata || {}),
          images: validImages,
          thumbnailUrl: validImages[0].url,
          startsAt: fromISTDateTimeLocalInput(eventStartsLocal),
          endsAt: fromISTDateTimeLocalInput(eventEndsLocal),
          deepLink: eventDeepLink.trim() || '/lectures',
          ctaLabel: eventCtaLabel.trim() || 'Explore Now',
        },
      };
      if (editingEvent) {
        await updateAdminContent(editingEvent.id, payload);
        setEventFeedback(`Updated event banner "${payload.title}".`);
      } else {
        await createAdminContent(payload);
        setEventFeedback(`Created event banner "${payload.title}".`);
      }
      setEditingEvent(null);
      setEventTitle('');
      setEventText('');
      setEventImages([{ url: '', caption: '', deepLink: '/lectures' }]);
      await loadAllAdminData();
    } catch (err) {
      setEventFeedback(err instanceof Error ? err.message : 'Failed to save event.');
    } finally {
      setSavingEvent(false);
    }
  };

  // ---------------------------------------------------------------------------
  // ANNOUNCEMENTS STATE (`/admin/announcements`)
  // ---------------------------------------------------------------------------
  const [editingAnn, setEditingAnn] = useState<Announcement | null>(null);
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annAudience, setAnnAudience] = useState('All');
  const [annScheduledLocal, setAnnScheduledLocal] = useState('');
  const [annActive, setAnnActive] = useState(true);
  const [savingAnn, setSavingAnn] = useState(false);
  const [annFeedback, setAnnFeedback] = useState<string | null>(null);

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    setAnnFeedback(null);
    if (!annTitle.trim() || !annBody.trim()) {
      setAnnFeedback('Announcement title and body are required.');
      return;
    }
    setSavingAnn(true);
    try {
      const payload = {
        title: annTitle.trim(),
        body: annBody.trim(),
        audience: annAudience,
        active: annActive,
        scheduledAt: fromISTDateTimeLocalInput(annScheduledLocal),
      };
      if (editingAnn) {
        await updateAdminAnnouncement(editingAnn.id, payload);
        setAnnFeedback(`Updated announcement "${payload.title}".`);
      } else {
        await createAdminAnnouncement(payload);
        setAnnFeedback(`Published announcement "${payload.title}".`);
      }
      setEditingAnn(null);
      setAnnTitle('');
      setAnnBody('');
      setAnnScheduledLocal('');
      await loadAllAdminData();
    } catch (err) {
      setAnnFeedback(
        err instanceof Error ? err.message : 'Failed to save announcement.'
      );
    } finally {
      setSavingAnn(false);
    }
  };

  if (serverDenied) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6 text-center text-white">
        <ShieldAlert className="h-12 w-12 text-rose-500" />
        <h1 className="mt-4 text-2xl font-extrabold">Admin access denied.</h1>
        <p className="mt-2 max-w-md text-sm text-slate-400">
          The backend Edge Function rejected administrator access for this token.
        </p>
        <Link
          to="/"
          className="mt-6 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white"
        >
          Return to Student Home
        </Link>
      </div>
    );
  }

  const navTabs: Array<{ id: AdminTabId; label: string; icon: React.ElementType }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'goals', label: "Today's Goals", icon: Target },
    { id: 'batches', label: 'Batches', icon: Layers },
    { id: 'lectures', label: 'Lectures', icon: PlayCircle },
    { id: 'series', label: 'Series', icon: FolderKanban },
    { id: 'tests', label: 'Tests & Schedules', icon: Trophy },
    { id: 'events', label: 'Events/Banners', icon: ImageIcon },
    { id: 'announcements', label: 'Announcements', icon: Megaphone },
    { id: 'students', label: 'Students', icon: Users },
    { id: 'chat', label: 'Chat/Notifications', icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-16">
      {/* Top Admin Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950 text-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-base font-extrabold tracking-tight sm:text-lg">
                Exam Cracker Admin Console
              </h1>
              <p className="text-[11px] text-emerald-400 font-semibold">
                Verified Admin: {user?.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={loadAllAdminData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sync Server</span>
            </button>

            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-500"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Student View</span>
            </Link>

            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-1 rounded-xl border border-rose-500/40 bg-rose-950/50 px-3 py-2 text-xs font-bold text-rose-200 hover:bg-rose-900"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>

        {/* Admin Navigation Bar */}
        <div className="border-t border-slate-800 bg-slate-900/90">
          <div className="mx-auto flex max-w-7xl overflow-x-auto px-4 py-2 gap-1.5 sm:px-6 lg:px-8">
            {navTabs.map((t) => {
              const Icon = t.icon;
              const isAct = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                    isAct
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8 space-y-6">
        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700"
          >
            {error}
          </div>
        )}

        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <span className="text-xs font-bold uppercase text-slate-400">
                  Students
                </span>
                <p className="mt-2 text-2xl font-extrabold text-slate-900">
                  {overview?.counts.student_profiles ?? students.length}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <span className="text-xs font-bold uppercase text-slate-400">
                  Catalog Items
                </span>
                <p className="mt-2 text-2xl font-extrabold text-slate-900">
                  {overview?.counts.course_catalog ?? allCatalog.length}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <span className="text-xs font-bold uppercase text-slate-400">
                  Enrollments
                </span>
                <p className="mt-2 text-2xl font-extrabold text-slate-900">
                  {overview?.counts.enrollments ?? 0}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <span className="text-xs font-bold uppercase text-slate-400">
                  Test Attempts
                </span>
                <p className="mt-2 text-2xl font-extrabold text-slate-900">
                  {overview?.counts.exam_attempts ?? 0}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <span className="text-xs font-bold uppercase text-slate-400">
                  Announcements
                </span>
                <p className="mt-2 text-2xl font-extrabold text-slate-900">
                  {overview?.counts.announcements ?? announcements.length}
                </p>
              </div>
            </div>

            {/* Provisioned Backend Services Status */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <span className="text-xs font-bold uppercase text-indigo-600">
                  Supabase Edge Function (exam-cracker-api)
                </span>
                <p className="mt-1 text-sm font-extrabold text-slate-900">
                  {edgeHealth}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Project: kncbvcozpcrfvxdbkbtf • Auth: Firebase ID Token RS256 Verified
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <span className="text-xs font-bold uppercase text-emerald-600">
                  Cloudflare Media Worker (ec-content-api)
                </span>
                <p className="mt-1 text-sm font-extrabold text-slate-900">
                  {proxyHealth}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  No YouTube Data API key required • Supports /video &amp; /playlist cursor pagination
                </p>
              </div>
            </div>

            {/* Recent Content Updates */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
              <h2 className="text-base font-extrabold text-slate-900">
                Latest Catalog Updates
              </h2>
              <div className="mt-4 space-y-2.5">
                {(overview?.latestContent || allCatalog.slice(0, 10)).map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-indigo-100 px-2 py-0.5 font-extrabold uppercase text-indigo-800">
                        {item.kind}
                      </span>
                      <span className="font-bold text-slate-900">{item.title}</span>
                      <span className="text-slate-500">
                        ({item.exam} • Class {item.classes.join('/')})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          item.active
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {item.active ? 'Active' : 'Disabled'}
                      </span>
                      <span className="text-slate-400">
                        {formatISTDateTime(item.updated_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TODAY'S GOALS */}
        {activeTab === 'goals' && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold text-slate-900">
                  {editingGoal
                    ? `Edit Today's Goal: ${editingGoal.title}`
                    : "Create + Today's Goal (kind=goal)"}
                </h2>
                {editingGoal && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingGoal(null);
                      setGoalTitle('');
                      setGoalDisplayText('');
                    }}
                    className="text-xs font-bold text-slate-500 hover:text-slate-800"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              {goalFeedback && (
                <div className="mt-4 rounded-xl bg-indigo-50 px-4 py-2.5 text-xs font-bold text-indigo-900">
                  {goalFeedback}
                </div>
              )}

              <form onSubmit={handleSaveGoal} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      Goal Headline / Title
                    </label>
                    <input
                      type="text"
                      required
                      value={goalTitle}
                      onChange={(e) => setGoalTitle(e.target.value)}
                      placeholder="e.g. Complete Electrostatics DPP #3"
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      Schedule Start (IST — Optional)
                    </label>
                    <input
                      type="datetime-local"
                      value={goalStartsAtLocal}
                      onChange={(e) => setGoalStartsAtLocal(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      Schedule End (IST — Optional)
                    </label>
                    <input
                      type="datetime-local"
                      value={goalEndsAtLocal}
                      onChange={(e) => setGoalEndsAtLocal(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      Target Exam
                    </label>
                    <select
                      value={goalExam}
                      onChange={(e) => setGoalExam(e.target.value as ContentExam)}
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    >
                      <option value="JEE">JEE</option>
                      <option value="NEET">NEET</option>
                      <option value="Both">Both</option>
                    </select>
                  </div>

                  <div>
                    <span className="block text-xs font-bold uppercase text-slate-700">
                      Target Classes
                    </span>
                    <div className="mt-2 flex items-center gap-3">
                      {(['11', '12'] as const).map((cls) => (
                        <label
                          key={cls}
                          className="inline-flex items-center gap-1.5 text-sm font-semibold"
                        >
                          <input
                            type="checkbox"
                            checked={goalClasses.includes(cls)}
                            onChange={() =>
                              toggleClassItem(cls, goalClasses, setGoalClasses)
                            }
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                          />
                          <span>Class {cls}th</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      Priority (Higher appears first)
                    </label>
                    <input
                      type="number"
                      value={goalPriority}
                      onChange={(e) => setGoalPriority(Number(e.target.value) || 1)}
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      CTA Button Label
                    </label>
                    <input
                      type="text"
                      value={goalCtaLabel}
                      onChange={(e) => setGoalCtaLabel(e.target.value)}
                      placeholder="Start Studying"
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      Internal Destination Link
                    </label>
                    <input
                      type="text"
                      value={goalDeepLink}
                      onChange={(e) => setGoalDeepLink(e.target.value)}
                      placeholder="/lectures or /tests"
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    />
                  </div>

                  <div className="flex items-end">
                    <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-800">
                      <input
                        type="checkbox"
                        checked={goalActive}
                        onChange={(e) => setGoalActive(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      />
                      <span>Enabled</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700">
                    Exact Display Text for Students
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={goalDisplayText}
                    onChange={(e) => setGoalDisplayText(e.target.value)}
                    placeholder="Watch Lecture 3 & solve 25 PYQs before 9:00 PM IST..."
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                  />
                </div>

                {/* Live Student Goal Card Preview */}
                {(goalTitle || goalDisplayText) && (
                  <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
                    <span className="text-[11px] font-bold uppercase text-indigo-600">
                      Live Student Home Card Preview ({goalExam} • Class{' '}
                      {goalClasses.join('/')})
                    </span>
                    <div className="mt-2 rounded-xl border border-indigo-100 bg-white p-3.5">
                      <p className="text-sm font-bold text-slate-900">
                        {goalTitle || 'Goal Title'}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {goalDisplayText || 'Goal display text...'}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingGoal}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    <span>
                      {savingGoal
                        ? 'Saving...'
                        : editingGoal
                        ? 'Update Goal'
                        : "Save Today's Goal"}
                    </span>
                  </button>
                </div>
              </form>
            </div>

            {/* Saved Goals List */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-3">
              <h3 className="text-base font-extrabold text-slate-900">
                All Today&apos;s Goals ({goalsList.length})
              </h3>
              {goalsList.map((g) => {
                const m = g.metadata || {};
                return (
                  <div
                    key={g.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-xs font-bold">
                        <span className="rounded bg-indigo-50 px-2 py-0.5 text-indigo-700">
                          {g.exam} • Class {g.classes.join('/')}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 ${
                            g.active
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {g.active ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <h4 className="mt-1 text-sm font-bold text-slate-900">
                        {g.title}
                      </h4>
                      <p className="text-xs text-slate-600">
                        {m.displayText || g.description}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Starts: {formatISTDateTime(m.startsAt)} • Ends:{' '}
                        {formatISTDateTime(m.endsAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingGoal(g);
                          setGoalTitle(g.title);
                          setGoalDisplayText(m.displayText || g.description || '');
                          setGoalExam(g.exam);
                          setGoalClasses(g.classes);
                          setGoalStartsAtLocal(toISTDateTimeLocalInput(m.startsAt));
                          setGoalEndsAtLocal(toISTDateTimeLocalInput(m.endsAt));
                          setGoalDeepLink(m.deepLink || '/lectures');
                          setGoalCtaLabel(m.ctaLabel || 'Start Now');
                          setGoalPriority(Number(m.priority || 10));
                          setGoalActive(g.active !== false);
                        }}
                        className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      {g.active !== false && (
                        <button
                          type="button"
                          onClick={() => setDisableTarget(g)}
                          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
                        >
                          Disable
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: BATCHES */}
        {activeTab === 'batches' && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold text-slate-900">
                  {editingBatch
                    ? `Edit Batch: ${editingBatch.title}`
                    : 'Create New Batch (kind=batch)'}
                </h2>
                {editingBatch && (
                  <button
                    type="button"
                    onClick={() => setEditingBatch(null)}
                    className="text-xs font-bold text-slate-500"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              {batchFeedback && (
                <div className="mt-4 rounded-xl bg-indigo-50 px-4 py-2.5 text-xs font-bold text-indigo-900">
                  {batchFeedback}
                </div>
              )}

              <form onSubmit={handleSaveBatch} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      Batch Name / Title
                    </label>
                    <input
                      type="text"
                      required
                      value={batchTitle}
                      onChange={(e) => setBatchTitle(e.target.value)}
                      placeholder="e.g. Sankalp JEE 2027 Target Batch"
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      Batch Code Display (Public Tag)
                    </label>
                    <input
                      type="text"
                      value={batchCodeDisplay}
                      onChange={(e) => setBatchCodeDisplay(e.target.value)}
                      placeholder="e.g. JEE-11-SANKALP"
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      Secret Enrollment Access Code (Leave blank for 1-Tap Free)
                    </label>
                    <input
                      type="text"
                      value={batchAccessCode}
                      onChange={(e) => setBatchAccessCode(e.target.value)}
                      placeholder="Optional secret access code"
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      Lead Instructor / Faculty
                    </label>
                    <input
                      type="text"
                      value={batchInstructor}
                      onChange={(e) => setBatchInstructor(e.target.value)}
                      placeholder="e.g. Arvind Dara Sir & Team"
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      Subjects (Comma-separated)
                    </label>
                    <input
                      type="text"
                      value={batchSubjectsText}
                      onChange={(e) => setBatchSubjectsText(e.target.value)}
                      placeholder="Physics, Chemistry, Mathematics"
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      Thumbnail Image URL (16:9 Cover)
                    </label>
                    <input
                      type="url"
                      value={batchThumbnailUrl}
                      onChange={(e) => setBatchThumbnailUrl(e.target.value)}
                      placeholder="https://.../batch-cover.jpg"
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      Target Exam
                    </label>
                    <select
                      value={batchExam}
                      onChange={(e) => setBatchExam(e.target.value as ContentExam)}
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    >
                      <option value="JEE">JEE</option>
                      <option value="NEET">NEET</option>
                      <option value="Both">Both</option>
                    </select>
                  </div>

                  <div>
                    <span className="block text-xs font-bold uppercase text-slate-700">
                      Target Classes
                    </span>
                    <div className="mt-2 flex items-center gap-3">
                      {(['11', '12'] as const).map((cls) => (
                        <label
                          key={cls}
                          className="inline-flex items-center gap-1.5 text-sm font-semibold"
                        >
                          <input
                            type="checkbox"
                            checked={batchClasses.includes(cls)}
                            onChange={() =>
                              toggleClassItem(cls, batchClasses, setBatchClasses)
                            }
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                          />
                          <span>Class {cls}th</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-end">
                    <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-800">
                      <input
                        type="checkbox"
                        checked={batchActive}
                        onChange={(e) => setBatchActive(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      />
                      <span>Active</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      About Batch
                    </label>
                    <textarea
                      rows={3}
                      value={batchAbout}
                      onChange={(e) => setBatchAbout(e.target.value)}
                      placeholder="Detailed overview of this batch..."
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      Batch Features (One per line)
                    </label>
                    <textarea
                      rows={3}
                      value={batchFeaturesText}
                      onChange={(e) => setBatchFeaturesText(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingBatch}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    <span>
                      {savingBatch
                        ? 'Saving...'
                        : editingBatch
                        ? 'Update Batch'
                        : 'Create Batch'}
                    </span>
                  </button>
                </div>
              </form>
            </div>

            {/* Saved Batches List */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-3">
              <h3 className="text-base font-extrabold text-slate-900">
                All Batches ({batchesList.length})
              </h3>
              {batchesList.map((b) => {
                const m = b.metadata || {};
                return (
                  <div
                    key={b.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                        <span className="rounded bg-indigo-50 px-2 py-0.5 text-indigo-700">
                          {b.exam} • Class {b.classes.join('/')}
                        </span>
                        {m.codeDisplay && (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">
                            {m.codeDisplay}
                          </span>
                        )}
                        {b.access_code ? (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900">
                            Access Code: {b.access_code}
                          </span>
                        ) : (
                          <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700">
                            Open 1-Tap Enrollment
                          </span>
                        )}
                        {!b.active && (
                          <span className="rounded bg-rose-100 px-2 py-0.5 text-rose-700">
                            Disabled
                          </span>
                        )}
                      </div>
                      <h4 className="mt-1 text-sm font-extrabold text-slate-900">
                        {b.title}
                      </h4>
                      <p className="text-xs text-slate-500">{b.description}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingBatch(b);
                          setBatchTitle(b.title);
                          setBatchCodeDisplay(m.codeDisplay || '');
                          setBatchAbout(b.description || '');
                          setBatchInstructor(m.instructor || '');
                          setBatchSubjectsText(
                            Array.isArray(m.subjects) ? m.subjects.join(', ') : ''
                          );
                          setBatchFeaturesText(
                            Array.isArray(m.features) ? m.features.join('\n') : ''
                          );
                          setBatchThumbnailUrl(m.thumbnailUrl || '');
                          setBatchAccessCode(b.access_code || '');
                          setBatchExam(b.exam);
                          setBatchClasses(b.classes);
                          setBatchActive(b.active !== false);
                        }}
                        className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      {b.active !== false && (
                        <button
                          type="button"
                          onClick={() => setDisableTarget(b)}
                          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
                        >
                          Disable
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 4: LECTURES & PLAYLISTS & PDF RESOURCES */}
        {activeTab === 'lectures' && (
          <AdminLecturesTab
            allCatalog={allCatalog}
            onRefresh={loadAllAdminData}
            onRequestDisable={(item) => setDisableTarget(item)}
          />
        )}

        {/* TAB 5: SERIES */}
        {activeTab === 'series' && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold text-slate-900">
                  {editingSeries
                    ? `Edit Series: ${editingSeries.title}`
                    : 'Create Lecture Series (kind=series)'}
                </h2>
                {editingSeries && (
                  <button
                    type="button"
                    onClick={() => setEditingSeries(null)}
                    className="text-xs font-bold text-slate-500"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              {seriesFeedback && (
                <div className="mt-4 rounded-xl bg-indigo-50 px-4 py-2.5 text-xs font-bold text-indigo-900">
                  {seriesFeedback}
                </div>
              )}

              <form onSubmit={handleSaveSeries} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      Series Title
                    </label>
                    <input
                      type="text"
                      required
                      value={seriesTitle}
                      onChange={(e) => setSeriesTitle(e.target.value)}
                      placeholder="e.g. Organic Chemistry Rapid Revision Series"
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      Thumbnail Image URL
                    </label>
                    <input
                      type="url"
                      value={seriesThumbnailUrl}
                      onChange={(e) => setSeriesThumbnailUrl(e.target.value)}
                      placeholder="https://.../series.jpg"
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      Optional Access Code
                    </label>
                    <input
                      type="text"
                      value={seriesAccessCode}
                      onChange={(e) => setSeriesAccessCode(e.target.value)}
                      placeholder="Leave empty for open 1-tap enrollment"
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      Target Exam
                    </label>
                    <select
                      value={seriesExam}
                      onChange={(e) => setSeriesExam(e.target.value as ContentExam)}
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    >
                      <option value="JEE">JEE</option>
                      <option value="NEET">NEET</option>
                      <option value="Both">Both</option>
                    </select>
                  </div>

                  <div>
                    <span className="block text-xs font-bold uppercase text-slate-700">
                      Target Classes
                    </span>
                    <div className="mt-2 flex items-center gap-3">
                      {(['11', '12'] as const).map((cls) => (
                        <label
                          key={cls}
                          className="inline-flex items-center gap-1.5 text-sm font-semibold"
                        >
                          <input
                            type="checkbox"
                            checked={seriesClasses.includes(cls)}
                            onChange={() =>
                              toggleClassItem(cls, seriesClasses, setSeriesClasses)
                            }
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                          />
                          <span>Class {cls}th</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-end">
                    <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-800">
                      <input
                        type="checkbox"
                        checked={seriesActive}
                        onChange={(e) => setSeriesActive(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      />
                      <span>Active</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      About Series
                    </label>
                    <textarea
                      rows={2}
                      value={seriesAbout}
                      onChange={(e) => setSeriesAbout(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      Series Features (One per line)
                    </label>
                    <textarea
                      rows={2}
                      value={seriesFeaturesText}
                      onChange={(e) => setSeriesFeaturesText(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingSeries}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    <span>
                      {savingSeries
                        ? 'Saving...'
                        : editingSeries
                        ? 'Update Series'
                        : 'Create Series'}
                    </span>
                  </button>
                </div>
              </form>
            </div>

            {/* Saved Series + Ordered Child Lessons */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
              <h3 className="text-base font-extrabold text-slate-900">
                All Series &amp; Ordered Child Lessons ({seriesList.length})
              </h3>
              {seriesList.map((s) => {
                const m = s.metadata || {};
                const childLessons = (
                  allCatalog.filter(
                    (c) => c.kind === 'lecture' && c.metadata?.parentId === s.id
                  ) as CourseCatalogItem<LectureMetadata>[]
                ).sort(
                  (a, b) =>
                    Number(a.metadata?.position || 0) -
                    Number(b.metadata?.position || 0)
                );

                return (
                  <div
                    key={s.id}
                    className="rounded-2xl border border-slate-200 p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-xs font-bold">
                          <span className="rounded bg-indigo-50 px-2 py-0.5 text-indigo-700">
                            {s.exam} • Class {s.classes.join('/')}
                          </span>
                          {s.access_code ? (
                            <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900">
                              Code: {s.access_code}
                            </span>
                          ) : (
                            <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700">
                              Open Series
                            </span>
                          )}
                          {!s.active && (
                            <span className="rounded bg-rose-100 px-2 py-0.5 text-rose-700">
                              Disabled
                            </span>
                          )}
                        </div>
                        <h4 className="mt-1 text-sm font-extrabold text-slate-900">
                          {s.title}
                        </h4>
                        <p className="text-xs text-slate-500">{s.description}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSeries(s);
                            setSeriesTitle(s.title);
                            setSeriesAbout(s.description || '');
                            setSeriesThumbnailUrl(m.thumbnailUrl || '');
                            setSeriesAccessCode(s.access_code || '');
                            setSeriesFeaturesText(
                              Array.isArray(m.features) ? m.features.join('\n') : ''
                            );
                            setSeriesExam(s.exam);
                            setSeriesClasses(s.classes);
                            setSeriesActive(s.active !== false);
                          }}
                          className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        {s.active !== false && (
                          <button
                            type="button"
                            onClick={() => setDisableTarget(s)}
                            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
                          >
                            Disable
                          </button>
                        )}
                      </div>
                    </div>

                    {childLessons.length > 0 && (
                      <div className="rounded-xl bg-slate-50 p-3 space-y-1.5">
                        <span className="text-[11px] font-bold uppercase text-slate-500">
                          Ordered Child Lessons ({childLessons.length})
                        </span>
                        {childLessons.map((ch, idx) => (
                          <div
                            key={ch.id}
                            className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-1.5 text-xs border border-slate-200"
                          >
                            <span className="truncate font-semibold text-slate-800">
                              #{ch.metadata?.position || idx + 1} — {ch.title}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => handleMoveChildLecture(s.id, ch, 'up')}
                                className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"
                                title="Move up"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === childLessons.length - 1}
                                onClick={() =>
                                  handleMoveChildLecture(s.id, ch, 'down')
                                }
                                className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"
                                title="Move down"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 6: TESTS & SCHEDULES */}
        {activeTab === 'tests' && (
          <AdminTestsTab
            allCatalog={allCatalog}
            onRefresh={loadAllAdminData}
            onRequestDisable={(item) => setDisableTarget(item)}
          />
        )}

        {/* TAB 7: EVENTS / BANNERS */}
        {activeTab === 'events' && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold text-slate-900">
                  {editingEvent
                    ? `Edit Event Banner: ${editingEvent.title}`
                    : 'Create Event / Banner Carousel (kind=event)'}
                </h2>
                {editingEvent && (
                  <button
                    type="button"
                    onClick={() => setEditingEvent(null)}
                    className="text-xs font-bold text-slate-500"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              {eventFeedback && (
                <div className="mt-4 rounded-xl bg-indigo-50 px-4 py-2.5 text-xs font-bold text-indigo-900">
                  {eventFeedback}
                </div>
              )}

              <form onSubmit={handleSaveEvent} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      Event Title
                    </label>
                    <input
                      type="text"
                      required
                      value={eventTitle}
                      onChange={(e) => setEventTitle(e.target.value)}
                      placeholder="e.g. All India Scholarship Test 2026"
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      Schedule Start (IST)
                    </label>
                    <input
                      type="datetime-local"
                      value={eventStartsLocal}
                      onChange={(e) => setEventStartsLocal(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      Schedule End (IST)
                    </label>
                    <input
                      type="datetime-local"
                      value={eventEndsLocal}
                      onChange={(e) => setEventEndsLocal(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      Default Internal Deep Link
                    </label>
                    <input
                      type="text"
                      value={eventDeepLink}
                      onChange={(e) => setEventDeepLink(e.target.value)}
                      placeholder="/tests or /lectures"
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      Target Exam
                    </label>
                    <select
                      value={eventExam}
                      onChange={(e) => setEventExam(e.target.value as ContentExam)}
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    >
                      <option value="Both">Both (JEE &amp; NEET)</option>
                      <option value="JEE">JEE</option>
                      <option value="NEET">NEET</option>
                    </select>
                  </div>

                  <div>
                    <span className="block text-xs font-bold uppercase text-slate-700">
                      Classes &amp; Active State
                    </span>
                    <div className="mt-2 flex items-center gap-3">
                      {(['11', '12'] as const).map((cls) => (
                        <label
                          key={cls}
                          className="inline-flex items-center gap-1 text-xs font-bold"
                        >
                          <input
                            type="checkbox"
                            checked={eventClasses.includes(cls)}
                            onChange={() =>
                              toggleClassItem(cls, eventClasses, setEventClasses)
                            }
                          />
                          <span>{cls}th</span>
                        </label>
                      ))}
                      <label className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700">
                        <input
                          type="checkbox"
                          checked={eventActive}
                          onChange={(e) => setEventActive(e.target.checked)}
                        />
                        <span>Enabled</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700">
                    Event Subtitle / Description
                  </label>
                  <input
                    type="text"
                    value={eventText}
                    onChange={(e) => setEventText(e.target.value)}
                    placeholder="Banner subtitle text..."
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                  />
                </div>

                {/* Multiple Banner Images with Reorder & Aspect Ratio Preview */}
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold uppercase text-slate-700">
                      Banner Image URLs (Reorderable)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setEventImages((prev) => [
                          ...prev,
                          { url: '', caption: '', deepLink: eventDeepLink },
                        ])
                      }
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1 text-xs font-bold text-white"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add Banner Row</span>
                    </button>
                  </div>

                  {eventImages.map((img, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-12 items-center"
                    >
                      <div className="sm:col-span-5">
                        <input
                          type="url"
                          required={idx === 0}
                          value={img.url}
                          onChange={(e) =>
                            setEventImages((prev) =>
                              prev.map((r, i) =>
                                i === idx ? { ...r, url: e.target.value } : r
                              )
                            )
                          }
                          placeholder="https://.../banner.jpg"
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <input
                          type="text"
                          value={img.caption || ''}
                          onChange={(e) =>
                            setEventImages((prev) =>
                              prev.map((r, i) =>
                                i === idx ? { ...r, caption: e.target.value } : r
                              )
                            )
                          }
                          placeholder="Optional slide caption"
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <input
                          type="text"
                          value={img.deepLink || ''}
                          onChange={(e) =>
                            setEventImages((prev) =>
                              prev.map((r, i) =>
                                i === idx ? { ...r, deepLink: e.target.value } : r
                              )
                            )
                          }
                          placeholder="/tests"
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                        />
                      </div>
                      <div className="sm:col-span-2 flex items-center justify-end gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveBannerRow(idx, 'up')}
                          className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === eventImages.length - 1}
                          onClick={() => moveBannerRow(idx, 'down')}
                          className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        {eventImages.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setEventImages((prev) =>
                                prev.filter((_, i) => i !== idx)
                              )
                            }
                            className="rounded p-1 text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* 16:7 Aspect Ratio Preview */}
                  {eventImages[0]?.url && isSafeHttpUrl(eventImages[0].url) && (
                    <div className="mt-3">
                      <span className="text-[11px] font-bold uppercase text-slate-500">
                        Banner Crop &amp; Aspect Ratio Preview (object-fit: cover)
                      </span>
                      <div className="mt-1 aspect-[16/7] max-w-xl overflow-hidden rounded-2xl border border-slate-300 bg-slate-900">
                        <img
                          src={eventImages[0].url}
                          alt="Banner preview"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingEvent}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    <span>
                      {savingEvent
                        ? 'Saving...'
                        : editingEvent
                        ? 'Update Event Banner'
                        : 'Save Event Banner'}
                    </span>
                  </button>
                </div>
              </form>
            </div>

            {/* Saved Events */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-3">
              <h3 className="text-base font-extrabold text-slate-900">
                Saved Events / Banners ({eventsList.length})
              </h3>
              {eventsList.map((ev) => {
                const m = ev.metadata || {};
                const imgs = Array.isArray(m.images) ? m.images : [];
                return (
                  <div
                    key={ev.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4"
                  >
                    <div>
                      <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700">
                        {ev.exam} • Class {ev.classes.join('/')} • {imgs.length} slide(s)
                      </span>
                      <h4 className="mt-1 text-sm font-bold text-slate-900">
                        {ev.title}
                      </h4>
                      <p className="text-xs text-slate-500">{ev.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingEvent(ev);
                          setEventTitle(ev.title);
                          setEventText(ev.description || '');
                          setEventExam(ev.exam);
                          setEventClasses(ev.classes);
                          setEventStartsLocal(toISTDateTimeLocalInput(m.startsAt));
                          setEventEndsLocal(toISTDateTimeLocalInput(m.endsAt));
                          setEventDeepLink(m.deepLink || '/lectures');
                          setEventCtaLabel(m.ctaLabel || 'Explore Now');
                          setEventActive(ev.active !== false);
                          setEventImages(
                            imgs.length > 0
                              ? imgs
                              : [{ url: m.thumbnailUrl || '', caption: '', deepLink: '/lectures' }]
                          );
                        }}
                        className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700"
                      >
                        Edit
                      </button>
                      {ev.active !== false && (
                        <button
                          type="button"
                          onClick={() => setDisableTarget(ev)}
                          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700"
                        >
                          Disable
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 8: ANNOUNCEMENTS */}
        {activeTab === 'announcements' && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold text-slate-900">
                  {editingAnn
                    ? `Edit Announcement: ${editingAnn.title}`
                    : 'Publish Text Announcement (/admin/announcements)'}
                </h2>
                {editingAnn && (
                  <button
                    type="button"
                    onClick={() => setEditingAnn(null)}
                    className="text-xs font-bold text-slate-500"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              {annFeedback && (
                <div className="mt-4 rounded-xl bg-indigo-50 px-4 py-2.5 text-xs font-bold text-indigo-900">
                  {annFeedback}
                </div>
              )}

              <form onSubmit={handleSaveAnnouncement} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      Announcement Title
                    </label>
                    <input
                      type="text"
                      required
                      value={annTitle}
                      onChange={(e) => setAnnTitle(e.target.value)}
                      placeholder="e.g. Sunday Minor Test Syllabus Updated"
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      Target Audience
                    </label>
                    <select
                      value={annAudience}
                      onChange={(e) => setAnnAudience(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    >
                      <option value="All">All Students</option>
                      <option value="JEE">JEE (Class 11 &amp; 12)</option>
                      <option value="NEET">NEET (Class 11 &amp; 12)</option>
                      <option value="JEE_11">JEE Class 11th Only</option>
                      <option value="JEE_12">JEE Class 12th Only</option>
                      <option value="NEET_11">NEET Class 11th Only</option>
                      <option value="NEET_12">NEET Class 12th Only</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700">
                      Schedule Time (IST — Optional)
                    </label>
                    <input
                      type="datetime-local"
                      value={annScheduledLocal}
                      onChange={(e) => setAnnScheduledLocal(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700">
                    Announcement Body
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={annBody}
                    onChange={(e) => setAnnBody(e.target.value)}
                    placeholder="Write the full notice for students..."
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={annActive}
                      onChange={(e) => setAnnActive(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                    <span>Active</span>
                  </label>

                  <button
                    type="submit"
                    disabled={savingAnn}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <Megaphone className="h-4 w-4" />
                    <span>
                      {savingAnn
                        ? 'Saving...'
                        : editingAnn
                        ? 'Update Announcement'
                        : 'Publish Announcement'}
                    </span>
                  </button>
                </div>
              </form>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-3">
              <h3 className="text-base font-extrabold text-slate-900">
                All Announcements ({announcements.length})
              </h3>
              {announcements.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4"
                >
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold">
                      <span className="rounded bg-indigo-50 px-2 py-0.5 text-indigo-700">
                        Audience: {a.audience}
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 ${
                          a.active
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {a.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <h4 className="mt-1 text-sm font-bold text-slate-900">
                      {a.title}
                    </h4>
                    <p className="text-xs text-slate-600">{a.body}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Scheduled: {formatISTDateTime(a.scheduled_at || a.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAnn(a);
                        setAnnTitle(a.title);
                        setAnnBody(a.body);
                        setAnnAudience(a.audience || 'All');
                        setAnnScheduledLocal(toISTDateTimeLocalInput(a.scheduled_at));
                        setAnnActive(a.active !== false);
                      }}
                      className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 9: STUDENTS */}
        {activeTab === 'students' && (
          <AdminStudentsTab
            students={students}
            onOpenStudentChat={(student) => {
              setChatStudentUid(student.firebase_uid);
              setActiveTab('chat');
            }}
          />
        )}

        {/* TAB 10: CHAT / NOTIFICATIONS */}
        {activeTab === 'chat' && user && (
          <AdminChatAndNotificationsTab
            adminUid={user.uid}
            students={students}
            initialStudentUid={chatStudentUid}
          />
        )}
      </main>

      <ConfirmDialog
        open={Boolean(disableTarget)}
        title={`Disable "${disableTarget?.title || 'Content'}"?`}
        message="This will soft-disable (active=false) this item so it no longer appears to students. No database rows are physically deleted, and you can re-enable it anytime by editing it."
        confirmLabel="Disable Item"
        variant="danger"
        loading={disabling}
        onConfirm={handleConfirmDisable}
        onCancel={() => setDisableTarget(null)}
      />
    </div>
  );
};
