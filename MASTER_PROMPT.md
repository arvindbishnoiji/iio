# MASTER PROMPT — Exam Cracker Educational App

You are the implementation agent for **Exam Cracker**, an educational app for JEE and NEET students. Work directly in this GitHub repository. The Android application ID must be **com.darvo.ec**. Do not return only a plan or a mockup: inspect the repo, build the working application, commit the code and document any step that genuinely requires a manual Firebase Console action.

## 0. Mandatory pre-flight rules

1. Inspect the entire repository before editing. The existing root file google-services.json is the Firebase Android client configuration for project darvo1 and package com.darvo.ec. Preserve it. It is not a Firebase Admin service-account private key.
2. Do not replace the deployed Cloudflare Worker or Supabase Edge Function with a new service name. Their source files are included in this repository and their deployed URLs are listed in README.md and .env.example.
3. Do not invent credentials or write placeholders over working public configuration. Never expose a server secret, Supabase secret/service-role key, private key, or Firebase Admin service-account JSON in frontend code, build output, GitHub commits, logs or Markdown. Never require a YouTube Data API key.
4. The Supabase project and tables already exist. Do not drop, recreate, or broadly expose existing tables. Current direct-client RLS policies intentionally deny public/ordinary-authenticated access; use the Firebase-token-verified Edge Function.
5. Use the Supabase schema, endpoint contracts and data model below. If a change is necessary, create a small safe migration, update schema documentation, and keep backward compatibility.
6. Build a complete, attractive, mobile-first application. No dead buttons, fake charts, fake sign-in success, fake test submission, pretend video progress, or hard-coded mock content in production. Empty states must explain how to add content from the admin panel.
7. Use India time (Asia/Kolkata) for displayed schedules and store timestamps as ISO-8601 UTC values. Handle loading, network errors, expired sessions and failed video imports visibly.

## 1. Required stack and deliverables

Use Vite + React + TypeScript for the UI and Capacitor for Android. Keep index.html as the Vite document entry and implement the admin panel as the protected /admin route in the same app. Do not put the whole application into one unmaintainable HTML file.

Create/maintain index.html, package.json, lockfile, tsconfig, Vite config, a structured src directory, Capacitor config with appId com.darvo.ec and appName Exam Cracker, Firebase modules, a typed API client for Supabase Edge Function, Cloudflare media-proxy client, reusable components, route guards, responsive styling and Android platform files. Include Firestore rules, build checks, a GitHub Actions debug-APK workflow and setup documentation.

Suggested source organization: src/app, src/components, src/features/auth, home, lectures, batches, series, tests, leaderboard, profile, admin, chat, notifications, and src/lib plus src/types. Keep data access out of visual components. Support common Android phones, tablets and desktop admin usage; implement accessibility, semantic form labels, keyboard focus, safe-area insets and graceful long-text wrapping.

## 2. Actual services already provisioned

### Firebase project darvo1

Use Firebase Authentication for student/admin sign-in, Firestore for chat and in-app notifications, and Firebase Cloud Messaging for push-notification support. The root Android config file already exists. Web configuration is in .env.example.

Use Firebase Email/Password authentication and Continue with Google. Students may register with email/password or Google. Persist the Firebase session, handle auth-state restoration/logout, and show friendly error messages. Web sign-in should use Firebase's supported web flow. Native Android Google sign-in must use a Capacitor-compatible native/redirect flow, not rely on a popup that cannot work inside a WebView. Add SHA-1/SHA-256 fingerprints in Firebase Console if required by the chosen Google flow. If OAuth provider enablement, authorised domains, a VAPID key or Android fingerprints are missing, implement the integration and state the exact manual Console action; never pretend it is enabled.

Admin identity is exactly **arvinddarabishnoi@gmail.com**. The Firebase Auth user must actually exist. Admin login is sign-in-only: no public admin self-registration and no button that grants privileges. Hide /admin from students and enforce administrator rights again on every backend admin operation. Do not trust an email typed into a field as proof of admin rights. The deployed Edge Function verifies the signed Firebase ID token and compares the verified email claim. Email verification is not required for this project's email-identity admin rule.

