import { AppShell } from '../../components/layout/AppShell';
import { RecentActivityPanel } from '../../components/dashboard/RecentActivityPanel';
import { useAuth } from '../../hooks/useAuth';

export default function AdminDashboard() {
  const { user } = useAuth();

  return (
    <AppShell title="Admin" subtitle={user ? `Signed in as ${user.fullName}` : undefined}>
      <div className="grid gap-6 lg:grid-cols-2">
        <RecentActivityPanel viewAllTo="/admin/logs" />
      </div>
    </AppShell>
  );
}
