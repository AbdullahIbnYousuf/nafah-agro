import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ReturnOrderDialog, { type ReturnCondition } from '@/components/ReturnOrderDialog';
import {
  ApiError,
  createManualOrder,
  getAdminProducts,
  getDeliveryRates,
  getOrders,
  transitionOrder,
  updateDeliveryRate,
} from '@/lib/api';
import type { DeliveryRate, OrderSource, OrderStatus, Product, UnifiedOrder } from '@/lib/types';

const sources: OrderSource[] = ['WEBSITE', 'PHYSICAL_SHOP', 'FACEBOOK', 'PHONE', 'WHATSAPP', 'OTHER'];
const statuses: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PROCESSING', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'RETURNED_SELLABLE', 'RETURNED_DAMAGED'];
const manualSources = ['FACEBOOK', 'PHONE', 'WHATSAPP', 'OTHER'] as const;

interface ManualItem { productVariantId: string; quantity: number }

export default function UnifiedOrderManager() {
  const [orders, setOrders] = useState<UnifiedOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [rates, setRates] = useState<DeliveryRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<OrderSource | ''>('');
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [orderNumber, setOrderNumber] = useState('');
  const [phoneFilter, setPhoneFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [manualSource, setManualSource] = useState<typeof manualSources[number]>('PHONE');
  const [initialStatus, setInitialStatus] = useState<'PENDING' | 'CONFIRMED'>('CONFIRMED');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [deliveryRateId, setDeliveryRateId] = useState('');
  const [discount, setDiscount] = useState(0);
  const [manualItems, setManualItems] = useState<ManualItem[]>([{ productVariantId: '', quantity: 1 }]);
  const [returnOrder, setReturnOrder] = useState<UnifiedOrder | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const page = await getOrders({
        ...(source ? { source } : {}), ...(status ? { status } : {}),
        ...(orderNumber.trim() ? { orderNumber: orderNumber.trim() } : {}),
        ...(phoneFilter.trim() ? { phone: phoneFilter.trim() } : {}), limit: 100,
        ...(dateFrom ? { dateFrom: new Date(`${dateFrom}T00:00:00+06:00`).toISOString() } : {}),
        ...(dateTo ? { dateTo: new Date(`${dateTo}T23:59:59.999+06:00`).toISOString() } : {}),
      });
      setOrders(page.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'অর্ডার লোড হয়নি');
    } finally { setLoading(false); }
  }, [dateFrom, dateTo, orderNumber, phoneFilter, source, status]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);
  useEffect(() => {
    void Promise.all([getAdminProducts({ limit: 100 }), getDeliveryRates()]).then(([page, deliveryRates]) => {
      setProducts(page.data);
      setRates(deliveryRates);
      setDeliveryRateId(deliveryRates.find(rate => rate.isActive && rate.charge !== null)?.id ?? '');
    }).catch(() => toast.error('ম্যানুয়াল অর্ডারের সহায়ক তথ্য লোড হয়নি'));
  }, []);

  const variants = useMemo(() => products.flatMap(product => (product.variants ?? []).filter(variant => product.isActive !== false && variant.isActive).map(variant => ({ ...variant, productName: product.name }))), [products]);
  const hasActiveFilters = Boolean(source || status || orderNumber || phoneFilter || dateFrom || dateTo);

  function clearFilters() {
    setSource('');
    setStatus('');
    setOrderNumber('');
    setPhoneFilter('');
    setDateFrom('');
    setDateTo('');
  }

  async function runAction(order: UnifiedOrder, action: 'CONFIRM' | 'PROCESS' | 'DELIVER' | 'CANCEL' | 'FAILED_DELIVERY') {
    try {
      if (action === 'CONFIRM') await transitionOrder(order.id, { action, confirmUnprofitable: false });
      else if (action === 'CANCEL' || action === 'FAILED_DELIVERY') {
        const reason = prompt(action === 'CANCEL' ? 'বাতিলের কারণ (অন্তত ৩ অক্ষর)' : 'ব্যর্থ ডেলিভারির কারণ (অন্তত ৩ অক্ষর)');
        if (!reason) return;
        await transitionOrder(order.id, { action, reason });
      } else await transitionOrder(order.id, { action });
      toast.success('অর্ডার আপডেট হয়েছে');
      await loadOrders();
    } catch (error) {
      if (action === 'CONFIRM' && error instanceof ApiError && error.code === 'UNPROFITABLE_ORDER_CONFIRMATION_REQUIRED') {
        if (confirm(`${error.message}\nতবুও নিশ্চিত করবেন?`)) {
          await transitionOrder(order.id, { action: 'CONFIRM', confirmUnprofitable: true });
          toast.success('ক্ষতির সতর্কতা নিশ্চিত করে অর্ডার সংরক্ষণ করা হয়েছে');
          await loadOrders();
          return;
        }
      }
      toast.error(error instanceof Error ? error.message : 'অর্ডার আপডেট হয়নি');
    }
  }

  async function submitReturn(condition: ReturnCondition, reason: string) {
    if (!returnOrder) return;
    await transitionOrder(returnOrder.id, { action: 'RETURN', condition, reason });
    toast.success('পুরো অর্ডার ফেরত সম্পন্ন হয়েছে');
    await loadOrders();
  }

  async function saveManual(confirmUnprofitable = false) {
    const items = manualItems.filter(item => item.productVariantId && item.quantity > 0);
    if (!customerName.trim() || !customerPhone.trim() || customerAddress.trim().length < 5 || !deliveryRateId || items.length === 0) {
      toast.error('গ্রাহক, ডেলিভারি এলাকা ও অন্তত একটি আইটেম পূরণ করুন'); return;
    }
    try {
      await createManualOrder({ source: manualSource, initialStatus, items, customer: {
        name: customerName.trim(), phone: customerPhone.trim(), address: customerAddress.trim(),
        ...(customerEmail.trim() ? { email: customerEmail.trim() } : {}),
      }, deliveryRateId, discountTotal: discount, confirmUnprofitable });
      toast.success('ম্যানুয়াল ডেলিভারি অর্ডার তৈরি হয়েছে');
      setShowManual(false); setManualItems([{ productVariantId: '', quantity: 1 }]); setDiscount(0);
      await loadOrders();
    } catch (error) {
      if (!confirmUnprofitable && error instanceof ApiError && error.code === 'UNPROFITABLE_ORDER_CONFIRMATION_REQUIRED' && confirm(`${error.message}\nতবুও তৈরি করবেন?`)) {
        await saveManual(true); return;
      }
      toast.error(error instanceof Error ? error.message : 'ম্যানুয়াল অর্ডার তৈরি হয়নি');
    }
  }

  async function editRate(rate: DeliveryRate) {
    const raw = prompt(`${rate.name} ডেলিভারি চার্জ (ফাঁকা রাখলে অনির্ধারিত)`, rate.charge?.toString() ?? '');
    if (raw === null) return;
    const charge = raw.trim() === '' ? null : Number(raw);
    if (charge !== null && (!Number.isFinite(charge) || charge < 0)) return toast.error('সঠিক চার্জ দিন');
    try {
      const updated = await updateDeliveryRate(rate.id, { charge });
      setRates(current => current.map(item => item.id === updated.id ? updated : item));
      toast.success('ডেলিভারি চার্জ আপডেট হয়েছে');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'চার্জ আপডেট হয়নি'); }
  }

  return <div>
    <div className="flex flex-wrap justify-between gap-3 mb-6"><div><h1 className="text-2xl font-bold">একীভূত অর্ডার</h1><p className="text-sm text-muted-foreground">ওয়েবসাইট, দোকান ও ম্যানুয়াল ডেলিভারি অর্ডার</p></div><Button onClick={() => setShowManual(value => !value)}><Plus size={16} className="mr-2" />ম্যানুয়াল অর্ডার</Button></div>
    <section className="bg-card border rounded-lg p-4 mb-5"><h2 className="font-semibold mb-3">ডেলিভারি চার্জ</h2><div className="flex flex-wrap gap-3">{rates.map(rate => <button key={rate.id} onClick={() => void editRate(rate)} className="border rounded px-4 py-2 text-left"><strong>{rate.name}</strong><div className="text-sm text-muted-foreground">{rate.charge === null ? 'অনির্ধারিত' : `৳${rate.charge}`} · {rate.isActive ? 'সক্রিয়' : 'নিষ্ক্রিয়'}</div></button>)}</div></section>
    {showManual && <section className="bg-card border rounded-lg p-5 mb-5 space-y-4"><h2 className="font-semibold">নতুন ম্যানুয়াল ডেলিভারি অর্ডার</h2><div className="grid md:grid-cols-4 gap-3"><label>উৎস<select className="w-full border rounded p-2 bg-background" value={manualSource} onChange={event => setManualSource(event.target.value as typeof manualSource)}>{manualSources.map(value => <option key={value}>{value}</option>)}</select></label><label>প্রাথমিক অবস্থা<select className="w-full border rounded p-2 bg-background" value={initialStatus} onChange={event => setInitialStatus(event.target.value as typeof initialStatus)}><option>PENDING</option><option>CONFIRMED</option></select></label><label>ডেলিভারি এলাকা<select className="w-full border rounded p-2 bg-background" value={deliveryRateId} onChange={event => setDeliveryRateId(event.target.value)}><option value="">নির্বাচন করুন</option>{rates.filter(rate => rate.isActive).map(rate => <option key={rate.id} value={rate.id}>{rate.name} ({rate.charge ?? 'অনির্ধারিত'})</option>)}</select></label><label>ছাড়<Input type="number" min="0" value={discount} onChange={event => setDiscount(Number(event.target.value))} /></label></div>
      <div className="grid md:grid-cols-4 gap-3"><div><Label>নাম</Label><Input value={customerName} onChange={event => setCustomerName(event.target.value)} /></div><div><Label>ফোন</Label><Input value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} /></div><div><Label>ইমেইল (ঐচ্ছিক)</Label><Input value={customerEmail} onChange={event => setCustomerEmail(event.target.value)} /></div><div><Label>ঠিকানা</Label><Input value={customerAddress} onChange={event => setCustomerAddress(event.target.value)} /></div></div>
      <div className="space-y-2">{manualItems.map((item, index) => <div key={index} className="flex gap-2"><select className="flex-1 border rounded p-2 bg-background" value={item.productVariantId} onChange={event => setManualItems(current => current.map((value, itemIndex) => itemIndex === index ? { ...value, productVariantId: event.target.value } : value))}><option value="">পণ্য/ভ্যারিয়েন্ট</option>{variants.map(variant => <option key={variant.id} value={variant.id}>{variant.productName} — {variant.name} · {variant.sku} · স্টক {variant.availableStock}</option>)}</select><Input className="w-24" type="number" min="1" value={item.quantity} onChange={event => setManualItems(current => current.map((value, itemIndex) => itemIndex === index ? { ...value, quantity: Number(event.target.value) } : value))} /><Button variant="outline" onClick={() => setManualItems(current => current.filter((_, itemIndex) => itemIndex !== index))}>সরান</Button></div>)}</div>
      <div className="flex gap-2"><Button variant="outline" onClick={() => setManualItems(current => [...current, { productVariantId: '', quantity: 1 }])}>আরও আইটেম</Button><Button onClick={() => void saveManual()}>অর্ডার তৈরি করুন</Button></div>
    </section>}
    <section className="grid md:grid-cols-4 xl:grid-cols-8 gap-2 mb-4 items-end">
      <select aria-label="অর্ডারের উৎস" className="h-10 border rounded px-3 bg-background" value={source} onChange={event => setSource(event.target.value as OrderSource | '')}><option value="">সব উৎস</option>{sources.map(value => <option key={value}>{value}</option>)}</select>
      <select aria-label="অর্ডারের অবস্থা" className="h-10 border rounded px-3 bg-background" value={status} onChange={event => setStatus(event.target.value as OrderStatus | '')}><option value="">সব অবস্থা</option>{statuses.map(value => <option key={value}>{value}</option>)}</select>
      <Input aria-label="অর্ডার নম্বর" placeholder="অর্ডার নম্বর" value={orderNumber} onChange={event => setOrderNumber(event.target.value)} />
      <Input aria-label="গ্রাহকের ফোন" placeholder="ফোন" value={phoneFilter} onChange={event => setPhoneFilter(event.target.value)} />
      <div><Label htmlFor="orders-date-from">তারিখ থেকে</Label><Input id="orders-date-from" type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} /></div>
      <div><Label htmlFor="orders-date-to">তারিখ পর্যন্ত</Label><Input id="orders-date-to" type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} /></div>
      <Button variant="outline" onClick={clearFilters} disabled={!hasActiveFilters}>ফিল্টার মুছুন</Button>
      <Button variant="outline" onClick={() => void loadOrders()}><RefreshCw size={16} className="mr-2" />রিফ্রেশ</Button>
    </section>
    {loading ? <div className="py-20 flex justify-center"><Loader2 className="animate-spin mr-2" />লোড হচ্ছে…</div> : <div className="space-y-3">{orders.map(order => <article key={order.id} className="bg-card border rounded-lg p-4"><div className="flex flex-wrap justify-between gap-3"><div><strong>{order.orderNumber}</strong><div className="text-sm">{order.source} · {order.status} · {order.customerName ?? 'গ্রাহক নেই'} · {order.customerPhone ?? 'ফোন নেই'}</div><div className="text-xs text-muted-foreground">{new Date(order.placedAt).toLocaleString('bn-BD')}</div></div><div className="text-right"><div className="font-bold">মোট ৳{order.grandTotal}</div><div className="text-sm">ক্রয়মূল্য {order.totalBuyingCost === null ? '—' : `৳${order.totalBuyingCost}`} · লাভ {order.grossProfit === null ? '—' : `৳${order.grossProfit}`} · মার্জিন {order.grossProfitMargin === null ? '—' : `${order.grossProfitMargin}%`}</div></div></div>
        <div className="text-sm mt-3">{order.items.map(item => `${item.productName} (${item.variantName}) × ${item.quantity}`).join(', ')}</div>
        {order.statusReason && <div className="text-sm text-destructive mt-2">কারণ: {order.statusReason}</div>}
        <div className="flex flex-wrap gap-2 mt-3">{order.status === 'PENDING' && <><Button size="sm" onClick={() => void runAction(order, 'CONFIRM')}>নিশ্চিত ও স্টক সংরক্ষণ</Button><Button size="sm" variant="outline" onClick={() => void runAction(order, 'CANCEL')}>বাতিল</Button></>}{order.status === 'CONFIRMED' && <><Button size="sm" onClick={() => void runAction(order, 'PROCESS')}>প্রসেসিং</Button><Button size="sm" onClick={() => void runAction(order, 'DELIVER')}>ডেলিভারড</Button><Button size="sm" variant="outline" onClick={() => void runAction(order, 'FAILED_DELIVERY')}>ডেলিভারি ব্যর্থ</Button></>}{order.status === 'PROCESSING' && <><Button size="sm" onClick={() => void runAction(order, 'DELIVER')}>ডেলিভারড</Button><Button size="sm" variant="outline" onClick={() => void runAction(order, 'FAILED_DELIVERY')}>ডেলিভারি ব্যর্থ</Button></>}{(order.status === 'DELIVERED' || order.status === 'COMPLETED') && <Button size="sm" variant="outline" onClick={() => setReturnOrder(order)}>পুরো অর্ডার ফেরত</Button>}</div>
      </article>)}</div>}
    <ReturnOrderDialog order={returnOrder} onClose={() => setReturnOrder(null)} onConfirm={submitReturn} />
  </div>;
}
