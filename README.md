# Exam Cracker (EC) — JEE & NEET Educational Platform

**Exam Cracker** is a mobile-first educational web and Android (Capacitor) application built for **IIT-JEE** and **NEET-UG** aspirants in **Class 11th** and **Class 12th**, with a protected route-based **Admin Console (`/admin`)**.

---

## 1. Repository & Android Identity

- **GitHub Repository:** `arvindbishnoiji/iio`
- **App Name:** `Exam Cracker`
- **Android Application ID (`appId` / `package_name`):** `com.darvo.ec`
- **Firebase Project ID:** `darvo1` (Project Number: `283467136948`)
- **Admin Email Identity:** `arvinddarabishnoi@gmail.com` (verified both client-side for UI visibility and server-side on the Supabase Edge Function via the signed Firebase RS256 ID token and in `firestore.rules`)
- **Android Client Config:** Root `google-services.json` (and synced `android/app/google-services.json`) is the public Firebase Android client configuration for `com.darvo.ec`. It is **not** a Firebase Admin service-account private key.

---

## 2. Provisioned Backend Services & Deployed URLs

### A. Supabase Project & Edge Function
- **Project Ref:** `kncbvcozpcrfvxdbkbtf`
- **Supabase URL:** `https://kncbvcozpcrfvxdbkbtf.supabase.co`
- **Deployed Edge Function Base URL:** `https://kncbvcozpcrfvxdbkbtf.supabase.co/functions/v1/exam-cracker-api`
- **Edge Function Source:** `supabase/functions/exam-cracker-api/index.ts`
- **Database Migration / Indexes:** `supabase/migrations/20261017000000_ec_query_indexes.sql`
- **Provisioned Tables:** `student_profiles`, `course_catalog`, `lesson_progress`, `exam_attempts`, `enrollments`, `announcements`
- **Security Model:** Row Level Security (RLS) intentionally denies direct public/client database access. All non-health API calls pass `Authorization: Bearer <Firebase ID Token>` and `apikey: <VITE_SUPABASE_PUBLISHABLE_KEY>` to the Edge Function, which verifies the Firebase JWT against Google's securetoken JWKS for project `darvo1`.

### B. Cloudflare Worker (Keyless YouTube Metadata Proxy)
- **Worker Name:** `ec-content-api`
- **Deployed Base URL:** `https://ec-content-api.arvinddara0290.workers.dev`
- **Source:** `workers/ec-content-api/src/index.js` (`wrangler.toml`)
- **Endpoints:**
  - `GET /health`
  - `GET /video?url=<YouTube video URL>` — public oEmbed video metadata (`videoId`, `title`, `author`, `thumbnail`, `watchUrl`)
  - `GET /playlist?url=<public YouTube playlist URL>&limit=200&cursor=<optional cursor>` — public playlist metadata with multi-page continuation cursor support
- **No YouTube Data API Key Required:** Never requires `YOUTUBE_API_KEY`. Includes automatic manual single-video URL fallback if YouTube restricts a video or changes its page layout.

---

## 3. Environment Variables

Copy `.env.example` to `.env.local` for local development:

```bash
cp .env.example .env.local
```

| Variable | Purpose |
| :--- | :--- |
| `VITE_FIREBASE_API_KEY` | Public Firebase Web API key (`darvo1`) |
| `VITE_FIREBASE_AUTH_DOMAIN` | `darvo1.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `darvo1` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `darvo1.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `283467136948` |
| `VITE_FIREBASE_APP_ID` | `1:283467136948:web:c66fd594827909eb3f7ce1` |
| `VITE_FIREBASE_MEASUREMENT_ID` | `G-FMV79YMHBC` |
| `VITE_SUPABASE_URL` | `https://kncbvcozpcrfvxdbkbtf.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public Supabase client header key (`sb_publishable_...`) |
| `VITE_SUPABASE_FUNCTION_URL` | `https://kncbvcozpcrfvxdbkbtf.supabase.co/functions/v1/exam-cracker-api` |
| `VITE_CLOUDFLARE_MEDIA_PROXY_URL` | `https://ec-content-api.arvinddara0290.workers.dev` |
| `VITE_ADMIN_EMAIL` | `arvinddarabishnoi@gmail.com` (UI hint; enforced server-side) |
| `VITE_FIREBASE_VAPID_KEY` | Optional Web Push VAPID key from Firebase Console (leave blank until configured) |

> **Security Rule:** Never put a Supabase `service_role` secret key, Firebase Admin SDK private key, or service-account JSON into `VITE_*` variables or commit them to Git.

---

## 4. Development, Testing, Build & Android Commands

```bash
# 1. Install dependencies
npm install

# 2. Start local Vite development server
npm run dev

# 3. Run TypeScript type-check
npm run typecheck

# 4. Run automated unit/integration test suite (Vitest)
npm test

# 5. Build production web bundle (outputs to dist/)
npm run build

# 6. Sync web bundle & plugins into Capacitor Android project (android/)
npm run cap:sync

# 7. Build debug APK (requires JDK 21 & Android SDK, or run via GitHub Actions)
cd android && ./gradlew --no-daemon assembleDebug
```

---

## 5. GitHub Actions Android Debug APK Workflow

- **Workflow file:** `.github/workflows/android-apk.yml`
- Runs on push to `main` / `arena/**`, pull requests, and manual `workflow_dispatch`.
- Executes `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, ensures `android/app/google-services.json` is present, runs `npx cap sync android`, builds the debug APK with `./gradlew --no-daemon assembleDebug`, and uploads `android/app/build/outputs/apk/debug/app-debug.apk` as the `exam-cracker-debug-apk` artifact.

---

## 6. Manual Firebase Console Tasks & Status (Truthful Checklist)

The code integrations for Firebase Auth, Firestore live chat/notifications, FCM device token registration, and Capacitor Android (`com.darvo.ec`) are implemented in this repository. Because Firebase Console settings cannot be mutated without an interactive Google Cloud/Firebase admin session, verify the following one-time steps in [Firebase Console (`darvo1`)](https://console.firebase.google.com/project/darvo1):

1. **Authentication Sign-In Providers:**
   - Open **Firebase Console → Authentication → Sign-in method** and confirm **Email/Password** and **Google** providers are enabled.
   - Ensure the admin account `arvinddarabishnoi@gmail.com` exists in **Authentication → Users** (admin login is sign-in only; public self-registration for admin privileges is disabled).
2. **Authorized Web Domains:**
   - Open **Authentication → Settings → Authorized domains** and add your production web hosting domain (and any preview domain) so Web Google Sign-In is permitted.
3. **Android SHA-1 / SHA-256 Fingerprints (`com.darvo.ec`):**
   - Open **Project Settings → General → Your apps → Android app (`com.darvo.ec`)** and add the SHA-1 and SHA-256 certificate fingerprints of your debug/release signing keystores so Google Sign-In on Android works seamlessly.
4. **Cloud Firestore Database & Security Rules (`firestore.rules`):**
   - Ensure Cloud Firestore is created in project `darvo1` and deploy `firestore.rules`:
     ```bash
     npx firebase-tools deploy --only firestore:rules --project darvo1
     ```
5. **Optional Web Push VAPID Key & Server Push Credentials:**
   - In-app Firestore notifications (`users/{studentUid}/notifications` and `broadcasts`) work in real time without push credentials.
   - For browser Web Push token generation, copy the Web Push certificate key pair from **Project Settings → Cloud Messaging → Web configuration** into `VITE_FIREBASE_VAPID_KEY`.
   - For server-initiated FCM push delivery, configure a Firebase Admin service account securely in backend secrets (never commit service-account JSON to Git).
