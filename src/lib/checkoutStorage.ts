export const RECEIPT_KEY = 'nafah-agro-order-receipt';
export const PENDING_CHECKOUT_KEY = 'nafah-agro-pending-checkout';
export interface OrderReceipt { scope: string; id: string; orderNumber: string; grandTotal: number; placedAt: string }
export function readReceipt(scope: string): OrderReceipt | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(RECEIPT_KEY) ?? 'null');
    return value?.scope === scope && typeof value.orderNumber === 'string' && typeof value.id === 'string' && Number.isFinite(value.grandTotal) ? value : null;
  } catch { return null; }
}
export function clearOtherCheckoutScope(scope: string) {
  for (const key of [RECEIPT_KEY, PENDING_CHECKOUT_KEY]) {
    try { const value = JSON.parse(sessionStorage.getItem(key) ?? 'null'); if (value && value.scope !== scope) sessionStorage.removeItem(key); }
    catch { sessionStorage.removeItem(key); }
  }
}
