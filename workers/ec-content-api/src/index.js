export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=180"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    const respond = (body, status) => new Response(JSON.stringify(body), { status: status || 200, headers: cors });
    if (url.pathname === "/health") return respond({ ok: true, service: "Exam Cracker YouTube metadata proxy", youtubeDataApiKeyRequired: false });
    if (request.method !== "GET") return respond({ error: "Method not allowed" }, 405);
    if (url.pathname === "/video") {
      const videoUrl = url.searchParams.get("url") || "";
      const videoId = getVideoId(videoUrl);
      if (!videoId) return respond({ error: "Provide a valid YouTube video URL." }, 400);
      try {
        const r = await fetch("https://www.youtube.com/oembed?url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + videoId) + "&format=json", {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; ExamCracker/1.0)" }
        });
        if (!r.ok) return respond({ error: "YouTube could not return metadata for this video." }, r.status);
        const d = await r.json();
        return respond({ videoId, title: d.title, author: d.author_name, thumbnail: d.thumbnail_url, provider: d.provider_name,
          watchUrl: "https://www.youtube.com/watch?v=" + videoId });
      } catch (_) { return respond({ error: "Unable to reach YouTube metadata service." }, 502); }
    }
    if (url.pathname === "/playlist") {
      const playlistUrl = url.searchParams.get("url") || "";
      const playlistId = getPlaylistId(playlistUrl);
      if (!playlistId) return respond({ error: "Provide a valid YouTube playlist URL containing a list= ID." }, 400);
      const requestedLimit = Number(url.searchParams.get("limit") || 200);
      const limit = Math.max(1, Math.min(500, Number.isFinite(requestedLimit) ? requestedLimit : 200));
      const cursor = url.searchParams.get("cursor") || "";
      try {
        const page = await fetch("https://www.youtube.com/playlist?list=" + encodeURIComponent(playlistId), {
          headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
                     "Accept-Language": "en-US,en;q=0.9" }
        });
        if (!page.ok) return respond({ error: "Could not read this playlist. It must be public or accessible by link.", details: "YouTube returned status " + page.status }, page.status);
        const html = await page.text();
        const config = extractJsonAfter(html, "ytcfg.set(");
        const initialData = extractJsonAfter(html, "ytInitialData =") || extractJsonAfter(html, 'window["ytInitialData"] =');
        if (!initialData) return respond({ error: "YouTube changed the playlist page format. Please retry later or enter videos individually." }, 502);
        const apiKeyMatch = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/);
        const apiKey = (config && config.INNERTUBE_API_KEY) || (apiKeyMatch && apiKeyMatch[1]);
        const context = (config && config.INNERTUBE_CONTEXT) || null;
        const playlistTitle = getPlaylistTitle(initialData);
        const items = [];
        const seen = new Set();
        let continuation = decodeCursor(cursor);
        let more = true;
        let currentData = initialData;
        let pagesFetched = 0;
        if (!continuation) {
          const firstScan = scanPlaylist(initialData, items, seen);
          continuation = firstScan.continuation || "";
        }
        while (continuation && items.length < limit && pagesFetched < 12) {
          if (!apiKey || !context) {
            more = true;
            break;
          }
          const browseUrl = "https://www.youtube.com/youtubei/v1/browse?key=" + encodeURIComponent(apiKey) + "&prettyPrint=false";
          const browse = await fetch(browseUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0", "Origin": "https://www.youtube.com" },
            body: JSON.stringify({ context: context, continuation: continuation })
          });
          if (!browse.ok) {
            more = true;
            break;
          }
          currentData = await browse.json();
          const scan = scanPlaylist(currentData, items, seen);
          continuation = scan.continuation || "";
          pagesFetched++;
        }
        more = !!continuation;
        return respond({
          playlistId: playlistId,
          title: playlistTitle,
          count: items.length,
          items: items.slice(0, limit),
          nextCursor: more && continuation ? encodeCursor(continuation) : null,
          hasMore: !!(more && continuation),
          youtubeDataApiKeyRequired: false,
          note: "Uses public YouTube page metadata, not the YouTube Data API. Private, restricted, removed, and region-blocked videos may be unavailable."
        });
      } catch (_) {
        return respond({ error: "Could not read this playlist metadata. Check that it is public and try again." }, 502);
      }
    }
    return respond({ error: "Not found", endpoints: ["/health", "/video?url=...", "/playlist?url=...&limit=200&cursor=..."] }, 404);
  }
};

