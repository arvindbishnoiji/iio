# MASTER PROMPT — Exam Cracker Next.js Web App

You are the implementation agent for **Exam Cracker (EC)**. Build a real, production-minded, mobile-first **Next.js web application** in this repository, connected to the already configured Firebase project, existing Supabase backend and existing Cloudflare YouTube metadata Worker. Read this entire prompt before editing. This is the source of truth for architecture and requirements.

## 1. Goal and non-negotiable rules

- App name: Exam Cracker
- Repository: arvindbishnoiji/iio, default branch main
- Product: JEE and NEET student learning web app with a protected admin dashboard
- Admin email: arvinddarabishnoi@gmail.com
- Firebase project ID: darvo1
- Android application ID that must remain compatible for a future wrapper: com.darvo.ec. This task is a WEB APP, not a Capacitor/Android project.
- Use Next.js App Router, TypeScript, accessible reusable React components and a consistent responsive design system. Do not build a standalone Vite app or put the product into one giant HTML file.
- Do not return only a plan or mockup. Implement files, dependencies, routes, data access, tests, docs and CI.
- Inspect the full repository before changes. Existing service source files and Google configuration are already present. Preserve the service names and endpoint URLs.
- Never invent a successful result, fake student data, add dead buttons, simulate a save, make test results up, or claim a build/deployment passed without real evidence. Every important action must persist and have loading/error/success states.
- Never add a Supabase secret/service-role key, Firebase Admin private key, private service-account JSON or Cloudflare API token to source code, browser bundles, Git commits, logs or public docs. Values prefixed NEXT_PUBLIC_ are browser-public by design and must contain public client configuration only.
- Do not loosen Supabase RLS or replace it with public read/write policies. Use the existing Firebase-token-verified Supabase Edge Function for all relational data.
- Do not require a YouTube Data API key. Do not download, scrape private content from, or rehost YouTube video bytes.
- Use ISO UTC timestamps in storage and show all user-facing schedules in Asia/Kolkata.
- Maintain a readable codebase, lockfile, TypeScript checks, production build and GitHub Actions verification.

## 2. Before implementation: inspect and document actual repository state

The current repo contains service configuration/source, not the finished student UI. Inspect the existing files, particularly:
- google-services.json
- .env.example
- README.md
- MASTER_PROMPT.md
- workers/ec-content-api/src/index.js
- wrangler.toml
- supabase/functions/exam-cracker-api/index.ts
- supabase/migrations/20261017000000_ec_query_indexes.sql
- firestore.rules and firebase.json
- .github/workflows/android-apk.yml

Do not overwrite or delete the existing service code without understanding it. The root wrangler.toml currently targets the existing media proxy Worker, ec-content-api. It must NOT be used to deploy the Next.js website. Move its configuration to workers/ec-content-api/wrangler.toml, adjust the config's main path to src/index.js, and verify the deployment still targets ec-content-api. Create a separate root configuration for the Next.js website. Update README commands to use the correct config for each deployment. The already-deployed media Worker URL must not change.

This repo was initially prepared for an Android/Capacitor build. This request now targets a Next.js web app. Remove or replace the obsolete Android APK workflow so it cannot fail on normal web-app commits. Preserve google-services.json for the user's future Android package, but do not treat it as the web Firebase config or a Firebase Admin key. Do not add Capacitor unless explicitly requested later.

## 3. Next.js and Cloudflare hosting

Use Next.js App Router, TypeScript, Tailwind CSS and a small, accessible component system. Organize code by features and keep API/auth logic separate from UI.

Host the Next.js web application on Cloudflare. Before selecting the adapter, review the current official Cloudflare Next.js deployment guide and check feature compatibility. Cloudflare's current guide recommends vinext for new Next.js-on-Workers projects, but it is beta; use the official Workers-ready setup and run its compatibility/build check. If a required app feature is not reliably supported, use the documented OpenNext adapter and verify that choice with CI instead of silently replacing Next.js with another framework. Pin compatible dependency versions and select security-patched stable releases. Keep the actual application structure in Next.js App Router.

