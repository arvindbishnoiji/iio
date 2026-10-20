# Exam Cracker — Next.js web app hand-off

Exam Cracker is a JEE/NEET learning app. Start with MASTER_PROMPT.md: it describes the complete Next.js application, Firebase flows, existing Supabase API and Cloudflare integration.

## Existing connected services

### Firebase
- Project ID: darvo1
- Android app package already configured in google-services.json: com.darvo.ec
- This task builds a Next.js web app, so use the web app values in .env.example; google-services.json is Android client configuration only.
- Email/Password, Google provider, Firestore and web push prerequisites must be verified in Firebase Console before production. Do not use google-services.json as a Firebase Admin credential.

### Supabase
- Project ref: kncbvcozpcrfvxdbkbtf
- Project URL: https://kncbvcozpcrfvxdbkbtf.supabase.co
- Firebase-token-verifying Edge Function: https://kncbvcozpcrfvxdbkbtf.supabase.co/functions/v1/exam-cracker-api
- Source: supabase/functions/exam-cracker-api/index.ts
- Tables: student_profiles, course_catalog, lesson_progress, exam_attempts, enrollments, announcements.
- RLS is enabled and direct client access is intentionally denied. Use the deployed Edge Function; never put a server key in the browser.

### Cloudflare media Worker
- Name: ec-content-api
- URL: https://ec-content-api.arvinddara0290.workers.dev
- Source: workers/ec-content-api/src/index.js
- Worker config should live in workers/ec-content-api/wrangler.toml so the root config can belong to the Next.js website.
- Endpoints: /health, /video?url=..., /playlist?url=...&limit=200&cursor=...
- It uses public YouTube metadata without a YouTube Data API key. Public playlist metadata may fail if YouTube changes its page format; always provide manual URL entry as a fallback.

## Web app setup

1. Copy .env.example to .env.local.
2. Install Node dependencies using the package manager and lockfile created by the app implementation.
3. Use the current Cloudflare Next.js deployment guide and compatibility-check the recommended adapter before deploying. The current Cloudflare guide recommends vinext for new Next.js projects on Workers, but it is beta; if the actual requirements are not covered, use the documented OpenNext adapter and verify through CI.
4. Add CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to GitHub Actions secrets/variables for automated deployment. Never commit the API token.
5. Verify Firebase Auth providers, admin account, Firestore rules/domain and optional VAPID configuration in Firebase Console.

## Important security notes

- Firebase signs in students and admins. The Supabase Edge Function verifies Firebase ID tokens and enforces admin/content access server-side.
- The Supabase publishable key and Firebase web config are client-public values; they are not a replacement for authentication/authorization.
- Do not expose a Supabase secret/service-role key, Firebase Admin private key or Cloudflare API token in source control or NEXT_PUBLIC_ variables.
- In-app Firestore chat/notifications should work without Web Push. Actual browser push requires an HTTPS origin and a real Firebase Web Push VAPID key; server-sent push may need secure backend Admin credentials.

Do not claim that the complete application is built or deployed until GitHub Actions and the real deployment confirm it.