Firestore collections:
- studentThreads/{studentUid} with messages at studentThreads/{studentUid}/messages/{messageId}. Message fields should include senderUid, senderRole (student/admin), text, createdAt and optional readAt/attachments.
- users/{studentUid}/notifications/{notificationId}. Fields: title, body, deepLink, createdAt, readAt/isRead, type.
- fcmTokens/{studentUid}/tokens/{tokenId} for signed-in device tokens.
- Optional broadcasts collection for active notices.

Use Firestore listeners for live chat and in-app notifications. A student can read/send only their own thread; the admin can read/respond to threads. Do not build open unauthenticated chat or allow students to impersonate admin messages. Store only necessary data. Keep PDF/image/video metadata and links in Supabase, not binary files in Firestore.

Push caveat: FCM token registration and in-app notifications can be implemented now. Server-sent push requires a secure Firebase Admin credential/service-account setup or another supported trusted sender. google-services.json is not an Admin credential. If no Admin credential exists in Firebase/CI secrets, document the one-time secure setup; never commit a private key.

### Supabase project and deployed Edge Function

- Project ref: kncbvcozpcrfvxdbkbtf
- API URL: https://kncbvcozpcrfvxdbkbtf.supabase.co
- Edge Function base URL: https://kncbvcozpcrfvxdbkbtf.supabase.co/functions/v1/exam-cracker-api
- Use VITE_SUPABASE_PUBLISHABLE_KEY as the apikey request header. This is a public client key, not an authorization mechanism.
- Platform verify_jwt is disabled because students authenticate with Firebase, not Supabase Auth. The Edge Function verifies each Firebase ID token itself. Every non-health route requires Authorization: Bearer followed by the current Firebase ID token. The Edge Function accesses the database with its backend-only Supabase secret/service-role credential. Never move that credential to the app.
- Refresh the Firebase ID token via currentUser.getIdToken() for API calls. Send Content-Type: application/json, plus the public Supabase key in the apikey header. Handle non-2xx responses and JSON error bodies.
- Append routes to the Edge Function base URL above. Do not add a second /functions/v1 prefix.

Provisioned tables:
1. student_profiles: firebase_uid primary key, display_name, email, exam, class_level, avatar_url, created_at, updated_at.
2. course_catalog: id UUID, kind (batch/series/lecture/resource/event/goal/test), title, description, exam (JEE/NEET/Both), classes text array ("11" and/or "12"), active, access_code, metadata JSONB, created_at, updated_at.
3. lesson_progress: id, firebase_uid, lecture_id (course_catalog UUID stored as text), watched_seconds, completed, updated_at.
4. exam_attempts: id, firebase_uid, test_id, exam, class_level, score, max_score, correct_count, incorrect_count, unanswered_count, answers JSONB, submitted_at.
5. enrollments: id, firebase_uid, item_type (batch/series), item_id, active, created_at.
6. announcements: id, title, body, audience, active, scheduled_at, created_at.

RLS is enabled and denies direct public/ordinary-authenticated access. This is intentional; do not "fix" it with allow-all policies. Use the Edge Function. Indexes have been applied and the source migration is in the repo.

### Cloudflare Worker — no YouTube Data API key

Worker name: ec-content-api  
Base URL: https://ec-content-api.arvinddara0290.workers.dev  
Source: workers/ec-content-api/src/index.js  
Wrangler config: wrangler.toml

Endpoints:
- GET /health
- GET /video?url=<YouTube video URL> returns videoId, title, author, thumbnail, provider and watchUrl using public metadata.
- GET /playlist?url=<public YouTube playlist URL>&limit=200&cursor=<optional cursor> imports page-sized lists and returns a nextCursor when more items exist. Continue following nextCursor until exhausted for a complete import. Deduplicate by videoId and show progress.

This Worker does not need YOUTUBE_API_KEY and must not require a Google YouTube Data API key. It reads public YouTube metadata; private, removed, age-restricted, region-restricted or unavailable videos may fail, and YouTube may change its public page format. Show a useful error and allow manual single-video URL entry. Do not promise autoplay always works: browsers may block unmuted autoplay. After a user clicks, attempt playback and show a Play button if it is blocked. Do not download or rehost YouTube videos.

