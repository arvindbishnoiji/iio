import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Edit3,
  FileJson,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { MathText } from '../../components/MathText';
import {
  createAdminContent,
  updateAdminContent,
  type AdminContentPayload,
} from '../../lib/api';
import {
  formatISTDateTime,
  fromISTDateTimeLocalInput,
  toISTDateTimeLocalInput,
} from '../../lib/date';
import { validateQuestionsJson } from '../../lib/validation';
import type {
  ClassLevel,
  ContentExam,
  CourseCatalogItem,
  TestMetadata,
} from '../../types';

const SAMPLE_QUESTIONS_JSON = JSON.stringify(
  [
    {
      id: 'q1',
      type: 'single-choice',
      subject: 'Physics',
      topic: 'Kinematics',
      text: 'A particle moves with initial velocity $u = 10\\text{ m/s}$ and constant acceleration $a = 2\\text{ m/s}^2$. Its velocity after $t = 5\\text{ s}$ is:',
      options: [
        { id: 'A', text: '$15\\text{ m/s}$' },
        { id: 'B', text: '$20\\text{ m/s}$' },
        { id: 'C', text: '$25\\text{ m/s}$' },
        { id: 'D', text: '$30\\text{ m/s}$' },
      ],
      correctAnswer: 'B',
      marks: 4,
      negativeMarks: 1,
      explanation:
        'Using $v = u + at = 10 + 2 \\times 5 = 20\\text{ m/s}$.',
    },
    {
      id: 'q2',
      type: 'single-choice',
      subject: 'Chemistry',
      topic: 'Atomic Structure',
      text: 'The energy of a photon of wavelength $\\lambda$ is given by:',
      options: [
        { id: 'A', text: '$\\frac{hc}{\\lambda}$' },
        { id: 'B', text: '$\\frac{h\\lambda}{c}$' },
        { id: 'C', text: '$hc\\lambda$' },
        { id: 'D', text: '$\\frac{\\lambda}{hc}$' },
      ],
      correctAnswer: 'A',
      marks: 4,
      negativeMarks: 1,
      explanation: 'By Planck’s quantum theory, $E = h\\nu = \\frac{hc}{\\lambda}$.',
    },
  ],
  null,
  2
);

interface AdminTestsTabProps {
  allCatalog: CourseCatalogItem[];
  onRefresh: () => Promise<void>;
  onRequestDisable: (item: CourseCatalogItem) => void;
}

