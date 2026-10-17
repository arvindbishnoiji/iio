import { createClient } from "npm:@supabase/supabase-js@2";

const FIREBASE_PROJECT_ID = "darvo1";
const ADMIN_EMAIL = "arvinddarabishnoi@gmail.com";
const ALLOWED_EXAMS = new Set(["JEE", "NEET", "Both"]);
const ALLOWED_KINDS = new Set(["batch", "series", "lecture", "resource", "event", "goal", "test"]);
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400"
};
let cachedJwks = null;
let cachedJwksExpiresAt = 0;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  const url = new URL(req.url);
  if (url.pathname.endsWith("/health") || url.pathname === "/health") {
    return json({ ok: true, service: "Exam Cracker API", firebaseProjectId: FIREBASE_PROJECT_ID }, 200);
  }
  try {
    const claims = await requireFirebaseUser(req);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || getDefaultSecretKey();
    if (!supabaseUrl || !serviceKey) throw new Error("Server database credentials are not configured.");
    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const isAdmin = String(claims.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase();
    const path = normalizePath(url.pathname);
    const method = req.method.toUpperCase();

    if (path === "/profile" && method === "GET") {
      const { data, error } = await db.from("student_profiles").select("*").eq("firebase_uid", claims.sub).maybeSingle();
      if (error) throw error;
      return json({ profile: data || null });
    }
    if (path === "/profile" && (method === "POST" || method === "PATCH")) {
      const body = await bodyJson(req);
      const displayName = String(body.displayName || body.display_name || "").trim();
      const exam = String(body.exam || "").toUpperCase();
      const classLevel = String(body.classLevel || body.class_level || "");
      const avatarUrl = body.avatarUrl !== undefined ? (body.avatarUrl ? String(body.avatarUrl).trim() : null) : (body.avatar_url !== undefined ? (body.avatar_url ? String(body.avatar_url).trim() : null) : (claims.picture || null));
      if (displayName.length < 2 || displayName.length > 80) return json({ error: "Name must be 2-80 characters." }, 400);
      if (!["JEE", "NEET"].includes(exam) || !["11", "12"].includes(classLevel)) return json({ error: "Choose JEE or NEET and class 11 or 12." }, 400);
      const { data, error } = await db.from("student_profiles").upsert({
        firebase_uid: claims.sub, display_name: displayName, email: claims.email || null,
        exam: exam, class_level: classLevel, avatar_url: avatarUrl, updated_at: new Date().toISOString()
      }, { onConflict: "firebase_uid" }).select("*").single();
      if (error) throw error;
      return json({ profile: data });
    }
    if (path === "/bootstrap" && method === "GET") {
      const profile = await getProfile(db, claims.sub);
      if (!profile) return json({ needsOnboarding: true, profile: null, content: [], announcements: [], enrollments: [] });
      let content = await readContent(db, { exam: profile.exam, classLevel: profile.class_level, activeOnly: true });
      content = await hideUnenrolledContent(db, claims.sub, content);
      const { data: userEnrollments } = await db.from("enrollments").select("id,item_type,item_id,active,created_at").eq("firebase_uid", claims.sub).eq("active", true);
      const { data: announcements, error } = await db.from("announcements").select("id,title,body,audience,active,scheduled_at,created_at")
        .eq("active", true).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      const filteredAnnouncements = (announcements || []).filter((a) => audienceMatches(a.audience, profile.exam, profile.class_level) && dateIsVisible(a.scheduled_at));
      return json({ needsOnboarding: false, profile: profile, content: redactStudentContent(content), announcements: filteredAnnouncements, enrollments: userEnrollments || [] });
    }
    if (path === "/content" && method === "GET") {
      const profile = await getProfile(db, claims.sub);
      if (!profile) return json({ error: "Finish onboarding first." }, 409);
      const kind = url.searchParams.get("kind") || "";
      const requestedExam = url.searchParams.get("exam") || "";
      const requestedClass = url.searchParams.get("class") || "";
      if (requestedExam && requestedExam !== profile.exam) return json({ error: "Content is restricted to your selected exam." }, 403);
      if (requestedClass && String(requestedClass) !== String(profile.class_level)) return json({ error: "Content is restricted to your selected class." }, 403);
      const exam = profile.exam;
      const classLevel = profile.class_level;
      const parentId = url.searchParams.get("parentId") || "";
      if (kind && !ALLOWED_KINDS.has(kind)) return json({ error: "Invalid content kind." }, 400);
      if (parentId && ["lecture", "resource"].includes(kind) && isUuid(parentId)) {
        const { data: parent, error: parentError } = await db.from("course_catalog").select("id,kind").eq("id", parentId).maybeSingle();
        if (parentError) throw parentError;
        if (parent && ["batch", "series"].includes(parent.kind)) {
          const { data: enrolled, error: enrollmentError } = await db.from("enrollments").select("id").eq("firebase_uid", claims.sub).eq("item_id", parentId).eq("item_type", parent.kind).eq("active", true).maybeSingle();
          if (enrollmentError) throw enrollmentError;
          if (!enrolled) return json({ error: "Enroll in this batch or series to view its lessons." }, 403);
        }
      }
      let rows = await readContent(db, { kind: kind, exam: exam, classLevel: classLevel, parentId: parentId, activeOnly: true });
      rows = await hideUnenrolledContent(db, claims.sub, rows);
      return json({ items: redactStudentContent(rows) });
    }
    if (path === "/enrollments" && method === "POST") {
      const profile = await getProfile(db, claims.sub);
      if (!profile) return json({ error: "Finish onboarding first." }, 409);
      const body = await bodyJson(req);
      const itemType = String(body.itemType || "");
      const itemId = String(body.itemId || "");
      if (!["batch", "series"].includes(itemType) || !isUuid(itemId)) return json({ error: "Invalid enrollment target." }, 400);
      const { data: item, error: itemError } = await db.from("course_catalog").select("*").eq("id", itemId).eq("active", true).maybeSingle();
      if (itemError) throw itemError;
      if (!item || item.kind !== itemType) return json({ error: "This item is not available." }, 404);
      if (!examMatches(item.exam, profile.exam) || !classMatches(item.classes, profile.class_level)) return json({ error: "This item is not available for your selected exam/class." }, 403);
      if (item.access_code && String(body.accessCode || "") !== item.access_code) return json({ error: "The batch code is incorrect." }, 403);
      const { data: existing, error: existingError } = await db.from("enrollments").select("id,active").eq("firebase_uid", claims.sub).eq("item_type", itemType).eq("item_id", itemId).maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        if (!existing.active) {
          const { data, error } = await db.from("enrollments").update({ active: true }).eq("id", existing.id).select("*").single();
          if (error) throw error;
          return json({ enrollment: data });
        }
        return json({ enrolled: true, enrollment: existing });
      }
      const { data, error } = await db.from("enrollments").insert({ firebase_uid: claims.sub, item_type: itemType, item_id: itemId, active: true }).select("*").single();
      if (error) throw error;
      return json({ enrolled: true, enrollment: data });
    }
    if (path === "/progress" && method === "POST") {
      const body = await bodyJson(req);
      const lectureId = String(body.lectureId || body.lecture_id || "");
      const watchedSeconds = Math.max(0, Math.min(2147483647, Number(body.watchedSeconds || body.watched_seconds || 0) || 0));
      const completed = body.completed === true;
      if (!isUuid(lectureId)) return json({ error: "Invalid lecture id." }, 400);
      const { data: existing, error: lookupError } = await db.from("lesson_progress").select("id,watched_seconds,completed")
        .eq("firebase_uid", claims.sub).eq("lecture_id", lectureId).maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) {
        const { data, error } = await db.from("lesson_progress").update({
          watched_seconds: Math.max(existing.watched_seconds || 0, watchedSeconds),
          completed: Boolean(existing.completed || completed), updated_at: new Date().toISOString()
        }).eq("id", existing.id).select("*").single();
        if (error) throw error;
        return json({ progress: data });
      }
      const { data, error } = await db.from("lesson_progress").insert({
        firebase_uid: claims.sub, lecture_id: lectureId, watched_seconds: watchedSeconds, completed: completed
      }).select("*").single();
      if (error) throw error;
      return json({ progress: data });
    }
    if (path === "/tests" && method === "GET") {
      const profile = await getProfile(db, claims.sub);
      if (!profile) return json({ error: "Finish onboarding first." }, 409);
      const rows = await readContent(db, { kind: "test", exam: profile.exam, classLevel: profile.class_level, activeOnly: true });
      return json({ items: redactStudentContent(rows).map(testCard) });
    }
    const testMatch = path.match(/^\/tests\/([0-9a-f-]{36})(?:\/(submit|result))?$/i);
    if (testMatch && method === "GET" && testMatch[2] === "result") {
      const { data: attempts, error } = await db.from("exam_attempts").select("*").eq("firebase_uid", claims.sub).eq("test_id", testMatch[1]).order("submitted_at", { ascending: false }).limit(1);
      if (error) throw error;
      if (!attempts || !attempts.length) return json({ error: "No submitted result was found for this test." }, 404);
      const a = attempts[0];
      const answersData = a.answers && typeof a.answers === "object" ? a.answers : {};
      return json({ attempt: a, review: Array.isArray(answersData.review) ? answersData.review : [], result: { score: a.score, maxScore: a.max_score, correct: a.correct_count, incorrect: a.incorrect_count, unanswered: a.unanswered_count, percentage: Number(a.max_score) > 0 ? Math.round((Number(a.score) / Number(a.max_score)) * 10000) / 100 : 0 } });
    }
    if (testMatch && method === "GET" && !testMatch[2]) {
      const profile = await getProfile(db, claims.sub);
      if (!profile) return json({ error: "Finish onboarding first." }, 409);
      const item = await getTest(db, testMatch[1], profile);
      if (!item) return json({ error: "Test not found." }, 404);
      const meta = item.metadata || {};
      const startsAt = parseDate(meta.scheduledAt || meta.scheduled_at);
      const endsAt = parseDate(meta.endsAt || meta.ends_at);
      if (startsAt && startsAt.getTime() > Date.now() && meta.isLive !== true) return json({ error: "This test has not started yet.", startsAt: startsAt.toISOString() }, 409);
      if (endsAt && endsAt.getTime() < Date.now()) return json({ error: "This test has ended." }, 410);
      const questions = Array.isArray(meta.questions) ? meta.questions : [];
      return json({ test: testCard(item), questions: questions.map(sanitizeQuestion) });
    }
    if (testMatch && method === "POST" && testMatch[2] === "submit") {
      const profile = await getProfile(db, claims.sub);
      if (!profile) return json({ error: "Finish onboarding first." }, 409);
      const item = await getTest(db, testMatch[1], profile);
      if (!item) return json({ error: "Test not found." }, 404);
      const meta = item.metadata || {};
      const questions = Array.isArray(meta.questions) ? meta.questions : [];
      if (!questions.length) return json({ error: "This test has no questions yet." }, 409);
      const startsAt = parseDate(meta.scheduledAt || meta.scheduled_at);
      const endsAt = parseDate(meta.endsAt || meta.ends_at);
      if (startsAt && startsAt.getTime() > Date.now() && meta.isLive !== true) return json({ error: "This test has not started yet.", startsAt: startsAt.toISOString() }, 409);
      if (endsAt && endsAt.getTime() < Date.now()) return json({ error: "This test has ended." }, 410);
      if (meta.allowMultipleAttempts === false) {
        const { data: prior, error } = await db.from("exam_attempts").select("id").eq("firebase_uid", claims.sub).eq("test_id", item.id).limit(1);
        if (error) throw error;
        if ((prior || []).length) return json({ error: "You have already submitted this test." }, 409);
      }
      const body = await bodyJson(req);
      const answers = body.answers && typeof body.answers === "object" ? body.answers : {};
      const marksDefault = Number(meta.marksPerQuestion ?? 4);
      const negativeDefault = Number(meta.negativeMarks ?? 1);
      let score = 0, maxScore = 0, correct = 0, incorrect = 0, unanswered = 0;
      const review = questions.map((q, index) => {
        const qid = String(q.id || index);
        const userAnswer = answers[qid] ?? answers[String(index)] ?? null;
        const correctAnswer = q.correctAnswer ?? q.correct_answer ?? q.answerKey ?? null;
        const marks = Number(q.marks ?? marksDefault);
        const negative = Number(q.negativeMarks ?? q.negative_marks ?? negativeDefault);
        maxScore += Math.max(0, marks);
        const given = normalizeAnswer(userAnswer);
        const expected = normalizeAnswer(correctAnswer);
        const isUnanswered = userAnswer === null || userAnswer === undefined || userAnswer === "";
        const isCorrect = !isUnanswered && expected !== "" && given === expected;
        if (isUnanswered) unanswered++;
        else if (isCorrect) { correct++; score += marks; }
        else { incorrect++; score -= negative; }
        return {
          questionId: qid, answer: userAnswer, correctAnswer: correctAnswer,
          isCorrect: isCorrect, explanation: q.explanation || "", marksAwarded: isUnanswered ? 0 : (isCorrect ? marks : -negative)
        };
      });
      const { data: attempt, error } = await db.from("exam_attempts").insert({
        firebase_uid: claims.sub, test_id: item.id, exam: profile.exam, class_level: profile.class_level,
        score: score, max_score: maxScore, correct_count: correct, incorrect_count: incorrect,
        unanswered_count: unanswered, answers: { submitted: answers, review: review }, submitted_at: new Date().toISOString()
      }).select("*").single();
      if (error) throw error;
      return json({ attempt: attempt, result: { score: score, maxScore: maxScore, correct, incorrect, unanswered, percentage: maxScore > 0 ? Math.round((score / maxScore) * 10000) / 100 : 0 }, review: review });
    }
    if (path === "/analysis" && method === "GET") {
      const profile = await getProfile(db, claims.sub);
      if (!profile) return json({ error: "Finish onboarding first." }, 409);
      const { data: attempts, error: attemptsError } = await db.from("exam_attempts").select("id,test_id,score,max_score,correct_count,incorrect_count,unanswered_count,submitted_at").eq("firebase_uid", claims.sub).order("submitted_at", { ascending: false }).limit(500);
      if (attemptsError) throw attemptsError;
      const { data: progress, error: progressError } = await db.from("lesson_progress").select("lecture_id,watched_seconds,completed,updated_at").eq("firebase_uid", claims.sub).order("updated_at", { ascending: false }).limit(2000);
      if (progressError) throw progressError;
      const results = attempts || [];
      const totalScore = results.reduce((sum, a) => sum + Number(a.score || 0), 0);
      const totalMax = results.reduce((sum, a) => sum + Number(a.max_score || 0), 0);
      const avgPct = results.length ? results.reduce((sum, a) => sum + (Number(a.max_score) > 0 ? Math.max(0, Number(a.score) / Number(a.max_score) * 100) : 0), 0) / results.length : 0;
      const completedLessons = (progress || []).filter((p) => p.completed).length;
      const level = results.length >= 10 && avgPct >= 80 ? "Expert" : results.length >= 5 && avgPct >= 65 ? "Advanced" : results.length >= 2 && avgPct >= 45 ? "Intermediate" : "Beginner";
      return json({ profile: profile, level: level, testsTaken: results.length, averagePercentage: Math.round(avgPct * 100) / 100, totalScore: totalScore, totalMaxScore: totalMax, completedLessons: completedLessons, watchedSeconds: (progress || []).reduce((sum, p) => sum + Number(p.watched_seconds || 0), 0), attempts: results, lessonProgress: progress || [] });
    }
    if (path === "/leaderboard" && method === "GET") {
      const profile = await getProfile(db, claims.sub);
      if (!profile) return json({ error: "Finish onboarding first." }, 409);
      const testId = url.searchParams.get("testId") || "";
      let q = db.from("exam_attempts").select("id,firebase_uid,test_id,exam,class_level,score,max_score,submitted_at").eq("exam", profile.exam).eq("class_level", profile.class_level).order("score", { ascending: false }).order("submitted_at", { ascending: true }).limit(1000);
      if (testId) q = q.eq("test_id", testId);
      const { data: attempts, error } = await q;
      if (error) throw error;
      const latest = new Map();
      for (const a of attempts || []) {
        const k = a.firebase_uid + ":" + a.test_id;
        if (!latest.has(k)) latest.set(k, a);
      }
      const rows = Array.from(latest.values()).sort((a, b) => Number(b.score) - Number(a.score) || new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime());
      const userIds = Array.from(new Set(rows.map((a) => a.firebase_uid)));
      const names = {};
      for (let i = 0; i < userIds.length; i += 100) {
        const { data, error: profileError } = await db.from("student_profiles").select("firebase_uid,display_name,avatar_url").in("firebase_uid", userIds.slice(i, i + 100));
        if (profileError) throw profileError;
        for (const p of data || []) names[p.firebase_uid] = p;
      }
      return json({ testId: testId || null, items: rows.map((a, i) => ({ rank: i + 1, testId: a.test_id, firebaseUid: a.firebase_uid, name: names[a.firebase_uid]?.display_name || "Student", avatarUrl: names[a.firebase_uid]?.avatar_url || null, score: a.score, maxScore: a.max_score, submittedAt: a.submitted_at })) });
    }
    if (path === "/admin/overview" && method === "GET") {
      if (!isAdmin) return json({ error: "Admin access denied." }, 403);
      const counts = {};
      const tables = ["student_profiles", "course_catalog", "exam_attempts", "enrollments", "announcements"];
      for (const table of tables) {
        const key = table === "student_profiles" ? "firebase_uid" : "id";
        const { count, error } = await db.from(table).select(key, { count: "exact", head: true });
        if (error) throw error;
        counts[table] = count || 0;
      }
      const { data: latest, error: latestError } = await db.from("course_catalog").select("id,kind,title,exam,classes,active,updated_at").order("updated_at", { ascending: false }).limit(10);
      if (latestError) throw latestError;
      return json({ counts, latestContent: latest || [] });
    }
    if (path === "/admin/students" && method === "GET") {
      if (!isAdmin) return json({ error: "Admin access denied." }, 403);
      const { data, error } = await db.from("student_profiles").select("firebase_uid,display_name,email,exam,class_level,avatar_url,created_at,updated_at").order("created_at", { ascending: false }).limit(2000);
      if (error) throw error;
      return json({ items: data || [] });
    }
    if (path === "/admin/content" && method === "GET") {
      if (!isAdmin) return json({ error: "Admin access denied." }, 403);
      const kind = url.searchParams.get("kind") || "";
      const exam = url.searchParams.get("exam") || "";
      const classLevel = url.searchParams.get("class") || "";
      const rows = await readContent(db, { kind, exam, classLevel, activeOnly: false });
      return json({ items: rows });
    }
    if (path === "/admin/content" && method === "POST") {
      if (!isAdmin) return json({ error: "Admin access denied." }, 403);
      const body = await bodyJson(req);
      const row = normalizeContentBody(body, null);
      const { data, error } = await db.from("course_catalog").insert(row).select("*").single();
      if (error) throw error;
      return json({ item: data }, 201);
    }
    const adminContentMatch = path.match(/^\/admin\/content\/([0-9a-f-]{36})$/i);
    if (adminContentMatch && method === "PATCH") {
      if (!isAdmin) return json({ error: "Admin access denied." }, 403);
      const body = await bodyJson(req);
      const row = normalizeContentBody(body, adminContentMatch[1]);
      const { data, error } = await db.from("course_catalog").update(row).eq("id", adminContentMatch[1]).select("*").single();
      if (error) throw error;
      return json({ item: data });
    }
    if (adminContentMatch && method === "DELETE") {
      if (!isAdmin) return json({ error: "Admin access denied." }, 403);
      const { data, error } = await db.from("course_catalog").update({ active: false, updated_at: new Date().toISOString() }).eq("id", adminContentMatch[1]).select("id,kind,title,active").single();
      if (error) throw error;
      return json({ item: data, disabled: true });
    }
    if (path === "/admin/announcements" && method === "GET") {
      if (!isAdmin) return json({ error: "Admin access denied." }, 403);
      const { data, error } = await db.from("announcements").select("*").order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return json({ items: data || [] });
    }
    if (path === "/admin/announcements" && method === "POST") {
      if (!isAdmin) return json({ error: "Admin access denied." }, 403);
      const body = await bodyJson(req);
      const row = normalizeAnnouncement(body);
      const { data, error } = await db.from("announcements").insert(row).select("*").single();
      if (error) throw error;
      return json({ item: data }, 201);
    }
    const adminAnnouncementMatch = path.match(/^\/admin\/announcements\/([0-9a-f-]{36})$/i);
    if (adminAnnouncementMatch && method === "PATCH") {
      if (!isAdmin) return json({ error: "Admin access denied." }, 403);
      const body = await bodyJson(req);
      const { data: current, error: currentError } = await db.from("announcements").select("*").eq("id", adminAnnouncementMatch[1]).single();
      if (currentError) throw currentError;
      const row = normalizeAnnouncement(Object.assign({}, current, body));
      const { data, error } = await db.from("announcements").update(row).eq("id", adminAnnouncementMatch[1]).select("*").single();
      if (error) throw error;
      return json({ item: data });
    }
    return json({ error: "Not found", path: path }, 404);
  } catch (error) {
    const message = String(error && error.message || error || "Unexpected server error");
    if (message.indexOf("Unauthorized") >= 0) return json({ error: "Please sign in again." }, 401);
    if (message.indexOf("Server database credentials") >= 0) return json({ error: message }, 503);
    return json({ error: "Request failed.", detail: message }, 500);
  }
});

