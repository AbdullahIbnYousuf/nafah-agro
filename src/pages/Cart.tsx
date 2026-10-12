import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError, createWebsiteOrder, getDeliveryRates } from '@/lib/api';
import type { DeliveryRate } from '@/lib/types';
import { clearOtherCheckoutScope, PENDING_CHECKOUT_KEY, RECEIPT_KEY } from '@/lib/checkoutStorage';
import { visiblePackSize } from '@/lib/productOptions';
import { sellingPriceForQuantity, quantityLabel, rateLabel } from '@/lib/quantity';

type CheckoutInput = Parameters<typeof createWebsiteOrder>[0];
function restorePending(scope: string): CheckoutInput | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(PENDING_CHECKOUT_KEY) ?? 'null');
    return saved?.scope === scope && saved.input?.customer && Array.isArray(saved.input.items) && typeof saved.input.idempotencyKey === 'string' ? saved.input : null;
  } catch { return null; }
}
export default function Cart() {
  const { user, loading, sessionError, session, retrySession } = useAuth();
  if (loading || sessionError || (session && !user)) return <div className="min-h-screen flex flex-col"><Navbar /><main className="flex-1 container mx-auto px-4 py-12"><p role={sessionError ? 'alert' : 'status'}>{sessionError || 'অ্যাকাউন্টের তথ্য লোড হচ্ছে…'}</p>{sessionError && <Button className="mt-3" onClick={() => void retrySession()}>রিট্রাই করুন</Button>}</main><Footer /></div>;
  return <CartWorkspace key={user?.id ?? 'guest'} />;
}
function CartWorkspace() {
  const { items, removeItem, updateQuantity, clearCart, totalPrice, loading, saving, error: cartError, refresh } = useCart();
  const { user, session, retrySession } = useAuth();
  const scope = user?.id ?? 'guest';
  const navigate = useNavigate();
  const [pendingOrder, setPendingOrder] = useState(() => restorePending(scope));
  const [rates, setRates] = useState<DeliveryRate[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesError, setRatesError] = useState('');
  const [deliveryRateId, setDeliveryRateId] = useState(pendingOrder?.deliveryRateId ?? user?.preferredDeliveryRateId ?? '');
  const [showCheckout, setShowCheckout] = useState(Boolean(pendingOrder));
  const [placing, setPlacing] = useState(false);
  const [customerName, setCustomerName] = useState(pendingOrder?.customer.name ?? user?.name ?? '');
  const [customerPhone, setCustomerPhone] = useState(pendingOrder?.customer.phone ?? user?.phoneNumber ?? '');
  const [customerEmail, setCustomerEmail] = useState(pendingOrder?.customer.email ?? user?.email ?? '');
  const [customerAddress, setCustomerAddress] = useState(pendingOrder?.customer.address ?? user?.deliveryAddress ?? '');
  const [saveAddress, setSaveAddress] = useState(pendingOrder?.saveDeliveryAddress ?? false);
  const [checkoutError, setCheckoutError] = useState('');
  const mounted = useRef(true);
  const submitLock = useRef(false);
  const loadRates = useCallback(async () => {
    setRatesLoading(true); setRatesError('');
    try {
      const active = (await getDeliveryRates()).filter(rate => rate.isActive);
      if (!mounted.current) return;
      setRates(active);
      setDeliveryRateId(current => active.some(rate => rate.id === current) ? current : '');
      if (!active.length) setRatesError('ডেলিভারি এলাকা পাওয়া যায়নি। দোকানের সঙ্গে যোগাযোগ করুন।');
    } catch { if (mounted.current) setRatesError('ডেলিভারি এলাকার তথ্য লোড করা যায়নি।'); }
    finally { if (mounted.current) setRatesLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true; clearOtherCheckoutScope(scope);
    void loadRates(); void refresh().catch(() => undefined);
    return () => { mounted.current = false; };
  }, [scope, loadRates, refresh]);

  const selectedRate = rates.find(rate => rate.id === deliveryRateId);
  const estimatedTotal = useMemo(
    () => selectedRate?.charge == null ? null : totalPrice + selectedRate.charge,
    [selectedRate, totalPrice],
  );

  async function placeOrder() {
    if (submitLock.current) return;
    if (!customerName.trim()) return toast.error('আপনার নাম দিন');
    if (!customerPhone.trim()) return toast.error('ফোন নম্বর দিন');
    if (!customerAddress.trim()) return toast.error('সম্পূর্ণ ঠিকানা দিন');
    if (!pendingOrder && !selectedRate) return toast.error('ডেলিভারি এলাকা সিলেক্ট করুন');
    if (!pendingOrder && selectedRate?.charge === null) return toast.error('এই এলাকার ডেলিভারি চার্জ এখনো নির্ধারিত হয়নি');
    submitLock.current = true; setPlacing(true); setCheckoutError('');
    let result: Awaited<ReturnType<typeof createWebsiteOrder>> | null = null;
    try {
      let input = pendingOrder;
      if (!input) {
        const [fresh, freshRates] = await Promise.all([refresh(), getDeliveryRates()]);
        if (!mounted.current) return;
        setRates(freshRates.filter(rate => rate.isActive));
        const freshRate = freshRates.find(rate => rate.id === deliveryRateId && rate.isActive);
        if (!freshRate || freshRate.charge === null) throw new Error('এই ডেলিভারি এলাকা এখন ব্যবহার করা যাচ্ছে না। অন্য এলাকা সিলেক্ট করুন।');
        if (freshRate.charge !== selectedRate?.charge) throw new Error('ডেলিভারি চার্জ আপডেট হয়েছে। নতুন মোট দাম দেখে আবার অর্ডার প্লেস করুন।');
        if (fresh.items.some(item => item.available === false)) throw new Error('কিছু পণ্য এখন অর্ডার করা যাচ্ছে না। আগে সেগুলো রিমুভ করুন।');
        if (!fresh.items.length) throw new Error('আপনার কার্ট খালি।');
        const freshTotal = fresh.items.reduce((sum, item) => sum + sellingPriceForQuantity({ kind: item.productKind, regularPrice: item.unitPrice, bulkPrice: item.bulkSellingPrice, quantity: item.quantity }).unitPrice * item.quantity, 0);
        if (Math.abs(freshTotal - totalPrice) > 0.005) throw new Error('পণ্যের দাম আপডেট হয়েছে। নতুন মোট দাম দেখে আবার অর্ডার প্লেস করুন।');
        input = {
          items: fresh.items.map(item => ({ productVariantId: item.productVariantId, quantity: item.quantity })),
          customer: { name: customerName.trim(), phone: customerPhone.trim(), ...(customerEmail.trim() ? { email: customerEmail.trim() } : {}), address: customerAddress.trim() },
          deliveryRateId, idempotencyKey: crypto.randomUUID(),
          expectedGrandTotal: (freshTotal + freshRate.charge).toFixed(2),
          ...(user ? { saveDeliveryAddress: saveAddress, cartRevision: fresh.revision } : {}),
        };
        sessionStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify({ scope, input }));
        setPendingOrder(input);
      }
      result = await createWebsiteOrder(input, session?.access_token);
    } catch (cause) {
      if (!mounted.current) return;
      const message = cause instanceof Error ? cause.message : 'অর্ডার প্লেস করা যায়নি। রিট্রাই করুন।';
      setCheckoutError(message); toast.error(message);
      if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500 && cause.status !== 408 && cause.status !== 429) {
        sessionStorage.removeItem(PENDING_CHECKOUT_KEY); setPendingOrder(null);
        if (cause.code === 'CART_CONFLICT') void refresh().catch(() => undefined);
        if (cause.code === 'CHECKOUT_TOTAL_CHANGED') { void refresh().catch(() => undefined); void loadRates(); }
      }
    } finally { submitLock.current = false; if (mounted.current) setPlacing(false); }
    if (!result || !mounted.current) return;
    sessionStorage.setItem(RECEIPT_KEY, JSON.stringify({ scope, id: result.order.id, orderNumber: result.order.orderNumber, grandTotal: result.order.grandTotal, placedAt: result.order.placedAt }));
    sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
    if (user) {
      void refresh().catch(() => undefined);
      if (saveAddress) void retrySession().catch(() => undefined);
    } else await clearCart().catch(() => undefined);
    if (mounted.current) navigate('/order-confirmation', { replace: true });
  }

  if (loading && items.length === 0 && !cartError && !pendingOrder) return <div className="min-h-screen flex flex-col"><Navbar /><main className="flex-1 flex justify-center items-center gap-2 py-16" role="status"><Loader2 className="animate-spin" />কার্ট লোড হচ্ছে…</main><Footer /></div>;
  if (cartError && items.length === 0 && !pendingOrder) return <div className="min-h-screen flex flex-col"><Navbar /><main className="container mx-auto flex-1 px-4 py-12"><p role="alert">{cartError}</p><Button className="mt-3" onClick={() => void refresh().catch(() => undefined)}>রিট্রাই করুন</Button></main><Footer /></div>;

  if (items.length === 0 && !pendingOrder) return (
    <div className="min-h-screen flex flex-col"><Navbar /><main className="flex flex-1 items-center justify-center px-4"><div className="text-center">
      <ShoppingBag size={64} className="mx-auto text-muted-foreground/40 mb-4" />
      <h1 className="text-2xl font-bold mb-2">আপনার কার্ট খালি</h1>
      <Button asChild><Link to="/shop">দোকানে যান</Link></Button>
    </div></main><Footer /></div>
  );

  return <div className="min-h-screen flex flex-col"><Navbar /><main className="container mx-auto px-4 py-8 flex-1">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-2"><h1 className="text-2xl font-bold sm:text-3xl">কার্ট</h1><Button variant="ghost" className="text-destructive" disabled={saving || placing || Boolean(pendingOrder)} onClick={() => void clearCart().catch(() => undefined)}><Trash2 size={16} className="mr-1" />কার্ট খালি করুন</Button></div>
    {loading && items.length > 0 && <p role="status" className="mb-3 text-sm text-muted-foreground">কার্ট আপডেট হচ্ছে…</p>}
    {cartError && <div role="alert" className="mb-4 rounded-lg border border-destructive/30 p-3 text-sm">{cartError}<Button variant="ghost" size="sm" onClick={() => void refresh().catch(() => undefined)}>রিট্রাই করুন</Button></div>}
    <div className="grid lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-4">{items.map(item => {
        const pricing = sellingPriceForQuantity({
          kind: item.productKind,
          regularPrice: item.unitPrice,
          bulkPrice: item.bulkSellingPrice,
          quantity: item.quantity,
        });
        return <div key={item.productVariantId} className="flex gap-3 rounded-lg border bg-card p-3 sm:gap-4 sm:p-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">{item.imageUrl
            ? <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
            : <ShoppingBag size={24} className="text-muted-foreground/50" aria-hidden="true" />}</div>
          <div className="min-w-0 flex-1">{item.available === false && <p role="alert" className="mb-2 text-sm text-destructive">{item.unavailableReason}</p>}<div className="break-words font-semibold">{item.productName}</div>{visiblePackSize(item.variantName) && <div className="break-words text-xs text-muted-foreground">{visiblePackSize(item.variantName)}</div>}<div className="text-xs text-muted-foreground">৳{pricing.unitPrice} {rateLabel(item.productKind, item.unitLabel)}</div>{item.productKind === 'EGG' && <div className="text-xs text-secondary">{pricing.tier === 'EGG_BULK' ? '15টি+ দাম' : 'সাধারণ দাম'} · ৳{pricing.unitPrice} প্রতি ডিম</div>}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2">
              <button aria-label="পরিমাণ কমান" disabled={saving || placing || Boolean(pendingOrder) || item.available === false} onClick={() => void updateQuantity(item.productVariantId, item.quantity - 1).catch(() => undefined)} className="flex h-11 w-11 items-center justify-center rounded-full border transition-colors hover:bg-muted"><Minus size={16} /></button>
              <span>{item.quantity} {quantityLabel('PIECE', item.productKind, item.unitLabel)}</span>
              <button aria-label="পরিমাণ বাড়ান" disabled={saving || placing || Boolean(pendingOrder) || item.available === false} onClick={() => void updateQuantity(item.productVariantId, item.quantity + 1).catch(() => undefined)} className="flex h-11 w-11 items-center justify-center rounded-full border transition-colors hover:bg-muted"><Plus size={16} /></button>
            </div><div className="ml-auto flex items-center gap-2"><strong>৳{pricing.unitPrice * item.quantity}</strong><button aria-label="কার্ট থেকে রিমুভ করুন" className="flex h-11 w-11 items-center justify-center rounded-md text-destructive hover:bg-destructive/10" disabled={saving || placing || Boolean(pendingOrder)} onClick={() => void removeItem(item.productVariantId).catch(() => undefined)}><Trash2 size={18} /></button></div></div>
          </div>
        </div>;
      })}</div>
      <aside className="h-fit rounded-lg border bg-card p-4 sm:p-6 lg:sticky lg:top-24">
        <h2 className="font-bold text-lg mb-4">অর্ডার সারাংশ</h2>
        <div className="flex justify-between text-sm"><span>পণ্যের দাম</span><span>৳{totalPrice}</span></div>
        <div className="mt-4"><Label>ডেলিভারি এলাকা *</Label><div className="mt-2 space-y-2">{ratesLoading && <p role="status">ডেলিভারি এলাকা লোড হচ্ছে…</p>}{ratesError && <div role="alert" className="text-sm text-destructive">{ratesError}<Button type="button" variant="ghost" onClick={() => void loadRates()}>রিট্রাই করুন</Button></div>}{rates.map(rate => <label key={rate.id} className={`flex min-h-12 cursor-pointer items-center rounded border p-3 ${deliveryRateId === rate.id ? 'border-secondary bg-secondary/10' : ''}`}><input disabled={placing || Boolean(pendingOrder)} type="radio" className="mr-2 h-5 w-5 shrink-0" checked={deliveryRateId === rate.id} onChange={() => setDeliveryRateId(rate.id)} />{rate.name} · {rate.charge === null ? 'চার্জ নির্ধারিত নয়' : `৳${rate.charge}`}</label>)}</div></div>
        <div className="border-t mt-4 pt-4 flex justify-between font-bold"><span>মোট দাম</span><span>{estimatedTotal === null ? 'নির্ধারিত নয়' : `৳${estimatedTotal}`}</span></div>
        <div className="mt-2 flex justify-between text-sm"><span>ডেলিভারি চার্জ</span><span>{selectedRate?.charge == null ? 'এলাকা সিলেক্ট করুন' : `৳${selectedRate.charge}`}</span></div><p className="text-xs text-muted-foreground mt-2">ডেলিভারির সময় টাকা দেবেন। অর্ডার কনফার্ম করতে আপনার সঙ্গে যোগাযোগ করা হবে।</p>{!user && <p className="mt-2 text-xs text-muted-foreground">লগইন ছাড়াও অর্ডার করতে পারবেন</p>}{saving && <p role="status" className="mt-2 text-sm">কার্ট সেভ হচ্ছে…</p>}
        {!showCheckout ? <><Button className="w-full mt-4" onClick={() => setShowCheckout(true)}>অর্ডার করতে এগিয়ে যান</Button><Button asChild variant="ghost" className="w-full mt-2"><Link to="/shop"><ArrowLeft size={16} className="mr-1" />আরও পণ্য</Link></Button></> : <div className="mt-5 space-y-3 border-t pt-4">
          <div><Label htmlFor="name">নাম *</Label><Input id="name" disabled={placing || Boolean(pendingOrder)} value={customerName} onChange={event => setCustomerName(event.target.value)} /></div>
          <div><Label htmlFor="phone">ফোন *</Label><Input id="phone" disabled={placing || Boolean(pendingOrder)} type="tel" value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} /></div>
          <div><Label htmlFor="email">ইমেইল (ঐচ্ছিক)</Label><Input id="email" disabled={placing || Boolean(pendingOrder)} type="email" value={customerEmail} onChange={event => setCustomerEmail(event.target.value)} /></div>
          <div><Label htmlFor="address">সম্পূর্ণ ঠিকানা *</Label><textarea id="address" disabled={placing || Boolean(pendingOrder)} value={customerAddress} onChange={event => setCustomerAddress(event.target.value)} className="w-full min-h-20 border rounded-md bg-background p-2" /></div>
          {user && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={saveAddress} disabled={placing || Boolean(pendingOrder)} onChange={event => setSaveAddress(event.target.checked)} className="mt-1 h-4 w-4" />এই ঠিকানা প্রোফাইলে সেভ করুন</label>}<div className="rounded bg-muted/40 p-3 text-sm">পেমেন্ট: ক্যাশ অন ডেলিভারি</div>
          {selectedRate?.charge == null && <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{selectedRate ? 'এই এলাকার ডেলিভারি চার্জ এখনো সেট করা হয়নি। অন্য এলাকা সিলেক্ট করুন অথবা দোকানের সঙ্গে যোগাযোগ করুন।' : 'অর্ডার করতে আগে ডেলিভারি এলাকা সিলেক্ট করুন।'}</p>}
          {checkoutError && <p role="alert" className="text-sm text-destructive">{checkoutError}</p>}{pendingOrder && <p className="text-sm text-muted-foreground">অর্ডারের রেজাল্ট পেতে রিট্রাই করুন। একই অর্ডার আবার তৈরি হবে না।</p>}<Button className="w-full" disabled={placing || saving || ratesLoading || (loading && !pendingOrder)} aria-disabled={selectedRate?.charge == null} onClick={() => void placeOrder()}>{placing ? <><Loader2 size={16} className="animate-spin mr-2" />অর্ডার হচ্ছে…</> : pendingOrder ? 'অর্ডার রিট্রাই করুন' : 'অর্ডার প্লেস করুন'}</Button>
          <Button variant="ghost" className="w-full" disabled={placing || Boolean(pendingOrder)} onClick={() => setShowCheckout(false)}>পিছনে যান</Button>
        </div>}
      </aside>
    </div>
  </main><Footer /></div>;
}
