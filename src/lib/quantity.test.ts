import { describe, expect, it } from 'vitest';
import {
  amountUnitsForKind,
  formatQuantity,
  quantityUnitForKind,
  toBaseQuantity,
} from './quantity';

describe('quantity display helpers', () => {
  it('uses the correct input and storage units for every product kind', () => {
    expect(amountUnitsForKind('PACKAGED')).toEqual(['PIECE']);
    expect(amountUnitsForKind('LOOSE_WEIGHT')).toEqual(['KG', 'G']);
    expect(amountUnitsForKind('LOOSE_VOLUME')).toEqual(['LITER', 'ML']);
    expect(amountUnitsForKind('EGG')).toEqual(['PIECE']);
    expect(quantityUnitForKind('LOOSE_WEIGHT')).toBe('GRAM');
    expect(quantityUnitForKind('LOOSE_VOLUME')).toBe('MILLILITER');
    expect(quantityUnitForKind('EGG')).toBe('PIECE');
  });

  it('converts measured input into exact base quantities', () => {
    expect(toBaseQuantity('1.25', 'KG')).toBe(1_250);
    expect(toBaseQuantity('250', 'G')).toBe(250);
    expect(toBaseQuantity('0.5', 'LITER')).toBe(500);
    expect(toBaseQuantity('500', 'ML')).toBe(500);
    expect(toBaseQuantity('0.0001', 'KG')).toBeNull();
  });

  it('formats stored base quantities in owner-friendly major units', () => {
    expect(formatQuantity(1_250, 'GRAM')).toContain('1.25 কেজি');
    expect(formatQuantity(500, 'MILLILITER')).toContain('0.5 লিটার');
    expect(formatQuantity(3, 'PIECE')).toContain('3 ইউনিট');
    expect(formatQuantity(15, 'PIECE', 'EGG')).toContain('15 টি ডিম');
  });
});
