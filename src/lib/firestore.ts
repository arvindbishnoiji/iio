import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  limit,
  type Unsubscribe,
} from 'firebase/firestore';
import { getMessaging, getToken, isSupported as isMessagingSupported } from 'firebase/messaging';
import { APP_CONFIG } from './config';
import { db, firebaseApp } from './firebase';
import { isValidInternalDeepLink } from './validation';
import type {
  AppNotification,
  BroadcastNotice,
  ChatMessage,
  ClassLevel,
  ContentExam,
  ExamTrack,
  StudentProfile,
  StudentThread,
} from '../types';

export function subscribeToStudentMessages(
  studentUid: string,
  onMessages: (messages: ChatMessage[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const messagesRef = collection(db, 'studentThreads', studentUid, 'messages');
  const q = query(messagesRef, orderBy('createdAt', 'asc'), limit(250));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: ChatMessage[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          senderUid: String(data.senderUid || ''),
          senderRole: data.senderRole === 'admin' ? 'admin' : 'student',
          text: String(data.text || ''),
          createdAt: String(data.createdAt || new Date().toISOString()),
          readAt: data.readAt ? String(data.readAt) : null,
          isRead: Boolean(data.isRead || data.readAt),
          attachments: Array.isArray(data.attachments) ? data.attachments.map(String) : [],
        };
      });
      onMessages(list);
    },
    (err) => {
      onError?.(err);
    }
  );
}

export function subscribeToAllStudentThreads(
  onThreads: (threads: StudentThread[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const threadsRef = collection(db, 'studentThreads');
  const q = query(threadsRef, limit(500));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: StudentThread[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            studentUid: String(data.studentUid || d.id),
            studentName: data.studentName ? String(data.studentName) : undefined,
            studentEmail: data.studentEmail ? String(data.studentEmail) : null,
            exam: (data.exam as ExamTrack) || undefined,
            classLevel: (data.classLevel as ClassLevel) || undefined,
            lastMessageText: data.lastMessageText ? String(data.lastMessageText) : '',
            lastMessageAt: data.lastMessageAt ? String(data.lastMessageAt) : '',
            lastSenderRole:
              data.lastSenderRole === 'admin'
                ? ('admin' as const)
                : data.lastSenderRole === 'student'
                ? ('student' as const)
                : undefined,
            unreadByAdmin: Boolean(data.unreadByAdmin),
            unreadByStudent: Boolean(data.unreadByStudent),
            updatedAt: data.updatedAt ? String(data.updatedAt) : '',
          };
        })
        .sort((a, b) => {
          const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
          const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
          return tb - ta;
        });
      onThreads(list);
    },
    (err) => {
      onError?.(err);
    }
  );
}

export async function sendStudentChatMessage(input: {
  studentUid: string;
  profile: StudentProfile | null;
  text: string;
}): Promise<void> {
  const trimmed = input.text.trim();
  if (!trimmed || trimmed.length > 5000) {
    throw new Error('Message must be between 1 and 5000 characters.');
  }
  const nowIso = new Date().toISOString();
  const threadDoc = doc(db, 'studentThreads', input.studentUid);
  await setDoc(
    threadDoc,
    {
      studentUid: input.studentUid,
      studentName: input.profile?.display_name || 'Student',
      studentEmail: input.profile?.email || null,
      exam: input.profile?.exam || null,
      classLevel: input.profile?.class_level || null,
      lastMessageText: trimmed.slice(0, 300),
      lastMessageAt: nowIso,
      lastSenderRole: 'student',
      unreadByAdmin: true,
      unreadByStudent: false,
      updatedAt: nowIso,
    },
    { merge: true }
  );

  const messagesRef = collection(db, 'studentThreads', input.studentUid, 'messages');
  await addDoc(messagesRef, {
    senderUid: input.studentUid,
    senderRole: 'student',
    text: trimmed,
    createdAt: nowIso,
    readAt: null,
    isRead: false,
  });
}

