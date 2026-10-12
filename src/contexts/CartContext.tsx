import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { AccountCartState, CartItem } from '@/lib/types';
import { sellingPriceForQuantity } from '@/lib/quantity';
import { ApiError, getAccountCart, mergeGuestCart, mutateAccountCart, previewCart } from '@/lib/api';
import { useAuth } from './AuthContext';
import { clearOtherCheckoutScope } from '@/lib/checkoutStorage';

interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  updateQuantity: (id: string, quantity: number) => Promise<void>;
  clearCart: () => Promise<void>;
  totalPrice: number; totalItems: number; revision: number;
  loading: boolean; saving: boolean; error: string | null;
  refresh: () => Promise<AccountCartState>;
}
const CartContext = createContext<CartContextType | null>(null);
const CART_KEY = 'nafah-agro-cart';
const MERGE_KEY = 'nafah-agro-guest-cart-merge';
const CLAIM_OWNER_KEY = 'nafah-agro-guest-cart-owner';
const CLAIM_PREFIX = 'nafah-agro-guest-cart-pending:';
function pendingMerge(scope: string): { mergeKey: string; items: CartItem[] } | null {
  try { return JSON.parse(localStorage.getItem(CLAIM_PREFIX + scope) ?? 'null'); }
  catch { return null; }
}

