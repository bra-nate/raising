import type { SilenceStatus, StatusTag } from '../types';

// ── Dates ─────────────────────────────────────
export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function relativeDate(iso?: string | null): string {
  if (!iso) return 'Never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? '' : 's'} ago`;
  return formatDate(iso);
}

// ── Silence (computed server-side; these only map to display) ──
type Tone = 'neutral' | 'good' | 'attention' | 'concern' | 'info';

export const silenceMeta: Record<SilenceStatus, { label: string; tone: Tone; dot: string }> = {
  ok: { label: 'On track', tone: 'good', dot: 'bg-good' },
  overdue: { label: 'Overdue', tone: 'attention', dot: 'bg-attention' },
  significant: { label: 'Significantly overdue', tone: 'concern', dot: 'bg-concern' },
};

// ── Status tags ───────────────────────────────
export const statusMeta: Record<StatusTag, { label: string; tone: Tone }> = {
  good: { label: 'Good', tone: 'good' },
  needs_attention: { label: 'Needs Attention', tone: 'attention' },
  concern: { label: 'Concern', tone: 'concern' },
};

export function fullName(m: { firstName: string; lastName: string }): string {
  return `${m.firstName} ${m.lastName}`;
}