Deploy the web application as a separate Worker named exam-cracker-web (or another new web-specific name). Never overwrite ec-content-api with website assets. Use the account ID shown in wrangler configuration, but keep deployment credentials as GitHub Actions secrets. Add:
- production build and type/lint/test workflow;
- separate Cloudflare deploy workflow, using CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from GitHub Actions secrets/variables;
- preview instructions and a README section with the final website URL once deployment exists.

The connected Cloudflare account ID is 93f8cbbe79e248f8d1db9fccc586f0c3. Account ID is configuration, not a secret; the API token is secret. The coding agent has GitHub access, so do not assume it can open the Cloudflare dashboard. If a dashboard action or secret must be supplied by the repository owner, document the exact one-time step. Do not claim the website is live until a real deployment URL is verified.

Use environment variables and service bindings in the officially supported way for the selected adapter. The existing media proxy remains a separate public endpoint and is used by the browser through NEXT_PUBLIC_CLOUDFLARE_MEDIA_PROXY_URL.

## 4. Actual service connections — use these values

### Firebase web app / Authentication / Firestore

Firebase project ID: darvo1  
Auth domain: darvo1.firebaseapp.com  
Storage bucket: darvo1.firebasestorage.app  
Messaging sender ID: 283467136948  
Web app ID: 1:283467136948:web:c66fd594827909eb3f7ce1  
Measurement ID: G-FMV79YMHBC  
Firebase web API key: AIzaSyDuvN6q4ybHc6rLTHlYdhSs5_rzvc8nhTA

Use the Firebase modular JavaScript SDK, initialised once in a client-only module. Do not import browser-only Firebase Auth/Firestore/FCM code into server components or run it during server rendering.

Authentication:
- Email/password sign-up and sign-in for students.
- Continue with Google.
- Persist/restore session; sign-out; password reset; useful errors for common Firebase Auth codes.
- Use redirect-based Google sign-in on mobile and handle the redirect result; a popup may be offered on desktop with a fallback.
- A signed-in student completes onboarding once: name, JEE or NEET, Class 11th or 12th. Save via the backend API before displaying the personalised dashboard.
- Admin identity is exactly arvinddarabishnoi@gmail.com. Admin can sign in but must not have a public admin self-registration route. The admin must already exist in Firebase Authentication. The backend verifies the signed Firebase ID token and checks the token's email claim. This project does not require email_verified=true for the admin check, but never trusts a typed email or browser-only check.
- The Google provider and Email/Password provider must actually be enabled in Firebase Console. If not, build the real integration and report the exact manual Console step—do not fake a successful login.
- Keep local session persistence using Firebase's SDK. Never create your own insecure UID or accept a UID from a student form as proof of identity.

Firestore is for real-time chat and in-app notifications, not for relational course/test content and not for binary PDFs/videos.

Collections:
- studentThreads/{studentUid}
- studentThreads/{studentUid}/messages/{messageId}
- users/{studentUid}/notifications/{notificationId}
- fcmTokens/{studentUid}/tokens/{tokenId}
- optional broadcasts/{broadcastId}

Chat message fields: senderUid, senderRole ("student" or "admin"), text, createdAt, optional readAt and safe attachment metadata. Use live Firestore listeners, timestamps, unread indicators and optimistic UI only with correct rollback/error handling. A student can access only their own thread. Only the configured admin can read/respond to student threads. Never let a student create a message with senderRole admin. Validate max text length and reject invalid payloads in Firestore Rules and app code. Review and tighten existing firestore.rules rather than blindly trusting it; preserve legitimate admin/student flows.

Notifications: implement a live in-app notification inbox using Firestore, read/unread state and validated internal deep links. Register FCM tokens only after permission is granted. Browser push requires HTTPS and a real VAPID key configured from Firebase Console. If VAPID or supported push environment is absent, Firestore in-app notifications must still work and the UI must not claim push is enabled. Sending push from a trusted server may require Firebase Admin credentials; never commit them. Document remaining server-side setup if required.

Firebase Analytics is optional and must initialise only in the browser. Do not block the app if Analytics is not configured.

### Supabase project and database

Project ref: kncbvcozpcrfvxdbkbtf  
Project URL: https://kncbvcozpcrfvxdbkbtf.supabase.co  
Publishable key: sb_publishable_-4si2gp96FDx7ziHHMO7Kg_sasmLYB2  
Edge Function base URL: https://kncbvcozpcrfvxdbkbtf.supabase.co/functions/v1/exam-cracker-api

