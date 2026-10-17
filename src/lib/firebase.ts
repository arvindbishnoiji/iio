import { Capacitor } from '@capacitor/core';
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithCredential,
  updateProfile,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type Auth,
  type User,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { APP_CONFIG } from './config';

const app: FirebaseApp = getApps().length
  ? getApp()
  : initializeApp({
      apiKey: APP_CONFIG.firebase.apiKey,
      authDomain: APP_CONFIG.firebase.authDomain,
      projectId: APP_CONFIG.firebase.projectId,
      storageBucket: APP_CONFIG.firebase.storageBucket,
      messagingSenderId: APP_CONFIG.firebase.messagingSenderId,
      appId: APP_CONFIG.firebase.appId,
      measurementId: APP_CONFIG.firebase.measurementId,
    });

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);

// Persist session across reloads
setPersistence(auth, browserLocalPersistence).catch(() => {
  // Ignore if environment already sets default persistence
});

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

let redirectErrorCallback: ((message: string) => void) | null = null;
let pendingRedirectError: string | null = null;

getRedirectResult(auth).catch((err) => {
  const friendly = formatFirebaseAuthError(err);
  if (redirectErrorCallback) {
    redirectErrorCallback(friendly);
  } else {
    pendingRedirectError = friendly;
  }
});

export function onRedirectAuthError(cb: (message: string) => void): () => void {
  redirectErrorCallback = cb;
  if (pendingRedirectError) {
    cb(pendingRedirectError);
    pendingRedirectError = null;
  }
  return () => {
    if (redirectErrorCallback === cb) redirectErrorCallback = null;
  };
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

export async function registerWithEmail(
  email: string,
  password: string,
  displayName?: string
): Promise<User> {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (displayName && displayName.trim()) {
    await updateProfile(cred.user, { displayName: displayName.trim() });
    await cred.user.getIdToken(true);
  }
  return cred.user;
}

export async function requestPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

/**
 * Initiates Google sign-in.
 * - On native Android (Capacitor WebView), uses redirect flow (or credential sign-in if an ID token is passed)
 *   because browser popups are not supported reliably in Android WebView.
 * - On web browsers, attempts popup sign-in first and automatically falls back to redirect if popups are blocked.
 */
export async function signInWithGoogle(options?: {
  forceRedirect?: boolean;
  idToken?: string;
}): Promise<User | null> {
  if (options?.idToken) {
    const credential = GoogleAuthProvider.credential(options.idToken);
    const result = await signInWithCredential(auth, credential);
    return result.user;
  }

  const isNative = Capacitor.isNativePlatform();
  if (isNative || options?.forceRedirect) {
    await signInWithRedirect(auth, googleProvider);
    return null;
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment'
    ) {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw err;
  }
}

export async function updateFirebaseUserProfile(updates: {
  displayName?: string;
  photoURL?: string | null;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');
  await updateProfile(user, {
    displayName: updates.displayName ?? user.displayName,
    photoURL: updates.photoURL !== undefined ? updates.photoURL || '' : user.photoURL,
  });
  await user.getIdToken(true);
}

export async function getFreshIdToken(forceRefresh = false): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Unauthorized: Please sign in to continue.');
  }
  return user.getIdToken(forceRefresh);
}

export async function signOutUser(): Promise<void> {
  await firebaseSignOut(auth);
}

export { onAuthStateChanged, app as firebaseApp, type User };

export function formatFirebaseAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code || '';
  const rawMessage = (error as { message?: string })?.message || 'Authentication failed.';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password. Please check your credentials and try again.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Please sign in instead.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a moment or reset your password.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in window was closed before completing sign-in.';
    case 'auth/cancelled-popup-request':
      return 'Another sign-in window is already open.';
    case 'auth/unauthorized-domain':
      return `This domain (${window.location.hostname}) is not yet added to Firebase Authorized Domains in project "darvo1". Add "${window.location.hostname}" under Firebase Console → Authentication → Settings → Authorized domains, or sign in with Email & Password.`;
    case 'auth/operation-not-allowed':
      return 'This sign-in provider is not yet enabled in Firebase Console (project darvo1 → Authentication → Sign-in method).';
    case 'auth/network-request-failed':
      return 'Network error while reaching Firebase Authentication. Check your internet connection and try again.';
    default:
      return rawMessage.replace(/^Firebase:\s*/i, '');
  }
}
