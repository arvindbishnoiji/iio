const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};

export const APP_CONFIG = {
  appId: 'com.darvo.ec',
  appName: 'Exam Cracker',
  firebase: {
    apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyDuvN6q4ybHc6rLTHlYdhSs5_rzvc8nhTA',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'darvo1.firebaseapp.com',
    projectId: env.VITE_FIREBASE_PROJECT_ID || 'darvo1',
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'darvo1.firebasestorage.app',
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '283467136948',
    appId: env.VITE_FIREBASE_APP_ID || '1:283467136948:web:c66fd594827909eb3f7ce1',
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || 'G-FMV79YMHBC',
    vapidKey: (env.VITE_FIREBASE_VAPID_KEY || '').trim(),
  },
  supabase: {
    url: (env.VITE_SUPABASE_URL || 'https://kncbvcozpcrfvxdbkbtf.supabase.co').replace(/\/+$/, ''),
    publishableKey:
      env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_-4si2gp96FDx7ziHHMO7Kg_sasmLYB2',
    functionUrl: (
      env.VITE_SUPABASE_FUNCTION_URL ||
      'https://kncbvcozpcrfvxdbkbtf.supabase.co/functions/v1/exam-cracker-api'
    ).replace(/\/+$/, ''),
  },
  cloudflare: {
    mediaProxyUrl: (
      env.VITE_CLOUDFLARE_MEDIA_PROXY_URL || 'https://ec-content-api.arvinddara0290.workers.dev'
    ).replace(/\/+$/, ''),
  },
  adminEmail: (env.VITE_ADMIN_EMAIL || 'arvinddarabishnoi@gmail.com').trim().toLowerCase(),
} as const;

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === APP_CONFIG.adminEmail;
}
