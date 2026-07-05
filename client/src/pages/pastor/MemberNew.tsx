import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Button, Card, Field, Input, Select } from '../../components/ui';
import { createMember, listUsers } from '../../lib/api';
import type { User } from '../../types';

export default function PastorMemberNew() {
  const navigate = useNavigate();
  const [leaders, setLeaders] = useState<User[]>([]);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    address: '',
    assignedLeaderId: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listUsers()
      .then(({ data }) => setLeaders(data.filter((u) => u.role === 'leader' && u.isActive)))
      .catch(() => setError('Could not load leaders.'));
  }, []);

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.assignedLeaderId) {
      setError('Please assign this member to a leader.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const member = await createMember(form);
      navigate(`/pastor/members/${member.id}`);
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not add member.';
      setError(message);
      setSubmitting(false);
    }
  }

  return (
    <AppShell title="Add member" subtitle="Assign to any leader" back={{ to: '/pastor/members', label: 'Members' }}>
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
          <Field label="Assigned leader">
            <Select value={form.assignedLeaderId} onChange={set('assignedLeaderId')} required>
              <option value="">Select a leader…</option>
              {leaders.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.fullName}
                </option>
              ))}
            </Select>
          </Field>
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
            <Button type="button" variant="secondary" onClick={() => navigate('/pastor/members')}>
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
