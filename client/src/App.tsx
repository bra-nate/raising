import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { RequireRole } from './components/RequireRole';
import { useAuth } from './hooks/useAuth';
import { homePathForRole } from './lib/roles';
import Login from './pages/Login';
import PastorDashboard from './pages/pastor/Dashboard';
import PastorUsers from './pages/pastor/Users';
import PastorMembers from './pages/pastor/Members';
import PastorMemberNew from './pages/pastor/MemberNew';
import PastorMemberProfile from './pages/pastor/MemberProfile';
import PastorFirstTimers from './pages/pastor/FirstTimers';
import PastorFirstTimerProfile from './pages/pastor/FirstTimerProfile';
import AdminDashboard from './pages/admin/Dashboard';
import AdminLogs from './pages/admin/Logs';
import AdminSettings from './pages/admin/Settings';
import LeaderDashboard from './pages/leader/Dashboard';
import LeaderMembers from './pages/leader/Members';
import LeaderMemberNew from './pages/leader/MemberNew';
import LeaderMemberProfile from './pages/leader/MemberProfile';
import FollowUpDashboard from './pages/followup/Dashboard';
import FollowUpFirstTimers from './pages/followup/FirstTimers';
import FollowUpFirstTimerProfile from './pages/followup/FirstTimerProfile';

// Send authenticated users to their role home; everyone else to login.
function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center bg-canvas text-faint">Loading…</div>;
  return <Navigate to={user ? homePathForRole(user.role) : '/login'} replace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />

            {/* Pastor */}
            <Route
              path="/pastor"
              element={
                <RequireRole roles={['pastor']}>
                  <PastorDashboard />
                </RequireRole>
              }
            />
            <Route
              path="/pastor/members"
              element={
                <RequireRole roles={['pastor']}>
                  <PastorMembers />
                </RequireRole>
              }
            />
            <Route
              path="/pastor/members/new"
              element={
                <RequireRole roles={['pastor']}>
                  <PastorMemberNew />
                </RequireRole>
              }
            />
            <Route
              path="/pastor/members/:id"
              element={
                <RequireRole roles={['pastor']}>
                  <PastorMemberProfile />
                </RequireRole>
              }
            />
            <Route
              path="/pastor/first-timers"
              element={
                <RequireRole roles={['pastor']}>
                  <PastorFirstTimers />
                </RequireRole>
              }
            />
            <Route
              path="/pastor/first-timers/:id"
              element={
                <RequireRole roles={['pastor']}>
                  <PastorFirstTimerProfile />
                </RequireRole>
              }
            />
            <Route
              path="/pastor/users"
              element={
                <RequireRole roles={['pastor']}>
                  <PastorUsers />
                </RequireRole>
              }
            />
            <Route
              path="/pastor/logs"
              element={
                <RequireRole roles={['pastor']}>
                  <AdminLogs />
                </RequireRole>
              }
            />
            <Route
              path="/pastor/settings"
              element={
                <RequireRole roles={['pastor']}>
                  <AdminSettings />
                </RequireRole>
              }
            />

            {/* Superadmin */}
            <Route
              path="/admin"
              element={
                <RequireRole roles={['superadmin']}>
                  <AdminDashboard />
                </RequireRole>
              }
            />
            <Route
              path="/admin/users"
              element={
                <RequireRole roles={['superadmin']}>
                  <PastorUsers />
                </RequireRole>
              }
            />
            <Route
              path="/admin/logs"
              element={
                <RequireRole roles={['superadmin']}>
                  <AdminLogs />
                </RequireRole>
              }
            />
            <Route
              path="/admin/settings"
              element={
                <RequireRole roles={['superadmin']}>
                  <AdminSettings />
                </RequireRole>
              }
            />

            {/* Leader */}
            <Route
              path="/leader"
              element={
                <RequireRole roles={['leader']}>
                  <LeaderDashboard />
                </RequireRole>
              }
            />
            <Route
              path="/leader/members"
              element={
                <RequireRole roles={['leader']}>
                  <LeaderMembers />
                </RequireRole>
              }
            />
            <Route
              path="/leader/members/new"
              element={
                <RequireRole roles={['leader']}>
                  <LeaderMemberNew />
                </RequireRole>
              }
            />
            <Route
              path="/leader/members/:id"
              element={
                <RequireRole roles={['leader']}>
                  <LeaderMemberProfile />
                </RequireRole>
              }
            />

            {/* Follow-up team */}
            <Route
              path="/followup"
              element={
                <RequireRole roles={['followup_team_lead', 'followup_team_member']}>
                  <FollowUpDashboard />
                </RequireRole>
              }
            />
            <Route
              path="/followup/first-timers"
              element={
                <RequireRole roles={['followup_team_lead', 'followup_team_member']}>
                  <FollowUpFirstTimers />
                </RequireRole>
              }
            />
            <Route
              path="/followup/first-timers/:id"
              element={
                <RequireRole roles={['followup_team_lead', 'followup_team_member']}>
                  <FollowUpFirstTimerProfile />
                </RequireRole>
              }
            />

            {/* Root and unknown paths route by auth state. */}
            <Route path="/" element={<RootRedirect />} />
            <Route path="*" element={<RootRedirect />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
