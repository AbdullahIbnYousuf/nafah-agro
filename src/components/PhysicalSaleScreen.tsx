import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, ChevronDown, Clock3, HandCoins, Plus, Search, ShoppingCart, Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ProfitWarningDialog from '@/components/ProfitWarningDialog';
import PhysicalSaleReturnDialog from '@/components/PhysicalSaleReturnDialog';
import { ApiError, createPhysicalSale, getAdminProducts, getPhysicalSales, returnPhysicalSale } from '@/lib/api';
import type { AmountUnit, PhysicalSale, Product, ProductVariant } from '@/lib/types';
import { getErrorMessage } from '@/lib/utils';
import { productPackLabel, visiblePackSize } from '@/lib/productOptions';
import { amountUnitsForKind, defaultAmountUnit, formatQuantity, productKindLabel, quantityUnitForKind, rateLabel, toBaseQuantity } from '@/lib/quantity';

interface SaleLine {
  product: Product;
  variant: ProductVariant;
  amount: string;
  amountUnit: AmountUnit;
}

function dhakaDate(offsetDays = 0) {
  const value = new Date(Date.now() + 6 * 60 * 60 * 1_000);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

export default function PhysicalSaleScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [recentSales, setRecentSales] = useState<PhysicalSale[]>([]);
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [selectionDraft, setSelectionDraft] = useState<SaleLine | null>(null);
  const [selectionError, setSelectionError] = useState('');
  const [query, setQuery] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [discount, setDiscount] = useState('0');
  const [paymentMode, setPaymentMode] = useState<'PAID_NOW' | 'CREDIT'>('PAID_NOW');
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState<PhysicalSale | null>(null);
  const [projectedLoss, setProjectedLoss] = useState<unknown>(null);
  const [returnSale, setReturnSale] = useState<PhysicalSale | null>(null);
  const [historyProduct, setHistoryProduct] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [historyFilters, setHistoryFilters] = useState({ product: '', query: '', dateFrom: '', dateTo: '' });
  const [errors, setErrors] = useState<{ items?: string; customerName?: string; phone?: string; followUp?: string; discount?: string; submit?: string }>({});
  const productGridRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    setLoadingProducts(true);
    Promise.all([getAdminProducts({ limit: 100 }), getPhysicalSales({
      limit: 50,
      ...(historyFilters.product ? { product: historyFilters.product } : {}),
      ...(historyFilters.query ? { query: historyFilters.query } : {}),
      ...(historyFilters.dateFrom ? { dateFrom: historyFilters.dateFrom } : {}),
      ...(historyFilters.dateTo ? { dateTo: historyFilters.dateTo } : {}),
    })])
      .then(([page, sales]) => { setProducts(page.data); setRecentSales(sales); })
      .catch((error) => toast.error(getErrorMessage(error, 'বিক্রয় স্ক্রিন লোড হয়নি')))
      .finally(() => setLoadingProducts(false));
  }, [historyFilters]);
  useEffect(load, [load]);

  const variants = useMemo(() => products.flatMap((product) =>
    product.isActive === false ? [] : (product.variants ?? []).filter((variant) => variant.isActive).map((variant) => ({ product, variant }))), [products]);
  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return variants.slice(0, 12);
    return variants.filter(({ product, variant }) =>
      `${product.name} ${visiblePackSize(variant.name) ?? ''}`.toLowerCase().includes(normalized)).slice(0, 20);
  }, [query, variants]);

  useEffect(() => {
    if (!selectionDraft) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!productGridRef.current?.contains(event.target as Node)) {
        setSelectionDraft(null);
        setSelectionError('');
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [selectionDraft]);

  const subtotal = lines.reduce((sum, line) => {
    const base = toBaseQuantity(line.amount, line.amountUnit) ?? 0;
    const scale = (line.product.kind ?? 'PACKAGED') === 'PACKAGED' ? 1 : 1_000;
    return sum + line.variant.sellingPrice * base / scale;
  }, 0);
  const discountNumber = Number(discount) || 0;
  const total = subtotal - discountNumber;

  function toggleProductSelection(product: Product, variant: ProductVariant) {
    if (variant.availableStock <= 0) return;
    setSelectionError('');
    setSelectionDraft((current) => {
      if (current?.variant.id === variant.id) return null;
      const existing = lines.find((line) => line.variant.id === variant.id);
      return existing
        ? { ...existing }
        : { product, variant, amount: '1', amountUnit: defaultAmountUnit(product.kind) };
    });
  }

  function saveProductSelection() {
    if (!selectionDraft) return;
    const quantity = toBaseQuantity(selectionDraft.amount, selectionDraft.amountUnit);
    if (quantity === null) {
      setSelectionError('সঠিক পরিমাণ দিন।');
      return;
    }
    if (quantity > selectionDraft.variant.availableStock) {
      setSelectionError(`স্টকে সর্বোচ্চ ${formatQuantity(selectionDraft.variant.availableStock, quantityUnitForKind(selectionDraft.product.kind))} আছে।`);
      return;
    }
    setLines((current) => {
      const existing = current.some((line) => line.variant.id === selectionDraft.variant.id);
      return existing
        ? current.map((line) => line.variant.id === selectionDraft.variant.id ? selectionDraft : line)
        : [...current, selectionDraft];
    });
    setErrors((current) => ({ ...current, items: undefined }));
    setSelectionDraft(null);
    setSelectionError('');
  }

  async function saveSale(confirmUnprofitable = false) {
    const nextErrors: typeof errors = {};
    if (lines.length === 0) nextErrors.items = 'কমপক্ষে একটি পণ্য যোগ করুন।';
    if (lines.some((line) => {
      const base = toBaseQuantity(line.amount, line.amountUnit);
      return base === null || base > line.variant.availableStock;
    })) nextErrors.items = 'প্রতিটি পণ্যের সঠিক পরিমাণ দিন এবং বর্তমান স্টকের মধ্যে রাখুন।';
    if (customerPhone.trim() && (customerPhone.trim().length < 7 || customerPhone.trim().length > 30)) nextErrors.phone = 'ফোন নম্বর ৭ থেকে ৩০ অক্ষরের মধ্যে লিখুন।';
    if (paymentMode === 'CREDIT' && !customerName.trim()) nextErrors.customerName = 'বাকি বিক্রির জন্য ক্রেতার নাম দিন।';
    if (paymentMode === 'CREDIT' && !customerPhone.trim()) nextErrors.phone = 'বাকি বিক্রির জন্য ফোন নম্বর দিন।';
    if (paymentMode === 'CREDIT' && (!nextFollowUpDate || nextFollowUpDate < dhakaDate())) nextErrors.followUp = 'আজ বা পরের কোনো যোগাযোগের তারিখ দিন।';
    if (!Number.isFinite(discountNumber) || discountNumber < 0 || discountNumber > subtotal) nextErrors.discount = 'ডিসকাউন্ট শূন্য থেকে সাবটোটালের মধ্যে হতে হবে।';
    if (Object.keys(nextErrors).length > 0) { setErrors(nextErrors); return; }
    setErrors({});
    setSaving(true);
    try {
      const result = await createPhysicalSale({
        items: lines.map((line) => ({ productVariantId: line.variant.id, amount: line.amount, amountUnit: line.amountUnit })),
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        discountTotal: discountNumber,
        paymentMode,
        nextFollowUpDate: paymentMode === 'CREDIT' ? nextFollowUpDate : undefined,
        confirmUnprofitable,
      });
      setCompleted(result);
      setLines([]); setCustomerName(''); setCustomerPhone(''); setDiscount('0'); setPaymentMode('PAID_NOW'); setNextFollowUpDate('');
      setProjectedLoss(null);
      toast.success(`বিক্রয় ${result.orderNumber} সম্পন্ন হয়েছে`);
      load();
    } catch (error) {
      if (!confirmUnprofitable && error instanceof ApiError && error.code === 'UNPROFITABLE_SALE_CONFIRMATION_REQUIRED') {
        setProjectedLoss(error.details?.projectedGrossProfit ?? 'ক্ষতি হবে');
      } else if (confirmUnprofitable) {
        throw error;
      } else {
        setErrors({ submit: getErrorMessage(error, 'বিক্রয় সম্পন্ন হয়নি') });
      }
    } finally {
      setSaving(false);
    }
  }

  async function submitReturn(input: Parameters<typeof returnPhysicalSale>[1]) {
    if (!returnSale) return;
    const updated = await returnPhysicalSale(returnSale.id, input);
    setRecentSales((current) => current.map((sale) => sale.id === updated.id ? updated : sale));
    setCompleted((current) => current?.id === updated.id ? updated : current);
    setReturnSale(updated);
    toast.success('পণ্য ফেরত সম্পন্ন হয়েছে');
  }

  function applyHistoryFilters(event: React.FormEvent) {
    event.preventDefault();
    setHistoryFilters({ product: historyProduct.trim(), query: historyQuery.trim(), dateFrom: historyDateFrom, dateTo: historyDateTo });
  }

  function clearHistoryFilters() {
    setHistoryProduct('');
    setHistoryQuery('');
    setHistoryDateFrom('');
    setHistoryDateTo('');
    setHistoryFilters({ product: '', query: '', dateFrom: '', dateTo: '' });
  }

  return <div className="space-y-8">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">দোকানের বিক্রি</h1><p className="text-sm text-muted-foreground">এখন পেমেন্ট অথবা বাকি রেখে বিক্রি সম্পন্ন করুন।</p></div><Button asChild variant="outline"><Link to="/admin/dues"><HandCoins size={17} className="mr-2" />বাকি হিসাব</Link></Button></div>
    <div className="grid xl:grid-cols-[1.1fr_1fr] gap-6">
      <section className="bg-card border rounded-lg p-5 space-y-4">
        <div className="relative"><Search className="absolute left-3 top-3 text-muted-foreground" size={17} /><Input aria-label="বিক্রির পণ্য খুঁজুন" className="pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="পণ্য বা প্যাক/সাইজ খুঁজুন" /></div>
        <div
          ref={productGridRef}
          className="grid sm:grid-cols-2 gap-2 max-h-[430px] overflow-y-auto"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setSelectionDraft(null);
              setSelectionError('');
            }
          }}
        >
          {matches.map(({ product, variant }) => {
            const title = productPackLabel(product.name, variant.name);
            const isOpen = selectionDraft?.variant.id === variant.id;
            const isInSale = lines.some((line) => line.variant.id === variant.id);
            return <div key={variant.id} className={`self-start overflow-hidden rounded-lg border transition-colors ${isOpen ? 'border-secondary ring-1 ring-secondary/30' : 'hover:border-secondary'} ${variant.availableStock <= 0 ? 'opacity-50' : ''}`}>
              <button
                type="button"
                onClick={() => toggleProductSelection(product, variant)}
                disabled={variant.availableStock <= 0}
                aria-expanded={isOpen}
                aria-controls={`physical-sale-selection-${variant.id}`}
                aria-label={`${title} পরিমাণ বেছে নিন`}
                className="w-full p-3 text-left disabled:cursor-not-allowed"
              >
                <div className="flex items-start justify-between gap-2"><div className="font-medium">{title}</div><ChevronDown size={17} className={`mt-0.5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} /></div>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{productKindLabel(product.kind)}</span>{isInSale && <span className="rounded-full bg-secondary/15 px-2 py-0.5 font-medium text-secondary">তালিকায় আছে</span>}</div>
                <div className="flex justify-between gap-2 mt-2"><span>৳{variant.sellingPrice} {rateLabel(product.kind)}</span><span>স্টক {formatQuantity(variant.availableStock, quantityUnitForKind(product.kind))}</span></div>
              </button>
              {isOpen && selectionDraft && <div id={`physical-sale-selection-${variant.id}`} className="space-y-3 border-t bg-muted/15 p-3">
                <div><Label className="text-xs">পরিমাণ</Label><div className="mt-1"><SaleAmountInput line={selectionDraft} onChange={(patch) => { setSelectionError(''); setSelectionDraft((current) => current ? { ...current, ...patch } : current); }} /></div></div>
                {selectionError && <p role="alert" className="text-sm text-destructive">{selectionError}</p>}
                <Button type="button" className="w-full" onClick={saveProductSelection}><Plus size={16} />{isInSale ? 'পরিমাণ আপডেট করুন' : 'বিক্রয় তালিকায় যোগ করুন'}</Button>
              </div>}
            </div>;
          })}
          {matches.length === 0 && <div role="status" className="col-span-full rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            {loadingProducts ? 'পণ্য লোড হচ্ছে…' : query.trim() ? 'এমন কোনো পণ্য পাওয়া যায়নি।' : 'বিক্রির জন্য কোনো পণ্য নেই।'}
          </div>}
        </div>
      </section>

      <section className="bg-card border rounded-lg p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><ShoppingCart size={18} />বিক্রয় তালিকা</h2>
        <div className="space-y-2">{lines.map((line) => <div key={line.variant.id} className="grid items-center gap-3 rounded border p-3 sm:grid-cols-[minmax(0,1fr)_190px_auto]"><div className="min-w-0"><strong className="break-words">{productPackLabel(line.product.name, line.variant.name)}</strong><div className="text-xs text-muted-foreground">৳{line.variant.sellingPrice} {rateLabel(line.product.kind)} · স্টক {formatQuantity(line.variant.availableStock, quantityUnitForKind(line.product.kind))}</div></div><SaleAmountInput line={line} onChange={(patch) => { setErrors(current => ({ ...current, items: undefined })); setLines((current) => current.map((item) => item.variant.id === line.variant.id ? { ...item, ...patch } : item)); }} /><Button className="w-full sm:w-auto" type="button" variant="ghost" aria-label="বাদ দিন" onClick={() => setLines((current) => current.filter((item) => item.variant.id !== line.variant.id))}><Trash2 size={16} /> <span className="sm:sr-only">বাদ দিন</span></Button></div>)}{lines.length === 0 && <p className="text-center text-muted-foreground py-8">বাম পাশ থেকে পণ্য যোগ করুন</p>}{errors.items && <p role="alert" className="text-sm text-destructive">{errors.items}</p>}</div>
        <div><Label className="text-xs">পেমেন্ট</Label><div className="mt-1 grid grid-cols-2 gap-2 rounded-lg bg-muted/50 p-1"><Button type="button" variant={paymentMode === 'PAID_NOW' ? 'default' : 'ghost'} onClick={() => { setPaymentMode('PAID_NOW'); setNextFollowUpDate(''); setErrors((current) => ({ ...current, customerName: undefined, phone: undefined, followUp: undefined })); }}>এখন পরিশোধ</Button><Button type="button" variant={paymentMode === 'CREDIT' ? 'default' : 'ghost'} onClick={() => { setPaymentMode('CREDIT'); setNextFollowUpDate((current) => current || dhakaDate(7)); }}>বাকি</Button></div></div>
        <div className="grid sm:grid-cols-2 gap-3"><Field label={`ক্রেতার নাম${paymentMode === 'CREDIT' ? '' : ' (ঐচ্ছিক)'}`} error={errors.customerName}><Input aria-label="ক্রেতার নাম" value={customerName} onChange={(event) => { setCustomerName(event.target.value); setErrors((current) => ({ ...current, customerName: undefined })); }} aria-invalid={Boolean(errors.customerName)} /></Field><Field label={`ফোন${paymentMode === 'CREDIT' ? '' : ' (ঐচ্ছিক)'}`} error={errors.phone}><Input aria-label="ক্রেতার ফোন" value={customerPhone} onChange={(event) => { setCustomerPhone(event.target.value); setErrors(current => ({ ...current, phone: undefined })); }} aria-invalid={Boolean(errors.phone)} /></Field></div>
        {paymentMode === 'CREDIT' && <Field label="পরবর্তী যোগাযোগের তারিখ" error={errors.followUp}><div className="relative"><CalendarClock className="pointer-events-none absolute left-3 top-3 text-muted-foreground" size={17} /><Input aria-label="পরবর্তী যোগাযোগের তারিখ" className="pl-10" type="date" min={dhakaDate()} value={nextFollowUpDate} onChange={(event) => { setNextFollowUpDate(event.target.value); setErrors((current) => ({ ...current, followUp: undefined })); }} aria-invalid={Boolean(errors.followUp)} /></div></Field>}
        <Field label="ডিসকাউন্ট (৳)" error={errors.discount}><Input type="number" min="0" max={subtotal} step="0.01" value={discount} onChange={(event) => { setDiscount(event.target.value); setErrors(current => ({ ...current, discount: undefined })); }} aria-invalid={Boolean(errors.discount)} /></Field>
        <div className="border-t pt-3 space-y-1 text-sm"><div className="flex justify-between"><span>সাবটোটাল</span><strong>৳{subtotal.toFixed(2)}</strong></div><div className="flex justify-between"><span>ডিসকাউন্ট</span><span>-৳{discountNumber.toFixed(2)}</span></div><div className="flex justify-between text-lg"><span>মোট</span><strong>৳{total.toFixed(2)}</strong></div></div>
        {errors.submit && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{errors.submit}</p>}
        <Button className="w-full min-h-11" disabled={saving || lines.length === 0} onClick={() => void saveSale()}><Plus size={16} className="mr-2" />{saving ? 'সম্পন্ন হচ্ছে…' : paymentMode === 'CREDIT' ? 'বাকি বিক্রি সম্পন্ন করুন' : 'বিক্রি সম্পন্ন করুন'}</Button>
      </section>
    </div>

    {completed && <section className={`border rounded-lg p-5 ${completed.grossProfit < 0 ? 'border-destructive bg-destructive/5' : 'border-green-500 bg-green-50'}`}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">সর্বশেষ বিক্রয়: {completed.orderNumber}</h2>{completed.paymentMethod === 'CREDIT' && <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">বাকি {money(completed.outstandingAmount)}</span>}</div><div className="grid sm:grid-cols-4 gap-3 mt-3 text-sm"><Metric label="বিক্রয়" value={`৳${completed.grandTotal.toFixed(2)}`} /><Metric label="ক্রয়মূল্য" value={`৳${completed.totalBuyingCost.toFixed(2)}`} /><Metric label="মোট লাভ" value={`৳${completed.grossProfit.toFixed(2)}`} /><Metric label={completed.paymentMethod === 'CREDIT' ? 'পরবর্তী যোগাযোগ' : 'মার্জিন'} value={completed.paymentMethod === 'CREDIT' ? completed.nextFollowUpDate ?? 'বাকি শেষ' : completed.grossProfitMargin === null ? 'প্রযোজ্য নয়' : `${completed.grossProfitMargin.toFixed(2)}%`} /></div></section>}

    <section>
      <h2 className="mb-3 text-lg font-semibold">দোকানের সাম্প্রতিক বিক্রি</h2>
      <form onSubmit={applyHistoryFilters} className="mb-4 grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-2 md:items-end xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_170px_170px_auto_auto]">
        <Field label="পণ্য"><ProductHistorySearch
          value={historyProduct}
          products={products}
          onChange={setHistoryProduct}
          onSelect={(value) => {
            setHistoryProduct(value);
            setHistoryFilters({ product: value, query: historyQuery.trim(), dateFrom: historyDateFrom, dateTo: historyDateTo });
          }}
        /></Field>
        <Field label="অন্য তথ্য"><Input
          aria-label="ক্রেতা বা বিক্রির তথ্য"
          value={historyQuery}
          onChange={(event) => setHistoryQuery(event.target.value)}
          placeholder="নাম, ফোন, বিক্রয় নম্বর বা মোট দাম"
        /></Field>
        <Field label="তারিখ থেকে"><Input type="date" value={historyDateFrom} onChange={(event) => setHistoryDateFrom(event.target.value)} /></Field>
        <Field label="তারিখ পর্যন্ত"><Input type="date" value={historyDateTo} onChange={(event) => setHistoryDateTo(event.target.value)} /></Field>
        <Button type="submit" variant="outline"><Search size={16} className="mr-2" />খুঁজুন</Button>
        <Button type="button" variant="ghost" onClick={clearHistoryFilters} disabled={!historyProduct && !historyQuery && !historyDateFrom && !historyDateTo && !historyFilters.product && !historyFilters.query && !historyFilters.dateFrom && !historyFilters.dateTo}>ফিল্টার মুছুন</Button>
      </form>
      {recentSales.length === 0
        ? <div className="rounded-lg border bg-card px-4 py-10 text-center text-sm text-muted-foreground">এই খোঁজে কোনো বিক্রি পাওয়া যায়নি</div>
        : <div className="space-y-3">{recentSales.map((sale) => <PhysicalSaleHistoryCard key={sale.id} sale={sale} onReturn={() => setReturnSale(sale)} />)}</div>}
    </section>
    <ProfitWarningDialog open={projectedLoss !== null} projectedGrossProfit={projectedLoss} onClose={() => setProjectedLoss(null)} onConfirm={() => saveSale(true)} />
    <PhysicalSaleReturnDialog sale={returnSale} onClose={() => setReturnSale(null)} onConfirm={submitReturn} />
  </div>;
}

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return <div><Label className="text-xs">{label}</Label><div className="mt-1">{children}</div>{error && <p role="alert" className="mt-1 text-sm text-destructive">{error}</p>}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><div className="text-muted-foreground">{label}</div><div className="font-bold text-lg">{value}</div></div>;
}

function ProductHistorySearch({
  value,
  products,
  onChange,
  onSelect,
}: {
  value: string;
  products: Product[];
  onChange: (value: string) => void;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const normalized = value.trim().toLocaleLowerCase('bn-BD');
  const suggestions = useMemo(() => products
    .filter((product) => !normalized || product.name.toLocaleLowerCase('bn-BD').includes(normalized))
    .sort((left, right) => left.name.localeCompare(right.name, 'bn-BD'))
    .slice(0, 8), [normalized, products]);

  return <div
    className="relative"
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}
  >
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-3 text-muted-foreground" size={17} />
      <Input
        role="combobox"
        aria-label="পণ্য বেছে নিন"
        aria-expanded={open}
        aria-controls="physical-sale-product-suggestions"
        aria-autocomplete="list"
        className="pl-10"
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(event) => { onChange(event.target.value); setOpen(true); }}
        onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}
        placeholder="পণ্য বেছে নিন বা নাম লিখুন"
      />
    </div>
    {open && <div id="physical-sale-product-suggestions" role="listbox" aria-label="পণ্যের পরামর্শ" className="absolute z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg">
      {suggestions.length === 0
        ? <p className="px-3 py-4 text-center text-sm text-muted-foreground">এমন কোনো পণ্য নেই।</p>
        : suggestions.map((product) => <button
          key={product.id}
          type="button"
          role="option"
          aria-selected={value === product.name}
          className="flex min-h-12 w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted focus:bg-muted focus:outline-none"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => { onSelect(product.name); setOpen(false); }}
        >
          {product.images[0]
            ? <img src={product.images[0]} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
            : <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-muted text-sm font-semibold">{product.name.charAt(0)}</span>}
          <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{product.name}</strong><span className="block text-xs text-muted-foreground">{productKindLabel(product.kind)}{product.isActive === false ? ' · নিষ্ক্রিয়' : ''}</span></span>
        </button>)}
    </div>}
  </div>;
}

function money(value: number) {
  return `৳${value.toFixed(2)}`;
}

function saleRateLabel(unit: PhysicalSale['items'][number]['quantityUnit']) {
  if (unit === 'GRAM') return 'প্রতি কেজি';
  if (unit === 'MILLILITER') return 'প্রতি লিটার';
  return 'প্রতি ইউনিট';
}

function PhysicalSaleHistoryCard({ sale, onReturn }: { sale: PhysicalSale; onReturn: () => void }) {
  const [open, setOpen] = useState(false);
  const customer = [sale.customerName, sale.customerPhone].filter(Boolean).join(' · ');
  const firstItem = sale.items[0];
  const remainingItems = sale.items.length - 1;
  const remainingMargin = sale.remainingRevenue === 0 ? null : sale.remainingGrossProfit / sale.remainingRevenue * 100;
  return <Collapsible open={open} onOpenChange={setOpen} className="overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md">
    <CollapsibleTrigger asChild>
      <button
        type="button"
        className="group grid w-full gap-3 p-4 text-left transition-colors hover:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
        aria-label={`${sale.orderNumber} ${open ? 'বিস্তারিত বন্ধ করুন' : 'বিস্তারিত দেখুন'}`}
      >
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <strong className="truncate text-base">{firstItem ? productPackLabel(firstItem.productName, firstItem.variantName) : sale.orderNumber}</strong>
            {remainingItems > 0 && <span className="shrink-0 rounded-full bg-secondary/15 px-2 py-0.5 text-xs font-medium text-secondary">আরও {remainingItems}টি</span>}
            {sale.paymentMethod === 'CREDIT' && <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${sale.outstandingAmount > 0 ? 'bg-amber-100 text-amber-900' : 'bg-green-100 text-green-800'}`}>{sale.outstandingAmount > 0 ? `বাকি ${money(sale.outstandingAmount)}` : 'বাকি শেষ'}</span>}
          </div>
          {firstItem && <div className="mt-0.5 text-sm text-muted-foreground">{formatQuantity(firstItem.quantity, firstItem.quantityUnit)}{remainingItems > 0 ? ' এবং অন্যান্য পণ্য' : ''}</div>}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Clock3 size={13} />{new Date(sale.completedAt).toLocaleString('bn-BD')}</span>
            <span className="inline-flex min-w-0 items-center gap-1"><UserRound size={13} /><span className="truncate">{customer || 'ক্রেতার তথ্য নেই'}</span></span>
            <span className="truncate">{sale.orderNumber}</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 sm:block sm:min-w-28 sm:text-right">
          <span className="text-xs text-muted-foreground">{sale.refundedAmount > 0 ? 'বর্তমান বিক্রি' : 'মোট দাম'}</span>
          <strong className="block text-lg text-primary">{money(sale.remainingRevenue)}</strong>
          {sale.refundedAmount > 0 && <span className="block text-xs text-destructive">ফেরত {money(sale.refundedAmount)}</span>}
        </div>
        <div className="flex items-center justify-end gap-1 text-xs font-medium text-secondary">
          <span>{open ? 'বন্ধ করুন' : 'বিস্তারিত'}</span>
          <ChevronDown size={18} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
    </CollapsibleTrigger>

    <CollapsibleContent>
      <div className="border-t bg-muted/15 p-4 sm:p-5">
        <div className="divide-y overflow-hidden rounded-lg border bg-background">
          {sale.items.map((item) => <div key={item.id} className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-4">
            <div className="min-w-0">
              <div className="break-words font-medium">{productPackLabel(item.productName, item.variantName)}</div>
              <div className="mt-0.5 text-sm text-muted-foreground">
                {formatQuantity(item.quantity, item.quantityUnit)} × {money(item.unitSellingPrice)} {saleRateLabel(item.quantityUnit)}
              </div>
              {item.returnedQuantity > 0 && <div className="mt-1 text-xs text-destructive">ফেরত নেওয়া হয়েছে {formatQuantity(item.returnedQuantity, item.quantityUnit)} · বাকি {formatQuantity(item.returnableQuantity, item.quantityUnit)}</div>}
            </div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-sm sm:min-w-64 sm:text-right">
              <span className="text-muted-foreground">পণ্যের দাম</span><strong>{money(item.grossLineRevenue)}</strong>
              {item.allocatedDiscount > 0 && <><span className="text-muted-foreground">ডিসকাউন্ট</span><span>-{money(item.allocatedDiscount)}</span></>}
              <span className="text-muted-foreground">ক্রয়মূল্য</span><span>{money(item.totalBuyingCost)}</span>
              <span className="text-muted-foreground">লাভ</span><span className={item.grossProfit < 0 ? 'text-destructive' : ''}>{money(item.grossProfit)}</span>
            </div>
          </div>)}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SaleSummaryMetric label="মূল মোট দাম" value={money(sale.grandTotal)} />
          <SaleSummaryMetric label="ফেরত টাকা" value={`-${money(sale.refundedAmount)}`} negative={sale.refundedAmount > 0} />
          <SaleSummaryMetric label="বর্তমান ক্রয়মূল্য" value={money(sale.remainingBuyingCost)} />
          <SaleSummaryMetric label="বর্তমান লাভ" value={money(sale.remainingGrossProfit)} negative={sale.remainingGrossProfit < 0} />
        </div>
        {sale.paymentMethod === 'CREDIT' && <div className="mt-4 rounded-lg border bg-card p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><strong>বাকি হিসাব</strong><span>{sale.nextFollowUpDate ? `পরবর্তী যোগাযোগ: ${sale.nextFollowUpDate}` : 'বাকি শেষ'}</span></div><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3"><Metric label="জমা হয়েছে" value={money(sale.collectedAmount)} /><Metric label="এখনো বাকি" value={money(sale.outstandingAmount)} /><Metric label="পেমেন্ট" value={`${sale.creditPayments.filter((payment) => !payment.voidedAt).length}টি`} /></div></div>}
        {sale.returns.length > 0 && <div className="mt-4 space-y-2">
          <h3 className="text-sm font-semibold">ফেরতের ইতিহাস</h3>
          {sale.returns.map((value) => <div key={value.id} className="rounded-lg border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong>{value.condition}</strong><span>{new Date(value.createdAt).toLocaleString('bn-BD')}</span></div>
            <div className="mt-1 text-muted-foreground">{value.items.map((item) => `${productPackLabel(item.productName, item.variantName)} ${formatQuantity(item.quantity, item.quantityUnit)}`).join(', ')}</div>
            <div className="mt-1">ফেরত মূল্য {money(value.refundAmount)}{sale.paymentMethod === 'CREDIT' ? ` · বাকি কমেছে ${money(value.creditOffsetAmount)} · নগদ ফেরত ${money(value.cashRefundAmount)}` : ''} · কারণ: {value.reason}</div>
          </div>)}
        </div>}
        <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
          <span>বিক্রি করেছেন: {sale.createdBy.fullName}</span>
          <span>বর্তমান লাভের মার্জিন: {remainingMargin === null ? 'প্রযোজ্য নয়' : `${remainingMargin.toFixed(2)}%`}</span>
        </div>
        <div className="mt-4 flex justify-end"><Button type="button" variant="outline" onClick={onReturn} disabled={!sale.items.some((item) => item.returnableQuantity > 0)}>{sale.items.some((item) => item.returnableQuantity > 0) ? 'পণ্য ফেরত নিন' : 'সব পণ্য ফেরত হয়েছে'}</Button></div>
      </div>
    </CollapsibleContent>
  </Collapsible>;
}

function SaleSummaryMetric({ label, value, negative = false }: { label: string; value: string; negative?: boolean }) {
  return <div className="rounded-lg border bg-card px-3 py-2">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className={`mt-0.5 font-semibold ${negative ? 'text-destructive' : ''}`}>{value}</div>
  </div>;
}

function SaleAmountInput({ line, onChange }: { line: SaleLine; onChange: (patch: Partial<Pick<SaleLine, 'amount' | 'amountUnit'>>) => void }) {
  const units = amountUnitsForKind(line.product.kind);
  const title = productPackLabel(line.product.name, line.variant.name);
  return <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
    <Input aria-label={`${title} পরিমাণ`} type="number" min="0" step={line.amountUnit === 'KG' || line.amountUnit === 'LITER' ? '0.001' : '1'} value={line.amount} onChange={(event) => onChange({ amount: event.target.value })} />
    {units.length === 1
      ? <div aria-label={`${title} একক`} className="flex h-11 items-center rounded-md border bg-muted/30 px-3 text-sm md:h-10">ইউনিট</div>
      : <select aria-label={`${title} একক`} className="h-11 rounded-md border bg-background px-2 md:h-10" value={line.amountUnit} onChange={(event) => onChange({ amountUnit: event.target.value as AmountUnit, amount: '' })}>{units.map((unit) => <option key={unit} value={unit}>{unit === 'KG' ? 'কেজি' : unit === 'G' ? 'গ্রাম' : unit === 'LITER' ? 'লিটার' : 'মিলি'}</option>)}</select>}
  </div>;
}
