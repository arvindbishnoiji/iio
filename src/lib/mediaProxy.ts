import { APP_CONFIG } from './config';
import type {
  CloudflarePlaylistItem,
  CloudflarePlaylistResponse,
  CloudflareVideoMetadata,
} from '../types';

export function extractYoutubeVideoId(input?: string | null): string {
  if (!input) return '';
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  try {
    const u = new URL(trimmed);
    const host = u.hostname.toLowerCase();
    if (host === 'youtu.be') {
      return u.pathname.split('/').filter(Boolean)[0] || '';
    }
    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      if (u.pathname === '/watch') {
        return u.searchParams.get('v') || '';
      }
      const match = u.pathname.match(/^\/(shorts|embed|live)\/([^/?#]+)/);
      if (match) return match[2];
    }
  } catch {
    // Ignore invalid URL
  }
  return '';
}

export function extractYoutubePlaylistId(input?: string | null): string {
  if (!input) return '';
  const trimmed = input.trim();
  try {
    const u = new URL(trimmed);
    if (!/(^|\.)youtube\.com$/i.test(u.hostname) && u.hostname.toLowerCase() !== 'youtu.be') {
      return '';
    }
    return u.searchParams.get('list') || '';
  } catch {
    return '';
  }
}

export function getYoutubeEmbedUrl(videoId: string): string {
  const cleanId = extractYoutubeVideoId(videoId) || videoId.trim();
  return `https://www.youtube.com/embed/${encodeURIComponent(cleanId)}?rel=0&modestbranding=1&playsinline=1`;
}

export function getYoutubeWatchUrl(videoId: string): string {
  const cleanId = extractYoutubeVideoId(videoId) || videoId.trim();
  return `https://www.youtube.com/watch?v=${encodeURIComponent(cleanId)}`;
}

export function getYoutubeDefaultThumbnail(videoId: string): string {
  const cleanId = extractYoutubeVideoId(videoId) || videoId.trim();
  if (!cleanId) return '';
  return `https://img.youtube.com/vi/${encodeURIComponent(cleanId)}/hqdefault.jpg`;
}

export async function checkMediaProxyHealth(): Promise<{
  ok: boolean;
  service: string;
  youtubeDataApiKeyRequired: boolean;
}> {
  const res = await fetch(`${APP_CONFIG.cloudflare.mediaProxyUrl}/health`);
  if (!res.ok) {
    throw new Error(`Cloudflare media proxy health check failed (${res.status}).`);
  }
  return res.json();
}

export async function fetchVideoMetadata(
  videoUrl: string
): Promise<CloudflareVideoMetadata> {
  const url = `${APP_CONFIG.cloudflare.mediaProxyUrl}/video?url=${encodeURIComponent(
    videoUrl.trim()
  )}`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error(
      'Unable to reach Cloudflare YouTube metadata proxy. You can still enter the video title and details manually below.'
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data.error === 'string'
        ? data.error
        : 'Could not load metadata for this YouTube video. You can still enter the title and thumbnail manually.'
    );
  }
  return data as CloudflareVideoMetadata;
}

export async function fetchPlaylistPage(
  playlistUrl: string,
  cursor?: string | null,
  limit = 200
): Promise<CloudflarePlaylistResponse> {
  const params = new URLSearchParams({
    url: playlistUrl.trim(),
    limit: String(limit),
  });
  if (cursor) {
    params.set('cursor', cursor);
  }
  const url = `${APP_CONFIG.cloudflare.mediaProxyUrl}/playlist?${params.toString()}`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error(
      'Unable to reach Cloudflare playlist proxy. Check your connection or add videos individually.'
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data.error === 'string'
        ? data.error
        : 'Could not read this YouTube playlist. Ensure it is public or add videos individually.'
    );
  }
  return data as CloudflarePlaylistResponse;
}

export interface PlaylistImportProgress {
  pagesFetched: number;
  totalItems: number;
  playlistTitle: string;
  hasMore: boolean;
}

/**
 * Fetches all pages of a public YouTube playlist by following `nextCursor` until
 * exhausted or aborted via `signal`. Deduplicates items by `videoId`.
 */
export async function importFullYoutubePlaylist(
  playlistUrl: string,
  options?: {
    signal?: AbortSignal;
    onProgress?: (progress: PlaylistImportProgress) => void;
    maxPages?: number;
  }
): Promise<{
  playlistId: string;
  title: string;
  items: CloudflarePlaylistItem[];
  pagesFetched: number;
  cancelled: boolean;
  note?: string;
}> {
  const seenVideoIds = new Set<string>();
  const deduplicated: CloudflarePlaylistItem[] = [];
  let cursor: string | null = null;
  let pagesFetched = 0;
  let playlistId = extractYoutubePlaylistId(playlistUrl);
  let title = '';
  let note: string | undefined;
  const maxPages = options?.maxPages ?? 25;
  let cancelled = false;

  while (pagesFetched < maxPages) {
    if (options?.signal?.aborted) {
      cancelled = true;
      break;
    }

    const page = await fetchPlaylistPage(playlistUrl, cursor, 200);
    pagesFetched += 1;
    if (page.playlistId) playlistId = page.playlistId;
    if (page.title && !title) title = page.title;
    if (page.note) note = page.note;

    for (const item of page.items || []) {
      if (!item || !item.videoId) continue;
      if (seenVideoIds.has(item.videoId)) continue;
      seenVideoIds.add(item.videoId);
      deduplicated.push({
        videoId: item.videoId,
        title: item.title || `Lecture ${deduplicated.length + 1}`,
        description: item.description || '',
        thumbnail: item.thumbnail || getYoutubeDefaultThumbnail(item.videoId),
        duration: item.duration || '',
        position: deduplicated.length + 1,
        watchUrl: item.watchUrl || getYoutubeWatchUrl(item.videoId),
        lesson: title || 'Playlist Lecture',
        selected: true,
      });
    }

    options?.onProgress?.({
      pagesFetched,
      totalItems: deduplicated.length,
      playlistTitle: title,
      hasMore: Boolean(page.hasMore && page.nextCursor),
    });

    if (!page.hasMore || !page.nextCursor) {
      break;
    }
    cursor = page.nextCursor;
  }

  return {
    playlistId,
    title: title || 'Imported YouTube Playlist',
    items: deduplicated,
    pagesFetched,
    cancelled,
    note,
  };
}
