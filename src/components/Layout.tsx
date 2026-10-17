import React, { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Bell,
  BookOpen,
  GraduationCap,
  Home,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Trophy,
  UserCheck,
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '../app/AppContext';
import { NotificationsDrawer } from '../features/notifications/NotificationsDrawer';

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/lectures', label: 'Lectures', icon: BookOpen, end: false },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy, end: false },
  { to: '/profile', label: 'Analysis/Profile', icon: UserCheck, end: false },
];

export const Layout: React.FC = () => {
  const location = useLocation();
  const {
    profile,
    isAdmin,
    unreadNotificationsCount,
    unreadChatCount,
    sessionExpired,
    bootstrapError,
    bootstrapLoading,
    refreshBootstrap,
    logout,
  } = useApp();
  const [notifOpen, setNotifOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Sticky Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-sm">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div>
                <span className="block text-base font-extrabold tracking-tight text-slate-900 sm:text-lg">
                  Exam Cracker
                </span>
                <span className="block text-[11px] font-medium text-slate-500">
                  JEE &amp; NEET Prep
                </span>
              </div>
            </Link>

            {profile && (
              <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
                <span>{profile.exam}</span>
                <span>•</span>
                <span>Class {profile.class_level}th</span>
              </div>
            )}
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>

          {/* Header Right Actions */}
          <div className="flex items-center gap-2">
            {profile && (
              <span className="inline-flex sm:hidden items-center rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700">
                {profile.exam} • {profile.class_level}th
              </span>
            )}

            {/* Mentor Live Chat Link */}
            <Link
              to="/chat"
              aria-label="Open mentor doubt & support chat"
              className={`relative inline-flex h-10 w-10 items-center justify-center rounded-xl border transition ${
                location.pathname === '/chat'
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
              }`}
              title="Mentor Support Chat"
            >
              <MessageSquare className="h-5 w-5" />
              {unreadChatCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                  {unreadChatCount > 9 ? '9+' : unreadChatCount}
                </span>
              )}
            </Link>

            {/* Notifications Drawer Trigger */}
            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              aria-label="Open notifications"
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100"
              title="Notifications"
            >
              <Bell className="h-5 w-5" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white">
                  {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                </span>
              )}
            </button>

            {/* Admin link ONLY visible to verified admin email */}
            {isAdmin && (
              <Link
                to="/admin"
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-slate-800"
              >
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span className="hidden sm:inline">Admin</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Session Expired or Bootstrap Error Banner */}
      {sessionExpired && (
        <div className="bg-rose-600 px-4 py-2.5 text-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Your login session has expired. Please sign in again to continue.</span>
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg bg-white px-3 py-1 text-xs font-bold text-rose-700 hover:bg-rose-50"
            >
              Sign In Again
            </button>
          </div>
        </div>
      )}

      {bootstrapError && !sessionExpired && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-amber-900">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              <span>{bootstrapError}</span>
            </div>
            <button
              type="button"
              onClick={refreshBootstrap}
              disabled={bootstrapLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${bootstrapLoading ? 'animate-spin' : ''}`} />
              <span>Retry</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-5 pb-24 sm:px-6 md:pb-12 lg:px-8">
        <Outlet />
      </main>

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="Mobile bottom navigation"
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <div className="grid grid-cols-4 h-16">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition ${
                    isActive
                      ? 'text-indigo-600'
                      : 'text-slate-500 hover:text-slate-800'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div
                      className={`flex h-7 w-12 items-center justify-center rounded-full transition ${
                        isActive ? 'bg-indigo-50 text-indigo-600' : ''
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="truncate max-w-[90%]">{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>

      <NotificationsDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
    </div>
  );
};
