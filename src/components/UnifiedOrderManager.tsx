import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import VariantOptionCombobox from '@/components/VariantOptionCombobox';
import { Input } from '@/components/ui/input';
import { FormattedDateInput } from '@/components/ui/formatted-date-input';
import { Label } from '@/components/ui/label';
import { FilterField, FilterFields, FilterPanel, FilterRefreshButton, FilterResetButton, filterSelectClassName } from '@/components/ui/filter-panel';
import ReturnOrderDialog, { type ReturnCondition } from '@/components/ReturnOrderDialog';
import OrderActionDialog, { type OrderAction } from '@/components/OrderActionDialog';
import ProfitWarningDialog from '@/components/ProfitWarningDialog';
import PriceIncreaseDialog from '@/components/PriceIncreaseDialog';
import DeliveryRateDialog from '@/components/DeliveryRateDialog';
import {
  ApiError,
  createManualOrder,
  getAdminDeliveryRates,
  getOrders,
  transitionOrder,
  updateDeliveryRate,
} from '@/lib/api';
import type { DeliveryRate, OrderSource, OrderStatus, UnifiedOrder, VariantOption } from '@/lib/types';
import { productPackLabel } from '@/lib/productOptions';
import { formatQuantity, sellingPriceForQuantity } from '@/lib/quantity';
import { formatAppDateTime } from '@/lib/date';

const sources: OrderSource[] = ['WEBSITE', 'PHYSICAL_SHOP', 'FACEBOOK', 'PHONE', 'WHATSAPP', 'OTHER'];
const statuses: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PROCESSING', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'RETURNED_SELLABLE', 'RETURNED_DAMAGED'];
const manualSources = ['FACEBOOK', 'PHONE', 'WHATSAPP', 'OTHER'] as const;

interface ManualItem { option: VariantOption | null; quantity: number }

interface OrderFilterPreferences {
  source: OrderSource | '';
  status: OrderStatus | '';
  orderNumber: string;
  phone: string;
  dateFrom: string;
  dateTo: string;
}

const ORDER_FILTERS_KEY = 'nafah_order_filters_v1';

function readOrderFilters(orderNumberFromUrl: string): OrderFilterPreferences {
  const fallback: OrderFilterPreferences = { source: '', status: '', orderNumber: orderNumberFromUrl, phone: '', dateFrom: '', dateTo: '' };
  try {
    const value = JSON.parse(window.sessionStorage.getItem(ORDER_FILTERS_KEY) ?? '{}') as Record<string, unknown>;
    return {
      source: sources.includes(value.source as OrderSource) ? value.source as OrderSource : '',
      status: statuses.includes(value.status as OrderStatus) ? value.status as OrderStatus : '',
      orderNumber: orderNumberFromUrl || (typeof value.orderNumber === 'string' ? value.orderNumber : ''),
      phone: typeof value.phone === 'string' ? value.phone : '',
      dateFrom: typeof value.dateFrom === 'string' ? value.dateFrom : '',
      dateTo: typeof value.dateTo === 'string' ? value.dateTo : '',
    };
  } catch {
    return fallback;
  }
}

