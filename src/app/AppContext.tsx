import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  auth,
  onAuthStateChanged,
  signOutUser,
  type User,
} from '../lib/firebase';
import {
  checkParentEnrollmentOnServer,
  getBootstrapData,
  onSessionExpired,
} from '../lib/api';
import { isAdminEmail } from '../lib/config';
import {
  registerFcmDeviceToken,
  subscribeToActiveBroadcasts,
  subscribeToStudentMessages,
  subscribeToStudentNotifications,
} from '../lib/firestore';
import { matchesStudentExamAndClass } from '../lib/validation';
import type {
  Announcement,
  AppNotification,
  BroadcastNotice,
  ChatMessage,
  CourseCatalogItem,
  StudentProfile,
} from '../types';

interface AppContextValue {
  user: User | null;
  isAdmin: boolean;
  authLoading: boolean;
  sessionExpired: boolean;
  profile: StudentProfile | null;
  needsOnboarding: boolean;
  content: CourseCatalogItem[];
  announcements: Announcement[];
  enrolledKeys: Set<string>;
  bootstrapLoading: boolean;
  bootstrapError: string | null;
  notifications: AppNotification[];
  broadcasts: BroadcastNotice[];
  chatMessages: ChatMessage[];
  unreadNotificationsCount: number;
  unreadChatCount: number;
  refreshBootstrap: () => Promise<void>;
  setProfileState: (profile: StudentProfile) => void;
  markEnrolled: (itemType: 'batch' | 'series', itemId: string) => void;
  isEnrolled: (itemType: 'batch' | 'series', itemId: string) => boolean;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);

  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean>(false);
  const [content, setContent] = useState<CourseCatalogItem[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [enrolledKeys, setEnrolledKeys] = useState<Set<string>>(new Set());
  const [bootstrapLoading, setBootstrapLoading] = useState<boolean>(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastNotice[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const isAdmin = useMemo(() => isAdminEmail(user?.email), [user?.email]);

  useEffect(() => {
    const unsubExpired = onSessionExpired(() => {
      setSessionExpired(true);
    });
    return unsubExpired;
  }, []);

  const refreshBootstrap = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setProfile(null);
      setNeedsOnboarding(false);
      setContent([]);
      setAnnouncements([]);
      setEnrolledKeys(new Set());
      setBootstrapError(null);
      return;
    }

    setBootstrapLoading(true);
    setBootstrapError(null);

    try {
      const data = await getBootstrapData();
      setSessionExpired(false);
      setProfile(data.profile);
      setNeedsOnboarding(Boolean(data.needsOnboarding || !data.profile));

      const filteredContent = data.profile
        ? (data.content || []).filter((item) =>
            matchesStudentExamAndClass(item, data.profile!.exam, data.profile!.class_level)
          )
        : [];

      setContent(filteredContent);
      setAnnouncements(data.announcements || []);

      const nextEnrolled = new Set<string>();

      if (Array.isArray(data.enrollments)) {
        for (const e of data.enrollments) {
          if (e.active !== false && e.item_type && e.item_id) {
            nextEnrolled.add(`${e.item_type}:${e.item_id}`);
          }
        }
      }

      // Any child lecture/resource returned by /bootstrap has already passed hideUnenrolledContent
      for (const item of filteredContent) {
        if (item.kind === 'lecture' || item.kind === 'resource') {
          const meta = (item.metadata || {}) as Record<string, unknown>;
          const parentId = String(
            meta.parentId || meta.parent_id || meta.batchId || meta.batch_id || ''
          );
          if (parentId) {
            const parentObj = filteredContent.find((c) => c.id === parentId);
            if (parentObj && (parentObj.kind === 'batch' || parentObj.kind === 'series')) {
              nextEnrolled.add(`${parentObj.kind}:${parentId}`);
            }
          }
        }
      }

      setEnrolledKeys(new Set(nextEnrolled));

      // If /bootstrap didn't include explicit `enrollments` array, verify active batches/series against the server
      if (!Array.isArray(data.enrollments) && data.profile) {
        const parentsToVerify = filteredContent.filter(
          (c) =>
            (c.kind === 'batch' || c.kind === 'series') &&
            !nextEnrolled.has(`${c.kind}:${c.id}`)
        );
        if (parentsToVerify.length > 0) {
          const checks = await Promise.allSettled(
            parentsToVerify.map(async (parent) => {
              const res = await checkParentEnrollmentOnServer(parent.id);
              return { parent, enrolled: res.enrolled };
            })
          );
          let updated = false;
          for (const check of checks) {
            if (check.status === 'fulfilled' && check.value.enrolled) {
              nextEnrolled.add(`${check.value.parent.kind}:${check.value.parent.id}`);
              updated = true;
            }
          }
          if (updated) {
            setEnrolledKeys(new Set(nextEnrolled));
          }
        }
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unable to load your learning dashboard.';
      setBootstrapError(msg);
    } finally {
      setBootstrapLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
      if (firebaseUser) {
        setSessionExpired(false);
        refreshBootstrap();
        registerFcmDeviceToken(firebaseUser.uid).catch(() => {});
      } else {
        setProfile(null);
        setNeedsOnboarding(false);
        setContent([]);
        setAnnouncements([]);
        setEnrolledKeys(new Set());
        setNotifications([]);
        setBroadcasts([]);
        setChatMessages([]);
      }
    });
    return () => unsub();
  }, [refreshBootstrap]);

  useEffect(() => {
    if (!user) return;
    const unsubNotifs = subscribeToStudentNotifications(user.uid, (items) => {
      setNotifications(items);
    });
    const unsubBroadcasts = subscribeToActiveBroadcasts((items) => {
      setBroadcasts(items);
    });
    const unsubChat = subscribeToStudentMessages(user.uid, (msgs) => {
      setChatMessages(msgs);
    });
    return () => {
      unsubNotifs();
      unsubBroadcasts();
      unsubChat();
    };
  }, [user]);

  const setProfileState = useCallback(
    (newProfile: StudentProfile) => {
      setProfile(newProfile);
      setNeedsOnboarding(false);
      refreshBootstrap();
    },
    [refreshBootstrap]
  );

  const markEnrolled = useCallback(
    (itemType: 'batch' | 'series', itemId: string) => {
      setEnrolledKeys((prev) => {
        const next = new Set(prev);
        next.add(`${itemType}:${itemId}`);
        return next;
      });
      refreshBootstrap();
    },
    [refreshBootstrap]
  );

  const isEnrolled = useCallback(
    (itemType: 'batch' | 'series', itemId: string): boolean => {
      return enrolledKeys.has(`${itemType}:${itemId}`);
    },
    [enrolledKeys]
  );

  const logout = useCallback(async () => {
    await signOutUser();
    setProfile(null);
    setNeedsOnboarding(false);
    setContent([]);
    setAnnouncements([]);
    setEnrolledKeys(new Set());
  }, []);

  const unreadNotificationsCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const unreadChatCount = useMemo(
    () => chatMessages.filter((m) => m.senderRole === 'admin' && !m.isRead).length,
    [chatMessages]
  );

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      isAdmin,
      authLoading,
      sessionExpired,
      profile,
      needsOnboarding,
      content,
      announcements,
      enrolledKeys,
      bootstrapLoading,
      bootstrapError,
      notifications,
      broadcasts,
      chatMessages,
      unreadNotificationsCount,
      unreadChatCount,
      refreshBootstrap,
      setProfileState,
      markEnrolled,
      isEnrolled,
      logout,
    }),
    [
      user,
      isAdmin,
      authLoading,
      sessionExpired,
      profile,
      needsOnboarding,
      content,
      announcements,
      enrolledKeys,
      bootstrapLoading,
      bootstrapError,
      notifications,
      broadcasts,
      chatMessages,
      unreadNotificationsCount,
      unreadChatCount,
      refreshBootstrap,
      setProfileState,
      markEnrolled,
      isEnrolled,
      logout,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return ctx;
}
