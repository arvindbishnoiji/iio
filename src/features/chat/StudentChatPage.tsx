import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCheck,
  MessageSquare,
  Send,
  ShieldCheck,
  User,
} from 'lucide-react';
import { useApp } from '../../app/AppContext';
import { formatISTDateTime } from '../../lib/date';
import {
  markChatMessagesRead,
  sendStudentChatMessage,
} from '../../lib/firestore';

export const StudentChatPage: React.FC = () => {
  const { user, profile, chatMessages } = useApp();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length]);

  useEffect(() => {
    if (!user || chatMessages.length === 0) return;
    const hasUnreadFromAdmin = chatMessages.some(
      (m) => m.senderRole === 'admin' && !m.isRead
    );
    if (hasUnreadFromAdmin) {
      markChatMessagesRead(user.uid, chatMessages, 'student').catch(() => {});
    }
  }, [user, chatMessages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    setError(null);
    setSending(true);
    try {
      await sendStudentChatMessage({
        studentUid: user.uid,
        profile,
        text: trimmed,
      });
      setText('');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to send message. Ensure Firestore rules are deployed in Firebase Console.'
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex h-[calc(100vh-11rem)] min-h-[480px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {/* Chat Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-bold">
                Mentor Doubt &amp; Academic Support Chat
              </h1>
              <p className="text-xs text-slate-300">
                Direct private thread with Exam Cracker Admin ({profile?.exam} • Class{' '}
                {profile?.class_level}th)
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Live Firestore Sync</span>
          </span>
        </div>

        {error && (
          <div
            role="alert"
            className="border-b border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700"
          >
            {error}
          </div>
        )}

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto bg-slate-50 p-4 space-y-3 sm:p-6">
          {chatMessages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                <MessageSquare className="h-6 w-6" />
              </div>
              <h2 className="mt-3 text-base font-bold text-slate-900">
                Start a Conversation with Your Mentor
              </h2>
              <p className="mt-1 max-w-md text-xs text-slate-500">
                Ask doubts about JEE/NEET concepts, batch access codes, or test schedules. Only you and the Exam Cracker administrator can read this thread.
              </p>
            </div>
          ) : (
            chatMessages.map((msg) => {
              const isStudent = msg.senderRole === 'student';
              return (
                <div
                  key={msg.id}
                  className={`flex ${isStudent ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[82%] rounded-2xl px-4 py-3 shadow-2xs ${
                      isStudent
                        ? 'bg-indigo-600 text-white rounded-br-xs'
                        : 'border border-slate-200 bg-white text-slate-900 rounded-bl-xs'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-[11px] font-bold opacity-80">
                      {isStudent ? (
                        <>
                          <User className="h-3 w-3" />
                          <span>You</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-3.5 w-3.5 text-indigo-600" />
                          <span className="text-indigo-600">Exam Cracker Admin</span>
                        </>
                      )}
                    </div>
                    <p className="mt-1 text-xs sm:text-sm whitespace-pre-wrap break-words leading-relaxed">
                      {msg.text}
                    </p>
                    <div
                      className={`mt-1.5 flex items-center justify-end gap-1.5 text-[10px] ${
                        isStudent ? 'text-indigo-200' : 'text-slate-400'
                      }`}
                    >
                      <span>{formatISTDateTime(msg.createdAt)}</span>
                      {isStudent && msg.isRead && (
                        <span title="Read by Admin" className="inline-flex items-center">
                          <CheckCheck className="h-3.5 w-3.5 text-emerald-300" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input Composer */}
        <form
          onSubmit={handleSend}
          className="border-t border-slate-200 bg-white p-3.5 sm:p-4"
        >
          <div className="flex items-end gap-2.5">
            <label htmlFor="student-chat-input" className="sr-only">
              Type your message
            </label>
            <textarea
              id="student-chat-input"
              rows={2}
              maxLength={5000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write your doubt or question for the mentor..."
              className="flex-1 resize-none rounded-2xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:bg-white focus:outline-none"
            />
            <button
              type="submit"
              disabled={sending || !text.trim()}
              className="inline-flex h-11 items-center gap-1.5 rounded-2xl bg-indigo-600 px-4 text-xs sm:text-sm font-bold text-white shadow-xs transition hover:bg-indigo-700 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              <span>{sending ? 'Sending...' : 'Send'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