export const AdminTestsTab: React.FC<AdminTestsTabProps> = ({
  allCatalog,
  onRefresh,
  onRequestDisable,
}) => {
  const testsList = useMemo(
    () =>
      allCatalog.filter(
        (c) => c.kind === 'test'
      ) as CourseCatalogItem<TestMetadata>[],
    [allCatalog]
  );

  const [editingTest, setEditingTest] =
    useState<CourseCatalogItem<TestMetadata> | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('Physics, Chemistry, Maths/Biology');
  const [exam, setExam] = useState<ContentExam>('JEE');
  const [classes, setClasses] = useState<ClassLevel[]>(['11', '12']);
  const [scheduledAtLocal, setScheduledAtLocal] = useState('');
  const [endsAtLocal, setEndsAtLocal] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [marksPerQuestion, setMarksPerQuestion] = useState<number>(4);
  const [negativeMarks, setNegativeMarks] = useState<number>(1);
  const [isLive, setIsLive] = useState<boolean>(true);
  const [allowMultipleAttempts, setAllowMultipleAttempts] = useState<boolean>(false);
  const [active, setActive] = useState<boolean>(true);

  const [questionsJsonText, setQuestionsJsonText] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const validation = useMemo(
    () => validateQuestionsJson(questionsJsonText),
    [questionsJsonText]
  );

  const toggleClass = (cls: ClassLevel) => {
    setClasses((prev) =>
      prev.includes(cls)
        ? prev.length > 1
          ? prev.filter((c) => c !== cls)
          : prev
        : [...prev, cls]
    );
  };

  const resetForm = () => {
    setEditingTest(null);
    setTitle('');
    setDescription('');
    setSubject('Physics, Chemistry, Maths/Biology');
    setExam('JEE');
    setClasses(['11', '12']);
    setScheduledAtLocal('');
    setEndsAtLocal('');
    setDurationMinutes(60);
    setMarksPerQuestion(4);
    setNegativeMarks(1);
    setIsLive(true);
    setAllowMultipleAttempts(false);
    setActive(true);
    setQuestionsJsonText('');
  };

  const startEditTest = (item: CourseCatalogItem<TestMetadata>) => {
    const m = item.metadata || {};
    setEditingTest(item);
    setTitle(item.title);
    setDescription(item.description || '');
    setSubject(m.subject || '');
    setExam(item.exam);
    setClasses(item.classes);
    setScheduledAtLocal(toISTDateTimeLocalInput(m.scheduledAt));
    setEndsAtLocal(toISTDateTimeLocalInput(m.endsAt));
    setDurationMinutes(Number(m.durationMinutes || 60));
    setMarksPerQuestion(Number(m.marksPerQuestion ?? 4));
    setNegativeMarks(Number(m.negativeMarks ?? 1));
    setIsLive(Boolean(m.isLive));
    setAllowMultipleAttempts(Boolean(m.allowMultipleAttempts));
    setActive(item.active !== false);
    setQuestionsJsonText(
      JSON.stringify(Array.isArray(m.questions) ? m.questions : [], null, 2)
    );
    setFeedback(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setQuestionsJsonText(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const handleSaveTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!title.trim()) {
      setFeedback({ type: 'error', message: 'Test title is required.' });
      return;
    }
    if (!validation.valid) {
      setFeedback({
        type: 'error',
        message:
          validation.globalError ||
          `Please fix ${validation.errors.length} question validation error(s) before saving.`,
      });
      return;
    }

    const scheduledAtIso = fromISTDateTimeLocalInput(scheduledAtLocal);
    const endsAtIso = fromISTDateTimeLocalInput(endsAtLocal);

    if (
      scheduledAtIso &&
      endsAtIso &&
      new Date(endsAtIso).getTime() <= new Date(scheduledAtIso).getTime()
    ) {
      setFeedback({
        type: 'error',
        message: 'End time must be after the scheduled start time.',
      });
      return;
    }

    const totalMarks = validation.questions.reduce(
      (sum, q) => sum + Number(q.marks ?? marksPerQuestion),
      0
    );

    setSaving(true);
    try {
      const existingMeta = editingTest?.metadata || {};
      const payload: AdminContentPayload = {
        kind: 'test',
        title: title.trim(),
        description: description.trim(),
        exam,
        classes,
        active,
        metadata: {
          ...existingMeta,
          subject: subject.trim() || 'General',
          durationMinutes: Math.max(1, Number(durationMinutes) || 60),
          scheduledAt: scheduledAtIso,
          endsAt: endsAtIso,
          isLive,
          allowMultipleAttempts,
          marksPerQuestion: Number(marksPerQuestion) || 4,
          negativeMarks: Number(negativeMarks) || 0,
          totalQuestions: validation.questions.length,
          totalMarks,
          questions: validation.questions,
        },
      };

      if (editingTest) {
        await updateAdminContent(editingTest.id, payload);
        setFeedback({
          type: 'success',
          message: `Updated test "${payload.title}" (${validation.questions.length} validated questions).`,
        });
      } else {
        await createAdminContent(payload);
        setFeedback({
          type: 'success',
          message: `Created test "${payload.title}" (${validation.questions.length} validated questions).`,
        });
      }
      resetForm();
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save test.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">
              {editingTest
                ? `Edit Test: ${editingTest.title}`
                : 'Create Mock Test & Question Bank (kind=test)'}
            </h2>
            <p className="text-xs text-slate-500">
              Schedules are entered in India Standard Time (Asia/Kolkata) and stored as ISO-8601 UTC. Answer keys remain strictly server-side until submission.
            </p>
          </div>
          {editingTest && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs font-bold text-slate-500 hover:text-slate-800"
            >
              Cancel Edit
            </button>
          )}
        </div>

        {feedback && (
          <div
            className={`mt-4 rounded-xl border px-4 py-3 text-xs sm:text-sm font-medium ${
              feedback.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}
          >
            {feedback.message}
          </div>
        )}

        <form onSubmit={handleSaveTest} className="mt-5 space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <label
                htmlFor="test-title"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                Test Title
              </label>
              <input
                id="test-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. All India Major Test #1 — Physics & Chemistry"
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900"
              />
            </div>

            <div>
              <label
                htmlFor="test-subject"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                Subject
              </label>
              <input
                id="test-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Physics / Full Syllabus"
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900"
              />
            </div>

            <div>
              <label
                htmlFor="test-duration"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                Duration (Minutes)
              </label>
              <input
                id="test-duration"
                type="number"
                min={1}
                max={360}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value) || 60)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900"
              />
            </div>

            <div>
              <label
                htmlFor="test-start-ist"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                Scheduled Start (IST)
              </label>
              <input
                id="test-start-ist"
                type="datetime-local"
                value={scheduledAtLocal}
                onChange={(e) => setScheduledAtLocal(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900"
              />
            </div>

            <div>
              <label
                htmlFor="test-end-ist"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                Ends At (IST)
              </label>
              <input
                id="test-end-ist"
                type="datetime-local"
                value={endsAtLocal}
                onChange={(e) => setEndsAtLocal(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900"
              />
            </div>

            <div>
              <label
                htmlFor="test-marks-default"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                Default Marks / Question
              </label>
              <input
                id="test-marks-default"
                type="number"
                min={1}
                value={marksPerQuestion}
                onChange={(e) => setMarksPerQuestion(Number(e.target.value) || 4)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900"
              />
            </div>

            <div>
              <label
                htmlFor="test-neg-default"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                Default Negative Marks
              </label>
              <input
                id="test-neg-default"
                type="number"
                min={0}
                step="0.25"
                value={negativeMarks}
                onChange={(e) => setNegativeMarks(Number(e.target.value) || 0)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label
                htmlFor="test-exam"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                Target Exam
              </label>
              <select
                id="test-exam"
                value={exam}
                onChange={(e) => setExam(e.target.value as ContentExam)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900"
              >
                <option value="JEE">JEE</option>
                <option value="NEET">NEET</option>
                <option value="Both">Both</option>
              </select>
            </div>

            <div>
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Target Classes
              </span>
              <div className="mt-2 flex items-center gap-4">
                {(['11', '12'] as const).map((cls) => (
                  <label
                    key={cls}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={classes.includes(cls)}
                      onChange={() => toggleClass(cls)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                    <span>Class {cls}th</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-4">
              <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={isLive}
                  onChange={(e) => setIsLive(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                />
                <span>Is Live Now</span>
              </label>

              <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={allowMultipleAttempts}
                  onChange={(e) => setAllowMultipleAttempts(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                <span>Allow Multiple Attempts</span>
              </label>

              <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                <span>Active</span>
              </label>
            </div>
          </div>

          <div>
            <label
              htmlFor="test-description"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700"
            >
              Instructions / Description
            </label>
            <input
              id="test-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Syllabus and marking scheme instructions for students..."
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900"
            />
          </div>

          {/* JSON Question Bank Editor + File Upload */}
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileJson className="h-5 w-5 text-indigo-600" />
                <label
                  htmlFor="test-questions-json"
                  className="text-xs font-extrabold uppercase tracking-wider text-slate-800"
                >
                  Question Bank JSON (Supports MathJax / LaTeX)
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuestionsJsonText(SAMPLE_QUESTIONS_JSON)}
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                >
                  Load Valid LaTeX JSON Template
                </button>

                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100">
                  <Upload className="h-3.5 w-3.5" />
                  <span>Upload .json File</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <textarea
              id="test-questions-json"
              rows={10}
              value={questionsJsonText}
              onChange={(e) => setQuestionsJsonText(e.target.value)}
              placeholder='Paste an array of question objects: [{ "id": "q1", "type": "single-choice", "text": "...", "options": [...], "correctAnswer": "B", "explanation": "..." }]'
              className="w-full rounded-xl border border-slate-300 bg-slate-950 p-3.5 font-mono text-xs text-emerald-300 focus:border-indigo-500 focus:outline-none"
            />

            {/* Validation Status & Row-Specific Errors */}
            {questionsJsonText.trim() && (
              <div>
                {validation.valid ? (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>
                      Valid JSON Question Bank: {validation.questions.length} question
                      {validation.questions.length === 1 ? '' : 's'} verified and ready to save.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800">
                    <div className="flex items-center gap-2 font-bold">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                      <span>
                        {validation.globalError ||
                          `Found ${validation.errors.length} validation error(s):`}
                      </span>
                    </div>
                    {validation.errors.length > 0 && (
                      <ul className="list-disc pl-5 space-y-1">
                        {validation.errors.map((err, i) => (
                          <li key={i}>
                            <strong>
                              Row #{err.row} ({err.questionId}):
                            </strong>{' '}
                            {err.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Live Parsed Questions Preview with MathText */}
            {validation.questions.length > 0 && (
              <div className="mt-4 space-y-2.5">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                  Live Question &amp; LaTeX Preview ({validation.questions.length})
                </h4>
                <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1">
                  {validation.questions.map((q, idx) => (
                    <div
                      key={q.id || idx}
                      className="rounded-xl border border-slate-200 bg-white p-3.5 text-xs"
                    >
                      <div className="flex items-center justify-between font-bold text-slate-700">
                        <span>
                          Q{idx + 1} ({q.id}) • Correct Answer:{' '}
                          <span className="text-emerald-700">{q.correctAnswer}</span>
                        </span>
                        <span>
                          +{q.marks ?? marksPerQuestion} / -
                          {q.negativeMarks ?? negativeMarks}
                        </span>
                      </div>
                      <div className="mt-1.5 font-semibold text-slate-900">
                        <MathText text={q.text} />
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {q.options.map((opt) => (
                          <div
                            key={opt.id}
                            className={`rounded-lg border px-2.5 py-1.5 ${
                              opt.id === q.correctAnswer
                                ? 'border-emerald-400 bg-emerald-50 font-semibold text-emerald-950'
                                : 'border-slate-200 bg-slate-50 text-slate-700'
                            }`}
                          >
                            <strong>{opt.id}.</strong> <MathText text={opt.text} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving || !validation.valid}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              <span>
                {saving
                  ? 'Saving Test...'
                  : editingTest
                  ? 'Update Test & Question Bank'
                  : 'Create Test'}
              </span>
            </button>
          </div>
        </form>
      </div>

      {/* Saved Tests List */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <h3 className="text-base font-extrabold text-slate-900">
          Saved Tests &amp; Schedules ({testsList.length})
        </h3>
        {testsList.length === 0 ? (
          <p className="text-xs text-slate-500">No tests created yet.</p>
        ) : (
          <div className="space-y-3">
            {testsList.map((test) => {
              const m = test.metadata || {};
              const qCount = Array.isArray(m.questions)
                ? m.questions.length
                : Number(m.totalQuestions || 0);
              return (
                <div
                  key={test.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                      <span className="rounded bg-indigo-50 px-2 py-0.5 text-indigo-700">
                        {test.exam} • Class {test.classes.join('/')}
                      </span>
                      {m.isLive && (
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">
                          LIVE
                        </span>
                      )}
                      {!test.active && (
                        <span className="rounded bg-rose-100 px-2 py-0.5 text-rose-700">
                          Disabled
                        </span>
                      )}
                    </div>
                    <h4 className="mt-1 text-sm font-extrabold text-slate-900">
                      {test.title}
                    </h4>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {qCount} Questions • {m.durationMinutes || 60} mins • Starts:{' '}
                      {formatISTDateTime(m.scheduledAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startEditTest(test)}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>Edit</span>
                    </button>
                    {test.active !== false && (
                      <button
                        type="button"
                        onClick={() => onRequestDisable(test)}
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
