import { describe, expect, it } from 'vitest';
import { formatBanglaNumber } from './utils';

describe('formatBanglaNumber', () => {
  it('renders counts using Bangla digits', () => {
    expect(formatBanglaNumber(8)).toBe('৮');
    expect(formatBanglaNumber(1_234)).toBe('১,২৩৪');
  });
});
