import { describe, expect, it, vi, afterEach } from 'vitest';
import { isAdminEmail, APP_CONFIG } from '../lib/config';
import {
  fromISTDateTimeLocalInput,
  getTestScheduleStatus,
  isScheduleActiveNow,
  toISTDateTimeLocalInput,
} from '../lib/date';
import {
  extractYoutubePlaylistId,
  extractYoutubeVideoId,
  importFullYoutubePlaylist,
} from '../lib/mediaProxy';
import {
  isSafeHttpUrl,
  isValidInternalDeepLink,
  matchesStudentExamAndClass,
  sanitizeQuestionForClient,
  validateQuestionsJson,
} from '../lib/validation';

describe('Exam Cracker Verification Suite', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('verifies Android appId and strict admin email identity', () => {
    expect(APP_CONFIG.appId).toBe('com.darvo.ec');
    expect(APP_CONFIG.appName).toBe('Exam Cracker');
    expect(isAdminEmail('arvinddarabishnoi@gmail.com')).toBe(true);
    expect(isAdminEmail('ARVINDDARABISHNOI@GMAIL.COM')).toBe(true);
    expect(isAdminEmail('student@gmail.com')).toBe(false);
    expect(isAdminEmail('')).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });

  it('strictly filters content by JEE/NEET exam and Class 11/12', () => {
    const neet12Only = { exam: 'NEET', classes: ['12'] };
    const jee11Only = { exam: 'JEE', classes: ['11'] };
    const both11And12 = { exam: 'Both', classes: ['11', '12'] };

    // JEE-11 student must NOT see NEET-12 content
    expect(matchesStudentExamAndClass(neet12Only, 'JEE', '11')).toBe(false);
    expect(matchesStudentExamAndClass(neet12Only, 'JEE', '12')).toBe(false);
    expect(matchesStudentExamAndClass(neet12Only, 'NEET', '11')).toBe(false);
    expect(matchesStudentExamAndClass(neet12Only, 'NEET', '12')).toBe(true);

    expect(matchesStudentExamAndClass(jee11Only, 'JEE', '11')).toBe(true);
    expect(matchesStudentExamAndClass(jee11Only, 'JEE', '12')).toBe(false);
    expect(matchesStudentExamAndClass(both11And12, 'JEE', '11')).toBe(true);
    expect(matchesStudentExamAndClass(both11And12, 'NEET', '12')).toBe(true);
  });

  it('converts Asia/Kolkata (IST) schedules to UTC ISO-8601 and hides future/expired goals', () => {
    // 2026-10-18 19:00 IST === 2026-10-18T13:30:00.000Z
    const utcIso = fromISTDateTimeLocalInput('2026-10-18T19:00');
    expect(utcIso).toBe('2026-10-18T13:30:00.000Z');
    expect(toISTDateTimeLocalInput(utcIso)).toBe('2026-10-18T19:00');

    const now = new Date('2026-10-17T12:00:00.000Z').getTime();
    const futureStart = '2026-10-18T00:00:00.000Z';
    const pastStart = '2026-10-17T00:00:00.000Z';
    const futureEnd = '2026-10-17T23:59:59.000Z';
    const pastEnd = '2026-10-17T06:00:00.000Z';

    // Not-yet-visible goal must NOT appear
    expect(isScheduleActiveNow(futureStart, null, now)).toBe(false);
    // Expired goal must NOT appear
    expect(isScheduleActiveNow(pastStart, pastEnd, now)).toBe(false);
    // Active goal within window appears
    expect(isScheduleActiveNow(pastStart, futureEnd, now)).toBe(true);

    expect(
      getTestScheduleStatus({ scheduledAt: futureStart, isLive: false }, now)
    ).toBe('upcoming');
    expect(
      getTestScheduleStatus({ scheduledAt: pastStart, endsAt: pastEnd, isLive: true }, now)
    ).toBe('completed');
    expect(
      getTestScheduleStatus({ scheduledAt: pastStart, endsAt: futureEnd, isLive: false }, now)
    ).toBe('live');
  });

  it('validates question bank JSON, preserves LaTeX, and strips answer keys for students', () => {
    const validRaw = JSON.stringify({
      questions: [
        {
          id: 'q1',
          type: 'single-choice',
          text: 'Evaluate $\\int_0^1 x^2 dx$',
          options: [
            { id: 'A', text: '$\\frac{1}{2}$' },
            { id: 'B', text: '$\\frac{1}{3}$' },
          ],
          correctAnswer: 'B',
          explanation: 'Using power rule $\\frac{x^3}{3}$.',
        },
      ],
    });
    const res = validateQuestionsJson(validRaw);
    expect(res.valid).toBe(true);
    expect(res.questions).toHaveLength(1);
    expect(res.questions[0].text).toContain('\\int_0^1');

    // Sanitize for student client
    const sanitized = sanitizeQuestionForClient(res.questions[0], 0);
    expect(sanitized.correctAnswer).toBeUndefined();
    expect(sanitized.explanation).toBeUndefined();
    expect((sanitized as unknown as Record<string, unknown>).correct_answer).toBeUndefined();

    // Invalid JSON with wrong correctAnswer option ID
    const invalidRaw = JSON.stringify([
      {
        id: 'q1',
        type: 'single-choice',
        text: 'Sample question',
        options: [
          { id: 'A', text: 'Opt 1' },
          { id: 'B', text: 'Opt 2' },
        ],
        correctAnswer: 'Z',
      },
    ]);
    const invalidRes = validateQuestionsJson(invalidRaw);
    expect(invalidRes.valid).toBe(false);
    expect(invalidRes.errors[0].row).toBe(1);
    expect(invalidRes.errors[0].message).toContain('does not match any option id');
  });

  it('validates safe HTTP URLs and internal deep links', () => {
    expect(isSafeHttpUrl('https://example.com/notes.pdf')).toBe(true);
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false);

    expect(isValidInternalDeepLink('/lectures')).toBe(true);
    expect(isValidInternalDeepLink('/tests/123e4567-e89b-12d3-a456-426614174000')).toBe(
      true
    );
    expect(isValidInternalDeepLink('//evil.example.com')).toBe(false);
    expect(isValidInternalDeepLink('javascript:void(0)')).toBe(false);
  });

  it('extracts YouTube IDs and follows playlist nextCursor while deduplicating videoIds', async () => {
    expect(
      extractYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    ).toBe('dQw4w9WgXcQ');
    expect(extractYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ'
    );
    expect(
      extractYoutubePlaylistId(
        'https://www.youtube.com/playlist?list=PL1234567890ABCDEF'
      )
    ).toBe('PL1234567890ABCDEF');

    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          playlistId: 'PL_TEST',
          title: 'JEE Physics Playlist',
          count: 2,
          items: [
            {
              videoId: 'vid_0000001',
              title: 'Lecture 1',
              description: '',
              thumbnail: 'https://img.youtube.com/vi/vid_0000001/hqdefault.jpg',
              duration: '45:00',
              position: 0,
              watchUrl: 'https://www.youtube.com/watch?v=vid_0000001',
            },
            {
              videoId: 'vid_0000002',
              title: 'Lecture 2',
              description: '',
              thumbnail: 'https://img.youtube.com/vi/vid_0000002/hqdefault.jpg',
              duration: '50:00',
              position: 1,
              watchUrl: 'https://www.youtube.com/watch?v=vid_0000002',
            },
          ],
          nextCursor: 'cursor_page_2',
          hasMore: true,
          youtubeDataApiKeyRequired: false,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          playlistId: 'PL_TEST',
          title: 'JEE Physics Playlist',
          count: 2,
          items: [
            // Duplicate videoId from page 1 — must be deduplicated
            {
              videoId: 'vid_0000002',
              title: 'Lecture 2 Duplicate',
              description: '',
              thumbnail: 'https://img.youtube.com/vi/vid_0000002/hqdefault.jpg',
              duration: '50:00',
              position: 0,
              watchUrl: 'https://www.youtube.com/watch?v=vid_0000002',
            },
            {
              videoId: 'vid_0000003',
              title: 'Lecture 3',
              description: '',
              thumbnail: 'https://img.youtube.com/vi/vid_0000003/hqdefault.jpg',
              duration: '55:00',
              position: 1,
              watchUrl: 'https://www.youtube.com/watch?v=vid_0000003',
            },
          ],
          nextCursor: null,
          hasMore: false,
          youtubeDataApiKeyRequired: false,
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const progressUpdates: number[] = [];
    const imported = await importFullYoutubePlaylist(
      'https://www.youtube.com/playlist?list=PL_TEST',
      {
        onProgress: (p) => progressUpdates.push(p.totalItems),
      }
    );

    expect(imported.pagesFetched).toBe(2);
    expect(imported.items).toHaveLength(3);
    expect(imported.items.map((i) => i.videoId)).toEqual([
      'vid_0000001',
      'vid_0000002',
      'vid_0000003',
    ]);
    expect(progressUpdates).toEqual([2, 3]);
  });
});