The deployed Edge Function slug is exam-cracker-api. Current deployed function version was verified as ACTIVE, version 3. It accepts a Firebase ID token and verifies the token itself; platform-level Supabase verify_jwt is disabled by design because the user authentication system is Firebase.

For each authenticated request to the Edge Function:
1. Obtain the current Firebase user ID token with currentUser.getIdToken().
2. Send Authorization: Bearer <firebase-id-token>.
3. Send apikey: <the Supabase publishable key above>.
4. Send Content-Type: application/json for JSON requests.
5. Append routes directly to the base URL above, e.g. base + /profile. Do not add /functions/v1 a second time.
6. Parse error bodies and handle 401, 403, 409, 410, 5xx and network errors visibly. Refresh/obtain the ID token when needed.

The publishable key is public and not a permission grant. Do not put server-side Supabase secret/service-role keys in the browser. Never use a direct supabase-js browser query to the protected relational tables as a workaround for RLS. Use the supplied Edge Function API. If its server database credential is missing, tell the owner how to set the secret in the Supabase project securely; do not put the secret into the repository.

Existing tables and important columns:
1. public.student_profiles: firebase_uid (primary key), display_name, email, exam, class_level ("11" or "12"), avatar_url, created_at, updated_at.
2. public.course_catalog: id UUID, kind (batch, series, lecture, resource, event, goal, test), title, description, exam (JEE, NEET, Both), classes text array ("11" and/or "12"), active, access_code, metadata JSONB, created_at, updated_at.
3. public.lesson_progress: id UUID, firebase_uid, lecture_id (course_catalog UUID as text), watched_seconds, completed, updated_at.
4. public.exam_attempts: id UUID, firebase_uid, test_id, exam, class_level, score, max_score, correct_count, incorrect_count, unanswered_count, answers JSONB, submitted_at.
5. public.enrollments: id UUID, firebase_uid, item_type (batch or series), item_id, active, created_at.
6. public.announcements: id UUID, title, body, audience, active, scheduled_at, created_at.

RLS is enabled on these tables and policies intentionally deny direct anonymous/ordinary authenticated client table access. Never add public allow-all policies. Query indexes already exist; source migration is under supabase/migrations. If changing backend code, update the checked-in source and deploy the same tested source to the existing function slug rather than creating a competing API. Avoid destructive migrations and never drop production data.

### Cloudflare YouTube/media metadata Worker

Worker name: ec-content-api  
Base URL: https://ec-content-api.arvinddara0290.workers.dev  
Source: workers/ec-content-api/src/index.js  
Worker deployment configuration should reside at workers/ec-content-api/wrangler.toml.

Endpoints:
- GET https://ec-content-api.arvinddara0290.workers.dev/health
- GET /video?url=<encoded YouTube video URL>
- GET /playlist?url=<encoded public YouTube playlist URL>&limit=200&cursor=<optional returned cursor>

Use it for title, thumbnail, author, video ID and playlist metadata. No YouTube Data API key or API quota should be required. For playlist import, repeatedly follow nextCursor, deduplicate by videoId, show progress and support cancellation/partial import. Keep title and thumbnail editable before saving. The public YouTube page format may change; private, blocked, age-restricted, removed or inaccessible playlists may fail. Show a useful error and allow the admin to add videos manually by URL. Never silently save a half-imported playlist as a complete one. Do not download or rehost video files; use YouTube's embedded player with the original video ID.

## 5. Required app routes and UI structure

Create a polished, modern coaching-app design. Use a mobile bottom navigation with Home, Lectures, Leaderboard, Analysis/Profile and an appropriate larger-screen layout. Keep buttons accessible and obvious. The app must work at small phone, tablet and desktop widths. Add skeleton/loading states, empty states, retry, network errors, form validation, toasts, dialogs and safe confirmation for destructive actions. Never use hard-coded sample content in production.

