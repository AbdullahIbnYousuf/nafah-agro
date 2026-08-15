import { describe, expect, it } from 'vitest';
import {
  packSizeAdminLabel,
  packSizeCustomerLabel,
  productPackLabel,
  visiblePackSize,
} from './productOptions';

describe('product pack/size presentation', () => {
  it('hides the internal default option name', () => {
    expect(visiblePackSize('Default')).toBeNull();
    expect(productPackLabel('Raw Honey', 'Default')).toBe('Raw Honey');
    expect(packSizeCustomerLabel('Default')).toBe('সাধারণ');
    expect(packSizeAdminLabel('Default')).toBe('প্যাক/সাইজ দেওয়া হয়নি');
  });

  it('shows meaningful pack/size names', () => {
    expect(visiblePackSize(' 500 g ')).toBe('500 g');
    expect(productPackLabel('Raw Honey', '500 g')).toBe('Raw Honey · 500 g');
  });
});