export function readGuestCart(): CartItem[] {
  try {
    const owner = JSON.parse(localStorage.getItem(CLAIM_OWNER_KEY) ?? 'null');
    // A timed-out merge belongs to the first account, not the next login.
    if (owner?.mergeKey === localStorage.getItem(MERGE_KEY)) return [];
    const parsed: unknown = JSON.parse(localStorage.getItem(CART_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is CartItem => Boolean(item && typeof item === 'object'
      && typeof item.productVariantId === 'string' && typeof item.productName === 'string'
      && typeof item.variantName === 'string' && Number.isInteger(item.quantity)
      && item.quantity > 0 && item.quantity <= 1_000_000 && Number.isFinite(item.unitPrice)));
  } catch { return []; }
}
function saveGuest(items: CartItem[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  localStorage.setItem(MERGE_KEY, crypto.randomUUID());
}

export function CartProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const scope = auth.loading || auth.sessionError || auth.needsPasswordSetup || auth.isPasswordRecovery
    ? 'blocked' : auth.user?.id ?? (auth.session ? 'blocked' : 'guest');
  const token = auth.session?.access_token;
  const [state, setState] = useState<AccountCartState & { scope: string }>(() => ({ scope: 'guest', revision: 0, items: readGuestCart() }));
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<{ scope: string; message: string } | null>(null);
  const error = failure?.scope === scope ? failure.message : null;
  const setError = useCallback((message: string | null) => setFailure(message ? { scope, message } : null), [scope]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const stateRef = useRef(state);
  stateRef.current = state;
  const busy = useRef(false);
  const requestNumber = useRef(0);
  const abort = useRef<AbortController | null>(null);

  const refresh = useCallback(async (): Promise<AccountCartState> => {
    const sequence = ++requestNumber.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    if (scope === 'blocked') throw new Error('অ্যাকাউন্টের তথ্য লোড হচ্ছে।');
    setPending(true); setError(null);
    try {
      let result: AccountCartState;
      if (scope === 'guest') {
        const items = readGuestCart();
        result = { revision: 0, items: items.length ? await previewCart(items, controller.signal) : [] };
      } else {
        if (!token) throw new Error('কার্ট লোড করতে লগইন করুন।');
        const claim = pendingMerge(scope);
        const guest = claim?.items ?? readGuestCart();
        if (guest.length) {
          const mergeKey = claim?.mergeKey ?? localStorage.getItem(MERGE_KEY) ?? crypto.randomUUID();
          if (!claim) {
            localStorage.setItem(MERGE_KEY, mergeKey);
            localStorage.setItem(CLAIM_PREFIX + scope, JSON.stringify({ mergeKey, items: guest }));
            localStorage.setItem(CLAIM_OWNER_KEY, JSON.stringify({ mergeKey, scope }));
          }
          result = await mergeGuestCart(token, mergeKey, guest, controller.signal);
          if (localStorage.getItem(MERGE_KEY) === mergeKey) saveGuest([]);
          localStorage.removeItem(CLAIM_PREFIX + scope);
        } else result = await getAccountCart(token, controller.signal);
      }
      if (currentScope.current === scope && sequence === requestNumber.current) {
        stateRef.current = { ...result, scope }; setState({ ...result, scope });
      }
      return result;
    } catch (cause) {
      if (currentScope.current === scope && sequence === requestNumber.current) setError(cause instanceof Error ? cause.message : 'কার্ট লোড করা যায়নি। রিট্রাই করুন।');
      throw cause;
    } finally {
      if (currentScope.current === scope && sequence === requestNumber.current) setPending(false);
    }
  }, [scope, token, setError]);

  useEffect(() => {
    setError(null); setSaving(false); busy.current = false;
    if (scope === 'blocked') return;
    clearOtherCheckoutScope(scope);
    if (scope === 'guest') setState({ scope, revision: 0, items: readGuestCart() });
    void refresh().catch(() => undefined);
    const focus = () => { if (!busy.current) void refresh().catch(() => undefined); };
    window.addEventListener('focus', focus); window.addEventListener('storage', focus);
    return () => { abort.current?.abort(); window.removeEventListener('focus', focus); window.removeEventListener('storage', focus); };
  }, [scope, refresh, setError]);

  const mutate = useCallback(async (action: 'ADD' | 'SET' | 'REMOVE' | 'CLEAR', line?: CartItem) => {
    if (scope === 'blocked' || busy.current || stateRef.current.scope !== scope) {
      const message = 'কার্ট লোড হচ্ছে। একটু পরে রিট্রাই করুন।'; toast.error(message); throw new Error(message);
    }
    busy.current = true; setSaving(true); setError(null); ++requestNumber.current; abort.current?.abort();
    try {
      let result: AccountCartState;
      if (scope === 'guest') {
        let items = readGuestCart();
        if (action === 'CLEAR') items = [];
        else if (line) {
          const existing = items.find(item => item.productVariantId === line.productVariantId);
          if (action === 'REMOVE') items = items.filter(item => item.productVariantId !== line.productVariantId);
          else {
            const quantity = action === 'ADD' ? (existing?.quantity ?? 0) + line.quantity : line.quantity;
            if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1_000_000 || (!existing && items.length >= 100)) throw new Error('কার্টের পরিমাণ সঠিক নয়।');
            if (line.available === false) throw new Error(line.unavailableReason ?? 'এই পণ্য অর্ডার করা যাচ্ছে না।');
            items = existing ? items.map(item => item.productVariantId === line.productVariantId ? { ...line, quantity } : item) : [...items, { ...line, quantity }];
          }
        }
        saveGuest(items); result = { items, revision: 0 };
      } else {
        if (!token) throw new Error('আগে লগইন করুন।');
        result = await mutateAccountCart(token, stateRef.current.revision, action, line);
      }
      if (currentScope.current !== scope) throw new Error('অ্যাকাউন্ট আপডেট হয়েছে।');
      stateRef.current = { ...result, scope }; setState({ ...result, scope }); setPending(false);
    } catch (cause) {
      if (currentScope.current === scope) {
        const message = cause instanceof Error ? cause.message : 'কার্ট সেভ করা যায়নি।';
        setError(message); toast.error(message);
        if (cause instanceof ApiError && cause.code === 'CART_CONFLICT') await refresh().catch(() => undefined);
      }
      throw cause;
    } finally { if (currentScope.current === scope) { busy.current = false; setSaving(false); } }
  }, [scope, token, refresh, setError]);

  const items = state.scope === scope && scope !== 'blocked' ? state.items : [];
  const totalPrice = items.reduce((sum, item) => item.available === false ? sum : sum + sellingPriceForQuantity({ kind: item.productKind, regularPrice: item.unitPrice, bulkPrice: item.bulkSellingPrice, quantity: item.quantity }).unitPrice * item.quantity, 0);
  return <CartContext.Provider value={{ items, revision: state.scope === scope ? state.revision : 0,
    loading: scope === 'blocked' || (state.scope !== scope && !error) || pending, saving, error, refresh,
    addItem: item => mutate('ADD', item), removeItem: id => mutate('REMOVE', items.find(item => item.productVariantId === id)),
    updateQuantity: (id, quantity) => quantity <= 0 ? mutate('REMOVE', items.find(item => item.productVariantId === id)) : mutate('SET', { ...items.find(item => item.productVariantId === id)!, quantity }),
    clearCart: () => mutate('CLEAR'), totalPrice, totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
  }}>{children}</CartContext.Provider>;
}
export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within CartProvider');
  return context;
}
