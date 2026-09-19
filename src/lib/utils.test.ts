import { describe, expect, it } from 'vitest';
import { formatNumber } from './utils';

describe('formatNumber', () => {
  it('renders counts using clear Latin digits', () => {
    expect(formatNumber(8)).toBe('8');
    expect(formatNumber(1_234)).toBe('1,234');
  });
});
