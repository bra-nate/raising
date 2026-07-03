import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { RequireRole } from './components/RequireRole';
import { useAuth } from './hooks/useAuth';
import { homePathForRole } from './lib/roles';
import Login from './pages/Login';
import PastorDashboard from './pages/pastor/Dashboard';
import PastorUsers from './pages/pastor/Users';
import LeaderDashboard from './pages/leader/Dashboard';
import FollowUpDashboard from './pages/followup/Dashboard';

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
              path="/pastor/users"
              element={
                <RequireRole roles={['pastor']}>
                  <PastorUsers />
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

            {/* Follow-up team */}
            <Route
              path="/followup"
              element={
                <RequireRole roles={['followup_team_lead', 'followup_team_member']}>
                  <FollowUpDashboard />
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
