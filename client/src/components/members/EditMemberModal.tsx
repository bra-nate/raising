import { FormEvent, useEffect, useState } from 'react';
import { Button, Field, Input, Modal } from '../ui';
import { updateMember } from '../../lib/api';
import type { Member } from '../../types';

interface MemberFields {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
}

interface EditMemberModalProps {
  member: Member;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

function fieldsFrom(member: Member): MemberFields {
  return {
    firstName: member.firstName,
    lastName: member.lastName,
    phone: member.phone ?? '',
    email: member.email ?? '',
    address: member.address ?? '',
  };
}

export function EditMemberModal({ member, onClose, onSaved }: EditMemberModalProps) {
  const initial = fieldsFrom(member);
  const [fields, setFields] = useState(initial);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const isDirty = Object.keys(initial).some(
    (key) => fields[key as keyof MemberFields] !== initial[key as keyof MemberFields]
  );

  function set(field: keyof MemberFields) {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      setFields((current) => ({ ...current, [field]: event.target.value }));
    };
  }

  function handleClose() {
    if (isDirty && !window.confirm('Discard your unsaved member changes?')) return;
    onClose();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const changed = Object.fromEntries(
      Object.entries(fields).filter(([key, value]) => value !== initial[key as keyof MemberFields])
    );
    if (Object.keys(changed).length === 0) return;

    setError('');
    setIsSaving(true);
    try {
      await updateMember(member.id, changed);
      await onSaved();
    } catch (caught) {
      const message =
        (caught as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Could not save member changes.';
      setError(message);
      setIsSaving(false);
    }
  }

  useEffect(() => {
    if (!isDirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty]);

  return (
    <Modal open onClose={handleClose} title="Edit member" description="Update this member’s contact details.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="First name">
            <Input value={fields.firstName} onChange={set('firstName')} required />
          </Field>
          <Field label="Last name">
            <Input value={fields.lastName} onChange={set('lastName')} required />
          </Field>
        </div>
        <Field label="Phone" hint="Optional">
          <Input value={fields.phone} onChange={set('phone')} />
        </Field>
        <Field label="Email" hint="Optional">
          <Input type="email" value={fields.email} onChange={set('email')} />
        </Field>
        <Field label="Address" hint="Optional">
          <Input value={fields.address} onChange={set('address')} />
        </Field>
        {error && <p className="text-body text-concern" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!isDirty || isSaving}>
            {isSaving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
