import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { PageLoader } from '@/shared/ui/Spinner';
import { AppLayout } from './AppLayout';
import { ReportLayout } from './ReportLayout';

const Landing = lazy(() => import('@/features/landing/LandingPage'));
const Login = lazy(() => import('@/features/auth/LoginPage'));
const Register = lazy(() => import('@/features/auth/RegisterPage'));
const Forgot = lazy(() => import('@/features/auth/ForgotPasswordPage'));
const Dashboard = lazy(() => import('@/features/dashboard/DashboardPage'));
const Profile = lazy(() => import('@/features/profile/ProfilePage'));
const CvBuilder = lazy(() => import('@/features/cv/CvBuilderPage'));
const MyCvs = lazy(() => import('@/features/cv/MyCvsPage'));
const JobMatch = lazy(() => import('@/features/match/JobMatchPage'));
const MatchReport = lazy(() => import('@/features/match/MatchReportPage'));
const Tailor = lazy(() => import('@/features/match/TailorPage'));
const Applications = lazy(() => import('@/features/applications/ApplicationsPage'));
const AddApplication = lazy(() => import('@/features/applications/AddApplicationPage'));
const ApplicationDetail = lazy(() => import('@/features/applications/ApplicationDetailPage'));
const Settings = lazy(() => import('@/features/settings/SettingsPage'));

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const loc = useLocation();
  if (status === 'loading') return <PageLoader />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') return <PageLoader />;
  if (status === 'authenticated') return <Navigate to="/app" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/login"
          element={
            <GuestOnly>
              <Login />
            </GuestOnly>
          }
        />
        <Route
          path="/register"
          element={
            <GuestOnly>
              <Register />
            </GuestOnly>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <GuestOnly>
              <Forgot />
            </GuestOnly>
          }
        />
        {/* Focused, full-width match report: its own layout (no sidebar), same auth guard. */}
        <Route
          path="/app/match/:matchId"
          element={
            <RequireAuth>
              <ReportLayout />
            </RequireAuth>
          }
        >
          <Route index element={<MatchReport />} />
        </Route>
        <Route
          path="/app"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="profile" element={<Profile />} />
          <Route path="cv-builder" element={<CvBuilder />} />
          <Route path="cv-builder/:cvId" element={<CvBuilder />} />
          <Route path="cvs" element={<MyCvs />} />
          <Route path="match" element={<JobMatch />} />
          <Route path="match/:matchId/tailor" element={<Tailor />} />
          <Route path="tailor/:draftId" element={<Tailor />} />
          <Route path="applications" element={<Applications />} />
          <Route path="applications/new" element={<AddApplication />} />
          <Route path="applications/:id" element={<ApplicationDetail />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