function getVideoId(value) {
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    if (host === "youtu.be") return u.pathname.split("/").filter(Boolean)[0] || "";
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v") || "";
      const m = u.pathname.match(/^\/(shorts|embed|live)\/([^/]+)/);
      if (m) return m[2];
    }
  } catch (_) {}
  return "";
}
function getPlaylistId(value) {
  try {
    const u = new URL(value);
    if (!/(^|\.)youtube\.com$/.test(u.hostname) && u.hostname !== "youtu.be") return "";
    return u.searchParams.get("list") || "";
  } catch (_) { return ""; }
}
function extractJsonAfter(source, marker) {
  const at = source.indexOf(marker);
  if (at < 0) return null;
  const start = source.indexOf("{", at + marker.length);
  if (start < 0) return null;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
    } else {
      if (c === '"') inString = true;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(source.slice(start, i + 1)); } catch (_) { return null; }
        }
      }
    }
  }
  return null;
}
function textOf(x) {
  if (!x) return "";
  if (typeof x === "string") return x;
  if (x.simpleText) return x.simpleText;
  if (Array.isArray(x.runs)) return x.runs.map(function(r) { return r.text || ""; }).join("");
  return "";
}
function getPlaylistTitle(data) {
  let title = "";
  walk(data, function(n) {
    if (!title && n.playlistMetadataRenderer && n.playlistMetadataRenderer.title) title = textOf(n.playlistMetadataRenderer.title);
    if (!title && n.playlistHeaderRenderer && n.playlistHeaderRenderer.title) title = textOf(n.playlistHeaderRenderer.title);
  });
  return title;
}
function walk(node, fn) {
  if (!node || typeof node !== "object") return;
  fn(node);
  if (Array.isArray(node)) {
    for (const item of node) walk(item, fn);
  } else {
    for (const value of Object.values(node)) walk(value, fn);
  }
}
function scanPlaylist(data, items, seen) {
  let continuation = "";
  walk(data, function(n) {
    const v = n.playlistVideoRenderer;
    if (v && v.videoId && !seen.has(v.videoId)) {
      const title = textOf(v.title) || "YouTube video";
      const thumbs = v.thumbnail && Array.isArray(v.thumbnail.thumbnails) ? v.thumbnail.thumbnails : [];
      const thumb = thumbs.length ? thumbs[thumbs.length - 1].url : "https://img.youtube.com/vi/" + v.videoId + "/hqdefault.jpg";
      if (title !== "Deleted video" && title !== "Private video") {
        seen.add(v.videoId);
        items.push({
          videoId: v.videoId,
          title: title,
          description: textOf(v.descriptionSnippet) || "",
          thumbnail: thumb,
          duration: textOf(v.lengthText),
          position: items.length,
          watchUrl: "https://www.youtube.com/watch?v=" + v.videoId + "&list=" + (v.navigationEndpoint && v.navigationEndpoint.watchEndpoint && v.navigationEndpoint.watchEndpoint.playlistId || "")
        });
      }
    }
    const token = n.continuationCommand && n.continuationCommand.token;
    if (token) continuation = token;
  });
  return { continuation: continuation };
}
function scanContinuation(data) {
  let token = "";
  walk(data, function(n) {
    if (n.continuationCommand && n.continuationCommand.token) token = n.continuationCommand.token;
  });
  return token;
}
function encodeCursor(value) {
  try { return btoa(unescape(encodeURIComponent(value))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
  catch (_) { return ""; }
}
function decodeCursor(value) {
  if (!value) return "";
  try {
    let s = value.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    return decodeURIComponent(escape(atob(s)));
  } catch (_) { return ""; }
}