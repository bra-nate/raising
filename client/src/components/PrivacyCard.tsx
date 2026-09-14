import { FormEvent, useState } from 'react';
import { Button, Card, Field, Input } from './ui';
import { exportPersonCsv, exportPersonData, setLegalBasis } from '../lib/api';

interface PrivacyCardProps {
  type: 'member' | 'first_timer';
  id: string;
  name: string;
  legalBasis?: string | null;
  consentNote?: string | null;
  onSaved?: () => void;
}

/**
 * Why this person's data is held, and the button that answers a subject access
 * request. Both live on the profile because that is where the question is asked.
 */
export function PrivacyCard({ type, id, name, legalBasis, consentNote, onSaved }: PrivacyCardProps) {
  const [basis, setBasis] = useState(legalBasis ?? '');
  const [note, setNote] = useState(consentNote ?? '');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');

  const dirty = basis !== (legalBasis ?? '') || note !== (consentNote ?? '');

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await setLegalBasis(type, id, { legalBasis: basis, consentNote: note });
      setMessage('Saved.');
      onSaved?.();
    } catch {
      setMessage('Could not save.');
    } finally {
      setSaving(false);
    }
  }

  function download(blob: Blob, extension: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '-').toLowerCase()}-data.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleExport(format: 'json' | 'csv') {
    setExporting(true);
    setMessage('');
    try {
      if (format === 'csv') {
        download(await exportPersonCsv(type, id), 'csv');
      } else {
        const data = await exportPersonData(type, id);
        download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'json');
      }
    } catch {
      setMessage('Could not export this record.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="text-caption uppercase tracking-wide text-faint">Privacy</h2>

      <form onSubmit={handleSave} className="mt-4 space-y-3">
        <Field label="Legal basis" hint="Why this record is held — e.g. legitimate interest, consent.">
          <Input value={basis} onChange={(e) => setBasis(e.target.value)} />
        </Field>
        <Field label="Consent note" hint="Optional — how and when consent was given.">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="secondary" disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <span className="text-caption text-faint">
            Export everything held:
            <button
              type="button"
              onClick={() => handleExport('csv')}
              disabled={exporting}
              className="ml-2 font-medium text-accent transition hover:underline disabled:opacity-50"
            >
              CSV
            </button>
            <button
              type="button"
              onClick={() => handleExport('json')}
              disabled={exporting}
              className="ml-2 font-medium text-accent transition hover:underline disabled:opacity-50"
            >
              JSON
            </button>
          </span>
          {message && <span className="text-caption text-faint">{message}</span>}
        </div>
      </form>
    </Card>
  );
}
