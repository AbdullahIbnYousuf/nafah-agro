import type { AmountUnit, ProductKind, QuantityUnit } from './types';

const numberFormat = new Intl.NumberFormat('bn-BD', { maximumFractionDigits: 3 });

export function resolvedProductKind(kind?: ProductKind): ProductKind {
  return kind ?? 'PACKAGED';
}

export function quantityUnitForKind(kind?: ProductKind): QuantityUnit {
  if (kind === 'LOOSE_WEIGHT') return 'GRAM';
  if (kind === 'LOOSE_VOLUME') return 'MILLILITER';
  return 'PIECE';
}

export function amountUnitsForKind(kind?: ProductKind): AmountUnit[] {
  if (kind === 'LOOSE_WEIGHT') return ['KG', 'G'];
  if (kind === 'LOOSE_VOLUME') return ['LITER', 'ML'];
  return ['PIECE'];
}

export function defaultAmountUnit(kind?: ProductKind): AmountUnit {
  if (kind === 'LOOSE_WEIGHT') return 'KG';
  if (kind === 'LOOSE_VOLUME') return 'LITER';
  return 'PIECE';
}

export function toBaseQuantity(amount: string | number, unit: AmountUnit): number | null {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const base = numeric * (unit === 'KG' || unit === 'LITER' ? 1_000 : 1);
  return Number.isInteger(base) ? base : null;
}

export function majorQuantity(baseQuantity: number, unit: QuantityUnit = 'PIECE'): number {
  return unit === 'PIECE' ? baseQuantity : baseQuantity / 1_000;
}

export function formatQuantity(baseQuantity: number, unit: QuantityUnit = 'PIECE', kind?: ProductKind): string {
  const amount = majorQuantity(baseQuantity, unit);
  const label = unit === 'GRAM' ? 'কেজি' : unit === 'MILLILITER' ? 'লিটার' : kind === 'EGG' ? 'টি ডিম' : 'ইউনিট';
  return `${numberFormat.format(amount)} ${label}`;
}

export function formatMajorQuantity(amount: number, unit: 'PIECE' | 'KG' | 'LITER'): string {
  const label = unit === 'KG' ? 'কেজি' : unit === 'LITER' ? 'লিটার' : 'ইউনিট';
  return `${numberFormat.format(amount)} ${label}`;
}

export function rateLabel(kind?: ProductKind): string {
  if (kind === 'LOOSE_WEIGHT') return 'প্রতি কেজি';
  if (kind === 'LOOSE_VOLUME') return 'প্রতি লিটার';
  if (kind === 'EGG') return 'প্রতি ডিম';
  return 'প্রতি ইউনিট';
}

export function productKindLabel(kind?: ProductKind): string {
  if (kind === 'LOOSE_WEIGHT') return 'খোলা ওজন';
  if (kind === 'LOOSE_VOLUME') return 'খোলা তরল';
  if (kind === 'EGG') return 'ডিম';
  return 'প্যাকেট';
}

export const EGG_BULK_MINIMUM_QUANTITY = 15;

export function sellingPriceForQuantity(input: {
  kind?: ProductKind;
  regularPrice: number;
  bulkPrice?: number | null;
  quantity: number;
}) {
  const usesBulk = input.kind === 'EGG'
    && input.quantity >= EGG_BULK_MINIMUM_QUANTITY
    && typeof input.bulkPrice === 'number';
  return {
    unitPrice: usesBulk ? input.bulkPrice! : input.regularPrice,
    tier: usesBulk ? 'EGG_BULK' as const : 'REGULAR' as const,
  };
}
