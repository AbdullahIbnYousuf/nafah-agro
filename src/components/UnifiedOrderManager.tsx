import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ReturnOrderDialog, { type ReturnCondition } from '@/components/ReturnOrderDialog';
import OrderActionDialog, { type OrderAction } from '@/components/OrderActionDialog';
import ProfitWarningDialog from '@/components/ProfitWarningDialog';
import DeliveryRateDialog from '@/components/DeliveryRateDialog';
import {
  createManualOrder,
  getAdminDeliveryRates,
  getAdminProducts,
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
  const [pendingAction, setPendingAction] = useState<{ order: UnifiedOrder; action: OrderAction } | null>(null);
  const [editingRate, setEditingRate] = useState<DeliveryRate | null>(null);
  const [manualProjectedLoss, setManualProjectedLoss] = useState<unknown>(null);
  const [manualErrors, setManualErrors] = useState<Record<string, string>>({});

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
    void Promise.all([getAdminProducts({ limit: 100 }), getAdminDeliveryRates()]).then(([page, deliveryRates]) => {
      setProducts(page.data);
      setRates(deliveryRates);
      setDeliveryRateId(deliveryRates.find(rate => rate.isActive && rate.charge !== null)?.id ?? '');
    }).catch(() => toast.error('ম্যানুয়াল অর্ডারের সহায়ক তথ্য লোড হয়নি'));
  }, []);

  const variants = useMemo(() => products.flatMap(product => (product.variants ?? []).filter(variant => product.isActive !== false && variant.isActive).map(variant => ({ ...variant, productName: product.name }))), [products]);
  const manualSubtotal = useMemo(() => manualItems.reduce((total, item) => {
    const variant = variants.find(candidate => candidate.id === item.productVariantId);
    return total + (variant ? variant.sellingPrice * item.quantity : 0);
  }, 0), [manualItems, variants]);
  const hasActiveFilters = Boolean(source || status || orderNumber || phoneFilter || dateFrom || dateTo);

  function clearFilters() {
    setSource('');
    setStatus('');
    setOrderNumber('');
    setPhoneFilter('');
    setDateFrom('');
    setDateTo('');
  }

  async function submitAction(reason: string | undefined, confirmUnprofitable: boolean) {
    if (!pendingAction) return;
    const { order, action } = pendingAction;
    if (action === 'CONFIRM') await transitionOrder(order.id, { action, confirmUnprofitable });
    else if (action === 'CANCEL' || action === 'FAILED_DELIVERY') await transitionOrder(order.id, { action, reason: reason ?? '' });
    else await transitionOrder(order.id, { action });
    toast.success('অর্ডার আপডেট হয়েছে');
    await loadOrders();
  }

  async function submitReturn(condition: ReturnCondition, reason: string) {
    if (!returnOrder) return;
    await transitionOrder(returnOrder.id, { action: 'RETURN', condition, reason });
    toast.success('পুরো অর্ডার ফেরত সম্পন্ন হয়েছে');
    await loadOrders();
  }

  async function saveManual(confirmUnprofitable = false) {
    const items = manualItems.filter(item => item.productVariantId && item.quantity > 0);
    const nextErrors: Record<string, string> = {};
    if (!customerName.trim()) nextErrors.name = 'গ্রাহকের নাম লিখুন।';
    if (customerPhone.trim().length < 7 || customerPhone.trim().length > 30) nextErrors.phone = 'ফোন নম্বর ৭ থেকে ৩০ অক্ষরের মধ্যে লিখুন।';
    if (customerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())) nextErrors.email = 'সঠিক ইমেইল ঠিকানা লিখুন।';
    if (customerAddress.trim().length < 5) nextErrors.address = 'অন্তত ৫ অক্ষরের ডেলিভারি ঠিকানা লিখুন।';
    if (!deliveryRateId) nextErrors.deliveryRate = 'ডেলিভারি এলাকা নির্বাচন করুন।';
    if (items.length === 0 || items.length !== manualItems.length) nextErrors.items = 'প্রতিটি আইটেমে পণ্য ও ১ বা তার বেশি পরিমাণ দিন।';
    if (!Number.isFinite(discount) || discount < 0 || discount > manualSubtotal) nextErrors.discount = 'ছাড় শূন্য থেকে সাবটোটালের মধ্যে হতে হবে।';
    if (Object.keys(nextErrors).length > 0) { setManualErrors(nextErrors); return; }
    setManualErrors({});
    try {
      await createManualOrder({ source: manualSource, initialStatus, items, customer: {
        name: customerName.trim(), phone: customerPhone.trim(), address: customerAddress.trim(),
        ...(customerEmail.trim() ? { email: customerEmail.trim() } : {}),
      }, deliveryRateId, discountTotal: discount, confirmUnprofitable });
      toast.success('ম্যানুয়াল ডেলিভারি অর্ডার তৈরি হয়েছে');
      setShowManual(false); setManualItems([{ productVariantId: '', quantity: 1 }]); setDiscount(0);
      setCustomerName(''); setCustomerPhone(''); setCustomerEmail(''); setCustomerAddress('');
      setManualProjectedLoss(null);
      await loadOrders();
    } catch (error) {
      if (!confirmUnprofitable && error instanceof Error && 'code' in error && error.code === 'UNPROFITABLE_ORDER_CONFIRMATION_REQUIRED') {
        const details = 'details' in error && error.details && typeof error.details === 'object' ? error.details as Record<string, unknown> : {};
        setManualProjectedLoss(details.projectedGrossProfit ?? 'ঋণাত্মক');
      } else if (confirmUnprofitable) {
        throw error;
      } else setManualErrors({ submit: error instanceof Error ? error.message : 'ম্যানুয়াল অর্ডার তৈরি হয়নি' });
    }
  }

  async function saveRate(charge: number | null) {
    if (!editingRate) return;
    const updated = await updateDeliveryRate(editingRate.id, { charge });
    setRates(current => current.map(item => item.id === updated.id ? updated : item));
    toast.success('ডেলিভারি চার্জ আপডেট হয়েছে');
  }

  return <div>
    <div className="flex flex-wrap justify-between gap-3 mb-6"><div><h1 className="text-2xl font-bold">একীভূত অর্ডার</h1><p className="text-sm text-muted-foreground">ওয়েবসাইট, দোকান ও ম্যানুয়াল ডেলিভারি অর্ডার</p></div><Button onClick={() => setShowManual(value => !value)}><Plus size={16} className="mr-2" />ম্যানুয়াল অর্ডার</Button></div>
    <section className="bg-card border rounded-lg p-4 mb-5"><h2 className="font-semibold mb-3">ডেলিভারি চার্জ</h2><div className="grid gap-3 sm:flex sm:flex-wrap">{rates.map(rate => <button key={rate.id} type="button" onClick={() => setEditingRate(rate)} className="min-h-12 rounded border px-4 py-2 text-left"><strong>{rate.name}</strong><div className="text-sm text-muted-foreground">{rate.charge === null ? 'অনির্ধারিত' : `৳${rate.charge}`} · {rate.isActive ? 'সক্রিয়' : 'নিষ্ক্রিয়'}</div></button>)}</div></section>
    {showManual && <section className="bg-card border rounded-lg p-5 mb-5 space-y-4"><h2 className="font-semibold">নতুন ম্যানুয়াল ডেলিভারি অর্ডার</h2><div className="grid md:grid-cols-4 gap-3"><label>উৎস<select className="min-h-11 w-full rounded border bg-background p-2" value={manualSource} onChange={event => setManualSource(event.target.value as typeof manualSource)}>{manualSources.map(value => <option key={value}>{value}</option>)}</select></label><label>প্রাথমিক অবস্থা<select className="min-h-11 w-full rounded border bg-background p-2" value={initialStatus} onChange={event => setInitialStatus(event.target.value as typeof initialStatus)}><option>PENDING</option><option>CONFIRMED</option></select></label><label>ডেলিভারি এলাকা<select className="min-h-11 w-full rounded border bg-background p-2" value={deliveryRateId} onChange={event => { setDeliveryRateId(event.target.value); setManualErrors(current => ({ ...current, deliveryRate: '' })); }} aria-invalid={Boolean(manualErrors.deliveryRate)}><option value="">নির্বাচন করুন</option>{rates.filter(rate => rate.isActive).map(rate => <option key={rate.id} value={rate.id}>{rate.name} ({rate.charge ?? 'অনির্ধারিত'})</option>)}</select>{manualErrors.deliveryRate && <FieldError>{manualErrors.deliveryRate}</FieldError>}</label><label>ছাড়<Input type="number" min="0" max={manualSubtotal} step="0.01" value={discount} onChange={event => { setDiscount(Number(event.target.value)); setManualErrors(current => ({ ...current, discount: '' })); }} aria-invalid={Boolean(manualErrors.discount)} />{manualErrors.discount && <FieldError>{manualErrors.discount}</FieldError>}</label></div>
      <div className="grid md:grid-cols-4 gap-3"><div><Label htmlFor="manual-customer-name">নাম</Label><Input id="manual-customer-name" value={customerName} onChange={event => { setCustomerName(event.target.value); setManualErrors(current => ({ ...current, name: '' })); }} aria-invalid={Boolean(manualErrors.name)} />{manualErrors.name && <FieldError>{manualErrors.name}</FieldError>}</div><div><Label htmlFor="manual-customer-phone">ফোন</Label><Input id="manual-customer-phone" inputMode="tel" value={customerPhone} onChange={event => { setCustomerPhone(event.target.value); setManualErrors(current => ({ ...current, phone: '' })); }} aria-invalid={Boolean(manualErrors.phone)} />{manualErrors.phone && <FieldError>{manualErrors.phone}</FieldError>}</div><div><Label htmlFor="manual-customer-email">ইমেইল (ঐচ্ছিক)</Label><Input id="manual-customer-email" type="email" value={customerEmail} onChange={event => { setCustomerEmail(event.target.value); setManualErrors(current => ({ ...current, email: '' })); }} aria-invalid={Boolean(manualErrors.email)} />{manualErrors.email && <FieldError>{manualErrors.email}</FieldError>}</div><div><Label htmlFor="manual-customer-address">ঠিকানা</Label><Input id="manual-customer-address" value={customerAddress} onChange={event => { setCustomerAddress(event.target.value); setManualErrors(current => ({ ...current, address: '' })); }} aria-invalid={Boolean(manualErrors.address)} />{manualErrors.address && <FieldError>{manualErrors.address}</FieldError>}</div></div>
      <div className="space-y-2">{manualItems.map((item, index) => <div key={index} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_6rem_auto] sm:border-0 sm:p-0"><select aria-label={`আইটেম ${index + 1} পণ্য`} className="min-h-11 min-w-0 rounded border bg-background p-2" value={item.productVariantId} onChange={event => { setManualErrors(current => ({ ...current, items: '' })); setManualItems(current => current.map((value, itemIndex) => itemIndex === index ? { ...value, productVariantId: event.target.value } : value)); }}><option value="">পণ্য/ভ্যারিয়েন্ট</option>{variants.map(variant => <option key={variant.id} value={variant.id}>{variant.productName} — {variant.name} · {variant.sku} · স্টক {variant.availableStock}</option>)}</select><Input aria-label={`আইটেম ${index + 1} পরিমাণ`} className="w-full" type="number" min="1" value={item.quantity} onChange={event => { setManualErrors(current => ({ ...current, items: '' })); setManualItems(current => current.map((value, itemIndex) => itemIndex === index ? { ...value, quantity: Number(event.target.value) } : value)); }} /><Button type="button" variant="outline" onClick={() => setManualItems(current => current.filter((_, itemIndex) => itemIndex !== index))}>সরান</Button></div>)}{manualErrors.items && <FieldError>{manualErrors.items}</FieldError>}</div>
      <div className="text-sm text-muted-foreground">পণ্যের সাবটোটাল: ৳{manualSubtotal.toFixed(2)}</div>
      {manualErrors.submit && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{manualErrors.submit}</p>}
      <div className="grid gap-2 sm:flex"><Button type="button" className="min-h-11 w-full sm:w-auto" variant="outline" onClick={() => setManualItems(current => [...current, { productVariantId: '', quantity: 1 }])}>আরও আইটেম</Button><Button type="button" className="min-h-11 w-full sm:w-auto" onClick={() => void saveManual()}>অর্ডার তৈরি করুন</Button></div>
    </section>}
    <section className="grid md:grid-cols-4 xl:grid-cols-8 gap-2 mb-4 items-end">
      <select aria-label="অর্ডারের উৎস" className="h-11 rounded border bg-background px-3 md:h-10" value={source} onChange={event => setSource(event.target.value as OrderSource | '')}><option value="">সব উৎস</option>{sources.map(value => <option key={value}>{value}</option>)}</select>
      <select aria-label="অর্ডারের অবস্থা" className="h-11 rounded border bg-background px-3 md:h-10" value={status} onChange={event => setStatus(event.target.value as OrderStatus | '')}><option value="">সব অবস্থা</option>{statuses.map(value => <option key={value}>{value}</option>)}</select>
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
        <div className="flex flex-wrap gap-2 mt-3">{order.status === 'PENDING' && <><Button size="sm" onClick={() => setPendingAction({ order, action: 'CONFIRM' })}>নিশ্চিত ও স্টক সংরক্ষণ</Button><Button size="sm" variant="outline" onClick={() => setPendingAction({ order, action: 'CANCEL' })}>বাতিল</Button></>}{order.status === 'CONFIRMED' && <><Button size="sm" onClick={() => setPendingAction({ order, action: 'PROCESS' })}>প্রসেসিং</Button><Button size="sm" onClick={() => setPendingAction({ order, action: 'DELIVER' })}>ডেলিভারড</Button><Button size="sm" variant="outline" onClick={() => setPendingAction({ order, action: 'FAILED_DELIVERY' })}>ডেলিভারি ব্যর্থ</Button></>}{order.status === 'PROCESSING' && <><Button size="sm" onClick={() => setPendingAction({ order, action: 'DELIVER' })}>ডেলিভারড</Button><Button size="sm" variant="outline" onClick={() => setPendingAction({ order, action: 'FAILED_DELIVERY' })}>ডেলিভারি ব্যর্থ</Button></>}{(order.status === 'DELIVERED' || order.status === 'COMPLETED') && <Button size="sm" variant="outline" onClick={() => setReturnOrder(order)}>পুরো অর্ডার ফেরত</Button>}</div>
      </article>)}</div>}
    <ReturnOrderDialog order={returnOrder} onClose={() => setReturnOrder(null)} onConfirm={submitReturn} />
    <OrderActionDialog order={pendingAction?.order ?? null} action={pendingAction?.action ?? null} onClose={() => setPendingAction(null)} onConfirm={submitAction} />
    <DeliveryRateDialog rate={editingRate} onClose={() => setEditingRate(null)} onConfirm={saveRate} />
    <ProfitWarningDialog open={manualProjectedLoss !== null} projectedGrossProfit={manualProjectedLoss} onClose={() => setManualProjectedLoss(null)} onConfirm={() => saveManual(true)} />
  </div>;
}

function FieldError({ children }: { children: string }) {
  return <p role="alert" className="mt-1 text-sm text-destructive">{children}</p>;
}
