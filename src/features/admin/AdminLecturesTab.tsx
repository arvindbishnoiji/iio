import React, { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Edit3,
  FileText,
  ListVideo,
  Loader2,
  PlayCircle,
  Plus,
  Sparkles,
  Trash2,
  Video,
  XCircle,
} from 'lucide-react';
import {
  createAdminContent,
  updateAdminContent,
  type AdminContentPayload,
} from '../../lib/api';
import {
  extractYoutubeVideoId,
  fetchVideoMetadata,
  getYoutubeDefaultThumbnail,
  getYoutubeWatchUrl,
  importFullYoutubePlaylist,
  type PlaylistImportProgress,
} from '../../lib/mediaProxy';
import { isSafeHttpUrl } from '../../lib/validation';
import type {
  ClassLevel,
  CloudflarePlaylistItem,
  ContentExam,
  CourseCatalogItem,
  LectureMetadata,
  ResourceMetadata,
} from '../../types';

interface AdminLecturesTabProps {
  allCatalog: CourseCatalogItem[];
  onRefresh: () => Promise<void>;
  onRequestDisable: (item: CourseCatalogItem) => void;
}

export const AdminLecturesTab: React.FC<AdminLecturesTabProps> = ({
  allCatalog,
  onRefresh,
  onRequestDisable,
}) => {
  const [subMode, setSubMode] = useState<'single' | 'playlist' | 'resources'>('single');

  const batchesAndSeries = useMemo(
    () => allCatalog.filter((c) => c.kind === 'batch' || c.kind === 'series'),
    [allCatalog]
  );

  const lecturesList = useMemo(
    () =>
      (
        allCatalog.filter((c) => c.kind === 'lecture') as CourseCatalogItem<LectureMetadata>[]
      ).sort(
        (a, b) => Number(a.metadata?.position || 0) - Number(b.metadata?.position || 0)
      ),
    [allCatalog]
  );

  const resourcesList = useMemo(
    () =>
      allCatalog.filter(
        (c) => c.kind === 'resource'
      ) as CourseCatalogItem<ResourceMetadata>[],
    [allCatalog]
  );

  // Filter state for existing lectures table
  const [filterParentId, setFilterParentId] = useState('');
  const [filterExam, setFilterExam] = useState<string>('');

  // ---------------------------------------------------------------------------
  // 1. SINGLE VIDEO FORM STATE
  // ---------------------------------------------------------------------------
  const [editingLecture, setEditingLecture] =
    useState<CourseCatalogItem<LectureMetadata> | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [videoId, setVideoId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [duration, setDuration] = useState('');
  const [lessonTopic, setLessonTopic] = useState('');
  const [position, setPosition] = useState<number>(1);
  const [parentId, setParentId] = useState('');
  const [notesPdfUrl, setNotesPdfUrl] = useState('');
  const [exam, setExam] = useState<ContentExam>('JEE');
  const [classes, setClasses] = useState<ClassLevel[]>(['11', '12']);
  const [active, setActive] = useState(true);

  const [fetchingMeta, setFetchingMeta] = useState(false);
  const [metaWarning, setMetaWarning] = useState<string | null>(null);
  const [savingSingle, setSavingSingle] = useState(false);
  const [singleFeedback, setSingleFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleParentSelectForSingle = (selectedParentId: string) => {
    setParentId(selectedParentId);
    const parentObj = batchesAndSeries.find((p) => p.id === selectedParentId);
    if (parentObj) {
      setExam(parentObj.exam);
      setClasses(parentObj.classes);
    }
  };

  const handleFetchSingleVideo = async () => {
    setMetaWarning(null);
    setSingleFeedback(null);
    const trimmed = youtubeUrl.trim();
    if (!trimmed) {
      setMetaWarning('Enter a YouTube video URL first.');
      return;
    }

    const extracted = extractYoutubeVideoId(trimmed);
    if (extracted) {
      setVideoId(extracted);
      if (!thumbnailUrl) {
        setThumbnailUrl(getYoutubeDefaultThumbnail(extracted));
      }
    }

    setFetchingMeta(true);
    try {
      const data = await fetchVideoMetadata(trimmed);
      setVideoId(data.videoId);
      if (data.title) setTitle(data.title);
      if (data.thumbnail) setThumbnailUrl(data.thumbnail);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Could not auto-fill metadata from Cloudflare proxy.';
      setMetaWarning(
        `${msg} You can still enter or edit the Title, Video ID, and Thumbnail manually below.`
      );
    } finally {
      setFetchingMeta(false);
    }
  };

  const resetSingleForm = () => {
    setEditingLecture(null);
    setYoutubeUrl('');
    setVideoId('');
    setTitle('');
    setDescription('');
    setThumbnailUrl('');
    setDuration('');
    setLessonTopic('');
    setPosition(lecturesList.length + 1);
    setNotesPdfUrl('');
    setActive(true);
    setMetaWarning(null);
  };

  const startEditLecture = (lec: CourseCatalogItem<LectureMetadata>) => {
    const m = lec.metadata || {};
    setSubMode('single');
    setEditingLecture(lec);
    setYoutubeUrl(m.youtubeUrl || (m.videoId ? getYoutubeWatchUrl(m.videoId) : ''));
    setVideoId(m.videoId || extractYoutubeVideoId(m.youtubeUrl || ''));
    setTitle(lec.title);
    setDescription(lec.description || '');
    setThumbnailUrl(m.thumbnailUrl || '');
    setDuration(m.duration || '');
    setLessonTopic(m.lesson || m.topic || '');
    setPosition(Number(m.position || 1));
    setParentId(m.parentId || '');
    setNotesPdfUrl(m.notesPdfUrl || '');
    setExam(lec.exam);
    setClasses(lec.classes);
    setActive(lec.active !== false);
    setSingleFeedback(null);
  };

  const handleSaveSingleLecture = async (e: React.FormEvent) => {
    e.preventDefault();
    setSingleFeedback(null);

    const resolvedVideoId =
      videoId.trim() || extractYoutubeVideoId(youtubeUrl.trim());
    if (!resolvedVideoId) {
      setSingleFeedback({
        type: 'error',
        message: 'Provide a valid YouTube video URL or 11-character YouTube videoId.',
      });
      return;
    }
    if (!title.trim()) {
      setSingleFeedback({
        type: 'error',
        message: 'Lecture title is required.',
      });
      return;
    }
    if (classes.length === 0) {
      setSingleFeedback({
        type: 'error',
        message: 'Select at least one class (11th or 12th).',
      });
      return;
    }
    if (notesPdfUrl.trim() && !isSafeHttpUrl(notesPdfUrl.trim())) {
      setSingleFeedback({
        type: 'error',
        message: 'Notes PDF URL must be a valid http(s) link.',
      });
      return;
    }

    setSavingSingle(true);
    try {
      const existingMeta = editingLecture?.metadata || {};
      const payload: AdminContentPayload = {
        kind: 'lecture',
        title: title.trim(),
        description: description.trim(),
        exam,
        classes,
        active,
        metadata: {
          ...existingMeta,
          youtubeUrl: youtubeUrl.trim() || getYoutubeWatchUrl(resolvedVideoId),
          videoId: resolvedVideoId,
          thumbnailUrl:
            thumbnailUrl.trim() || getYoutubeDefaultThumbnail(resolvedVideoId),
          duration: duration.trim(),
          position: Number(position) || 1,
          parentId: parentId || '',
          lesson: lessonTopic.trim(),
          topic: lessonTopic.trim(),
          notesPdfUrl: notesPdfUrl.trim() || '',
        },
      };

      if (editingLecture) {
        await updateAdminContent(editingLecture.id, payload);
        setSingleFeedback({
          type: 'success',
          message: `Updated lecture "${payload.title}".`,
        });
      } else {
        await createAdminContent(payload);
        setSingleFeedback({
          type: 'success',
          message: `Added lecture "${payload.title}".`,
        });
      }
      resetSingleForm();
      await onRefresh();
    } catch (err) {
      setSingleFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save lecture.',
      });
    } finally {
      setSavingSingle(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 2. PLAYLIST IMPORT STATE (Cursor Pagination + Deduplication + Preview)
  // ---------------------------------------------------------------------------
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [playlistParentId, setPlaylistParentId] = useState('');
  const [playlistExam, setPlaylistExam] = useState<ContentExam>('JEE');
  const [playlistClasses, setPlaylistClasses] = useState<ClassLevel[]>(['11', '12']);
  const [playlistLessonDefault, setPlaylistLessonDefault] = useState('');

  const [importingPlaylist, setImportingPlaylist] = useState(false);
  const [importProgress, setImportProgress] =
    useState<PlaylistImportProgress | null>(null);
  const [importedRows, setImportedRows] = useState<CloudflarePlaylistItem[]>([]);
  const [importedPlaylistId, setImportedPlaylistId] = useState('');
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const [savingPlaylistBatch, setSavingPlaylistBatch] = useState(false);
  const [playlistSaveProgress, setPlaylistSaveProgress] = useState<{
    saved: number;
    total: number;
  } | null>(null);
  const [playlistSuccess, setPlaylistSuccess] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const handlePlaylistParentChange = (selectedId: string) => {
    setPlaylistParentId(selectedId);
    const parentObj = batchesAndSeries.find((p) => p.id === selectedId);
    if (parentObj) {
      setPlaylistExam(parentObj.exam);
      setPlaylistClasses(parentObj.classes);
    }
  };

  const handleStartPlaylistImport = async () => {
    setPlaylistError(null);
    setPlaylistSuccess(null);
    if (!playlistUrl.trim()) {
      setPlaylistError('Enter a public YouTube playlist URL (containing list=...).');
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setImportingPlaylist(true);
    setImportProgress(null);

    try {
      const result = await importFullYoutubePlaylist(playlistUrl.trim(), {
        signal: controller.signal,
        onProgress: (prog) => {
          setImportProgress(prog);
        },
      });
      setImportedPlaylistId(result.playlistId);
      if (!playlistLessonDefault && result.title) {
        setPlaylistLessonDefault(result.title);
      }
      setImportedRows(
        result.items.map((item, idx) => ({
          ...item,
          position: idx + 1,
          lesson: playlistLessonDefault || result.title || 'Playlist Lesson',
          selected: true,
        }))
      );
      if (result.items.length === 0) {
        setPlaylistError(
          'No public videos were found in this playlist. You can switch to Single Video Entry to add videos manually.'
        );
      }
    } catch (err) {
      setPlaylistError(
        err instanceof Error
          ? `${err.message} Your original URL has been retained — you can retry or use Single Video Entry.`
          : 'Playlist import failed.'
      );
    } finally {
      setImportingPlaylist(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelPlaylistImport = () => {
    abortControllerRef.current?.abort();
  };

  const updateImportedRow = (
    videoIdKey: string,
    changes: Partial<CloudflarePlaylistItem>
  ) => {
    setImportedRows((prev) =>
      prev.map((r) => (r.videoId === videoIdKey ? { ...r, ...changes } : r))
    );
  };

  const handleConfirmSavePlaylist = async () => {
    setPlaylistError(null);
    setPlaylistSuccess(null);

    const selectedRows = importedRows.filter((r) => r.selected !== false);
    if (selectedRows.length === 0) {
      setPlaylistError('Select at least 1 imported video to save.');
      return;
    }
    if (!playlistParentId) {
      setPlaylistError(
        'Please select a target Parent Batch or Series before saving imported lectures.'
      );
      return;
    }
    if (playlistClasses.length === 0) {
      setPlaylistError('Please select at least one target Class (11 or 12).');
      return;
    }

    setSavingPlaylistBatch(true);
    setPlaylistSaveProgress({ saved: 0, total: selectedRows.length });

    let savedCount = 0;
    try {
      const sorted = [...selectedRows].sort(
        (a, b) => Number(a.position || 0) - Number(b.position || 0)
      );
      for (const row of sorted) {
        await createAdminContent({
          kind: 'lecture',
          title: row.title.trim() || `Lecture ${row.position}`,
          description: row.description || '',
          exam: playlistExam,
          classes: playlistClasses,
          active: true,
          metadata: {
            youtubeUrl: row.watchUrl || getYoutubeWatchUrl(row.videoId),
            videoId: row.videoId,
            thumbnailUrl:
              row.thumbnail || getYoutubeDefaultThumbnail(row.videoId),
            duration: row.duration || '',
            position: Number(row.position) || savedCount + 1,
            parentId: playlistParentId,
            lesson: row.lesson || playlistLessonDefault || 'Playlist Lesson',
            topic: row.lesson || playlistLessonDefault || 'Playlist Lesson',
            playlistId: importedPlaylistId || '',
          },
        });
        savedCount += 1;
        setPlaylistSaveProgress({
          saved: savedCount,
          total: selectedRows.length,
        });
      }

      setPlaylistSuccess(
        `Successfully imported and saved ${savedCount} deduplicated lectures!`
      );
      setImportedRows([]);
      await onRefresh();
    } catch (err) {
      setPlaylistError(
        err instanceof Error
          ? `Saved ${savedCount} videos before error: ${err.message}`
          : 'Error while saving playlist lectures.'
      );
    } finally {
      setSavingPlaylistBatch(false);
      setPlaylistSaveProgress(null);
    }
  };

  // ---------------------------------------------------------------------------
  // 3. PDF RESOURCES FORM STATE (`kind=resource`)
  // ---------------------------------------------------------------------------
  const [editingResource, setEditingResource] =
    useState<CourseCatalogItem<ResourceMetadata> | null>(null);
  const [resTitle, setResTitle] = useState('');
  const [resDesc, setResDesc] = useState('');
  const [resPdfUrl, setResPdfUrl] = useState('');
  const [resThumbUrl, setResThumbUrl] = useState('');
  const [resSubject, setResSubject] = useState('');
  const [resParentId, setResParentId] = useState('');
  const [resExam, setResExam] = useState<ContentExam>('JEE');
  const [resClasses, setResClasses] = useState<ClassLevel[]>(['11', '12']);
  const [resActive, setResActive] = useState(true);
  const [savingResource, setSavingResource] = useState(false);
  const [resFeedback, setResFeedback] = useState<string | null>(null);

  const handleSaveResource = async (e: React.FormEvent) => {
    e.preventDefault();
    setResFeedback(null);
    if (!resTitle.trim() || !isSafeHttpUrl(resPdfUrl.trim())) {
      setResFeedback('Provide a title and a valid https:// PDF URL.');
      return;
    }
    setSavingResource(true);
    try {
      const payload: AdminContentPayload = {
        kind: 'resource',
        title: resTitle.trim(),
        description: resDesc.trim(),
        exam: resExam,
        classes: resClasses,
        active: resActive,
        metadata: {
          ...(editingResource?.metadata || {}),
          pdfUrl: resPdfUrl.trim(),
          thumbnailUrl: resThumbUrl.trim(),
          subject: resSubject.trim(),
          parentId: resParentId || '',
        },
      };
      if (editingResource) {
        await updateAdminContent(editingResource.id, payload);
      } else {
        await createAdminContent(payload);
      }
      setEditingResource(null);
      setResTitle('');
      setResDesc('');
      setResPdfUrl('');
      setResThumbUrl('');
      setResSubject('');
      setResFeedback('Resource saved successfully!');
      await onRefresh();
    } catch (err) {
      setResFeedback(
        err instanceof Error ? err.message : 'Failed to save PDF resource.'
      );
    } finally {
      setSavingResource(false);
    }
  };

  const toggleClassInList = (
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

  const filteredLectures = useMemo(() => {
    return lecturesList.filter((l) => {
      if (filterParentId && l.metadata?.parentId !== filterParentId) return false;
      if (filterExam && l.exam !== filterExam) return false;
      return true;
    });
  }, [lecturesList, filterParentId, filterExam]);

  return (
    <div className="space-y-6">
      {/* Sub-navigation between Single Lecture, Playlist Import, and PDF Resources */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSubMode('single')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition ${
            subMode === 'single'
              ? 'bg-indigo-600 text-white'
              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Video className="h-4 w-4" />
          <span>Single Video URL</span>
        </button>

        <button
          type="button"
          onClick={() => setSubMode('playlist')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition ${
            subMode === 'playlist'
              ? 'bg-indigo-600 text-white'
              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <ListVideo className="h-4 w-4" />
          <span>Import Public YouTube Playlist</span>
        </button>

        <button
          type="button"
          onClick={() => setSubMode('resources')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition ${
            subMode === 'resources'
              ? 'bg-indigo-600 text-white'
              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>PDF Notes &amp; Resources ({resourcesList.length})</span>
        </button>
      </div>

      {/* 1. SINGLE VIDEO LECTURE EDITOR */}
      {subMode === 'single' && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-slate-900">
              {editingLecture ? `Edit Lecture: ${editingLecture.title}` : 'Add Single YouTube Lecture'}
            </h2>
            {editingLecture && (
              <button
                type="button"
                onClick={resetSingleForm}
                className="text-xs font-bold text-slate-500 hover:text-slate-800"
              >
                Cancel Edit
              </button>
            )}
          </div>

          {singleFeedback && (
            <div
              className={`mt-4 rounded-xl border px-4 py-3 text-xs sm:text-sm font-medium ${
                singleFeedback.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-rose-200 bg-rose-50 text-rose-700'
              }`}
            >
              {singleFeedback.message}
            </div>
          )}

          {metaWarning && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              {metaWarning}
            </div>
          )}

          <form onSubmit={handleSaveSingleLecture} className="mt-5 space-y-4">
            {/* Step 1: Parent Batch/Series & YouTube URL */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
              <div className="md:col-span-5">
                <label
                  htmlFor="lec-parent"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  Target Parent Batch or Series
                </label>
                <select
                  id="lec-parent"
                  value={parentId}
                  onChange={(e) => handleParentSelectForSingle(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                >
                  <option value="">— Standalone / Open Lecture —</option>
                  {batchesAndSeries.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.kind.toUpperCase()}] {p.title} ({p.exam} • {p.classes.join('/')})
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-7">
                <label
                  htmlFor="lec-yt-url"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  YouTube Video URL (No API Key Required)
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    id="lec-yt-url"
                    type="text"
                    value={youtubeUrl}
                    onChange={(e) => {
                      setYoutubeUrl(e.target.value);
                      const vid = extractYoutubeVideoId(e.target.value);
                      if (vid) setVideoId(vid);
                    }}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                  />
                  <button
                    type="button"
                    disabled={fetchingMeta}
                    onClick={handleFetchSingleVideo}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-50 px-4 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                  >
                    {fetchingMeta ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    <span>{fetchingMeta ? 'Fetching...' : 'Auto-Fill Metadata'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Editable Metadata Fields */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2">
                <label
                  htmlFor="lec-title"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  Lecture Title (Editable)
                </label>
                <input
                  id="lec-title"
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Electrostatics L-01: Coulomb's Law"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900"
                />
              </div>

              <div>
                <label
                  htmlFor="lec-lesson-topic"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  Lesson / Chapter / Topic
                </label>
                <input
                  id="lec-lesson-topic"
                  type="text"
                  value={lessonTopic}
                  onChange={(e) => setLessonTopic(e.target.value)}
                  placeholder="e.g. Chapter 1: Electrostatics"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900"
                />
              </div>

              <div>
                <label
                  htmlFor="lec-position"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  Lesson Order / Position
                </label>
                <input
                  id="lec-position"
                  type="number"
                  min={1}
                  value={position}
                  onChange={(e) => setPosition(Number(e.target.value) || 1)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="lec-thumb"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  Thumbnail URL (Editable)
                </label>
                <input
                  id="lec-thumb"
                  type="url"
                  value={thumbnailUrl}
                  onChange={(e) => setThumbnailUrl(e.target.value)}
                  placeholder="https://img.youtube.com/vi/.../hqdefault.jpg"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900"
                />
              </div>

              <div>
                <label
                  htmlFor="lec-duration"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  Duration Label
                </label>
                <input
                  id="lec-duration"
                  type="text"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="e.g. 54:20"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900"
                />
              </div>

              <div>
                <label
                  htmlFor="lec-pdf"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  Notes / DPP PDF URL (Optional)
                </label>
                <input
                  id="lec-pdf"
                  type="url"
                  value={notesPdfUrl}
                  onChange={(e) => setNotesPdfUrl(e.target.value)}
                  placeholder="https://.../notes.pdf"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="lec-exam"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  Target Exam
                </label>
                <select
                  id="lec-exam"
                  value={exam}
                  onChange={(e) => setExam(e.target.value as ContentExam)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900"
                >
                  <option value="JEE">JEE</option>
                  <option value="NEET">NEET</option>
                  <option value="Both">Both (JEE &amp; NEET)</option>
                </select>
              </div>

              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Target Classes
                </span>
                <div className="mt-2 flex items-center gap-3">
                  {(['11', '12'] as const).map((cls) => (
                    <label
                      key={cls}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={classes.includes(cls)}
                        onChange={() => toggleClassInList(cls, classes, setClasses)}
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
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                  <span>Active (Visible to enrolled students)</span>
                </label>
              </div>
            </div>

            <div>
              <label
                htmlFor="lec-desc"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                Lecture Description / Key Topics
              </label>
              <textarea
                id="lec-desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Summary of concepts covered in this lecture..."
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="submit"
                disabled={savingSingle}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                <span>
                  {savingSingle
                    ? 'Saving...'
                    : editingLecture
                    ? 'Update Lecture'
                    : 'Save Lecture'}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. PUBLIC YOUTUBE PLAYLIST IMPORTER */}
      {subMode === 'playlist' && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">
              Import Public YouTube Playlist (Multi-Page Cursor Pagination)
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Calls Cloudflare Worker <code>/playlist?url=...</code>, follows{' '}
              <code>nextCursor</code> until exhausted, deduplicates by{' '}
              <code>videoId</code>, and lets you preview and edit every row before saving.
            </p>
          </div>

          {playlistError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs sm:text-sm text-rose-700 flex flex-wrap items-center justify-between gap-2">
              <span>{playlistError}</span>
              <button
                type="button"
                onClick={() => {
                  setYoutubeUrl(playlistUrl);
                  setSubMode('single');
                }}
                className="rounded-lg bg-white px-3 py-1 text-xs font-bold text-rose-800 border border-rose-300"
              >
                Switch to Manual Single-Video Entry
              </button>
            </div>
          )}

          {playlistSuccess && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs sm:text-sm font-semibold text-emerald-800">
              {playlistSuccess}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <div className="md:col-span-8">
              <label
                htmlFor="playlist-url-input"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                Public YouTube Playlist URL
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="playlist-url-input"
                  type="url"
                  value={playlistUrl}
                  onChange={(e) => setPlaylistUrl(e.target.value)}
                  placeholder="https://www.youtube.com/playlist?list=PL..."
                  className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                />
                {!importingPlaylist ? (
                  <button
                    type="button"
                    onClick={handleStartPlaylistImport}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700"
                  >
                    <ListVideo className="h-4 w-4" />
                    <span>Fetch Playlist</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCancelPlaylistImport}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-rose-700"
                  >
                    <XCircle className="h-4 w-4" />
                    <span>Cancel Import</span>
                  </button>
                )}
              </div>
            </div>

            <div className="md:col-span-4">
              <label
                htmlFor="playlist-default-lesson"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                Default Chapter / Topic Name
              </label>
              <input
                id="playlist-default-lesson"
                type="text"
                value={playlistLessonDefault}
                onChange={(e) => setPlaylistLessonDefault(e.target.value)}
                placeholder="e.g. Mechanics Full Playlist"
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
              />
            </div>
          </div>

          {importProgress && (
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 px-4 py-3 text-xs font-semibold text-indigo-950 flex items-center justify-between">
              <span>
                Playlist: <strong>{importProgress.playlistTitle || 'Loading...'}</strong> •
                Pages fetched: <strong>{importProgress.pagesFetched}</strong> •
                Deduplicated videos: <strong>{importProgress.totalItems}</strong>
              </span>
              {importingPlaylist && (
                <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
              )}
            </div>
          )}

          {/* Imported Preview Table & Target Confirmation */}
          {importedRows.length > 0 && (
            <div className="space-y-4 border-t border-slate-200 pt-5">
              <div className="grid grid-cols-1 gap-4 rounded-2xl bg-slate-50 p-4 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="playlist-target-parent"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                  >
                    Confirm Target Batch / Series (Required)
                  </label>
                  <select
                    id="playlist-target-parent"
                    value={playlistParentId}
                    onChange={(e) => handlePlaylistParentChange(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900"
                  >
                    <option value="">— Select Batch or Series —</option>
                    {batchesAndSeries.map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.kind.toUpperCase()}] {p.title} ({p.exam} • {p.classes.join('/')})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="playlist-target-exam"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                  >
                    Confirm Target Exam
                  </label>
                  <select
                    id="playlist-target-exam"
                    value={playlistExam}
                    onChange={(e) => setPlaylistExam(e.target.value as ContentExam)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900"
                  >
                    <option value="JEE">JEE</option>
                    <option value="NEET">NEET</option>
                    <option value="Both">Both</option>
                  </select>
                </div>

                <div>
                  <span className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Confirm Target Classes
                  </span>
                  <div className="mt-2 flex items-center gap-3">
                    {(['11', '12'] as const).map((cls) => (
                      <label
                        key={cls}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={playlistClasses.includes(cls)}
                          onChange={() =>
                            toggleClassInList(
                              cls,
                              playlistClasses,
                              setPlaylistClasses
                            )
                          }
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                        />
                        <span>Class {cls}th</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <span>
                    Selected:{' '}
                    {importedRows.filter((r) => r.selected !== false).length} /{' '}
                    {importedRows.length} videos
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setImportedRows((prev) =>
                        prev.map((r) => ({ ...r, selected: true }))
                      )
                    }
                    className="rounded-lg bg-slate-100 px-2.5 py-1 text-indigo-600 hover:bg-slate-200"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setImportedRows((prev) =>
                        prev.map((r) => ({ ...r, selected: false }))
                      )
                    }
                    className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-600 hover:bg-slate-200"
                  >
                    Deselect All
                  </button>
                </div>

                <button
                  type="button"
                  disabled={savingPlaylistBatch}
                  onClick={handleConfirmSavePlaylist}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>
                    {savingPlaylistBatch && playlistSaveProgress
                      ? `Saving ${playlistSaveProgress.saved}/${playlistSaveProgress.total}...`
                      : `Confirm & Save Selected Videos (${
                          importedRows.filter((r) => r.selected !== false).length
                        })`}
                  </span>
                </button>
              </div>

              {/* Editable Preview Rows */}
              <div className="max-h-[460px] overflow-y-auto rounded-2xl border border-slate-200">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-100 text-slate-600 uppercase font-bold">
                    <tr>
                      <th className="p-2.5">Use</th>
                      <th className="p-2.5 w-16">Order</th>
                      <th className="p-2.5">Thumb</th>
                      <th className="p-2.5">Title (Editable)</th>
                      <th className="p-2.5">Lesson / Topic (Editable)</th>
                      <th className="p-2.5">Thumbnail URL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importedRows.map((row) => (
                      <tr key={row.videoId} className="hover:bg-slate-50">
                        <td className="p-2.5">
                          <input
                            type="checkbox"
                            checked={row.selected !== false}
                            onChange={(e) =>
                              updateImportedRow(row.videoId, {
                                selected: e.target.checked,
                              })
                            }
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                          />
                        </td>
                        <td className="p-2.5">
                          <input
                            type="number"
                            min={1}
                            value={row.position}
                            onChange={(e) =>
                              updateImportedRow(row.videoId, {
                                position: Number(e.target.value) || 1,
                              })
                            }
                            className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="p-2.5">
                          <img
                            src={row.thumbnail}
                            alt={row.title}
                            className="h-10 w-16 rounded object-cover bg-slate-900"
                          />
                        </td>
                        <td className="p-2.5">
                          <input
                            type="text"
                            value={row.title}
                            onChange={(e) =>
                              updateImportedRow(row.videoId, {
                                title: e.target.value,
                              })
                            }
                            className="w-full min-w-[200px] rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-900"
                          />
                        </td>
                        <td className="p-2.5">
                          <input
                            type="text"
                            value={row.lesson || ''}
                            onChange={(e) =>
                              updateImportedRow(row.videoId, {
                                lesson: e.target.value,
                              })
                            }
                            className="w-full min-w-[140px] rounded-lg border border-slate-300 px-2.5 py-1 text-xs"
                          />
                        </td>
                        <td className="p-2.5">
                          <input
                            type="url"
                            value={row.thumbnail}
                            onChange={(e) =>
                              updateImportedRow(row.videoId, {
                                thumbnail: e.target.value,
                              })
                            }
                            className="w-full min-w-[160px] rounded-lg border border-slate-300 px-2.5 py-1 text-xs"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. PDF RESOURCES EDITOR (`kind=resource`) */}
      {subMode === 'resources' && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
          <h2 className="text-lg font-extrabold text-slate-900">
            {editingResource
              ? `Edit PDF Resource: ${editingResource.title}`
              : 'Add PDF Study Material / Notes (kind=resource)'}
          </h2>

          {resFeedback && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-semibold text-indigo-900">
              {resFeedback}
            </div>
          )}

          <form onSubmit={handleSaveResource} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700">
                  Resource Title
                </label>
                <input
                  type="text"
                  required
                  value={resTitle}
                  onChange={(e) => setResTitle(e.target.value)}
                  placeholder="e.g. Rotational Motion Formula Sheet PDF"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700">
                  PDF URL (https://)
                </label>
                <input
                  type="url"
                  required
                  value={resPdfUrl}
                  onChange={(e) => setResPdfUrl(e.target.value)}
                  placeholder="https://example.com/formula-sheet.pdf"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700">
                  Attach to Parent Batch/Series (Optional)
                </label>
                <select
                  value={resParentId}
                  onChange={(e) => setResParentId(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                >
                  <option value="">— Open to All Matching Students —</option>
                  {batchesAndSeries.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.kind.toUpperCase()}] {p.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700">
                  Subject
                </label>
                <input
                  type="text"
                  value={resSubject}
                  onChange={(e) => setResSubject(e.target.value)}
                  placeholder="Physics / Chemistry / Biology / Maths"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700">
                  Target Exam
                </label>
                <select
                  value={resExam}
                  onChange={(e) => setResExam(e.target.value as ContentExam)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                >
                  <option value="JEE">JEE</option>
                  <option value="NEET">NEET</option>
                  <option value="Both">Both</option>
                </select>
              </div>

              <div>
                <span className="block text-xs font-bold uppercase text-slate-700">
                  Classes
                </span>
                <div className="mt-2 flex items-center gap-3">
                  {(['11', '12'] as const).map((cls) => (
                    <label
                      key={cls}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={resClasses.includes(cls)}
                        onChange={() =>
                          toggleClassInList(cls, resClasses, setResClasses)
                        }
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      />
                      <span>Class {cls}th</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-700">
                Description
              </label>
              <input
                type="text"
                value={resDesc}
                onChange={(e) => setResDesc(e.target.value)}
                placeholder="Short summary of this study resource..."
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={resActive}
                  onChange={(e) => setResActive(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                <span>Active</span>
              </label>

              <button
                type="submit"
                disabled={savingResource}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingResource
                  ? 'Saving...'
                  : editingResource
                  ? 'Update Resource'
                  : 'Save PDF Resource'}
              </button>
            </div>
          </form>

          {/* Existing Resources List */}
          <div className="border-t border-slate-200 pt-4 space-y-2.5">
            <h3 className="text-sm font-extrabold text-slate-900">
              Saved PDF Resources ({resourcesList.length})
            </h3>
            {resourcesList.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 p-3.5 text-xs"
              >
                <div>
                  <span className="font-bold text-slate-900">{r.title}</span>
                  <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                    {r.exam} • {r.classes.join('/')}
                  </span>
                  {!r.active && (
                    <span className="ml-2 rounded bg-rose-100 px-2 py-0.5 font-bold text-rose-700">
                      Disabled
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingResource(r);
                      setResTitle(r.title);
                      setResDesc(r.description || '');
                      setResPdfUrl(String(r.metadata?.pdfUrl || ''));
                      setResThumbUrl(String(r.metadata?.thumbnailUrl || ''));
                      setResSubject(String(r.metadata?.subject || ''));
                      setResParentId(String(r.metadata?.parentId || ''));
                      setResExam(r.exam);
                      setResClasses(r.classes);
                      setResActive(r.active !== false);
                    }}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Edit
                  </button>
                  {r.active !== false && (
                    <button
                      type="button"
                      onClick={() => onRequestDisable(r)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 font-bold text-rose-700 hover:bg-rose-100"
                    >
                      Disable
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Existing Lectures Catalog Table */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-extrabold text-slate-900">
            Saved Video Lectures ({filteredLectures.length})
          </h3>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterParentId}
              onChange={(e) => setFilterParentId(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              <option value="">All Batches / Series</option>
              {batchesAndSeries.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>

            <select
              value={filterExam}
              onChange={(e) => setFilterExam(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              <option value="">All Exams</option>
              <option value="JEE">JEE</option>
              <option value="NEET">NEET</option>
              <option value="Both">Both</option>
            </select>
          </div>
        </div>

        {filteredLectures.length === 0 ? (
          <p className="text-xs text-slate-500">
            No lectures match the selected filter. Add a single video or import a playlist above.
          </p>
        ) : (
          <div className="space-y-2.5">
            {filteredLectures.map((lec) => {
              const m = lec.metadata || {};
              const parentObj = batchesAndSeries.find((p) => p.id === m.parentId);
              return (
                <div
                  key={lec.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 p-3.5 hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-12 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-900">
                      {m.thumbnailUrl ? (
                        <img
                          src={m.thumbnailUrl}
                          alt={lec.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-white">
                          <PlayCircle className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                        <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700">
                          #{m.position || 1}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                          {lec.exam} • Class {lec.classes.join('/')}
                        </span>
                        {parentObj && (
                          <span className="text-slate-500">
                            • {parentObj.title}
                          </span>
                        )}
                        {!lec.active && (
                          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-rose-700">
                            Disabled
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-sm font-bold text-slate-900">
                        {lec.title}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startEditLecture(lec)}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>Edit</span>
                    </button>
                    {lec.active !== false && (
                      <button
                        type="button"
                        onClick={() => onRequestDisable(lec)}
                        className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Disable</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