Recommended routes:
- / — redirect to sign-in, onboarding, or personalised home depending on state.
- /login — sign-in, register and reset password.
- /onboarding — name, exam and class selection.
- /home — Today's Goal, banners/events, tests and relevant content.
- /lectures — batches, My Batches, All Batches, series, lessons and PDF resources.
- /tests — upcoming/live/completed list and test selector.
- /leaderboard — test selector and one leaderboard per test.
- /profile — profile, progress/analysis and logout.
- /admin — protected admin dashboard.
- /admin/content — optionally use nested admin sections; no public route may reveal admin data.
Do not expose secret IDs or email lists to student routes. All content displayed must follow the saved profile exam and class.

### Student onboarding and personalised home

After a successful Firebase sign-in:
1. If there is no student profile, collect the student's display name.
2. Ask JEE or NEET.
3. Ask Class 11th or 12th.
4. Save with POST /profile using displayName, exam and classLevel ("11" or "12").
5. Only continue after save succeeds.

At the top of Home display a prominent "+ Today's Goal" section/card, driven by active goal records. Below it display:
- scheduled today's goals with text/time/optional CTA;
- multiple active event/banner images in a carousel;
- live tests that are actually configured as live;
- upcoming tests with schedule and duration;
- enrolled batches, continue-learning/recent lectures;
- announcements and unread notifications.

Filter content by exam/class everywhere. Interpret all schedules in Asia/Kolkata. Hide goals outside their active window. A goal record uses kind=goal; metadata may contain startsAt, endsAt, deepLink, ctaLabel, priority and optional CTA text.

### Batches and enrolment

Show All Batches and My Batches separately. Batch card/detail should include thumbnail, title, description/about, exam/classes, instructor/features and enrolment status. Image URLs must be validated and rendered with object-fit:cover, not stretched.

Admin may configure access_code. If a batch has a code, ask the student for it and submit POST /enrollments with itemType=batch, itemId and accessCode. If there is no code, allow one-tap enrolment. Never expose access_code in student-visible content or browser logs. The backend decides enrolment success; a wrong code must never create an enrolment. Series uses the same pattern with itemType=series.

Lessons/resources with parentId pointing to a batch or series are restricted to active enrollees, except explicitly configured isPreview content. If the backend does not enforce a restriction, do not fake security in the UI; fix and deploy the backend source before relying on it.

### Lectures, playlist import and player

Admin flow for one video:
- Choose exam (JEE/NEET/Both), class(es), target batch or series, topic/lesson and order.
- Enter a YouTube URL; call Cloudflare /video?url=... and auto-fill title/thumbnail when available.
- Keep title, thumbnail and description editable.
- Allow notes/PDF URL and active/preview flag.
- Save kind=lecture to course_catalog with its UUID, and metadata fields youtubeUrl, videoId, thumbnailUrl, duration, position, parentId, lesson/topic and optional notesPdfUrl, isPreview and playlistId.

Admin playlist flow:
- Paste a public YouTube playlist URL and fetch metadata from Cloudflare /playlist.
- Follow every returned nextCursor until complete or cancelled. Deduplicate by videoId. Show imported/failed counts.
- Let the admin select all or a subset, reorder entries, edit title and thumbnail, set one target batch/series and lesson topic, select exam/classes, then confirm the save.
- Never silently lose items on pagination failure. Preserve failed items' URLs and offer manual add.
- Verify worker response shape against actual deployed source before coding assumptions.

Student lecture click should open a dedicated player screen/page with responsive YouTube embed, controls, fullscreen, title, batch/topic context, previous/next and a scrollable following-lesson list. Use YouTube embed, not a local video element for a YouTube URL. A user click should trigger playback attempt; browsers may block autoplay, so show a prominent Play button on failure. Persist progress periodically through POST /progress using lectureId (the course_catalog UUID), watchedSeconds and completed. Avoid a database write on every second; debounce/batch updates and flush on exit where possible. Do not fake watched time or completion.

### Series and PDFs/resources

Provide All Series, My Series and Series Detail. Series metadata includes features, thumbnail, exam/classes, about and optional access-code. Lessons in a series must use the series UUID as metadata.parentId.