## 3. Student onboarding

On first successful sign-in:
1. Ask for student's display name.
2. Ask for exam track: JEE or NEET.
3. Ask class: 11th or 12th.
4. Save by POST /profile with displayName, exam and classLevel ("11" or "12").
5. Only then open the personalised home page.

Use Firebase UID as stable student identity. The backend derives it from the verified token. Never accept a student UID in a request body as the identity for profiles, progress or results. Allow editing display name/avatar later. Do not silently change exam/class content if profile save fails. Add logout and expired-session handling.

## 4. Student navigation and pages

Mobile bottom navigation and a suitable large-screen layout:
- Home
- Lectures
- Leaderboard
- Analysis/Profile

Within Lectures expose Batches, My Batches, All Batches, Series and Resources/PDFs. Add search/filter when useful. Every content family must be filtered by selected exam and class; JEE-11 users must not see NEET-12-only content.

### Home

At the top show a prominent “+ Today's Goal” section/card. Below it show active goal(s), event/banner carousel, live test card(s), upcoming scheduled tests, enrolled-batch continuation/recent lectures and relevant announcements/notifications. Goals/events need enabled state, schedule windows and exam/class targeting. Display times in Asia/Kolkata. A not-yet-visible goal must not appear in the current-goal card.

Goal records use kind=goal and metadata can include startsAt, endsAt, deepLink, ctaLabel and priority. Show only active goals within the schedule.

### Batches

List/grid cards show thumbnail, name, code display, about, exam/class, instructor/subjects/features and enrollment state. Use object-fit cover and responsive fixed aspect ratios; never stretch images.

Provide All Batches, My Batches and a batch detail screen. If access_code exists, ask the student for it and POST /enrollments with accessCode. If no code is set, one tap enrolls. Never return the access code to students. Show wrong-code errors and do not create an enrollment until the backend accepts it. Hide content attached to a batch/series until the student is enrolled.

### Lectures and player

Admin can add one video URL or import a public playlist. For one URL, call Cloudflare /video?url=..., auto-fill title and thumbnail if returned, and keep both editable. Let the admin choose the parent batch/series, lesson/topic, ordering, exam/class and notes/PDF link.

For a playlist:
- Call Cloudflare /playlist?url=....
- Follow pagination cursors until complete or the admin cancels; show progress/count and deduplicate by videoId.
- Preview imported rows and allow editing title, thumbnail, lesson/topic and ordering.
- Do not save until the admin confirms target batch/series, exam and class.
- If import fails, retain the original URL and offer manual link entry.

A lecture click opens a dedicated player screen: large responsive YouTube iframe, fullscreen, title, batch/lesson context, next/previous actions and scrollable upcoming lesson list. Build the embed URL from videoId; keep controls and fullscreen enabled. Do not scrape, download or rehost video bytes. Persist watch progress periodically to POST /progress with lectureId (the course_catalog UUID), watchedSeconds and completed; avoid writing every second. Resume where possible. Show related PDFs/notes.

Lecture metadata should contain youtubeUrl, videoId, thumbnailUrl, duration, position, parentId (parent batch/series UUID), lesson/topic name, optional notesPdfUrl, isPreview and playlistId. Use UUIDs consistently, never titles as identifiers.

### Series

Provide All Series, My Series and Series Details. Admin can create series with title, about, thumbnail URL, exam, classes, optional access code and features. Series can contain ordered lessons. Enroll by code when configured, or one tap when no code exists. Store child parentId as the series UUID.

### Tests and JSON question bank

Separate upcoming, live and completed tests. Show start/end time, duration, number of questions and marks. Admin can create a test with title, description, subject, exam, one/both classes, scheduledAt, endsAt, durationMinutes, marksPerQuestion, negativeMarks, isLive, allowMultipleAttempts and ordered questions.

