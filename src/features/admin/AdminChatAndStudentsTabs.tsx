import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CheckCheck,
  Megaphone,
  MessageSquare,
  Search,
  Send,
  User,
} from 'lucide-react';
import { formatISTDateTime } from '../../lib/date';
import {
  createAdminBroadcast,
  markChatMessagesRead,
  sendAdminChatMessage,
  sendAdminNotificationToStudent,
  subscribeToAllStudentThreads,
  subscribeToStudentMessages,
} from '../../lib/firestore';
import type {
  ChatMessage,
  ClassLevel,
  ContentExam,
  StudentProfile,
  StudentThread,
} from '../../types';

interface AdminStudentsTabProps {
  students: StudentProfile[];
  onOpenStudentChat: (student: StudentProfile) => void;
}

export const AdminStudentsTab: React.FC<AdminStudentsTabProps> = ({
  students,
  onOpenStudentChat,
}) => {
  const [search, setSearch] = useState('');
  const [examFilter, setExamFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (examFilter && s.exam !== examFilter) return false;
      if (classFilter && String(s.class_level) !== String(classFilter)) return false;
      if (!q) return true;
      return (
        (s.display_name || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.firebase_uid || '').toLowerCase().includes(q)
      );
    });
  }, [students, search, examFilter, classFilter]);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">
            Registered Students ({filtered.length} / {students.length})
          </h2>
          <p className="text-xs text-slate-500">
            Search and filter students by name, exam track, or class level
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or email..."
              className="rounded-xl border border-slate-300 pl-9 pr-3 py-1.5 text-xs sm:text-sm text-slate-900"
            />
          </div>

          <select
            value={examFilter}
            onChange={(e) => setExamFilter(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs sm:text-sm text-slate-800"
          >
            <option value="">All Exams</option>
            <option value="JEE">JEE</option>
            <option value="NEET">NEET</option>
          </select>

          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs sm:text-sm text-slate-800"
          >
            <option value="">All Classes</option>
            <option value="11">Class 11th</option>
            <option value="12">Class 12th</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-slate-500">
          No students match the selected search or filter.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200">
              <tr>
                <th className="p-3.5">Student</th>
                <th className="p-3.5">Exam Track</th>
                <th className="p-3.5">Class</th>
                <th className="p-3.5">Joined (IST)</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((s) => (
                <tr key={s.firebase_uid} className="hover:bg-slate-50">
                  <td className="p-3.5">
                    <div className="flex items-center gap-2.5">
                      {s.avatar_url ? (
                        <img
                          src={s.avatar_url}
                          alt={s.display_name}
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                          <User className="h-4 w-4" />
                        </div>
                      )}
                      <div>
                        <p className="font-bold text-slate-900">{s.display_name}</p>
                        {s.email && (
                          <p className="text-xs text-slate-500">{s.email}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-3.5">
                    <span className="rounded-lg bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
                      {s.exam}
                    </span>
                  </td>
                  <td className="p-3.5 font-semibold text-slate-700">
                    Class {s.class_level}th
                  </td>
                  <td className="p-3.5 text-xs text-slate-500">
                    {formatISTDateTime(s.created_at)}
                  </td>
                  <td className="p-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => onOpenStudentChat(s)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>Message / Notify</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

interface AdminChatAndNotificationsTabProps {
  adminUid: string;
  students: StudentProfile[];
  initialStudentUid?: string | null;
}

export const AdminChatAndNotificationsTab: React.FC<
  AdminChatAndNotificationsTabProps
> = ({ adminUid, students, initialStudentUid }) => {
  const [threads, setThreads] = useState<StudentThread[]>([]);
  const [selectedStudentUid, setSelectedStudentUid] = useState<string>(
    initialStudentUid || ''
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // Direct notification / broadcast state
  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');
  const [notifDeepLink, setNotifDeepLink] = useState('/');
  const [notifMode, setNotifMode] = useState<'student' | 'broadcast'>('student');
  const [broadcastExam, setBroadcastExam] = useState<ContentExam>('Both');
  const [broadcastClasses, setBroadcastClasses] = useState<ClassLevel[]>(['11', '12']);
  const [sendingNotif, setSendingNotif] = useState(false);
  const [notifFeedback, setNotifFeedback] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialStudentUid) {
      setSelectedStudentUid(initialStudentUid);
    }
  }, [initialStudentUid]);

  useEffect(() => {
    const unsub = subscribeToAllStudentThreads((items) => {
      setThreads(items);
      if (!selectedStudentUid && items.length > 0) {
        setSelectedStudentUid(items[0].studentUid);
      }
    });
    return unsub;
  }, [selectedStudentUid]);

  useEffect(() => {
    if (!selectedStudentUid) {
      setMessages([]);
      return;
    }
    const unsub = subscribeToStudentMessages(selectedStudentUid, (msgs) => {
      setMessages(msgs);
      const hasUnreadFromStudent = msgs.some(
        (m) => m.senderRole === 'student' && !m.isRead
      );
      if (hasUnreadFromStudent) {
        markChatMessagesRead(selectedStudentUid, msgs, 'admin').catch(() => {});
      }
    });
    return unsub;
  }, [selectedStudentUid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const selectedStudent = useMemo(
    () => students.find((s) => s.firebase_uid === selectedStudentUid) || null,
    [students, selectedStudentUid]
  );

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentUid || !replyText.trim()) return;
    setSendingReply(true);
    try {
      await sendAdminChatMessage({
        studentUid: selectedStudentUid,
        adminUid,
        studentName: selectedStudent?.display_name,
        text: replyText.trim(),
        alsoNotify: true,
      });
      setReplyText('');
    } catch (err) {
      setNotifFeedback(
        err instanceof Error ? err.message : 'Failed to send reply.'
      );
    } finally {
      setSendingReply(false);
    }
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotifFeedback(null);
    if (!notifTitle.trim() || !notifBody.trim()) {
      setNotifFeedback('Notification title and body are required.');
      return;
    }

    setSendingNotif(true);
    try {
      if (notifMode === 'student') {
        if (!selectedStudentUid) {
          throw new Error('Select a student first to send a direct notification.');
        }
        await sendAdminNotificationToStudent(selectedStudentUid, {
          title: notifTitle.trim(),
          body: notifBody.trim(),
          deepLink: notifDeepLink.trim() || '/',
          type: 'info',
        });
        setNotifFeedback('Direct in-app notification delivered to student!');
      } else {
        await createAdminBroadcast({
          title: notifTitle.trim(),
          body: notifBody.trim(),
          deepLink: notifDeepLink.trim() || '/',
          exam: broadcastExam,
          classes: broadcastClasses,
        });
        setNotifFeedback('Live broadcast published to Firestore!');
      }
      setNotifTitle('');
      setNotifBody('');
    } catch (err) {
      setNotifFeedback(
        err instanceof Error ? err.message : 'Failed to send notification.'
      );
    } finally {
      setSendingNotif(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left: Student Threads & Picker */}
      <div className="lg:col-span-4 space-y-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xs">
          <h2 className="text-sm font-extrabold text-slate-900">
            Student Chat Threads ({threads.length})
          </h2>

          <div className="mt-3">
            <label htmlFor="admin-chat-student-picker" className="sr-only">
              Start or open thread with any student
            </label>
            <select
              id="admin-chat-student-picker"
              value={selectedStudentUid}
              onChange={(e) => setSelectedStudentUid(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800"
            >
              <option value="">— Select Any Registered Student —</option>
              {students.map((s) => (
                <option key={s.firebase_uid} value={s.firebase_uid}>
                  {s.display_name} ({s.exam} • {s.class_level}th)
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 max-h-[420px] overflow-y-auto space-y-2 pr-1">
            {threads.length === 0 ? (
              <p className="p-3 text-xs text-slate-500">
                No active chat threads yet. Select any student from the dropdown above to message them directly.
              </p>
            ) : (
              threads.map((t) => {
                const isSelected = t.studentUid === selectedStudentUid;
                return (
                  <button
                    key={t.studentUid}
                    type="button"
                    onClick={() => setSelectedStudentUid(t.studentUid)}
                    className={`flex w-full flex-col rounded-2xl border p-3 text-left transition ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/70'
                        : 'border-slate-100 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-extrabold text-slate-900">
                        {t.studentName || t.studentUid.slice(0, 10)}
                      </span>
                      {t.unreadByAdmin && (
                        <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          Unread
                        </span>
                      )}
                    </div>
                    {t.lastMessageText && (
                      <p className="mt-1 truncate text-xs text-slate-600">
                        {t.lastMessageText}
                      </p>
                    )}
                    {t.lastMessageAt && (
                      <span className="mt-1 text-[10px] text-slate-400">
                        {formatISTDateTime(t.lastMessageAt)}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* In-App Notification & Broadcast Sender */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-indigo-600" />
            <h3 className="text-sm font-extrabold text-slate-900">
              Send In-App Notification / Broadcast
            </h3>
          </div>

          {notifFeedback && (
            <div className="rounded-xl bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-900">
              {notifFeedback}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setNotifMode('student')}
              className={`flex-1 rounded-xl py-1.5 text-xs font-bold ${
                notifMode === 'student'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              Selected Student
            </button>
            <button
              type="button"
              onClick={() => setNotifMode('broadcast')}
              className={`flex-1 rounded-xl py-1.5 text-xs font-bold ${
                notifMode === 'broadcast'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              All Broadcast
            </button>
          </div>

          <form onSubmit={handleSendNotification} className="space-y-3">
            <input
              type="text"
              required
              value={notifTitle}
              onChange={(e) => setNotifTitle(e.target.value)}
              placeholder="Notification title"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
            />
            <textarea
              rows={2}
              required
              value={notifBody}
              onChange={(e) => setNotifBody(e.target.value)}
              placeholder="Notification message body..."
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
            />
            <div>
              <label className="block text-[11px] font-bold text-slate-600">
                Internal Destination Link
              </label>
              <select
                value={notifDeepLink}
                onChange={(e) => setNotifDeepLink(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-1.5 text-xs"
              >
                <option value="/">/ (Home)</option>
                <option value="/lectures">/lectures (Batches &amp; Lectures)</option>
                <option value="/tests">/tests (Mock Tests)</option>
                <option value="/leaderboard">/leaderboard (Leaderboard)</option>
                <option value="/profile">/profile (Analysis/Profile)</option>
                <option value="/chat">/chat (Mentor Chat)</option>
              </select>
            </div>

            {notifMode === 'broadcast' && (
              <div className="flex items-center justify-between gap-2">
                <select
                  value={broadcastExam}
                  onChange={(e) => setBroadcastExam(e.target.value as ContentExam)}
                  className="rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs"
                >
                  <option value="Both">Both Exams</option>
                  <option value="JEE">JEE Only</option>
                  <option value="NEET">NEET Only</option>
                </select>
                <div className="flex gap-2 text-xs">
                  {(['11', '12'] as const).map((c) => (
                    <label key={c} className="inline-flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={broadcastClasses.includes(c)}
                        onChange={() =>
                          setBroadcastClasses((prev) =>
                            prev.includes(c)
                              ? prev.length > 1
                                ? prev.filter((x) => x !== c)
                                : prev
                              : [...prev, c]
                          )
                        }
                      />
                      <span>{c}th</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={sendingNotif}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Megaphone className="h-3.5 w-3.5" />
              <span>
                {sendingNotif
                  ? 'Sending...'
                  : notifMode === 'student'
                  ? 'Send In-App Alert'
                  : 'Publish Broadcast'}
              </span>
            </button>
          </form>
        </div>
      </div>

      {/* Right: Live Conversation Stream */}
      <div className="lg:col-span-8">
        <div className="flex h-[620px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-4 text-white">
            <div>
              <h3 className="text-sm font-extrabold">
                {selectedStudent
                  ? `${selectedStudent.display_name} (${selectedStudent.exam} • Class ${selectedStudent.class_level}th)`
                  : selectedStudentUid
                  ? `Thread: ${selectedStudentUid}`
                  : 'Select a Student Thread'}
              </h3>
              {selectedStudent?.email && (
                <p className="text-xs text-slate-400">{selectedStudent.email}</p>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-50 p-4 space-y-3">
            {!selectedStudentUid ? (
              <div className="flex h-full items-center justify-center text-xs text-slate-500">
                Select a student from the left panel to view or reply to their chat thread.
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-slate-500">
                No messages in this student&apos;s thread yet. Send a message below to initiate contact.
              </div>
            ) : (
              messages.map((msg) => {
                const isAdminMsg = msg.senderRole === 'admin';
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isAdminMsg ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm ${
                        isAdminMsg
                          ? 'bg-indigo-600 text-white'
                          : 'border border-slate-200 bg-white text-slate-900'
                      }`}
                    >
                      <div className="text-[10px] font-bold opacity-75">
                        {isAdminMsg ? 'Admin (You)' : selectedStudent?.display_name || 'Student'}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words">
                        {msg.text}
                      </p>
                      <div
                        className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                          isAdminMsg ? 'text-indigo-200' : 'text-slate-400'
                        }`}
                      >
                        <span>{formatISTDateTime(msg.createdAt)}</span>
                        {isAdminMsg && msg.isRead && (
                          <CheckCheck className="h-3.5 w-3.5 text-emerald-300" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={handleSendReply}
            className="border-t border-slate-200 bg-white p-3.5 flex items-end gap-2.5"
          >
            <textarea
              rows={2}
              disabled={!selectedStudentUid}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={
                selectedStudentUid
                  ? 'Write a reply to this student (also sends an in-app notification)...'
                  : 'Select a student thread first...'
              }
              className="flex-1 resize-none rounded-2xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm"
            />
            <button
              type="submit"
              disabled={!selectedStudentUid || sendingReply || !replyText.trim()}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{sendingReply ? 'Sending...' : 'Reply'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
