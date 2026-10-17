export const IST_TIMEZONE = 'Asia/Kolkata';

export function parseIsoDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatISTDateTime(isoString?: string | null): string {
  const d = parseIsoDate(isoString);
  if (!d) return 'Not scheduled';
  try {
    const formatted = new Intl.DateTimeFormat('en-IN', {
      timeZone: IST_TIMEZONE,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(d);
    return `${formatted} IST`;
  } catch {
    return d.toISOString();
  }
}

export function formatISTDate(isoString?: string | null): string {
  const d = parseIsoDate(isoString);
  if (!d) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: IST_TIMEZONE,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function formatISTTime(isoString?: string | null): string {
  const d = parseIsoDate(isoString);
  if (!d) return '—';
  try {
    const formatted = new Intl.DateTimeFormat('en-IN', {
      timeZone: IST_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(d);
    return `${formatted} IST`;
  } catch {
    return d.toISOString().slice(11, 16);
  }
}

/**
 * Converts a UTC ISO-8601 timestamp into an Asia/Kolkata `YYYY-MM-DDTHH:mm` string
 * suitable for `<input type="datetime-local" />`.
 */
export function toISTDateTimeLocalInput(isoString?: string | null): string {
  const d = parseIsoDate(isoString);
  if (!d) return '';
  // IST is strictly UTC + 5 hours 30 minutes
  const istMs = d.getTime() + (5 * 60 + 30) * 60 * 1000;
  const istDate = new Date(istMs);
  const year = istDate.getUTCFullYear();
  const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(istDate.getUTCDate()).padStart(2, '0');
  const hours = String(istDate.getUTCHours()).padStart(2, '0');
  const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Converts a `YYYY-MM-DDTHH:mm` string entered in Asia/Kolkata (+05:30)
 * into a canonical ISO-8601 UTC string (`...Z`).
 */
export function fromISTDateTimeLocalInput(localValue?: string | null): string | null {
  if (!localValue || !localValue.trim()) return null;
  const trimmed = localValue.trim();
  const normalized = trimmed.length === 16 ? `${trimmed}:00+05:30` : `${trimmed}+05:30`;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Checks whether an item with optional `startsAt` and `endsAt` is currently within its visible schedule window.
 * A not-yet-visible goal or event (startsAt > now) returns false.
 * An expired goal or event (endsAt < now) returns false.
 */
export function isScheduleActiveNow(
  startsAt?: string | null,
  endsAt?: string | null,
  nowMs: number = Date.now()
): boolean {
  const start = parseIsoDate(startsAt);
  const end = parseIsoDate(endsAt);
  if (start && start.getTime() > nowMs) return false;
  if (end && end.getTime() < nowMs) return false;
  return true;
}

export type TestScheduleStatus = 'live' | 'upcoming' | 'completed';

export function getTestScheduleStatus(
  test: {
    scheduledAt?: string | null;
    endsAt?: string | null;
    isLive?: boolean;
  },
  nowMs: number = Date.now()
): TestScheduleStatus {
  const start = parseIsoDate(test.scheduledAt);
  const end = parseIsoDate(test.endsAt);

  if (end && end.getTime() < nowMs) {
    return 'completed';
  }
  if (test.isLive === true) {
    return 'live';
  }
  if (start && start.getTime() > nowMs) {
    return 'upcoming';
  }
  return 'live';
}

export function formatWatchDuration(seconds?: number | null): string {
  const total = Math.max(0, Math.floor(Number(seconds || 0)));
  if (total === 0) return '0m';
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }
  if (mins > 0) {
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  return `${secs}s`;
}

export function formatCountdown(remainingSeconds: number): string {
  const clamped = Math.max(0, Math.floor(remainingSeconds));
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