Support paste/upload of JSON with validation before save. Each question should have a stable id, question text, optional image/subject/topic, type (initially single-choice), options, correctAnswer, optional marks/negativeMarks and explanation. Preserve MathJax/LaTeX. Validate all question text, options and correct answers. Preview parsed JSON and show row-specific validation errors.

Example metadata shape:

    {
      "subject": "Physics",
      "durationMinutes": 60,
      "scheduledAt": "2026-10-18T13:30:00.000Z",
      "endsAt": "2026-10-18T14:30:00.000Z",
      "isLive": false,
      "allowMultipleAttempts": false,
      "marksPerQuestion": 4,
      "negativeMarks": 1,
      "questions": [
        {
          "id": "q1",
          "type": "single-choice",
          "text": "Question statement",
          "options": [
            { "id": "A", "text": "Option A" },
            { "id": "B", "text": "Option B" },
            { "id": "C", "text": "Option C" },
            { "id": "D", "text": "Option D" }
          ],
          "correctAnswer": "B",
          "explanation": "Shown after submission"
        }
      ]
    }

Never calculate official scores solely in the client. GET /tests/:id returns sanitized questions; POST /tests/:id/submit scores on the backend. Correct answers and explanations must not appear before submission, including GET /content and bootstrap responses. Show countdown, autosave in-progress answers locally, confirm final submit, handle expired test/duplicate-attempt responses and show score, accuracy, correct/incorrect/unanswered counts, explanation review and leaderboard link.

### Leaderboard

Provide separate leaderboards for each test and a test selector. Call /leaderboard?testId=<test UUID>. Show rank, display name/avatar and score/max score; never expose email or private profile fields. If no test is selected, show the selector rather than a misleading mixed ranking. No fake rank data.

### Analysis/Profile

Call GET /analysis. Show learning level, completed lessons, watched time, tests taken, average percentage, recent results and lesson progress. Describe level as a learning indicator based on saved data, not an official exam rank. Include profile, exam/class and logout.

### PDFs/resources

Resource metadata should use pdfUrl, title, description, thumbnail and optional parentId. Open PDF inside the app or in a safe browser/download according to platform. If attached to a restricted batch, require enrollment. Validate URL protocol and never execute arbitrary HTML/scripts from admin-entered URLs.

### Events, banners and announcements

Admin can configure multiple event/banner image URLs, title, text, start/end schedule, enabled/disabled and optional internal deep link. Store as kind=event with metadata.images array and schedule fields. Each banner can open its valid internal destination. Validate links and handle missing destinations.

Use announcements table/API for text notices; bootstrap returns active/scheduled announcements filtered for exam/class. In-app messages/notifications live in Firestore. Mark notifications read and navigate deep links only to valid in-app destinations.

## 5. Admin panel

The /admin route requires Firebase authentication and server-side authorization. If signed out, show admin sign-in. If signed in with the wrong email, show “Admin access denied.” Do not show the dashboard. The API is the final authority; hiding buttons is not security. No public admin registration.

Admin tabs: Dashboard, Today's Goals, Batches, Lectures, Series, Tests & Schedules, Events/Banners, Announcements, Students, Chat/Notifications. Use confirmation dialogs for disabling, save/loading states, validation and feedback.

Global content editor fields: exam JEE/NEET/Both; class 11th/12th/both; title, description; thumbnail/metadata fields; active/disabled state; optional schedule; create/update/archive controls.

Admin flows:
1. Today's Goals: add multiple goals, schedule time/end, target exam/classes, exact display text, enable/disable and preview.
2. Add Batch: title, code display, about, instructor/features, thumbnail URL, optional access code, exam/classes and active state. Save kind=batch.
3. Add Lecture: pick target batch/series, then one YouTube URL or playlist URL, get metadata via Cloudflare, edit title/thumbnail/lesson and confirm save. Playlist import must support all pages/subset/order and attach to the selected parent.
4. Add Series: title, about, thumbnail, optional code, exam/classes/features and active state, with ordered children.
5. Add Test: title, exam/classes, schedule, duration/marks, JSON input, validation/preview and save kind=test. Keep answer keys private until result.
6. Events/Banners: multiple image URL rows, reorder, active toggle, schedule, title/text, deep link and image crop/ratio preview.
7. Announcements: title/body, All or specific audience, schedule and active state.
8. Students: search/filter by name, exam/class; show activity/results without secrets.
9. Chat: admin can open/respond to each student's Firestore thread with sender identity/read state. In-app notification works even if push credentials are not yet configured.

