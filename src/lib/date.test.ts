import { describe, expect, it } from 'vitest';
import { formatAppDate, formatAppDateTime, formatDateInputValue } from './date';

describe('application date formatting', () => {
  it('formats stored date-only values without changing their calendar day', () => {
    expect(formatDateInputValue('2026-09-12')).toBe('12/09/2026');
    expect(formatAppDate('2026-09-12')).toBe('12/09/2026');
  });

  it('formats timestamps in the Asia/Dhaka timezone', () => {
    expect(formatAppDateTime('2026-09-11T20:30:00.000Z')).toBe('12/09/2026, 02:30 AM');
  });

  it('does not display invalid or empty values', () => {
    expect(formatDateInputValue('')).toBe('');
    expect(formatAppDate('not-a-date')).toBe('');
  });
});
