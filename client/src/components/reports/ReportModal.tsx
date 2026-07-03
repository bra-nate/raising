import { FormEvent, useState } from 'react';
import { Button, Field, Modal } from '../ui';
import { createMemberReport } from '../../lib/api';
import { statusMeta } from '../../lib/utils';
import type { StatusTag } from '../../types';

const STATUS_ORDER: StatusTag[] = ['good', 'needs_attention', 'concern'];

export function ReportModal({
  open,
  onClose,
  memberId,
  memberName,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  memberId: string;
  memberName: string;
  onSubmitted: () => void;
}) {
  const [statusTag, setStatusTag] = useState<StatusTag>('good');
  const [content, setContent] = useState('');
  const [isConfidential, setConfidential] = useState(false);
  const [isSafetyFlagged, setSafetyFlagged] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setStatusTag('good');
    setContent('');
    setConfidential(false);
    setSafetyFlagged(false);
    setError('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await createMemberReport({ memberId, statusTag, content, isConfidential, isSafetyFlagged });
      reset();
      onSubmitted();
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not submit report.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add report" description={memberName}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Status">
          <div className="grid grid-cols-3 gap-2">
            {STATUS_ORDER.map((s) => {
              const active = statusTag === s;
              return (
                <button
                  type="button"
                  key={s}
                  onClick={() => setStatusTag(s)}
                  className={`rounded-input border px-3 py-2 text-caption font-medium transition ${
                    active
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border bg-surface text-muted hover:bg-wash'
                  }`}
                >
                  {statusMeta[s].label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="What happened?">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            rows={5}
            className="w-full resize-y rounded-input border border-border bg-surface px-3.5 py-2.5 text-body text-ink-2 outline-none transition placeholder:text-faint focus:border-info focus:shadow-focus"
            placeholder="A short note on this member's spiritual and personal wellbeing…"
          />
        </Field>

        <label className="flex items-start gap-2.5 rounded-input border border-hairline bg-surface/60 px-3.5 py-2.5">
          <input
            type="checkbox"
            checked={isConfidential}
            onChange={(e) => setConfidential(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-accent"
          />
          <span>
            <span className="block text-body font-medium text-ink-2">Confidential</span>
            <span className="block text-caption text-faint">Only you and the pastor can read this report.</span>
          </span>
        </label>

        <label className="flex items-start gap-2.5 rounded-input border border-concern/30 bg-concern/5 px-3.5 py-2.5">
          <input
            type="checkbox"
            checked={isSafetyFlagged}
            onChange={(e) => setSafetyFlagged(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-concern"
          />
          <span>
            <span className="block text-body font-medium text-concern">Safety concern</span>
            <span className="block text-caption text-faint">
              Notifies the pastor immediately. This report can never be edited or deleted.
            </span>
          </span>
        </label>

        {error && <p className="text-body text-concern">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit report'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
