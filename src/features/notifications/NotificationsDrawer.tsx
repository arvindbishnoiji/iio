import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  ExternalLink,
  Megaphone,
  MessageSquare,
  Sparkles,
  X,
} from 'lucide-react';
import { useApp } from '../../app/AppContext';
import { formatISTDateTime } from '../../lib/date';
import {
  markAllNotificationsRead,
  markNotificationRead,
} from '../../lib/firestore';
import { isValidInternalDeepLink, matchesStudentExamAndClass } from '../../lib/validation';
import type { AppNotification } from '../../types';

interface NotificationsDrawerProps {
  open: boolean;
  onClose: () => void;
}

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({
  open,
  onClose,
}) => {
  const navigate = useNavigate();
  const {
    user,
    profile,
    notifications,
    broadcasts,
    announcements,
    unreadNotificationsCount,
  } = useApp();

  if (!open) return null;

  const filteredBroadcasts = profile
    ? broadcasts.filter((b) =>
        matchesStudentExamAndClass(
          { exam: b.exam, classes: b.classes },
          profile.exam,
          profile.class_level
        )
      )
    : broadcasts;

  const handleOpenNotification = async (item: AppNotification) => {
    if (user && !item.isRead) {
      await markNotificationRead(user.uid, item.id).catch(() => {});
    }
    if (item.deepLink && isValidInternalDeepLink(item.deepLink)) {
      onClose();
      navigate(item.deepLink);
    }
  };

  const handleMarkAll = async () => {
    if (!user) return;
    await markAllNotificationsRead(user.uid, notifications);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Notifications and Announcements"
    >
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Notifications</h2>
              <p className="text-xs text-slate-500">
                {unreadNotificationsCount > 0
                  ? `${unreadNotificationsCount} unread alert${
                      unreadNotificationsCount === 1 ? '' : 's'
                    }`
                  : 'All caught up'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {unreadNotificationsCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Mark all read</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notifications"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Personal Firestore Notifications */}
          <div>
            <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-400">
              Direct Alerts ({notifications.length})
            </h3>
            {notifications.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                No direct notifications yet. When a mentor replies or sends an update, it will appear here in real time.
              </div>
            ) : (
              <div className="space-y-2.5">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => handleOpenNotification(n)}
                    className={`cursor-pointer rounded-xl border p-3.5 transition ${
                      n.isRead
                        ? 'border-slate-200 bg-white hover:bg-slate-50'
                        : 'border-indigo-200 bg-indigo-50/60 hover:bg-indigo-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {n.type === 'chat' ? (
                          <MessageSquare className="h-4 w-4 shrink-0 text-indigo-600" />
                        ) : (
                          <Sparkles className="h-4 w-4 shrink-0 text-indigo-600" />
                        )}
                        <span className="text-sm font-semibold text-slate-900">
                          {n.title}
                        </span>
                      </div>
                      {!n.isRead && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-indigo-600" />
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600 break-words">
                      {n.body}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                      <span>{formatISTDateTime(n.createdAt)}</span>
                      {n.deepLink && (
                        <span className="inline-flex items-center gap-1 font-medium text-indigo-600">
                          <span>Open</span>
                          <ExternalLink className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live Broadcasts & Announcements */}
          {(filteredBroadcasts.length > 0 || announcements.length > 0) && (
            <div>
              <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                Notices &amp; Announcements
              </h3>
              <div className="space-y-2.5">
                {filteredBroadcasts.map((b) => (
                  <div
                    key={`broadcast-${b.id}`}
                    onClick={() => {
                      if (b.deepLink && isValidInternalDeepLink(b.deepLink)) {
                        onClose();
                        navigate(b.deepLink);
                      }
                    }}
                    className={`rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 ${
                      b.deepLink ? 'cursor-pointer hover:bg-amber-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Megaphone className="h-4 w-4 shrink-0 text-amber-600" />
                      <span className="text-sm font-semibold text-slate-900">
                        {b.title}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-700 break-words">
                      {b.body}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                      <span>{formatISTDateTime(b.createdAt)}</span>
                      {b.deepLink && (
                        <span className="font-semibold text-amber-700">View →</span>
                      )}
                    </div>
                  </div>
                ))}

                {announcements.map((a) => (
                  <div
                    key={`ann-${a.id}`}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3.5"
                  >
                    <div className="flex items-center gap-2">
                      <Megaphone className="h-4 w-4 shrink-0 text-indigo-600" />
                      <span className="text-sm font-semibold text-slate-900">
                        {a.title}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600 break-words">
                      {a.body}
                    </p>
                    <div className="mt-2 text-[11px] text-slate-400">
                      {formatISTDateTime(a.scheduled_at || a.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