Resource items use kind=resource and metadata such as pdfUrl, thumbnailUrl, subject, parentId and order. Offer in-app preview or safe external/browser view with download when possible. Check URL protocol (only http/https), handle inaccessible PDFs and do not execute arbitrary HTML/script content supplied through a URL. Batch-restricted PDFs require enrolment unless explicitly marked preview.

### Tests, timed scheduling and JSON question bank

Separate live, upcoming, expired and completed tests. Each card displays title, exam/class, subject, start/end time, duration, question count and marks where configured.

Admin can create/edit a test with:
- title, description and subject;
- exam JEE/NEET/Both and classes 11/12/both;
- active switch;
- scheduledAt, endsAt, durationMinutes, isLive;
- marksPerQuestion, negativeMarks, allowMultipleAttempts;
- questions JSON with stable IDs, text, optional image/subject/topic, type (start with single-choice), options, correctAnswer, marks/negativeMarks and explanation.

Support paste or upload of JSON, schema validation, preview and clear row-specific errors before save. Preserve LaTeX/math strings. Require question text, options and a valid answer. Save tests as kind=test in metadata.questions. Example item shape:
    {
      "id": "q1",
      "type": "single-choice",
      "text": "Question statement or LaTeX",
      "options": [
        {"id": "A", "text": "Option A"},
        {"id": "B", "text": "Option B"},
        {"id": "C", "text": "Option C"},
        {"id": "D", "text": "Option D"}
      ],
      "correctAnswer": "B",
      "marks": 4,
      "negativeMarks": 1,
      "explanation": "Shown after submission"
    }

Never calculate official score solely in the browser. GET /tests and GET /tests/:id must not expose answer keys or explanations before submission. POST /tests/:id/submit sends the selected answers and backend calculates/stores score. Add countdown, in-progress draft answer persistence, question navigation, answered/unanswered/marked status, warning before submit, handling for expired tests and duplicate attempts. After submission show result, accuracy, correct/incorrect/unanswered counts, explanation review and leaderboard link. Treat server response as authoritative.

### Leaderboard and analysis/profile

Leaderboard must be per test, not a mix of scores across different tests. Use GET /leaderboard?testId=<uuid>. Display rank, display name/avatar, score/max score. Never expose student email or unnecessary private fields. If no test is selected, ask the student to select one instead of inventing a global score. Provide real empty/error/loading states.

Use GET /analysis to display learning level, tests taken, average percentage, recent attempts, watched time and completed lessons. Describe level as an educational progress indicator based on saved activity, not an official JEE/NEET rank. Profile displays name/avatar, exam/class, progress and logout. Never calculate progress from static demo data.

### Events, banners, announcements, chat and notifications

Admin events/banners support multiple image URLs, titles, descriptions, active/disabled state, start/end schedule, order and validated in-app deep links. Store as kind=event with metadata.images array and schedule fields. Support JEE/NEET/Both and classes selection as in all content editors.

Use /admin/announcements for text announcements (title, body, audience, schedule, active). Audience can be All, JEE, NEET, or a matching exam/class target. Respect scheduledAt and active. Bootstrap should show only announcements for the current student and current schedule.

Chat is real-time through Firestore. Student sees own chat thread; admin sees a student conversation list and can reply. In-app notifications can be created/read in Firestore and link to safe internal app routes. Add a badge for unread chat/notifications. If browser push permissions or VAPID key are unavailable, do not block in-app notifications and do not show false “push enabled” status.

## 6. Protected admin dashboard at /admin

Check auth on every app load and refresh, but treat client checks only as UX. The server-side Edge Function remains the authority for relational admin operations. A signed-in non-admin must see an access-denied state and must not receive admin API data. Do not create any self-register-as-admin flow.

Admin sections/tabs:
- Dashboard/overview
- Today's Goals
- Batches
- Lectures and playlist import
- Series
- Tests and JSON question editor
- Events/Banners
- Announcements
- Students
- Chat and notifications

Use a desktop sidebar and responsive mobile navigation. All sections must actually persist via APIs/Firestore. Provide create/edit/archive controls, search/filter, active/disabled status, confirmation dialogs, loading and error states. Admin editors for content require exam, class(es), title, description, active flag and metadata-specific fields.

