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
  options?: Array<{ value: string; label: string }>;
}> = [
  { key: 'reportThresholdDays', label: 'Report threshold (days)', help: 'Days before a member is flagged as unreported.', type: 'number' },
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
  },
  {
    key: 'concernDueDays',
    label: 'Concern case due (days)',
    help: 'How long a concern case has before it counts as overdue.',
    type: 'number',
  },
  {
    key: 'firstContactDays',
    label: 'First contact window (days)',
    help: 'How long after a visit a first-timer may wait for their first call.',
    type: 'number',
  },
  {
    key: 'retentionMonths',
    label: 'Retention (months)',
    help: 'Months of inactivity before a closed record is flagged for review. 0 retains indefinitely.',
    type: 'number',
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

  useEffect(() => {
    getSettings()
      .then(setValues)
      .catch(() => setError('Could not load settings.'))
      .finally(() => setLoading(false));
  }, []);

  async function save(key: string, value: string) {
    setSavingKey(key);
    setValues((v) => ({ ...v, [key]: value }));
    try {
      await updateSetting(key, value);
    } catch {
      setError(`Could not save ${key}.`);
    } finally {
      setSavingKey(null);
    }
  }

  const home = user ? homePathForRole(user.role) : '/';

  return (
    <AppShell title="Settings" back={{ to: home, label: 'Dashboard' }}>
      {error && <p className="mb-4 text-body text-concern">{error}</p>}
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
