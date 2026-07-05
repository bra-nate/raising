import type { FirstTimerStatus } from '../types';
import type { BatchUploadRow } from './api';

export const ftStatusMeta: Record<
  FirstTimerStatus,
  { label: string; tone: 'neutral' | 'info' | 'good' | 'attention' | 'concern' }
> = {
  pending: { label: 'Pending', tone: 'attention' },
  contacted: { label: 'Contacted', tone: 'info' },
  interested: { label: 'Interested', tone: 'good' },
  not_interested: { label: 'Not interested', tone: 'concern' },
  converted: { label: 'Converted', tone: 'good' },
};

export const callOutcomeLabels: Record<string, string> = {
  answered: 'Answered',
  no_answer: 'No answer',
  callback_requested: 'Callback requested',
  interested: 'Interested',
  not_interested: 'Not interested',
};

// Minimal CSV parser: header row maps columns firstName,lastName,phone,email.
// Handles quoted cells with embedded commas/quotes. Blank lines skipped.
export function parseCsv(text: string): { rows: BatchUploadRow[]; errors: string[] } {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    errors.push('CSV needs a header row and at least one data row.');
    return { rows: [], errors };
  }
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  };
  const header = parseLine(lines[0]).map((h) => h.toLowerCase());
  const idx = {
    firstName: header.indexOf('firstname'),
    lastName: header.indexOf('lastname'),
    phone: header.indexOf('phone'),
    email: header.indexOf('email'),
  };
  if (idx.firstName === -1 || idx.lastName === -1) {
    errors.push('CSV header must include firstName and lastName columns.');
    return { rows: [], errors };
  }
  const rows: BatchUploadRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    const firstName = cells[idx.firstName] ?? '';
    const lastName = cells[idx.lastName] ?? '';
    if (!firstName || !lastName) {
      errors.push(`Row ${i}: missing first or last name — skipped.`);
      continue;
    }
    rows.push({
      firstName,
      lastName,
      phone: idx.phone >= 0 ? cells[idx.phone] || undefined : undefined,
      email: idx.email >= 0 ? cells[idx.email] || undefined : undefined,
    });
  }
  return { rows, errors };
}