export async function sendAdminChatMessage(input: {
  studentUid: string;
  adminUid: string;
  studentName?: string;
  text: string;
  alsoNotify?: boolean;
}): Promise<void> {
  const trimmed = input.text.trim();
  if (!trimmed || trimmed.length > 5000) {
    throw new Error('Message must be between 1 and 5000 characters.');
  }
  const nowIso = new Date().toISOString();
  const threadDoc = doc(db, 'studentThreads', input.studentUid);
  await setDoc(
    threadDoc,
    {
      studentUid: input.studentUid,
      ...(input.studentName ? { studentName: input.studentName } : {}),
      lastMessageText: trimmed.slice(0, 300),
      lastMessageAt: nowIso,
      lastSenderRole: 'admin',
      unreadByAdmin: false,
      unreadByStudent: true,
      updatedAt: nowIso,
    },
    { merge: true }
  );

  const messagesRef = collection(db, 'studentThreads', input.studentUid, 'messages');
  await addDoc(messagesRef, {
    senderUid: input.adminUid,
    senderRole: 'admin',
    text: trimmed,
    createdAt: nowIso,
    readAt: null,
    isRead: false,
  });

  if (input.alsoNotify !== false) {
    const notificationsRef = collection(db, 'users', input.studentUid, 'notifications');
    await addDoc(notificationsRef, {
      title: 'New reply from Exam Cracker Mentor',
      body: trimmed.slice(0, 180),
      deepLink: '/chat',
      createdAt: nowIso,
      readAt: null,
      isRead: false,
      type: 'chat',
    });
  }
}

export async function markChatMessagesRead(
  studentUid: string,
  messages: ChatMessage[],
  viewerRole: 'student' | 'admin'
): Promise<void> {
  const nowIso = new Date().toISOString();
  const targetSender = viewerRole === 'student' ? 'admin' : 'student';
  const unread = messages.filter((m) => m.senderRole === targetSender && !m.isRead);

  for (const msg of unread) {
    const msgRef = doc(db, 'studentThreads', studentUid, 'messages', msg.id);
    // Strict adherence to firestore.rules: only update readAt and isRead
    await updateDoc(msgRef, {
      readAt: nowIso,
      isRead: true,
    }).catch(() => {});
  }

  const threadRef = doc(db, 'studentThreads', studentUid);
  await setDoc(
    threadRef,
    viewerRole === 'student'
      ? { unreadByStudent: false }
      : { unreadByAdmin: false },
    { merge: true }
  ).catch(() => {});
}

export function subscribeToStudentNotifications(
  studentUid: string,
  onNotifications: (items: AppNotification[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const notifRef = collection(db, 'users', studentUid, 'notifications');
  const q = query(notifRef, orderBy('createdAt', 'desc'), limit(100));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: AppNotification[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: String(data.title || 'Notification'),
          body: String(data.body || ''),
          deepLink:
            data.deepLink && isValidInternalDeepLink(String(data.deepLink))
              ? String(data.deepLink)
              : null,
          createdAt: String(data.createdAt || new Date().toISOString()),
          readAt: data.readAt ? String(data.readAt) : null,
          isRead: Boolean(data.isRead || data.readAt),
          type: (data.type as AppNotification['type']) || 'info',
        };
      });
      onNotifications(items);
    },
    (err) => {
      onError?.(err);
    }
  );
}

export async function markNotificationRead(
  studentUid: string,
  notificationId: string
): Promise<void> {
  const nowIso = new Date().toISOString();
  const ref = doc(db, 'users', studentUid, 'notifications', notificationId);
  // Strict adherence to firestore.rules: only update readAt and isRead
  await updateDoc(ref, {
    readAt: nowIso,
    isRead: true,
  });
}

export async function markAllNotificationsRead(
  studentUid: string,
  notifications: AppNotification[]
): Promise<void> {
  const unread = notifications.filter((n) => !n.isRead);
  await Promise.all(
    unread.map((n) => markNotificationRead(studentUid, n.id).catch(() => {}))
  );
}

