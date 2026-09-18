import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, Field, Input, Modal, Select, SkeletonRows } from '../ui';
import { acknowledgeCase, assignCase, listCases, resolveCase, updateCase } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { fullName, relativeDate } from '../../lib/utils';
import type { CareCase } from '../../types';

const kindMeta = {
  safety: { label: 'Safety', tone: 'concern' as const },
  concern: { label: 'Concern', tone: 'attention' as const },
};

function isOverdue(c: CareCase): boolean {
  return c.status !== 'resolved' && !!c.dueDate && new Date(c.dueDate).getTime() < Date.now();
}

interface CasesPanelProps {
  /** Scope to one member (used on the member profile). Omit for the dashboard queue. */
  memberId?: string;
  title?: string;
  emptyText?: string;
  className?: string;
}

export function CasesPanel({
  memberId,
  title = 'Open cases',
  emptyText = 'No open cases. Nothing is waiting on anyone.',
  className = 'p-5',
}: CasesPanelProps) {
  const { user } = useAuth();
  const [cases, setCases] = useState<CareCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resolving, setResolving] = useState<CareCase | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { data } = await listCases(memberId ? { memberId } : {});
      setCases(data);
      setError('');
    } catch {
      setError('Could not load cases.');
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Safeguarding cases are pastor business — the server enforces this, the UI
  // just avoids offering a button that would 403.
  const mayAct = (c: CareCase) => c.kind === 'concern' || user?.role === 'pastor';

  async function handleAcknowledge(c: CareCase) {
    try {
      await acknowledgeCase(c.id);
      await refresh();
    } catch {
      alert('Could not acknowledge this case.');
    }
  }

  async function handleAssign(c: CareCase, ownerId: string) {
    try {
      await assignCase(c.id, ownerId);
      await refresh();
    } catch (err) {
      alert(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Could not assign this case.'
      );
    }
  }

  async function handleDueDate(c: CareCase, dueDate: string) {
    try {
      await updateCase(c.id, { dueDate: new Date(dueDate).toISOString() });
      await refresh();
    } catch {
      alert('Could not change the due date.');
    }
  }

  return (
    <Card className={className}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-body font-semibold text-ink-2">{title}</h2>
        {!loading && cases.length > 0 && (
          <span className="text-caption text-faint">
            {cases.length} open · {cases.filter(isOverdue).length} overdue
          </span>
        )}
      </div>

      {loading ? (
        <SkeletonRows rows={3} className="p-0" />
      ) : error ? (
        <p className="text-body text-concern">{error}</p>
      ) : cases.length === 0 ? (
        <p className="text-body text-faint">{emptyText}</p>
      ) : (
        <ul className="space-y-3">
          {cases.map((c) => (
            <li key={c.id} className="rounded-card border border-hairline px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={kindMeta[c.kind].tone}>{kindMeta[c.kind].label}</Badge>
                {c.status === 'acknowledged' && <Badge tone="neutral">Acknowledged</Badge>}
                {isOverdue(c) && <Badge tone="concern">Overdue</Badge>}
                {!memberId && c.member && (
                  <Link
                    to={`/${user?.role === 'leader' ? 'leader' : 'pastor'}/members/${c.memberId}`}
                    className="text-body font-medium text-ink-2 hover:text-accent hover:underline"
                  >
                    {fullName(c.member)}
                  </Link>
                )}
              </div>

              <p className="mt-1.5 text-caption text-faint">
                Raised {relativeDate(c.createdAt)}
                {c.reportCount > 1 && ` · ${c.reportCount} reports`}
                {c.owner ? ` · ${c.owner.fullName}` : ' · unassigned'}
              </p>

              {c.actionPlan && <p className="mt-2 text-body text-muted">{c.actionPlan}</p>}

              {mayAct(c) && (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={c.ownerId ?? ''}
                      onChange={(e) => handleAssign(c, e.target.value)}
                      aria-label={`Owner for ${c.member ? fullName(c.member) : 'this case'}`}
                      disabled={!c.assignableOwners || c.assignableOwners.length === 0}
                    >
                      <option value="" disabled>
                        Unassigned
                      </option>
                      {(c.assignableOwners ?? []).map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.fullName}
                        </option>
                      ))}
                    </Select>
                    <Input
                      type="date"
                      value={c.dueDate ? c.dueDate.slice(0, 10) : ''}
                      onChange={(e) => e.target.value && handleDueDate(c, e.target.value)}
                      aria-label="Due date"
                      className="max-w-[10rem]"
                    />
                  </div>
                  <div className="flex gap-3">
                    {c.status === 'open' && (
                      <button
                        onClick={() => handleAcknowledge(c)}
                        className="text-caption font-medium text-accent transition hover:underline"
                      >
                        Acknowledge
                      </button>
                    )}
                    <button
                      onClick={() => setResolving(c)}
                      className="text-caption font-medium text-muted transition hover:text-ink-2 hover:underline"
                    >
                      Resolve
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <ResolveModal
        target={resolving}
        onClose={() => setResolving(null)}
        onDone={() => {
          setResolving(null);
          refresh();
        }}
      />
    </Card>
  );
}

/** Closing a case requires saying how it was closed. The plan is optional; the note is not. */
function ResolveModal({
  target,
  onClose,
  onDone,
}: {
  target: CareCase | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState('');
  const [plan, setPlan] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setNote('');
    setPlan(target?.actionPlan ?? '');
    setError('');
  }, [target]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!target) return;
    setError('');
    setSubmitting(true);
    try {
      if (plan.trim() && plan.trim() !== (target.actionPlan ?? '')) {
        await updateCase(target.id, { actionPlan: plan.trim() });
      }
      await resolveCase(target.id, note);
      onDone();
    } catch (err) {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Could not resolve this case.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      title="Resolve case"
      description={
        target?.kind === 'safety'
          ? 'Safety cases stay on the record permanently. The note is the account of what was done.'
          : 'The note is kept with the case as the record of what was done.'
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="What was done" hint="Required.">
          <Input value={note} onChange={(e) => setNote(e.target.value)} required />
        </Field>
        <Field label="Action plan" hint="Optional — kept with the case.">
          <Input value={plan} onChange={(e) => setPlan(e.target.value)} />
        </Field>
        {error && <p className="text-body text-concern">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Resolving…' : 'Resolve case'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
