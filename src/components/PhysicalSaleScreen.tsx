import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Clock3, Plus, Search, ShoppingCart, Trash2, UserRound } from 'lucide-react';
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

export default function PhysicalSaleScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [recentSales, setRecentSales] = useState<PhysicalSale[]>([]);
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [query, setQuery] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [discount, setDiscount] = useState('0');
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState<PhysicalSale | null>(null);
  const [projectedLoss, setProjectedLoss] = useState<unknown>(null);
  const [returnSale, setReturnSale] = useState<PhysicalSale | null>(null);
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [historyFilters, setHistoryFilters] = useState({ query: '', dateFrom: '', dateTo: '' });
  const [errors, setErrors] = useState<{ items?: string; phone?: string; discount?: string; submit?: string }>({});

  const load = useCallback(() => {
    Promise.all([getAdminProducts({ limit: 100 }), getPhysicalSales({
      limit: 50,
      ...(historyFilters.query ? { query: historyFilters.query } : {}),
      ...(historyFilters.dateFrom ? { dateFrom: historyFilters.dateFrom } : {}),
      ...(historyFilters.dateTo ? { dateTo: historyFilters.dateTo } : {}),
    })])
      .then(([page, sales]) => { setProducts(page.data); setRecentSales(sales); })
      .catch((error) => toast.error(getErrorMessage(error, 'বিক্রয় স্ক্রিন লোড হয়নি')));
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
  const subtotal = lines.reduce((sum, line) => {
    const base = toBaseQuantity(line.amount, line.amountUnit) ?? 0;
    const scale = (line.product.kind ?? 'PACKAGED') === 'PACKAGED' ? 1 : 1_000;
    return sum + line.variant.sellingPrice * base / scale;
  }, 0);
  const discountNumber = Number(discount) || 0;
  const total = subtotal - discountNumber;

  function addLine(product: Product, variant: ProductVariant) {
    setLines((current) => {
      const existing = current.find((line) => line.variant.id === variant.id);
      if (existing) return (product.kind ?? 'PACKAGED') === 'PACKAGED'
        ? current.map((line) => line.variant.id === variant.id ? { ...line, amount: String(Math.min(Number(line.amount) + 1, variant.availableStock)) } : line)
        : current;
      if (variant.availableStock <= 0) { toast.error('এই পণ্যটি স্টকে নেই'); return current; }
      return [...current, { product, variant, amount: '1', amountUnit: defaultAmountUnit(product.kind) }];
    });
  }

  async function saveSale(confirmUnprofitable = false) {
    const nextErrors: typeof errors = {};
    if (lines.length === 0) nextErrors.items = 'কমপক্ষে একটি পণ্য যোগ করুন।';
    if (lines.some((line) => {
      const base = toBaseQuantity(line.amount, line.amountUnit);
      return base === null || base > line.variant.availableStock;
    })) nextErrors.items = 'প্রতিটি পণ্যের সঠিক পরিমাণ দিন এবং বর্তমান স্টকের মধ্যে রাখুন।';
    if (customerPhone.trim() && (customerPhone.trim().length < 7 || customerPhone.trim().length > 30)) nextErrors.phone = 'ফোন নম্বর ৭ থেকে ৩০ অক্ষরের মধ্যে লিখুন।';
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
        confirmUnprofitable,
      });
      setCompleted(result);
      setLines([]); setCustomerName(''); setCustomerPhone(''); setDiscount('0');
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
    setHistoryFilters({ query: historyQuery.trim(), dateFrom: historyDateFrom, dateTo: historyDateTo });
  }

  function clearHistoryFilters() {
    setHistoryQuery('');
    setHistoryDateFrom('');
    setHistoryDateTo('');
    setHistoryFilters({ query: '', dateFrom: '', dateTo: '' });
  }

  return <div className="space-y-8">
    <div><h1 className="text-2xl font-bold">দোকানের বিক্রি</h1><p className="text-sm text-muted-foreground">পেমেন্ট CASH। বিক্রি সম্পন্ন হলে আগে কেনা স্টক আগে কমবে।</p></div>
    <div className="grid xl:grid-cols-[1.1fr_1fr] gap-6">
      <section className="bg-card border rounded-lg p-5 space-y-4">
        <div className="relative"><Search className="absolute left-3 top-3 text-muted-foreground" size={17} /><Input className="pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="পণ্য বা প্যাক/সাইজ খুঁজুন" /></div>
        <div className="grid sm:grid-cols-2 gap-2 max-h-[430px] overflow-y-auto">{matches.map(({ product, variant }) => <button key={variant.id} type="button" onClick={() => addLine(product, variant)} disabled={variant.availableStock <= 0} className="text-left border rounded-lg p-3 hover:border-secondary disabled:opacity-50"><div className="font-medium">{productPackLabel(product.name, variant.name)}</div><div className="mt-1 text-xs text-muted-foreground">{productKindLabel(product.kind)}</div><div className="flex justify-between mt-2"><span>৳{variant.sellingPrice} {rateLabel(product.kind)}</span><span>স্টক {formatQuantity(variant.availableStock, quantityUnitForKind(product.kind))}</span></div></button>)}</div>
      </section>

      <section className="bg-card border rounded-lg p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><ShoppingCart size={18} />বিক্রয় তালিকা</h2>
        <div className="space-y-2">{lines.map((line) => <div key={line.variant.id} className="grid items-center gap-3 rounded border p-3 sm:grid-cols-[minmax(0,1fr)_190px_auto]"><div className="min-w-0"><strong className="break-words">{productPackLabel(line.product.name, line.variant.name)}</strong><div className="text-xs text-muted-foreground">৳{line.variant.sellingPrice} {rateLabel(line.product.kind)} · স্টক {formatQuantity(line.variant.availableStock, quantityUnitForKind(line.product.kind))}</div></div><SaleAmountInput line={line} onChange={(patch) => { setErrors(current => ({ ...current, items: undefined })); setLines((current) => current.map((item) => item.variant.id === line.variant.id ? { ...item, ...patch } : item)); }} /><Button className="w-full sm:w-auto" type="button" variant="ghost" aria-label="বাদ দিন" onClick={() => setLines((current) => current.filter((item) => item.variant.id !== line.variant.id))}><Trash2 size={16} /> <span className="sm:sr-only">বাদ দিন</span></Button></div>)}{lines.length === 0 && <p className="text-center text-muted-foreground py-8">বাম পাশ থেকে পণ্য যোগ করুন</p>}{errors.items && <p role="alert" className="text-sm text-destructive">{errors.items}</p>}</div>
        <div className="grid sm:grid-cols-2 gap-3"><Field label="ক্রেতার নাম (ঐচ্ছিক)"><Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></Field><Field label="ফোন (ঐচ্ছিক)" error={errors.phone}><Input value={customerPhone} onChange={(event) => { setCustomerPhone(event.target.value); setErrors(current => ({ ...current, phone: undefined })); }} aria-invalid={Boolean(errors.phone)} /></Field></div>
        <Field label="ডিসকাউন্ট (৳)" error={errors.discount}><Input type="number" min="0" max={subtotal} step="0.01" value={discount} onChange={(event) => { setDiscount(event.target.value); setErrors(current => ({ ...current, discount: undefined })); }} aria-invalid={Boolean(errors.discount)} /></Field>
        <div className="border-t pt-3 space-y-1 text-sm"><div className="flex justify-between"><span>সাবটোটাল</span><strong>৳{subtotal.toFixed(2)}</strong></div><div className="flex justify-between"><span>ডিসকাউন্ট</span><span>-৳{discountNumber.toFixed(2)}</span></div><div className="flex justify-between text-lg"><span>মোট</span><strong>৳{total.toFixed(2)}</strong></div></div>
        {errors.submit && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{errors.submit}</p>}
        <Button className="w-full min-h-11" disabled={saving || lines.length === 0} onClick={() => void saveSale()}><Plus size={16} className="mr-2" />{saving ? 'সম্পন্ন হচ্ছে…' : 'CASH বিক্রয় সম্পন্ন করুন'}</Button>
      </section>
    </div>

    {completed && <section className={`border rounded-lg p-5 ${completed.grossProfit < 0 ? 'border-destructive bg-destructive/5' : 'border-green-500 bg-green-50'}`}><h2 className="font-semibold">সর্বশেষ বিক্রয়: {completed.orderNumber}</h2><div className="grid sm:grid-cols-4 gap-3 mt-3 text-sm"><Metric label="বিক্রয়" value={`৳${completed.grandTotal.toFixed(2)}`} /><Metric label="ক্রয়মূল্য" value={`৳${completed.totalBuyingCost.toFixed(2)}`} /><Metric label="মোট লাভ" value={`৳${completed.grossProfit.toFixed(2)}`} /><Metric label="মার্জিন" value={completed.grossProfitMargin === null ? 'প্রযোজ্য নয়' : `${completed.grossProfitMargin.toFixed(2)}%`} /></div></section>}

    <section>
      <h2 className="mb-3 text-lg font-semibold">দোকানের সাম্প্রতিক বিক্রি</h2>
      <form onSubmit={applyHistoryFilters} className="mb-4 grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-[minmax(0,1fr)_170px_170px_auto_auto] md:items-end">
        <Field label="বিক্রি খুঁজুন"><Input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="পণ্য, ফোন, বিক্রয় নম্বর বা মোট দাম" /></Field>
        <Field label="তারিখ থেকে"><Input type="date" value={historyDateFrom} onChange={(event) => setHistoryDateFrom(event.target.value)} /></Field>
        <Field label="তারিখ পর্যন্ত"><Input type="date" value={historyDateTo} onChange={(event) => setHistoryDateTo(event.target.value)} /></Field>
        <Button type="submit" variant="outline"><Search size={16} className="mr-2" />খুঁজুন</Button>
        <Button type="button" variant="ghost" onClick={clearHistoryFilters} disabled={!historyQuery && !historyDateFrom && !historyDateTo && !historyFilters.query && !historyFilters.dateFrom && !historyFilters.dateTo}>ফিল্টার মুছুন</Button>
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
        {sale.returns.length > 0 && <div className="mt-4 space-y-2">
          <h3 className="text-sm font-semibold">ফেরতের ইতিহাস</h3>
          {sale.returns.map((value) => <div key={value.id} className="rounded-lg border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong>{value.condition}</strong><span>{new Date(value.createdAt).toLocaleString('bn-BD')}</span></div>
            <div className="mt-1 text-muted-foreground">{value.items.map((item) => `${productPackLabel(item.productName, item.variantName)} ${formatQuantity(item.quantity, item.quantityUnit)}`).join(', ')}</div>
            <div className="mt-1">ফেরত টাকা {money(value.refundAmount)} · কারণ: {value.reason}</div>
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
  return <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2"><Input aria-label={`${line.product.name} পরিমাণ`} type="number" min="0" step={line.amountUnit === 'KG' || line.amountUnit === 'LITER' ? '0.001' : '1'} value={line.amount} onChange={(event) => onChange({ amount: event.target.value })} /><select aria-label={`${line.product.name} একক`} className="h-11 rounded-md border bg-background px-2 md:h-10" value={line.amountUnit} onChange={(event) => onChange({ amountUnit: event.target.value as AmountUnit, amount: '' })}>{units.map((unit) => <option key={unit} value={unit}>{unit === 'PIECE' ? 'ইউনিট' : unit === 'KG' ? 'কেজি' : unit === 'G' ? 'গ্রাম' : unit === 'LITER' ? 'লিটার' : 'মিলি'}</option>)}</select></div>;
}
