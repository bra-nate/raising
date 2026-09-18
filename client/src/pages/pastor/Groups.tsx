import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { Badge, Button, Card, Field, Input, Modal, Select, SkeletonRows } from '../../components/ui';
import { IconPlus } from '../../components/ui/icons';
import {
  createGroup,
  deleteGroup,
  listGroups,
  listUsers,
  moveGroupMembers,
  updateGroup,
} from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import type { Group, User } from '../../types';

export default function Groups() {
  const { user } = useAuth();
  // A superadmin may see the structure; only the pastor may change it.
  const mayEdit = user?.role === 'pastor';
  const [groups, setGroups] = useState<Group[]>([]);
  const [leaders, setLeaders] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Group | null>(null);
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState<Group | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [g, u] = await Promise.all([listGroups(), listUsers()]);
      setGroups(g.data);
      setLeaders(u.data.filter((x) => x.role === 'leader' && x.isActive));
      setError('');
    } catch {
      setError('Could not load groups.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleDelete(g: Group) {
    if (!confirm(`Delete ${g.name}? This cannot be undone.`)) return;
    try {
      await deleteGroup(g.id);
      await refresh();
    } catch (err) {
      alert(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Could not delete this group.'
      );
    }
  }

  return (
    <AppShell
      title="Groups"
      subtitle={loading ? undefined : `${groups.length} group${groups.length === 1 ? '' : 's'}`}
      back={{ to: mayEdit ? '/pastor' : '/admin', label: 'Dashboard' }}
      actions={
        mayEdit ? (
          <Button variant="primary" onClick={() => setCreating(true)}>
            <IconPlus className="h-4 w-4" />
            New group
          </Button>
        ) : undefined
      }
    >
      {loading ? (
        <SkeletonRows rows={4} className="p-0" />
      ) : error ? (
        <p className="text-body text-concern">{error}</p>
      ) : groups.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-body font-medium text-ink-2">No groups yet</p>
          <p className="mt-1 text-caption text-faint">
            Groups let you see care risk by congregation structure rather than by leader alone.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <Card key={g.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-body font-semibold text-ink-2">{g.name}</h2>
                {g.openCaseCount > 0 && <Badge tone="concern">{g.openCaseCount} open</Badge>}
              </div>
              <p className="mt-1 text-caption text-faint">{g.leader?.fullName ?? 'No leader'}</p>

              <dl className="mt-4 space-y-1.5 text-body">
                <Row label="Members" value={g.memberCount} />
                <Row label="Silent" value={g.silentCount} tone={g.silentCount > 0 ? 'attention' : undefined} />
                <Row label="Open cases" value={g.openCaseCount} tone={g.openCaseCount > 0 ? 'concern' : undefined} />
              </dl>

              <div className={`mt-auto flex flex-wrap gap-3 ${mayEdit ? 'pt-4' : ''}`}>
                {!mayEdit ? null : (
                <button
                  onClick={() => setEditing(g)}
                  className="text-caption font-medium text-accent transition hover:underline"
                >
                  Edit
                </button>
                )}
                {!mayEdit ? null : g.memberCount > 0 ? (
                  <button
                    onClick={() => setMoving(g)}
                    className="text-caption font-medium text-muted transition hover:text-ink-2 hover:underline"
                  >
                    Move members
                  </button>
                ) : (
                  <button
                    onClick={() => handleDelete(g)}
                    className="text-caption font-medium text-concern transition hover:underline"
                  >
                    Delete
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <GroupModal
        open={creating || editing !== null}
        group={editing}
        leaders={leaders}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onDone={() => {
          setCreating(false);
          setEditing(null);
          refresh();
        }}
      />

      <MoveModal
        group={moving}
        groups={groups}
        onClose={() => setMoving(null)}
        onDone={() => {
          setMoving(null);
          refresh();
        }}
      />
    </AppShell>
  );
}

function Row({ label, value, tone }: { label: string; value: number; tone?: 'attention' | 'concern' }) {
  const colour = tone === 'concern' ? 'text-concern' : tone === 'attention' ? 'text-attention' : 'text-ink-2';
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={`font-medium ${colour}`}>{value}</dd>
    </div>
  );
}

function GroupModal({
  open,
  group,
  leaders,
  onClose,
  onDone,
}: {
  open: boolean;
  group: Group | null;
  leaders: User[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [leaderId, setLeaderId] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setName(group?.name ?? '');
    setLeaderId(group?.leaderId ?? leaders[0]?.id ?? '');
    setError('');
  }, [group, leaders, open]);

  const leaderChanged = group !== null && leaderId !== group.leaderId;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (group) await updateGroup(group.id, { name, leaderId });
      else await createGroup({ name, leaderId });
      onDone();
    } catch (err) {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Could not save this group.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={group ? 'Edit group' : 'New group'}
      description={group ? undefined : 'A group belongs to one leader.'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field
          label="Leader"
          hint={
            leaderChanged
              ? `Every member of this group will be reassigned to the new leader.`
              : undefined
          }
        >
          <Select value={leaderId} onChange={(e) => setLeaderId(e.target.value)} required>
            {leaders.map((l) => (
              <option key={l.id} value={l.id}>
                {l.fullName}
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
            {submitting ? 'Saving…' : group ? 'Save group' : 'Create group'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function MoveModal({
  group,
  groups,
  onClose,
  onDone,
}: {
  group: Group | null;
  groups: Group[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setTarget('');
    setError('');
  }, [group]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!group) return;
    setError('');
    setSubmitting(true);
    try {
      await moveGroupMembers(group.id, target || null);
      onDone();
    } catch (err) {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Could not move these members.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={group !== null}
      onClose={onClose}
      title={`Move members out of ${group?.name ?? ''}`}
      description="Members moved into another group are reassigned to that group's leader. Ungrouping leaves their leader unchanged."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Move to">
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">No group</option>
            {groups
              .filter((g) => g.id !== group?.id)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
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
            {submitting ? 'Moving…' : `Move ${group?.memberCount ?? 0} member(s)`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
