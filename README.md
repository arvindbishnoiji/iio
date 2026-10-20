# Exam Cracker — Next.js migration and services

This repository currently contains an existing Vite + React student/admin app, a Capacitor Android scaffold, and connected backend source. The current task is to migrate the existing UI to Next.js App Router while preserving working features. Follow MASTER_PROMPT.md as the implementation specification; do not assume that migration is complete until CI verifies it.

## Existing application

The current UI and service helpers are under src/features and src/lib. Inspect these files before changing architecture. Reuse and migrate the working auth, onboarding, admin, home, batches, lectures, tests, leaderboard, profile, chat, notifications, API, date/scheduling, validation and playlist-import logic. MASTER_PROMPT.md includes the route migration and feature-parity checklist.

## Services and connection values

### Firebase
- Project ID: darvo1
- Android package: com.darvo.ec
- .env.example contains the Next.js web Firebase configuration as NEXT_PUBLIC_* variables.
- Verify Email/Password and Google providers, admin account, Firestore and authorised domains in Firebase Console. google-services.json is Android client configuration, not a web config or Firebase Admin service-account credential.

### Supabase
- Project ref: kncbvcozpcrfvxdbkbtf
- Project URL: https://kncbvcozpcrfvxdbkbtf.supabase.co
- Deployed Firebase-token-verifying Edge Function: https://kncbvcozpcrfvxdbkbtf.supabase.co/functions/v1/exam-cracker-api
- Source: supabase/functions/exam-cracker-api/index.ts
- Tables: student_profiles, course_catalog, lesson_progress, exam_attempts, enrollments, announcements.
- RLS deliberately denies direct browser table access. Use the Edge Function with a current Firebase ID token and the Supabase publishable key. Do not add allow-all policies or expose server-side keys.

### Cloudflare YouTube metadata Worker
- Name: ec-content-api
- URL: https://ec-content-api.arvinddara0290.workers.dev
- Source: workers/ec-content-api/src/index.js
- Move its Wrangler config to workers/ec-content-api/wrangler.toml so the root config can target the Next.js website. Keep the deployed Worker name and URL unchanged.
- Endpoints: /health, /video?url=..., /playlist?url=...&limit=200&cursor=...
- Public playlist metadata does not require a YouTube Data API key. YouTube formats can change; keep a manual video-link fallback.

## Local development and deployment

1. Copy .env.example to .env.local.
2. Use the package manager and lockfile after completing the Next.js migration.
3. Follow the current official Cloudflare Next.js guide and compatibility-check the deployment adapter. The current guide recommends vinext for new Next.js projects on Workers, but it is beta; use a documented supported adapter and verify it through CI.
4. Configure CLOUDFLARE_API_TOKEN as a GitHub Actions secret and CLOUDFLARE_ACCOUNT_ID as a repository secret/variable for automated website deployment.
5. Ensure the website Worker uses a separate name and config from ec-content-api.

## Security and status

- NEXT_PUBLIC_* configuration is intentionally public. Never add a Supabase secret/service-role key, Firebase Admin private key or Cloudflare API token to source control or browser variables.
- Firestore chat/in-app notifications require restrictive rules. Web push needs HTTPS and a real VAPID key from Firebase Console; in-app notification listeners should still work without it.
- Keep the Android source/configuration, but do not claim the APK workflow remains compatible with a server-rendered Next.js app unless an actual build confirms it.
- Report only build, test and deployment results actually confirmed by GitHub Actions or the relevant service.