export async function sendAdminNotificationToStudent(
  studentUid: string,
  payload: {
    title: string;
    body: string;
    deepLink?: string | null;
    type?: AppNotification['type'];
  }
): Promise<void> {
  const title = payload.title.trim();
  const body = payload.body.trim();
  if (!title || !body) {
    throw new Error('Notification title and message body are required.');
  }
  const safeDeepLink =
    payload.deepLink && isValidInternalDeepLink(payload.deepLink)
      ? payload.deepLink.trim()
      : null;
  const notifRef = collection(db, 'users', studentUid, 'notifications');
  await addDoc(notifRef, {
    title,
    body,
    deepLink: safeDeepLink,
    createdAt: new Date().toISOString(),
    readAt: null,
    isRead: false,
    type: payload.type || 'info',
  });
}

export function subscribeToActiveBroadcasts(
  onBroadcasts: (items: BroadcastNotice[]) => void
): Unsubscribe {
  const ref = collection(db, 'broadcasts');
  const q = query(ref, where('active', '==', true), limit(30));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: BroadcastNotice[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: String(data.title || ''),
            body: String(data.body || ''),
            deepLink:
              data.deepLink && isValidInternalDeepLink(String(data.deepLink))
                ? String(data.deepLink)
                : null,
            exam: (data.exam as ContentExam) || 'Both',
            classes: (Array.isArray(data.classes)
              ? data.classes.map(String).filter((c) => c === '11' || c === '12')
              : ['11', '12']) as ClassLevel[],
            active: Boolean(data.active),
            createdAt: String(data.createdAt || new Date().toISOString()),
          };
        })
        .sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      onBroadcasts(list);
    },
    () => {
      // Ignore if Firestore broadcasts collection has no documents yet
    }
  );
}

export async function createAdminBroadcast(payload: {
  title: string;
  body: string;
  deepLink?: string | null;
  exam: ContentExam;
  classes: ClassLevel[];
}): Promise<void> {
  const title = payload.title.trim();
  const body = payload.body.trim();
  if (!title || !body) {
    throw new Error('Broadcast title and body are required.');
  }
  const safeDeepLink =
    payload.deepLink && isValidInternalDeepLink(payload.deepLink)
      ? payload.deepLink.trim()
      : null;
  await addDoc(collection(db, 'broadcasts'), {
    title,
    body,
    deepLink: safeDeepLink,
    exam: payload.exam,
    classes: payload.classes,
    active: true,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Registers the signed-in device's FCM token under `fcmTokens/{studentUid}/tokens/{tokenId}`.
 * Works on native Android (Capacitor PushNotifications) and Web Push (if VAPID key is set).
 */
export async function registerFcmDeviceToken(studentUid: string): Promise<string | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const perm = await PushNotifications.requestPermissions();
      if (perm.receive !== 'granted') return null;

      return new Promise((resolve) => {
        PushNotifications.addListener('registration', async (tokenObj) => {
          const token = tokenObj.value;
          if (token && token.length > 20) {
            const tokenId = token.slice(0, 32).replace(/[^a-zA-Z0-9_-]/g, '_');
            await setDoc(doc(db, 'fcmTokens', studentUid, 'tokens', tokenId), {
              token,
              platform: 'android',
              updatedAt: new Date().toISOString(),
            }).catch(() => {});
            resolve(token);
          } else {
            resolve(null);
          }
        });
        PushNotifications.addListener('registrationError', () => {
          resolve(null);
        });
        PushNotifications.register().catch(() => resolve(null));
      });
    }

    if (!APP_CONFIG.firebase.vapidKey) {
      // Web Push VAPID key is optional; in-app Firestore notifications work without it.
      return null;
    }

    const supported = await isMessagingSupported();
    if (!supported || typeof Notification === 'undefined') return null;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const messaging = getMessaging(firebaseApp);
    const token = await getToken(messaging, {
      vapidKey: APP_CONFIG.firebase.vapidKey,
    });
    if (token && token.length > 20) {
      const tokenId = token.slice(0, 32).replace(/[^a-zA-Z0-9_-]/g, '_');
      await setDoc(doc(db, 'fcmTokens', studentUid, 'tokens', tokenId), {
        token,
        platform: 'web',
        updatedAt: new Date().toISOString(),
      });
      return token;
    }
    return null;
  } catch {
    return null;
  }
}