export default function UnifiedOrderManager() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [initialFilters] = useState(() => readOrderFilters(searchParams.get('orderNumber')?.trim() ?? ''));
  const [orders, setOrders] = useState<UnifiedOrder[]>([]);
  const [rates, setRates] = useState<DeliveryRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<OrderSource | ''>(initialFilters.source);
  const [status, setStatus] = useState<OrderStatus | ''>(initialFilters.status);
  const [orderNumber, setOrderNumber] = useState(initialFilters.orderNumber);
  const [phoneFilter, setPhoneFilter] = useState(initialFilters.phone);
  const [dateFrom, setDateFrom] = useState(initialFilters.dateFrom);
  const [dateTo, setDateTo] = useState(initialFilters.dateTo);
  const [showManual, setShowManual] = useState(false);
  const [manualSource, setManualSource] = useState<typeof manualSources[number]>('PHONE');
  const [initialStatus, setInitialStatus] = useState<'PENDING' | 'CONFIRMED'>('CONFIRMED');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [deliveryRateId, setDeliveryRateId] = useState('');
  const [finalProductTotal, setFinalProductTotal] = useState('');
  const [priceEdited, setPriceEdited] = useState(false);
  const [manualItems, setManualItems] = useState<ManualItem[]>([{ option: null, quantity: 1 }]);
  const [returnOrder, setReturnOrder] = useState<UnifiedOrder | null>(null);
  const [pendingAction, setPendingAction] = useState<{ order: UnifiedOrder; action: OrderAction } | null>(null);
  const [editingRate, setEditingRate] = useState<DeliveryRate | null>(null);
  const [manualProjectedLoss, setManualProjectedLoss] = useState<unknown>(null);
  const [manualPriceIncrease, setManualPriceIncrease] = useState<number | null>(null);
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
    try {
      window.sessionStorage.setItem(ORDER_FILTERS_KEY, JSON.stringify({
        source, status, orderNumber, phone: phoneFilter, dateFrom, dateTo,
      }));
    } catch {
      // The filters still work when browser storage is unavailable.
    }
  }, [dateFrom, dateTo, orderNumber, phoneFilter, source, status]);
  useEffect(() => {
    void getAdminDeliveryRates().then((deliveryRates) => {
      setRates(deliveryRates);
      setDeliveryRateId(deliveryRates.find(rate => rate.isActive && rate.charge !== null)?.id ?? '');
    }).catch(() => toast.error('ম্যানুয়াল অর্ডারের সহায়ক তথ্য লোড হয়নি'));
  }, []);

  const manualSubtotal = useMemo(() => manualItems.reduce((total, item) => {
    const variant = item.option;
    if (!variant) return total;
    const pricing = sellingPriceForQuantity({
      kind: variant.productKind,
      regularPrice: variant.sellingPrice,
      bulkPrice: variant.bulkSellingPrice,
      quantity: item.quantity,
    });
    return total + pricing.unitPrice * item.quantity;
  }, 0), [manualItems]);
  const displayedFinalTotal = priceEdited ? finalProductTotal : manualSubtotal.toFixed(2);
  const finalTotalNumber = Number(displayedFinalTotal);
  const selectedDeliveryCharge = rates.find((rate) => rate.id === deliveryRateId)?.charge ?? 0;
  const hasActiveFilters = Boolean(source || status || orderNumber || phoneFilter || dateFrom || dateTo);

  function clearFilters() {
    setSource('');
    setStatus('');
    setOrderNumber('');
    setPhoneFilter('');
    setDateFrom('');
    setDateTo('');
    if (searchParams.has('orderNumber')) {
      const next = new URLSearchParams(searchParams);
      next.delete('orderNumber');
      setSearchParams(next, { replace: true });
    }
  }

  async function submitAction(reason: string | undefined, confirmUnprofitable: boolean) {
    if (!pendingAction) return;
    const { order, action } = pendingAction;
    if (action === 'CONFIRM') await transitionOrder(order.id, { action, confirmUnprofitable });
    else if (action === 'CANCEL' || action === 'FAILED_DELIVERY') await transitionOrder(order.id, { action, reason });
    else await transitionOrder(order.id, { action });
    toast.success('অর্ডার আপডেট হয়েছে');
    await loadOrders();
  }

  async function submitReturn(condition: ReturnCondition, reason?: string) {
    if (!returnOrder) return;
    await transitionOrder(returnOrder.id, { action: 'RETURN', condition, reason });
    toast.success('পুরো অর্ডার রিটার্ন সম্পন্ন হয়েছে');
    await loadOrders();
  }

  async function saveManual(confirmUnprofitable = false, confirmPriceIncrease = false) {
    const items = manualItems.filter(item => item.option && item.quantity > 0).map((item) => ({ productVariantId: item.option!.productVariantId, quantity: item.quantity }));
    const nextErrors: Record<string, string> = {};
    if (!customerName.trim()) nextErrors.name = 'গ্রাহকের নাম লিখুন।';
    if (customerPhone.trim().length < 7 || customerPhone.trim().length > 30) nextErrors.phone = 'ফোন নম্বর 7 থেকে 30 অক্ষরের মধ্যে লিখুন।';
    if (customerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())) nextErrors.email = 'সঠিক ইমেইল ঠিকানা লিখুন।';
    if (customerAddress.trim().length < 5) nextErrors.address = 'কমপক্ষে 5 অক্ষরের ডেলিভারি ঠিকানা লিখুন।';
    if (!deliveryRateId) nextErrors.deliveryRate = 'ডেলিভারি এলাকা সিলেক্ট করুন।';
    if (items.length === 0 || items.length !== manualItems.length) nextErrors.items = 'প্রতিটি আইটেমে পণ্য ও 1 বা তার বেশি পরিমাণ দিন।';
    if (!/^\d+(?:\.\d{1,2})?$/.test(displayedFinalTotal) || !Number.isFinite(finalTotalNumber)) nextErrors.finalTotal = 'মোট পণ্যের সঠিক দাম দিন (সর্বোচ্চ ২ ঘর দশমিক)।';
    if (Object.keys(nextErrors).length > 0) { setManualErrors(nextErrors); return; }
    setManualErrors({});
    try {
      await createManualOrder({ source: manualSource, initialStatus, items, customer: {
        name: customerName.trim(), phone: customerPhone.trim(), address: customerAddress.trim(),
        ...(customerEmail.trim() ? { email: customerEmail.trim() } : {}),
      }, deliveryRateId, discountTotal: 0, finalProductTotal: priceEdited ? finalTotalNumber : undefined, confirmUnprofitable, confirmPriceIncrease });
      toast.success('ম্যানুয়াল ডেলিভারি অর্ডার তৈরি হয়েছে');
      setShowManual(false); setManualItems([{ option: null, quantity: 1 }]); setFinalProductTotal(''); setPriceEdited(false);
      setCustomerName(''); setCustomerPhone(''); setCustomerEmail(''); setCustomerAddress('');
      setManualProjectedLoss(null);
      setManualPriceIncrease(null);
      await loadOrders();
    } catch (error) {
      if (!confirmPriceIncrease && error instanceof ApiError && error.code === 'PRICE_INCREASE_CONFIRMATION_REQUIRED') {
        setManualPriceIncrease(Number(error.details?.priceIncreaseTotal ?? Math.max(0, finalTotalNumber - manualSubtotal)));
      } else if (!confirmUnprofitable && error instanceof Error && 'code' in error && error.code === 'UNPROFITABLE_ORDER_CONFIRMATION_REQUIRED') {
        const details = 'details' in error && error.details && typeof error.details === 'object' ? error.details as Record<string, unknown> : {};
        setManualProjectedLoss(details.projectedGrossProfit ?? 'ক্ষতি হবে');
      } else if (confirmUnprofitable || confirmPriceIncrease) {
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
    <div className="flex flex-wrap justify-between gap-3 mb-6"><div><h1 className="text-2xl font-bold">অর্ডার</h1><p className="text-sm text-muted-foreground">ওয়েবসাইট, দোকান ও ম্যানুয়াল ডেলিভারি অর্ডার</p></div><Button onClick={() => setShowManual(value => !value)}><Plus size={16} className="mr-2" />ম্যানুয়াল অর্ডার</Button></div>
    <section className="bg-card border rounded-lg p-4 mb-5"><h2 className="font-semibold mb-3">ডেলিভারি চার্জ</h2><div className="grid gap-3 sm:flex sm:flex-wrap">{rates.map(rate => <button key={rate.id} type="button" onClick={() => setEditingRate(rate)} className="min-h-12 rounded border px-4 py-2 text-left"><strong>{rate.name}</strong><div className="text-sm text-muted-foreground">{rate.charge === null ? 'সেট করা হয়নি' : `৳${rate.charge}`} · {rate.isActive ? 'অ্যাকটিভ' : 'ইনঅ্যাকটিভ'}</div></button>)}</div></section>
    {showManual && <section className="bg-card border rounded-lg p-5 mb-5 space-y-4"><h2 className="font-semibold">নতুন ম্যানুয়াল ডেলিভারি অর্ডার</h2><div className="grid md:grid-cols-3 gap-3"><label>উৎস<select className="min-h-11 w-full rounded border bg-background p-2" value={manualSource} onChange={event => setManualSource(event.target.value as typeof manualSource)}>{manualSources.map(value => <option key={value}>{value}</option>)}</select></label><label>শুরুর স্ট্যাটাস<select className="min-h-11 w-full rounded border bg-background p-2" value={initialStatus} onChange={event => setInitialStatus(event.target.value as typeof initialStatus)}><option>PENDING</option><option>CONFIRMED</option></select></label><label>ডেলিভারি এলাকা<select className="min-h-11 w-full rounded border bg-background p-2" value={deliveryRateId} onChange={event => { setDeliveryRateId(event.target.value); setManualErrors(current => ({ ...current, deliveryRate: '' })); }} aria-invalid={Boolean(manualErrors.deliveryRate)}><option value="">সিলেক্ট করুন</option>{rates.filter(rate => rate.isActive).map(rate => <option key={rate.id} value={rate.id}>{rate.name} ({rate.charge ?? 'সেট করা হয়নি'})</option>)}</select>{manualErrors.deliveryRate && <FieldError>{manualErrors.deliveryRate}</FieldError>}</label></div>
      <div className="grid md:grid-cols-4 gap-3"><div><Label htmlFor="manual-customer-name">নাম</Label><Input id="manual-customer-name" value={customerName} onChange={event => { setCustomerName(event.target.value); setManualErrors(current => ({ ...current, name: '' })); }} aria-invalid={Boolean(manualErrors.name)} />{manualErrors.name && <FieldError>{manualErrors.name}</FieldError>}</div><div><Label htmlFor="manual-customer-phone">ফোন</Label><Input id="manual-customer-phone" inputMode="tel" value={customerPhone} onChange={event => { setCustomerPhone(event.target.value); setManualErrors(current => ({ ...current, phone: '' })); }} aria-invalid={Boolean(manualErrors.phone)} />{manualErrors.phone && <FieldError>{manualErrors.phone}</FieldError>}</div><div><Label htmlFor="manual-customer-email">ইমেইল (ঐচ্ছিক)</Label><Input id="manual-customer-email" type="email" value={customerEmail} onChange={event => { setCustomerEmail(event.target.value); setManualErrors(current => ({ ...current, email: '' })); }} aria-invalid={Boolean(manualErrors.email)} />{manualErrors.email && <FieldError>{manualErrors.email}</FieldError>}</div><div><Label htmlFor="manual-customer-address">ঠিকানা</Label><Input id="manual-customer-address" value={customerAddress} onChange={event => { setCustomerAddress(event.target.value); setManualErrors(current => ({ ...current, address: '' })); }} aria-invalid={Boolean(manualErrors.address)} />{manualErrors.address && <FieldError>{manualErrors.address}</FieldError>}</div></div>
      <div className="space-y-2">{manualItems.map((item, index) => <div key={index} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_6rem_auto] sm:border-0 sm:p-0"><VariantOptionCombobox context="MANUAL_ORDER" selected={item.option} ariaLabel={`আইটেম ${index + 1} পণ্য`} disabledReason={(option) => manualItems.some((other, itemIndex) => itemIndex !== index && other.option?.productVariantId === option.productVariantId) ? 'এই পণ্যটি অর্ডারে আগেই আছে।' : initialStatus === 'CONFIRMED' && option.availableStock <= 0 ? 'কনফার্মড অর্ডারের জন্য এই পণ্যের স্টক নেই।' : undefined} onSelect={(option) => { setManualErrors(current => ({ ...current, items: '' })); setManualItems(current => current.map((value, itemIndex) => itemIndex === index ? { ...value, option } : value)); }} /><div><Input aria-label={`আইটেম ${index + 1} পরিমাণ`} className="w-full" type="number" min="1" step="1" value={item.quantity} onChange={event => { setManualErrors(current => ({ ...current, items: '' })); setManualItems(current => current.map((value, itemIndex) => itemIndex === index ? { ...value, quantity: Number(event.target.value) } : value)); }} />{item.option && <span className="mt-1 block text-xs text-muted-foreground">{item.option.productKind === "EGG" ? "টি ডিম" : (item.option.unitLabel ?? "ইউনিট")}</span>}</div><Button type="button" variant="outline" onClick={() => setManualItems(current => current.filter((_, itemIndex) => itemIndex !== index))}>রিমুভ করুন</Button></div>)}{manualErrors.items && <FieldError>{manualErrors.items}</FieldError>}</div>
      <div className="rounded-lg border bg-muted/20 p-3 space-y-2 text-sm"><div className="flex justify-between"><span>বর্তমান পণ্যের দাম</span><strong>৳{manualSubtotal.toFixed(2)}</strong></div><div><Label htmlFor="manual-final-product-total">মোট পণ্যের দাম (৳)</Label><Input id="manual-final-product-total" type="number" min="0" step="0.01" value={displayedFinalTotal} onChange={event => { setFinalProductTotal(event.target.value); setPriceEdited(true); setManualErrors(current => ({ ...current, finalTotal: '' })); }} aria-invalid={Boolean(manualErrors.finalTotal)} />{manualErrors.finalTotal && <FieldError>{manualErrors.finalTotal}</FieldError>}</div>{Number.isFinite(finalTotalNumber) && finalTotalNumber < manualSubtotal && <div className="flex justify-between"><span>ছাড়</span><span>-৳{(manualSubtotal - finalTotalNumber).toFixed(2)}</span></div>}{Number.isFinite(finalTotalNumber) && finalTotalNumber > manualSubtotal && <div className="flex justify-between"><span>বাড়তি দাম</span><span>+৳{(finalTotalNumber - manualSubtotal).toFixed(2)}</span></div>}<div className="flex justify-between"><span>ডেলিভারি চার্জ</span><span>৳{selectedDeliveryCharge.toFixed(2)}</span></div><div className="flex justify-between border-t pt-2 font-semibold"><span>গ্রাহকের মোট দাম</span><span>{Number.isFinite(finalTotalNumber) ? `৳${(finalTotalNumber + selectedDeliveryCharge).toFixed(2)}` : 'দাম দিন'}</span></div></div>
      {manualErrors.submit && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{manualErrors.submit}</p>}
      <div className="grid gap-2 sm:flex"><Button type="button" className="min-h-11 w-full sm:w-auto" variant="outline" onClick={() => setManualItems(current => [...current, { option: null, quantity: 1 }])}>আরও আইটেম</Button><Button type="button" className="min-h-11 w-full sm:w-auto" onClick={() => void saveManual()}>অর্ডার তৈরি করুন</Button></div>
    </section>}
    <FilterPanel className="mb-4" actions={<><FilterResetButton active={hasActiveFilters} onClick={clearFilters} /><FilterRefreshButton onClick={() => void loadOrders()} loading={loading} /></>}>
      <FilterFields className="lg:grid-cols-3 xl:grid-cols-6">
        <FilterField label="অর্ডারের উৎস"><select aria-label="অর্ডারের উৎস" className={filterSelectClassName} value={source} onChange={event => setSource(event.target.value as OrderSource | '')}><option value="">সব উৎস</option>{sources.map(value => <option key={value}>{value}</option>)}</select></FilterField>
        <FilterField label="অর্ডারের স্ট্যাটাস"><select aria-label="অর্ডারের স্ট্যাটাস" className={filterSelectClassName} value={status} onChange={event => setStatus(event.target.value as OrderStatus | '')}><option value="">সব স্ট্যাটাস</option>{statuses.map(value => <option key={value}>{value}</option>)}</select></FilterField>
        <FilterField label="অর্ডার নম্বর"><Input aria-label="অর্ডার নম্বর" placeholder="অর্ডার নম্বর লিখুন" value={orderNumber} onChange={event => setOrderNumber(event.target.value)} /></FilterField>
        <FilterField label="গ্রাহকের ফোন"><Input aria-label="গ্রাহকের ফোন" placeholder="ফোন নম্বর লিখুন" value={phoneFilter} onChange={event => setPhoneFilter(event.target.value)} /></FilterField>
        <FilterField label="তারিখ থেকে"><FormattedDateInput aria-label="অর্ডারের তারিখ থেকে" value={dateFrom} onChange={event => setDateFrom(event.target.value)} /></FilterField>
        <FilterField label="তারিখ পর্যন্ত"><FormattedDateInput aria-label="অর্ডারের তারিখ পর্যন্ত" value={dateTo} onChange={event => setDateTo(event.target.value)} /></FilterField>
      </FilterFields>
    </FilterPanel>
    {loading ? <div className="py-20 flex justify-center"><Loader2 className="animate-spin mr-2" />লোড হচ্ছে…</div> : <div className="space-y-3">{orders.map(order => <article key={order.id} className="bg-card border rounded-lg p-4"><div className="flex flex-wrap justify-between gap-3"><div><strong>{order.orderNumber}</strong><div className="text-sm">{order.source} · {order.status} · {order.customerName ?? 'গ্রাহক নেই'} · {order.customerPhone ?? 'ফোন নেই'}</div><div className="text-xs text-muted-foreground">{formatAppDateTime(order.placedAt)}</div></div><div className="text-right"><div className="font-bold">মোট ৳{order.grandTotal}</div><div className="text-sm">ক্রয়মূল্য {order.totalBuyingCost === null ? 'এখনও হিসাব হয়নি' : `৳${order.totalBuyingCost}`} · লাভ {order.grossProfit === null ? 'এখনও হিসাব হয়নি' : `৳${order.grossProfit}`} · মার্জিন {order.grossProfitMargin === null ? 'লাভের হিসাব নেই' : `${order.grossProfitMargin}%`}</div></div></div>
        <div className="text-sm mt-3">{order.items.map(item => `${productPackLabel(item.productName, item.variantName)} × ${formatQuantity(item.quantity, item.quantityUnit, undefined, item.unitLabel)}`).join(', ')}</div>
        {(order.discountTotal > 0 || order.priceIncreaseTotal > 0) && <div className="mt-2 text-xs text-muted-foreground">বর্তমান পণ্যের দাম ৳{order.subtotal.toFixed(2)}{order.discountTotal > 0 ? ` · ছাড় -৳${order.discountTotal.toFixed(2)}` : ''}{order.priceIncreaseTotal > 0 ? ` · বাড়তি দাম +৳${order.priceIncreaseTotal.toFixed(2)}` : ''} · ডেলিভারি ৳{order.deliveryCharge.toFixed(2)}</div>}
        {order.statusReason && <div className="text-sm text-destructive mt-2">কারণ: {order.statusReason}</div>}
        <div className="flex flex-wrap gap-2 mt-3">{order.status === 'PENDING' && <><Button size="sm" onClick={() => setPendingAction({ order, action: 'CONFIRM' })}>অর্ডার কনফার্ম ও স্টক রিজার্ভ</Button><Button size="sm" variant="outline" onClick={() => setPendingAction({ order, action: 'CANCEL' })}>বাতিল</Button></>}{order.status === 'CONFIRMED' && <><Button size="sm" onClick={() => setPendingAction({ order, action: 'PROCESS' })}>প্রসেসিং</Button><Button size="sm" onClick={() => setPendingAction({ order, action: 'DELIVER' })}>ডেলিভারড</Button><Button size="sm" variant="outline" onClick={() => setPendingAction({ order, action: 'FAILED_DELIVERY' })}>ডেলিভারি ব্যর্থ</Button></>}{order.status === 'PROCESSING' && <><Button size="sm" onClick={() => setPendingAction({ order, action: 'DELIVER' })}>ডেলিভারড</Button><Button size="sm" variant="outline" onClick={() => setPendingAction({ order, action: 'FAILED_DELIVERY' })}>ডেলিভারি ব্যর্থ</Button></>}{order.source !== 'PHYSICAL_SHOP' && (order.status === 'DELIVERED' || order.status === 'COMPLETED') && <Button size="sm" variant="outline" onClick={() => setReturnOrder(order)}>পুরো অর্ডার রিটার্ন</Button>}</div>
      </article>)}</div>}
    <ReturnOrderDialog order={returnOrder} onClose={() => setReturnOrder(null)} onConfirm={submitReturn} />
    <OrderActionDialog order={pendingAction?.order ?? null} action={pendingAction?.action ?? null} onClose={() => setPendingAction(null)} onConfirm={submitAction} />
    <DeliveryRateDialog rate={editingRate} onClose={() => setEditingRate(null)} onConfirm={saveRate} />
    <PriceIncreaseDialog open={manualPriceIncrease !== null} increase={manualPriceIncrease ?? 0} subject="অর্ডার" onClose={() => setManualPriceIncrease(null)} onConfirm={() => saveManual(false, true)} />
    <ProfitWarningDialog open={manualProjectedLoss !== null} projectedGrossProfit={manualProjectedLoss} onClose={() => setManualProjectedLoss(null)} onConfirm={() => saveManual(true, finalTotalNumber > manualSubtotal)} />
  </div>;
}

function FieldError({ children }: { children: string }) {
  return <p role="alert" className="mt-1 text-sm text-destructive">{children}</p>;
}
