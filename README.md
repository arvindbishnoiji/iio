# Exam Cracker (EC) — setup notes

This repository is the implementation hand-off for Exam Cracker JEE/NEET. Read MASTER_PROMPT.md before changing the architecture; it contains the full feature specification and current API contracts.

## Repository and Android identity

- GitHub repository: arvindbishnoiji/iio
- App name: Exam Cracker
- Android application ID: com.darvo.ec
- Firebase project: darvo1
- The existing root google-services.json is Android client configuration, not a Firebase Admin service-account secret. Keep it.

## Services already provisioned

### Cloudflare Worker
- Name: ec-content-api
- Base URL: https://ec-content-api.arvinddara0290.workers.dev
- Source: workers/ec-content-api/src/index.js
- Endpoints: /health, /video?url=..., /playlist?url=...&limit=200&cursor=...
- Public YouTube metadata proxy does not require YOUTUBE_API_KEY. Public playlist formats can change; provide manual single-video URL fallback.

Deploy/update from this repository when Wrangler is installed and authenticated:
npm install
npx wrangler deploy --config wrangler.toml

### Supabase
- Project ref: kncbvcozpcrfvxdbkbtf
- Project URL: https://kncbvcozpcrfvxdbkbtf.supabase.co
- Edge Function: https://kncbvcozpcrfvxdbkbtf.supabase.co/functions/v1/exam-cracker-api
- Source: supabase/functions/exam-cracker-api/index.ts
- Existing tables: student_profiles, course_catalog, lesson_progress, exam_attempts, enrollments, announcements.
- RLS is enabled and direct client access is intentionally denied. Use the Firebase-token-verifying Edge Function; never use a Supabase secret/service-role key in the client app.
- The ec_query_indexes migration was applied to the connected Supabase project; its source is under supabase/migrations.

The function verifies Firebase ID tokens for project darvo1. API requests require Authorization: Bearer <Firebase ID token> and an apikey header containing the Supabase publishable key. The health endpoint is public.

### Firebase
The google-services.json file identifies Firebase project darvo1, Android package com.darvo.ec and the Firebase sender/project number. Web Firebase configuration is in .env.example. No Firebase Admin service-account JSON was identified in the root contents; google-services.json does not replace one.

Before production, verify Firebase Authentication Email/Password + Google providers, Firestore database/rules and Android fingerprints in Firebase Console. Real FCM push sending needs secure server-side Firebase Admin credentials; do not add those credentials to this repository.

## Environment

Copy .env.example to .env.local for local Vite development. Firebase web configuration and the Supabase publishable key are public client config; neither replaces authentication/authorization. Do not put a Supabase secret/service-role key or Firebase private key into VITE_* variables.

## Next step

Give MASTER_PROMPT.md to the coding agent with GitHub access. Ask it to inspect first, then complete the React/Vite/Capacitor app, route-based admin panel, Firestore chat/notifications, build checks and Android APK workflow. The repository intentionally does not claim the complete frontend exists yet.