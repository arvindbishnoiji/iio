import React, { useEffect } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { AppProvider } from './AppContext';
import { Layout } from '../components/Layout';
import {
  RequireAdminAuth,
  RequireStudentAuth,
} from '../components/RouteGuards';
import { AuthPage } from '../features/auth/AuthPage';
import { OnboardingPage } from '../features/auth/OnboardingPage';
import { HomePage } from '../features/home/HomePage';
import { LecturesHubPage } from '../features/lectures/LecturesHubPage';
import { LecturePlayerPage } from '../features/lectures/LecturePlayerPage';
import { BatchDetailPage } from '../features/batches/BatchDetailPage';
import { SeriesDetailPage } from '../features/series/SeriesDetailPage';
import { TestsPage } from '../features/tests/TestsPage';
import { TestAttemptPage } from '../features/tests/TestAttemptPage';
import { LeaderboardPage } from '../features/leaderboard/LeaderboardPage';
import { ProfileAnalysisPage } from '../features/profile/ProfileAnalysisPage';
import { StudentChatPage } from '../features/chat/StudentChatPage';
import { AdminPage } from '../features/admin/AdminPage';
import { isValidInternalDeepLink } from '../lib/validation';

const NativeAppListeners: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = CapApp.addListener('appUrlOpen', (event) => {
      try {
        const url = new URL(event.url);
        const path = `${url.pathname}${url.search}`;
        if (isValidInternalDeepLink(path)) {
          navigate(path);
        }
      } catch {
        // Ignore invalid deep links
      }
    });
    return () => {
      listener.then((h) => h.remove()).catch(() => {});
    };
  }, [navigate]);

  return null;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AppProvider>
        <NativeAppListeners />
        <Routes>
          {/* Public Auth Route */}
          <Route path="/auth" element={<AuthPage />} />

          {/* Protected Admin Console Route (/admin) */}
          <Route
            path="/admin"
            element={
              <RequireAdminAuth>
                <AdminPage />
              </RequireAdminAuth>
            }
          />

          {/* Protected Student Routes */}
          <Route element={<RequireStudentAuth />}>
            <Route path="/onboarding" element={<OnboardingPage />} />

            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/lectures" element={<LecturesHubPage />} />
              <Route
                path="/lectures/watch/:lectureId"
                element={<LecturePlayerPage />}
              />
              <Route path="/batches/:batchId" element={<BatchDetailPage />} />
              <Route path="/series/:seriesId" element={<SeriesDetailPage />} />
              <Route path="/tests" element={<TestsPage />} />
              <Route path="/tests/:testId" element={<TestAttemptPage />} />
              <Route path="/leaderboard" element={<LeaderboardPage />} />
              <Route path="/profile" element={<ProfileAnalysisPage />} />
              <Route path="/chat" element={<StudentChatPage />} />
            </Route>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
};
