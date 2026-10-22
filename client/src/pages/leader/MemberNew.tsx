import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { DuplicateMemberWarning } from '../../components/members/DuplicateMemberWarning';
import { Button, Card, Field, Input } from '../../components/ui';
import { createMember, getDuplicateMemberMatches } from '../../lib/api';
import type { DuplicateMemberMatch } from '../../lib/api';

export default function LeaderMemberNew() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', address: '' });
  const [error, setError] = useState('');
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateMemberMatch[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setDuplicateMatches([]);
      setForm((f) => ({ ...f, [field]: e.target.value }));
    };
  }

  async function submit(allowDuplicate = false) {
    setError('');
    setSubmitting(true);
    try {
      const member = await createMember({ ...form, allowDuplicate });
      navigate(`/leader/members/${member.id}`);
    } catch (err) {
      const matches = getDuplicateMemberMatches(err);
      if (matches.length > 0) setDuplicateMatches(matches);
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not add member.';
      if (matches.length === 0) setError(message);
      setSubmitting(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void submit();
  }

  return (
    <AppShell title="Add member" subtitle="Someone in your care" back={{ to: '/leader/members', label: 'My Members' }}>
      <Card className="max-w-lg p-7">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="First name">
              <Input value={form.firstName} onChange={set('firstName')} required />
            </Field>
            <Field label="Last name">
              <Input value={form.lastName} onChange={set('lastName')} required />
            </Field>
          </div>
          <Field label="Phone" hint="Optional">
            <Input value={form.phone} onChange={set('phone')} />
          </Field>
          <Field label="Email" hint="Optional">
            <Input type="email" value={form.email} onChange={set('email')} />
          </Field>
          <Field label="Address" hint="Optional">
            <Input value={form.address} onChange={set('address')} />
          </Field>

          {error && <p className="text-body text-concern">{error}</p>}
          {duplicateMatches.length > 0 && (
            <DuplicateMemberWarning
              matches={duplicateMatches}
              profilePath={(id) => `/leader/members/${id}`}
              isSubmitting={submitting}
              onCreateAnyway={() => void submit(true)}
            />
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => navigate('/leader/members')}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Adding…' : 'Add member'}
            </Button>
          </div>
        </form>
      </Card>
    </AppShell>
  );
}
