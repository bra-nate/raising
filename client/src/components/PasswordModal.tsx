import { FormEvent, useState } from 'react';
import { Button, Field, Input, Modal } from './ui';
import { changePassword, resetUserPassword, tokenStore } from '../lib/api';

interface PasswordModalProps {
  open: boolean;
  onClose: () => void;
  /** Present = pastor resetting someone else. Absent = signed-in user changing their own. */
  target?: { id: string; fullName: string };
  /** First login on a pastor-issued password: no way out but through. */
  forced?: boolean;
  onDone?: () => void;
}

export function PasswordModal({ open, onClose, target, forced, onDone }: PasswordModalProps) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function close() {
    if (forced) return;
    setCurrent('');
    setNext('');
    setConfirm('');
    setError('');
    setDone(false);
    onClose();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (next !== confirm) {
      setError('The two new passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      if (target) {
        await resetUserPassword(target.id, next);
      } else {
        // The returned token drops the password-gate claim the old one carries.
        const { token } = await changePassword(current, next);
        if (token) tokenStore.set(token);
      }
      setDone(true);
      onDone?.();
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Could not update the password.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <Modal
        open={open}
        onClose={close}
        title={target ? 'Password reset' : 'Password changed'}
        description={
          target
            ? `Share the new password with ${target.fullName} directly. They can change it from their own account.`
            : 'Your password has been updated.'
        }
      >
        <div className="flex justify-end">
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={target ? `Reset password — ${target.fullName}` : forced ? 'Choose your password' : 'Change password'}
      description={
        target
          ? 'Sets a new temporary password. This action is recorded in the activity log.'
          : forced
            ? 'This account is on a password someone else set. Choose your own to continue.'
            : undefined
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {!target && (
          <Field label="Current password">
            <Input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </Field>
        )}
        <Field label={target ? 'Temporary password' : 'New password'} hint="At least 8 characters.">
          <Input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            minLength={8}
            required
          />
        </Field>
        <Field label="Confirm">
          <Input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
            required
          />
        </Field>
        {error && <p className="text-body text-concern">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          {!forced && (
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
          )}
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Saving…' : target ? 'Reset password' : 'Change password'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
