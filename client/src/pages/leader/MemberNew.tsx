import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Button, Card, Field, Input } from '../../components/ui';
import { createMember } from '../../lib/api';

export default function LeaderMemberNew() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', address: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const member = await createMember(form);
      navigate(`/leader/members/${member.id}`);
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not add member.';
      setError(message);
      setSubmitting(false);
    }
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
