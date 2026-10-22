import { describe, expect, it } from 'vitest';
import { parseCsv } from './firstTimers';

describe('parseCsv', () => {
  it('parses quoted commas and escaped quotes without losing optional fields', () => {
    const result = parseCsv(
      'firstName,lastName,phone,email\n"Ama, Jr.","O""Neil",0240000000,ama@example.com'
    );

    expect(result).toEqual({
      rows: [
        {
          firstName: 'Ama, Jr.',
          lastName: 'O"Neil',
          phone: '0240000000',
          email: 'ama@example.com',
        },
      ],
      errors: [],
    });
  });

  it('keeps valid rows and reports malformed rows by their visible row number', () => {
    const result = parseCsv('firstName,lastName\nAma,Mensah\n,Missing\nKojo,Owusu');

    expect(result.rows.map((row) => row.firstName)).toEqual(['Ama', 'Kojo']);
    expect(result.errors).toEqual(['Row 2: missing first or last name — skipped.']);
  });

  it('rejects a file without the required name columns', () => {
    expect(parseCsv('name,email\nAma,ama@example.com')).toEqual({
      rows: [],
      errors: ['CSV header must include firstName and lastName columns.'],
    });
  });
});