API expectations:
- Create relational content: POST /admin/content.
- List relational content: GET /admin/content?kind=...&exam=...&class=...
- Update: PATCH /admin/content/:uuid with the FULL current form state because the function maps/replaces normalized fields.
- Archive/disable: DELETE /admin/content/:uuid; this is a soft-disable (active=false), not a physical database delete.
- Overview: GET /admin/overview.
- Students: GET /admin/students.
- Announcements: GET/POST /admin/announcements and PATCH /admin/announcements/:uuid.

Today's Goals editor should allow exact student-facing text, scheduled start/end, exam, classes, CTA/deep link, active/disabled, priority and a live preview.

Add Batch form: title, description/about, thumbnail URL, code display, optional access code, instructor/features, exam, classes and active state. Do not confuse an informational course code with the server-enforced access_code.

Add Lecture form: target batch/series, one YouTube URL or a playlist URL, editable metadata, lesson/topic, sort order, notes/PDF, exam/classes and active/preview state.

Add Test form: JSON paste/upload, parsing/validation, preview and settings for schedule, duration, marks, negative marking and attempts. Keep keys private until backend result.

Students page: filter/search by name, exam/class and show progress or test records only as provided by authorized API. Never display service secrets or include sensitive values in client logs.

## 7. Exact backend API contract

Base URL:
https://kncbvcozpcrfvxdbkbtf.supabase.co/functions/v1/exam-cracker-api

Required request headers:
Authorization: Bearer <current Firebase ID token>
apikey: <Supabase publishable key from environment>
Content-Type: application/json for JSON payloads

Routes implemented by the current function:
- GET /health — public health response; no Firebase token required.
- GET /profile — current signed-in user's profile.
- POST /profile — { displayName, exam, classLevel }.
- PATCH /profile — update onboarding/profile through the implemented request shape.
- GET /bootstrap — profile, active content and announcements.
- GET /content?kind=batch|series|lecture|resource|event|goal|test&exam=JEE|NEET&class=11|12&parentId=<uuid>.
- POST /enrollments — { itemType: "batch"|"series", itemId: "<uuid>", accessCode?: "..." }.
- POST /progress — { lectureId: "<course_catalog UUID>", watchedSeconds: number, completed: boolean }.
- GET /tests — list personalised tests.
- GET /tests/:uuid — sanitised questions for an eligible active test.
- POST /tests/:uuid/submit — { answers: { questionId: selectedOptionId } }.
- GET /tests/:uuid/result — current student's latest saved result for that test.
- GET /leaderboard?testId=<uuid>.
- GET /analysis.
- GET /admin/overview.
- GET /admin/students.
- GET /admin/content?kind=...&exam=...&class=...
- POST /admin/content.
- PATCH /admin/content/:uuid.
- DELETE /admin/content/:uuid — soft-disable.
- GET /admin/announcements.
- POST /admin/announcements.
- PATCH /admin/announcements/:uuid.

Do not assume an endpoint exists just because it would be convenient. Inspect the source and implement/deploy a matching backward-compatible endpoint if genuinely needed. Keep Edge Function source under supabase/functions/exam-cracker-api/index.ts synced with the deployed slug exam-cracker-api. Test health and authenticated flows where access permits; never disable token checking to make a frontend request work.

## 8. Environment variables

Update .env.example for Next.js names, and have README explain copying it to .env.local.

Public browser configuration:
- NEXT_PUBLIC_FIREBASE_API_KEY = AIzaSyDuvN6q4ybHc6rLTHlYdhSs5_rzvc8nhTA
- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = darvo1.firebaseapp.com
- NEXT_PUBLIC_FIREBASE_PROJECT_ID = darvo1
- NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = darvo1.firebasestorage.app
- NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = 283467136948
- NEXT_PUBLIC_FIREBASE_APP_ID = 1:283467136948:web:c66fd594827909eb3f7ce1
- NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID = G-FMV79YMHBC
- NEXT_PUBLIC_SUPABASE_URL = https://kncbvcozpcrfvxdbkbtf.supabase.co
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = sb_publishable_-4si2gp96FDx7ziHHMO7Kg_sasmLYB2
- NEXT_PUBLIC_SUPABASE_FUNCTION_URL = https://kncbvcozpcrfvxdbkbtf.supabase.co/functions/v1/exam-cracker-api
- NEXT_PUBLIC_CLOUDFLARE_MEDIA_PROXY_URL = https://ec-content-api.arvinddara0290.workers.dev
- NEXT_PUBLIC_ADMIN_EMAIL = arvinddarabishnoi@gmail.com
- NEXT_PUBLIC_FIREBASE_VAPID_KEY = optional empty value until a real public VAPID key is obtained from Firebase Console.