All changes must persist across reloads. Do not store production content only in localStorage. Local storage may hold harmless UI preferences or transient test answers; Supabase/Firestore remain source of truth.

Admin content create: POST /admin/content. Update: PATCH /admin/content/:id with the full current form values, not a partial title-only body. Disable/archive: DELETE /admin/content/:id (soft-disables active=false). Do not physically delete course rows. Announcements use /admin/announcements and /admin/announcements/:id.

## 6. API contract

Base URL: https://kncbvcozpcrfvxdbkbtf.supabase.co/functions/v1/exam-cracker-api

Headers: Authorization: Bearer <Firebase ID token>, apikey: <Supabase publishable key>, Content-Type: application/json.

- GET /health — public check.
- GET /profile
- POST /profile — { displayName, exam, classLevel }.
- GET /bootstrap
- GET /content?kind=batch|series|lecture|resource|event|goal|test&exam=JEE|NEET&class=11|12&parentId=<uuid>
- POST /enrollments — { itemType: "batch"|"series", itemId: "<uuid>", accessCode?: "..." }.
- POST /progress — { lectureId: "<course_catalog UUID>", watchedSeconds: number, completed: boolean }.
- GET /tests
- GET /tests/:uuid
- POST /tests/:uuid/submit — { answers: { questionId: selectedOptionId } }.
- GET /tests/:uuid/result
- GET /leaderboard?testId=<uuid>
- GET /analysis
- GET /admin/overview
- GET /admin/students
- GET /admin/content?kind=...&exam=...&class=...
- POST /admin/content
- PATCH /admin/content/:uuid
- DELETE /admin/content/:uuid (soft-disable)
- GET /admin/announcements
- POST /admin/announcements
- PATCH /admin/announcements/:uuid

Content payloads use kind, title, description, exam, classes, active, accessCode and metadata. Keep metadata field names consistent and preserve unknown existing properties when editing. Never put answer keys into client caches, analytics, logs or general content responses.

## 7. Firebase Console tasks — state truthfully

Confirm Email/Password and Google providers are enabled. Confirm Firestore exists and deploy firestore.rules. Add Android package com.darvo.ec and fingerprints if needed. Add authorised web domains for web Google sign-in. Set a real FCM Web VAPID key from Firebase Console if web push is enabled. Set trusted Firebase Admin credentials securely if push delivery requires server-side sends. Never commit those credentials.

Do not claim these manual actions are complete unless checked. Public Firebase config and the Supabase publishable key may be in .env.example; private keys and server/service-role credentials may not. Document any pending setup in README.

## 8. Acceptance checklist

Before finishing:
- Install dependencies with a lockfile; run type-check, lint if configured, production build and fix failures.
- Verify login/logout, session restoration, onboarding save and admin route protection.
- Verify JEE/NEET and class filtering on every page/editor.
- Verify create/edit/disable batch, series, lecture, test, goal, resource, event/banner and announcement.
- Verify open enrollment, valid-code enrollment and rejected wrong-code behavior.
- Verify playlist cursor pagination/deduplication, manual video fallback, editable metadata and lecture playback.
- Verify student content responses do not expose answer keys; server calculates/stores test scores.
- Verify per-test leaderboard, analysis from real records and chat Firestore rules.
- Verify empty/error states. Do not substitute dummy data.
- Verify Android package com.darvo.ec, production build and debug APK build in GitHub Actions; upload app-debug.apk as an artifact.
- Update README with commands, exact env variables, deployed URLs, Firebase Console status and remaining genuine blockers.

Finish by summarising files changed, checks actually run, APK workflow location and any remaining manual Firebase task. Do not claim a check succeeded unless it was actually run.