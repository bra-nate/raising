import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { Badge, Button, Field, Input, Modal, Select } from '../../components/ui';
import { IconPlus } from '../../components/ui/icons';
import { createUser, deactivateUser, listUsers } from '../../lib/api';
import { roleLabels } from '../../lib/roles';
import { useAuth } from '../../hooks/useAuth';
import type { User, UserRole } from '../../types';

const CREATABLE_ROLES: UserRole[] = ['leader', 'followup_team_lead', 'followup_team_member', 'pastor'];

export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const { data } = await listUsers();
      setUsers(data);
    } catch {
      setError('Could not load users.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleDeactivate(u: User) {
    if (!confirm(`Deactivate ${u.fullName}? They will no longer be able to sign in.`)) return;
    try {
      await deactivateUser(u.id);
      await refresh();
    } catch {
      alert('Could not deactivate this user.');
    }
  }

  const activeCount = users.filter((u) => u.isActive).length;

  return (
    <AppShell
      title="User Management"
      subtitle={loading ? undefined : `${activeCount} active · ${users.length} total`}
      back={{ to: '/pastor', label: 'Dashboard' }}
      actions={
        <Button variant="primary" onClick={() => setModalOpen(true)}>
          <IconPlus className="h-4 w-4" />
          New user
        </Button>
      }
    >
      <div className="overflow-hidden rounded-card border border-hairline bg-surface shadow-card">
        {loading ? (
          <div className="p-8 text-body text-faint">Loading…</div>
        ) : error ? (
          <div className="p-8 text-body text-concern">{error}</div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-body font-medium text-ink-2">No users yet</p>
            <p className="mt-1 text-caption text-faint">Create your first leader or follow-up account.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-hairline text-caption uppercase tracking-wide text-faint">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-hairline last:border-0 transition hover:bg-surface-2">
                    <td className="px-5 py-3">
                      <span className="text-body font-medium text-ink-2">{u.fullName}</span>
                      {u.id === me?.id && <span className="ml-2 text-caption text-faint">you</span>}
                    </td>
                    <td className="px-5 py-3 text-body text-muted">{u.email}</td>
                    <td className="px-5 py-3 text-body text-slateink">{roleLabels[u.role]}</td>
                    <td className="px-5 py-3">
                      {u.isActive ? <Badge tone="good">Active</Badge> : <Badge tone="neutral">Inactive</Badge>}
                    </td>
                    <td className="px-5 py-3 font-mono text-caption text-faint">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {u.isActive && u.id !== me?.id && (
                        <button
                          onClick={() => handleDeactivate(u)}
                          className="text-caption font-medium text-concern transition hover:underline"
                        >
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateUserModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => {
          setModalOpen(false);
          refresh();
        }}
      />
    </AppShell>
  );
}

function CreateUserModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('leader');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setFullName('');
    setEmail('');
    setPassword('');
    setRole('leader');
    setError('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await createUser({ fullName, email, password, role });
      reset();
      onCreated();
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not create user.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create user" description="They can change their password after first sign-in.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full name">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </Field>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Temporary password" hint="At least 8 characters.">
          <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            {CREATABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabels[r]}
              </option>
            ))}
          </Select>
        </Field>
        {error && <p className="text-body text-concern">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create user'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