All NEXT_PUBLIC values ship to the browser. No Supabase secret/service_role key, Firebase Admin service account or Cloudflare API token belongs here. Add and maintain .gitignore to protect .env.local and all private key formats.

## 9. Real-world integration and manual console tasks

Do not claim completion without verifying it. The coding agent may lack Firebase/Cloudflare dashboard access, so list these exactly when not verifiable:
- Firebase Console: ensure Email/Password and Google providers are enabled.
- Ensure the admin Firebase Auth user arvinddarabishnoi@gmail.com already exists.
- Ensure Firestore database exists and deploy/check firestore.rules from this repo.
- Add the hosting domain to Firebase Authentication authorised domains when Google sign-in requires it.
- Create/configure a real Web Push VAPID key only if using browser push.
- For Cloudflare website deploy through GitHub Actions, add CLOUDFLARE_API_TOKEN as a repository Actions secret and CLOUDFLARE_ACCOUNT_ID as a repository secret/variable. Token needs the appropriate Workers deployment permission.
- If direct Firebase push delivery needs Firebase Admin credentials, store them only in secure backend/CI secrets and document the exact manual configuration; never commit the credential JSON.

Use Cloudflare's official deployment docs: https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/ and review vinext's current compatibility status because it is beta. Use the official Firebase web Auth and FCM docs as needed. Do not rely on old blog posts for config details.

## 10. Accessibility, performance and quality

- Use semantic forms, proper labels, keyboard navigation, visible focus, sufficient contrast and mobile safe-area padding.
- Use accessible dialogs/drawers, reduced-motion support, lazy-load thumbnails and paginate content lists when needed.
- Do not render user-provided URLs as executable HTML. Validate allowed schemes and only render safe internal deep links to known app routes.
- Keep server credentials out of logs and UI. Avoid logging tokens, email lists, answer keys or access codes.
- Show a helpful empty state when no content exists, such as “No lectures yet. The admin can add lectures from Dashboard → Lectures.” Do not fabricate sample courses.
- Unit-test API client error handling, profile filters, question JSON validation and scoring-result rendering where applicable.
- Use current security-patched dependency versions, commit lockfile and run npm audit; resolve critical/high findings or explain verified unavoidable exceptions.
- Run npm ci, type-check, lint, tests and production build in CI. If the coding agent cannot execute a command locally, make GitHub Actions run it and read the real workflow result before saying it passed.
- Keep a log of what is actually implemented and what requires manual credentials/configuration.

## 11. Definition of done

The work is not done until:
1. Next.js routes render and the app builds without errors.
2. Email/password and Google authentication flows are connected to Firebase, with correct loading/error/session handling.
3. Onboarding saves name/exam/class to Supabase through the verified Firebase-token API.
4. Home shows real scheduled goals, event banners, tests, announcements and user content.
5. Admin can create/edit/disable batches, series, lectures, resources, tests, goals, events and announcements and can import playlist metadata without a YouTube Data API key.
6. Student can browse/enrol, open a YouTube player, resume progress, take a timed test, see a server-calculated result, choose a test-specific leaderboard and see analysis.
7. Firestore chat and in-app notification listeners work with restrictive rules, and non-admin users cannot access other students' chats/admin functions.
8. No secret is committed and the public browser config only contains approved client values.
9. Cloudflare web app uses a separate Worker/config from ec-content-api. GitHub Actions checks build successfully. Deployment is only called complete when a real deployment has succeeded.
10. README contains install/run/build/deploy commands, API URLs, env keys, Firebase manual requirements, and truthful status of anything incomplete.

At the end, report: pages/features implemented; files changed; current build/test/Actions results with evidence; deployment URL if truly deployed; and every remaining manual Console/secrets step. Do not report a successful APK build for this web-app task.