function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: Object.assign({}, CORS_HEADERS, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }) });
}
function normalizePath(path) {
  const p = path.replace(/\/+$/, "");
  const marker = "/exam-cracker-api";
  const index = p.indexOf(marker);
  return (index >= 0 ? p.slice(index + marker.length) : p) || "/";
}
async function bodyJson(req) {
  try { return await req.json(); } catch (_) { throw new Error("Invalid JSON request body."); }
}
function b64urlDecode(s) {
  const v = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = v + "=".repeat((4 - v.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function base64urlToBytes(s) {
  const v = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = v + "=".repeat((4 - v.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
async function getFirebaseJwks() {
  if (cachedJwks && cachedJwksExpiresAt > Date.now()) return cachedJwks;
  const response = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
  if (!response.ok) throw new Error("Unable to load authentication keys.");
  const data = await response.json();
  cachedJwks = data.keys || [];
  cachedJwksExpiresAt = Date.now() + 60 * 60 * 1000;
  return cachedJwks;
}
async function requireFirebaseUser(req) {
  const header = req.headers.get("Authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token || token.split(".").length !== 3) throw new Error("Unauthorized");
  const parts = token.split(".");
  let head, claims;
  try { head = JSON.parse(b64urlDecode(parts[0])); claims = JSON.parse(b64urlDecode(parts[1])); }
  catch (_) { throw new Error("Unauthorized"); }
  if (head.alg !== "RS256" || !head.kid || claims.aud !== FIREBASE_PROJECT_ID ||
      claims.iss !== "https://securetoken.google.com/" + FIREBASE_PROJECT_ID ||
      !claims.sub || typeof claims.sub !== "string" ||
      Number(claims.exp) <= Math.floor(Date.now() / 1000) ||
      Number(claims.iat) > Math.floor(Date.now() / 1000) + 300) throw new Error("Unauthorized");
  const jwks = await getFirebaseJwks();
  const jwk = jwks.find((k) => k.kid === head.kid);
  if (!jwk) throw new Error("Unauthorized");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const verified = await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, base64urlToBytes(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
  if (!verified) throw new Error("Unauthorized");
  if (claims.auth_time && Number(claims.auth_time) > Math.floor(Date.now() / 1000) + 300) throw new Error("Unauthorized");
  return claims;
}
function getDefaultSecretKey() {
  try {
    const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (!raw) return "";
    const obj = JSON.parse(raw);
    return obj.default || Object.values(obj)[0] || "";
  } catch (_) { return ""; }
}
async function getProfile(db, uid) {
  const { data, error } = await db.from("student_profiles").select("*").eq("firebase_uid", uid).maybeSingle();
  if (error) throw error;
  return data || null;
}
function examMatches(contentExam, exam) { return contentExam === "Both" || contentExam === exam; }
function classMatches(classes, classLevel) { return !Array.isArray(classes) || classes.includes(String(classLevel)); }
function audienceMatches(audience, exam, classLevel) {
  if (!audience || audience === "All" || audience === "all") return true;
  const a = String(audience).toUpperCase();
  return a === String(exam).toUpperCase() || a === (String(exam) + "_" + String(classLevel)).toUpperCase() || a === (String(exam) + " " + String(classLevel)).toUpperCase();
}
function dateIsVisible(value) { return !value || new Date(value).getTime() <= Date.now(); }
function parseDate(value) { if (!value) return null; const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d; }
async function readContent(db, options) {
  let q = db.from("course_catalog").select("*").order("created_at", { ascending: false }).limit(3000);
  if (options.kind) q = q.eq("kind", options.kind);
  if (options.activeOnly) q = q.eq("active", true);
  if (options.exam && ["JEE", "NEET"].includes(options.exam)) q = q.in("exam", [options.exam, "Both"]);
  if (options.classLevel && ["11", "12"].includes(String(options.classLevel))) q = q.contains("classes", [String(options.classLevel)]);
  const { data, error } = await q;
  if (error) throw error;
  let rows = data || [];
  if (options.parentId) rows = rows.filter((r) => String((r.metadata || {}).parentId || (r.metadata || {}).parent_id || (r.metadata || {}).batchId || "") === String(options.parentId));
  return rows;
}
function redactStudentContent(rows) {
  return (rows || []).map((r) => {
    const copy = Object.assign({}, r);
    const hasAccessCode = Boolean(copy.access_code || (copy.metadata && (copy.metadata.requiresAccessCode || copy.metadata.hasAccessCode)));
    delete copy.access_code;
    copy.hasAccessCode = hasAccessCode;
    if (copy.kind === "test" && copy.metadata && Array.isArray(copy.metadata.questions)) {
      copy.metadata = Object.assign({}, copy.metadata, { questions: copy.metadata.questions.map(sanitizeQuestion) });
    }
    return copy;
  });
}
async function hideUnenrolledContent(db, uid, rows) {
  const candidates = (rows || []).filter((r) => ["lecture", "resource"].includes(r.kind));
  if (!candidates.length) return rows || [];
  const { data, error } = await db.from("enrollments").select("item_type,item_id").eq("firebase_uid", uid).eq("active", true);
  if (error) throw error;
  const enrolled = new Set((data || []).map((x) => x.item_type + ":" + x.item_id));
  return (rows || []).filter((r) => {
    if (!["lecture", "resource"].includes(r.kind)) return true;
    const m = r.metadata || {};
    const parent = String(m.parentId || m.parent_id || m.batchId || m.batch_id || "");
    if (!parent) return true;
    return enrolled.has("batch:" + parent) || enrolled.has("series:" + parent);
  });
}
function testCard(item) {
  const m = item.metadata || {};
  return { id: item.id, kind: item.kind, title: item.title, description: item.description, exam: item.exam, classes: item.classes,
    active: item.active, thumbnailUrl: m.thumbnailUrl || m.thumbnail_url || null, scheduledAt: m.scheduledAt || m.scheduled_at || null,
    endsAt: m.endsAt || m.ends_at || null, durationMinutes: Number(m.durationMinutes || m.duration_minutes || 0),
    totalQuestions: Array.isArray(m.questions) ? m.questions.length : Number(m.totalQuestions || 0),
    totalMarks: m.totalMarks || null, isLive: m.isLive === true, subject: m.subject || null };
}
function sanitizeQuestion(q, index) {
  const copy = Object.assign({}, q);
  delete copy.correctAnswer; delete copy.correct_answer; delete copy.answerKey; delete copy.answer_key; delete copy.explanation;
  copy.id = String(q.id || index);
  return copy;
}
async function getTest(db, id, profile) {
  if (!isUuid(id)) return null;
  const { data, error } = await db.from("course_catalog").select("*").eq("id", id).eq("kind", "test").eq("active", true).maybeSingle();
  if (error) throw error;
  if (!data || !examMatches(data.exam, profile.exam) || !classMatches(data.classes, profile.class_level)) return null;
  return data;
}
function normalizeAnswer(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((v) => String(v).trim().toLowerCase()).sort().join("|");
  return String(value).trim().toLowerCase();
}
function normalizeContentBody(body, id) {
  const kind = String(body.kind || "lecture");
  const title = String(body.title || "").trim();
  const exam = String(body.exam || "Both");
  const classes = Array.isArray(body.classes) ? body.classes.map(String) : ["11", "12"];
  if (!ALLOWED_KINDS.has(kind)) throw new Error("Invalid content kind.");
  if (!title || title.length > 180) throw new Error("Content title is required and must be under 180 characters.");
  if (!ALLOWED_EXAMS.has(exam)) throw new Error("Exam must be JEE, NEET, or Both.");
  if (!classes.length || classes.some((x) => !["11", "12"].includes(x))) throw new Error("Classes must contain 11 and/or 12.");
  const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
  const row = {
    kind: kind, title: title, description: String(body.description || "").slice(0, 10000),
    exam: exam, classes: classes, active: body.active !== false,
    access_code: body.accessCode === undefined ? (body.access_code === undefined ? null : (body.access_code || null)) : (body.accessCode || null),
    metadata: metadata, updated_at: new Date().toISOString()
  };
  if (!id) row.created_at = new Date().toISOString();
  return row;
}
function normalizeAnnouncement(body) {
  const title = String(body.title || "").trim();
  const text = String(body.body || "").trim();
  if (!title || title.length > 180 || !text || text.length > 10000) throw new Error("Announcement title and body are required.");
  const scheduledAt = body.scheduled_at || body.scheduledAt || null;
  return {
    title: title, body: text, audience: String(body.audience || "All"), active: body.active !== false,
    scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null
  };
}
function isUuid(s) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s)); }