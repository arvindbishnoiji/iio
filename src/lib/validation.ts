import type { ClassLevel, ExamTrack, TestQuestion, TestQuestionOption } from '../types';

export function isSafeHttpUrl(value?: string | null): boolean {
  if (!value || typeof value !== 'string') return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

const ALLOWED_INTERNAL_PREFIXES = [
  '/',
  '/lectures',
  '/batches',
  '/series',
  '/tests',
  '/leaderboard',
  '/profile',
  '/chat',
];

export function isValidInternalDeepLink(value?: string | null): boolean {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return false;
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return false;
  const pathname = trimmed.split('?')[0].split('#')[0];
  if (pathname === '/') return true;
  return ALLOWED_INTERNAL_PREFIXES.some(
    (prefix) => prefix !== '/' && (pathname === prefix || pathname.startsWith(`${prefix}/`))
  );
}

export function matchesStudentExamAndClass(
  item: { exam?: string | null; classes?: string[] | null },
  studentExam: ExamTrack,
  studentClass: ClassLevel
): boolean {
  const examOk = !item.exam || item.exam === 'Both' || item.exam === studentExam;
  const classOk =
    !Array.isArray(item.classes) ||
    item.classes.length === 0 ||
    item.classes.map(String).includes(String(studentClass));
  return examOk && classOk;
}

export interface QuestionValidationError {
  row: number;
  questionId: string;
  message: string;
}

export interface QuestionBankValidationResult {
  valid: boolean;
  questions: TestQuestion[];
  errors: QuestionValidationError[];
  globalError?: string;
}

export function validateQuestionsJson(rawJson: string): QuestionBankValidationResult {
  const trimmed = (rawJson || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      questions: [],
      errors: [],
      globalError: 'Paste or upload a JSON question bank before validating.',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Invalid JSON syntax';
    return {
      valid: false,
      questions: [],
      errors: [],
      globalError: `JSON syntax error: ${detail}`,
    };
  }

  let rawList: unknown[] | null = null;
  if (Array.isArray(parsed)) {
    rawList = parsed;
  } else if (
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as Record<string, unknown>).questions)
  ) {
    rawList = (parsed as { questions: unknown[] }).questions;
  }

  if (!rawList) {
    return {
      valid: false,
      questions: [],
      errors: [],
      globalError:
        'Root JSON must be an array of question objects or an object containing a "questions" array.',
    };
  }

  if (rawList.length === 0) {
    return {
      valid: false,
      questions: [],
      errors: [],
      globalError: 'The question bank must contain at least 1 question.',
    };
  }

  const errors: QuestionValidationError[] = [];
  const normalizedQuestions: TestQuestion[] = [];
  const seenIds = new Set<string>();

  rawList.forEach((entry, index) => {
    const rowNum = index + 1;
    if (!entry || typeof entry !== 'object') {
      errors.push({
        row: rowNum,
        questionId: `q${rowNum}`,
        message: 'Question entry must be a JSON object.',
      });
      return;
    }

    const q = entry as Record<string, unknown>;
    const qId = String(q.id || `q${rowNum}`).trim();
    if (!qId) {
      errors.push({
        row: rowNum,
        questionId: `q${rowNum}`,
        message: 'Question id cannot be empty.',
      });
    } else if (seenIds.has(qId)) {
      errors.push({
        row: rowNum,
        questionId: qId,
        message: `Duplicate question id "${qId}". Each question must have a unique id.`,
      });
    }
    seenIds.add(qId);

    const text = String(q.text || q.question || '').trim();
    if (!text) {
      errors.push({
        row: rowNum,
        questionId: qId,
        message: 'Question statement ("text") is required.',
      });
    }

    const qType = String(q.type || 'single-choice').trim();
    if (qType !== 'single-choice') {
      errors.push({
        row: rowNum,
        questionId: qId,
        message: `Unsupported question type "${qType}". Only "single-choice" is currently supported.`,
      });
    }

    const rawOptions = Array.isArray(q.options) ? q.options : [];
    if (rawOptions.length < 2) {
      errors.push({
        row: rowNum,
        questionId: qId,
        message: 'Each question must provide at least 2 options.',
      });
    }

    const options: TestQuestionOption[] = [];
    const optionIds = new Set<string>();

    rawOptions.forEach((opt, optIdx) => {
      const fallbackId = String.fromCharCode(65 + optIdx);
      if (typeof opt === 'string') {
        const optText = opt.trim();
        if (!optText) {
          errors.push({
            row: rowNum,
            questionId: qId,
            message: `Option ${fallbackId} text cannot be empty.`,
          });
        }
        options.push({ id: fallbackId, text: optText });
        optionIds.add(fallbackId.toUpperCase());
      } else if (opt && typeof opt === 'object') {
        const o = opt as Record<string, unknown>;
        const oid = String(o.id || fallbackId).trim();
        const otext = String(o.text ?? '').trim();
        if (!oid) {
          errors.push({
            row: rowNum,
            questionId: qId,
            message: `Option #${optIdx + 1} is missing an "id".`,
          });
        }
        if (!otext) {
          errors.push({
            row: rowNum,
            questionId: qId,
            message: `Option "${oid || fallbackId}" text cannot be empty.`,
          });
        }
        if (optionIds.has(oid.toUpperCase())) {
          errors.push({
            row: rowNum,
            questionId: qId,
            message: `Duplicate option id "${oid}" in question "${qId}".`,
          });
        }
        optionIds.add(oid.toUpperCase());
        options.push({ id: oid, text: otext });
      } else {
        errors.push({
          row: rowNum,
          questionId: qId,
          message: `Option #${optIdx + 1} must be an object with { id, text }.`,
        });
      }
    });

    const rawCorrect = String(
      q.correctAnswer ?? q.correct_answer ?? q.answerKey ?? ''
    ).trim();
    if (!rawCorrect) {
      errors.push({
        row: rowNum,
        questionId: qId,
        message: 'A "correctAnswer" matching one of the option IDs is required.',
      });
    } else if (options.length > 0 && !optionIds.has(rawCorrect.toUpperCase())) {
      errors.push({
        row: rowNum,
        questionId: qId,
        message: `correctAnswer "${rawCorrect}" does not match any option id (${options
          .map((o) => o.id)
          .join(', ')}).`,
      });
    }

    const matchedOption = options.find(
      (o) => o.id.toUpperCase() === rawCorrect.toUpperCase()
    );

    const imageUrl = q.imageUrl ? String(q.imageUrl).trim() : undefined;
    if (imageUrl && !isSafeHttpUrl(imageUrl)) {
      errors.push({
        row: rowNum,
        questionId: qId,
        message: 'Question imageUrl must be a valid http(s) URL.',
      });
    }

    const marks =
      q.marks !== undefined && q.marks !== null && q.marks !== ''
        ? Number(q.marks)
        : undefined;
    if (marks !== undefined && (!Number.isFinite(marks) || marks <= 0)) {
      errors.push({
        row: rowNum,
        questionId: qId,
        message: 'Question marks must be a positive number.',
      });
    }

    const negativeMarks =
      q.negativeMarks !== undefined && q.negativeMarks !== null && q.negativeMarks !== ''
        ? Number(q.negativeMarks)
        : undefined;
    if (
      negativeMarks !== undefined &&
      (!Number.isFinite(negativeMarks) || negativeMarks < 0)
    ) {
      errors.push({
        row: rowNum,
        questionId: qId,
        message: 'Question negativeMarks must be 0 or a positive number.',
      });
    }

    normalizedQuestions.push({
      id: qId || `q${rowNum}`,
      type: 'single-choice',
      text,
      imageUrl,
      subject: q.subject ? String(q.subject).trim() : undefined,
      topic: q.topic ? String(q.topic).trim() : undefined,
      options,
      correctAnswer: matchedOption ? matchedOption.id : rawCorrect,
      marks,
      negativeMarks,
      explanation: q.explanation ? String(q.explanation).trim() : '',
    });
  });

  return {
    valid: errors.length === 0,
    questions: normalizedQuestions,
    errors,
  };
}

export function sanitizeQuestionForClient(q: TestQuestion, idx = 0): TestQuestion {
  const copy: Record<string, unknown> = { ...q };
  delete copy.correctAnswer;
  delete copy.correct_answer;
  delete copy.answerKey;
  delete copy.answer_key;
  delete copy.explanation;
  return {
    id: String(q.id || `q${idx + 1}`),
    type: 'single-choice',
    text: q.text,
    imageUrl: q.imageUrl,
    subject: q.subject,
    topic: q.topic,
    options: Array.isArray(q.options) ? q.options : [],
    marks: q.marks,
    negativeMarks: q.negativeMarks,
  };
}
