import { useEffect, useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { Field, Input, Select, SkeletonRows } from '../../components/ui';
import { getSettings, updateSetting } from '../../lib/api';
import { homePathForRole } from '../../lib/roles';
import { useAuth } from '../../hooks/useAuth';

// Field definitions for the known, writable settings.
const FIELDS: Array<{
  key: string;
  label: string;
  help: string;
  type: 'number' | 'boolean' | 'select';
  min?: number;
  max?: number;
  options?: Array<{ value: string; label: string }>;
}> = [
  { key: 'reportThresholdDays', label: 'Report threshold (days)', help: 'Days before a member is flagged as unreported.', type: 'number', min: 1, max: 365 },
  { key: 'allowDeleteReports', label: 'Allow report deletion', help: 'Master toggle for redact/delete.', type: 'boolean' },
  {
    key: 'deletePermission',
    label: 'Who may delete',
    help: 'Applies when deletion is enabled.',
    type: 'select',
    options: [
      { value: 'pastor_only', label: 'Pastor only' },
      { value: 'leaders', label: 'Leaders' },
    ],
  },
  { key: 'notificationsEnabled', label: 'Notifications enabled', help: 'Master toggle for in-app notifications.', type: 'boolean' },
  {
    key: 'reportReminderDay',
    label: 'Report reminder day',
    help: 'Day of week leaders are reminded.',
    type: 'select',
    options: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => ({
      value: d,
      label: d.charAt(0).toUpperCase() + d.slice(1),
    })),
  },
  {
    key: 'safetyAckHours',
    label: 'Safety acknowledgement window (hours)',
    help: 'How long a safety case may sit unacknowledged before it escalates to the pastor.',
    type: 'number',
    min: 1,
    max: 168,
  },
  {
    key: 'concernDueDays',
    label: 'Concern case due (days)',
    help: 'How long a concern case has before it counts as overdue.',
    type: 'number',
    min: 1,
    max: 365,
  },
  {
    key: 'firstContactDays',
    label: 'First contact window (days)',
    help: 'How long after a visit a first-timer may wait for their first call.',
    type: 'number',
    min: 1,
    max: 90,
  },
  {
    key: 'retentionMonths',
    label: 'Retention (months)',
    help: 'Months of inactivity before a closed record is flagged for review. 0 retains indefinitely.',
    type: 'number',
    min: 0,
    max: 120,
  },
  {
    key: 'retentionMode',
    label: 'Retention action',
    help: 'Flagged records are always reported. Redaction, when enabled, is still a deliberate act.',
    type: 'select',
    options: [
      { value: 'report_only', label: 'Report only' },
      { value: 'report_and_redact', label: 'Allow redaction' },
    ],
  },
];

export default function Settings() {
  const { user } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    getSettings()
      .then(setValues)
      .catch(() => setError('Could not load settings.'))
      .finally(() => setLoading(false));
  }, []);

  async function save(key: string, value: string) {
    const previous = values[key] ?? '';
    setSavingKey(key);
    setError('');
    setStatus('');
    setValues((v) => ({ ...v, [key]: value }));
    try {
      await updateSetting(key, value);
      setStatus('Setting saved.');
    } catch {
      setValues((v) => ({ ...v, [key]: previous }));
      setError(`Could not save ${key}.`);
    } finally {
      setSavingKey(null);
    }
  }

  const home = user ? homePathForRole(user.role) : '/';

  return (
    <AppShell title="Settings" back={{ to: home, label: 'Dashboard' }}>
      <div aria-live="polite" aria-atomic="true">
        {error && <p className="mb-4 text-body text-concern">{error}</p>}
        {status && <p className="mb-4 text-body text-good">{status}</p>}
      </div>
      {loading ? (
        <SkeletonRows rows={4} className="p-0" />
      ) : (
        <div className="max-w-xl space-y-6 rounded-card border border-hairline bg-surface p-6 shadow-card">
          {FIELDS.map((f) => (
            <Field key={f.key} label={f.label} hint={f.help}>
              {f.type === 'boolean' ? (
                <Select
                  value={values[f.key] ?? 'false'}
                  onChange={(e) => save(f.key, e.target.value)}
                  disabled={savingKey === f.key}
                >
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </Select>
              ) : f.type === 'select' ? (
                <Select
                  value={values[f.key] ?? ''}
                  onChange={(e) => save(f.key, e.target.value)}
                  disabled={savingKey === f.key}
                >
                  {f.options!.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  type="number"
                  min={f.min}
                  max={f.max}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  onBlur={(e) => save(f.key, e.target.value)}
                  disabled={savingKey === f.key}
                />
              )}
            </Field>
          ))}
        </div>
      )}
    </AppShell>
  );
}
