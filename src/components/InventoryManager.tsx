import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Minus, PackageX, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adjustStock, createPurchase, getAdminProducts, getStockBatches } from '@/lib/api';
import type { AmountUnit, Product, ProductVariant, StockBatch } from '@/lib/types';
import { getErrorMessage } from '@/lib/utils';
import { productPackLabel, visiblePackSize } from '@/lib/productOptions';
import { amountUnitsForKind, defaultAmountUnit, formatQuantity, productKindLabel, quantityUnitForKind, rateLabel, toBaseQuantity } from '@/lib/quantity';

interface PurchaseRow {
  productVariantId: string;
  amount: string;
  amountUnit: AmountUnit;
  unitBuyingCost: string;
}

type StockAlertFilter = 'ALL' | 'OUT_OF_STOCK' | 'LOW_STOCK';

const todayDhaka = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

function flattenVariants(products: Product[]) {
  return products.flatMap((product) => (product.variants ?? []).map((variant) => ({ product, variant })));
}

export default function InventoryManager() {
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<StockBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchaseDate, setPurchaseDate] = useState(todayDhaka);
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<PurchaseRow[]>([{ productVariantId: '', amount: '', amountUnit: 'PIECE', unitBuyingCost: '' }]);
  const [savingPurchase, setSavingPurchase] = useState(false);
  const [stockAlertFilter, setStockAlertFilter] = useState<StockAlertFilter>('ALL');
  const [adjustVariantId, setAdjustVariantId] = useState('');
  const [direction, setDirection] = useState<'INCREASE' | 'DECREASE'>('DECREASE');
  const [adjustQuantity, setAdjustQuantity] = useState('');
  const [adjustAmountUnit, setAdjustAmountUnit] = useState<AmountUnit>('PIECE');
  const [adjustCost, setAdjustCost] = useState('');
  const [adjustDate, setAdjustDate] = useState(todayDhaka);
  const [adjustReason, setAdjustReason] = useState('');
  const [savingAdjustment, setSavingAdjustment] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getAdminProducts({ limit: 100 }), getStockBatches()])
      .then(([page, stock]) => { setProducts(page.data); setBatches(stock); })
      .catch((error) => toast.error(getErrorMessage(error, 'ইনভেন্টরি লোড হয়নি')))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const variants = useMemo(() => flattenVariants(products), [products]);
  const variantById = useMemo(() => new Map(variants.map((item) => [item.variant.id, item])), [variants]);
  const availableByVariant = useMemo(() => new Map(variants.map(({ variant }) => [variant.id, variant.availableStock])), [variants]);
  const stockAlerts = useMemo(() => {
    const activeVariants = variants.filter(({ product, variant }) => product.isActive !== false && variant.isActive);
    const outOfStock = activeVariants
      .filter(({ variant }) => variant.availableStock === 0)
      .sort((left, right) => productPackLabel(left.product.name, left.variant.name).localeCompare(productPackLabel(right.product.name, right.variant.name), 'bn-BD'));
    const lowStock = activeVariants
      .filter(({ variant }) => variant.availableStock > 0 && variant.availableStock <= variant.lowStockThreshold)
      .sort((left, right) => {
        const leftUrgency = left.variant.lowStockThreshold > 0 ? left.variant.availableStock / left.variant.lowStockThreshold : 1;
        const rightUrgency = right.variant.lowStockThreshold > 0 ? right.variant.availableStock / right.variant.lowStockThreshold : 1;
        return leftUrgency - rightUrgency
          || productPackLabel(left.product.name, left.variant.name).localeCompare(productPackLabel(right.product.name, right.variant.name), 'bn-BD');
      });
    return { outOfStock, lowStock, all: [...outOfStock, ...lowStock] };
  }, [variants]);
  const visibleStockAlerts = stockAlertFilter === 'OUT_OF_STOCK'
    ? stockAlerts.outOfStock
    : stockAlertFilter === 'LOW_STOCK'
      ? stockAlerts.lowStock
      : stockAlerts.all;

  function setRow(index: number, patch: Partial<PurchaseRow>) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  }

  function focusPurchaseRow(index: number) {
    window.requestAnimationFrame(() => {
      const row = document.getElementById(`purchase-row-${index}`);
      row?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      row?.focus({ preventScroll: true });
    });
  }

  function addAlertToPurchase(product: Product, variant: ProductVariant) {
    const existingIndex = rows.findIndex((row) => row.productVariantId === variant.id);
    if (existingIndex >= 0) {
      focusPurchaseRow(existingIndex);
      return;
    }
    const emptyIndex = rows.findIndex((row) => !row.productVariantId);
    const nextRow: PurchaseRow = {
      productVariantId: variant.id,
      amount: '',
      amountUnit: defaultAmountUnit(product.kind),
      unitBuyingCost: '',
    };
    if (emptyIndex >= 0) {
      setRows((current) => current.map((row, index) => index === emptyIndex ? nextRow : row));
      focusPurchaseRow(emptyIndex);
      return;
    }
    const nextIndex = rows.length;
    setRows((current) => [...current, nextRow]);
    focusPurchaseRow(nextIndex);
  }

  async function submitPurchase(event: React.FormEvent) {
    event.preventDefault();
    const items = rows.map((row) => ({
      productVariantId: row.productVariantId,
      amount: row.amount,
      amountUnit: row.amountUnit,
      unitBuyingCost: Number(row.unitBuyingCost),
    }));
    if (items.some((item) => !item.productVariantId || toBaseQuantity(item.amount, item.amountUnit) === null || !Number.isFinite(item.unitBuyingCost) || item.unitBuyingCost <= 0)) {
      toast.error('প্রতিটি পণ্য, ধনাত্মক পরিমাণ ও ক্রয়মূল্য দিন');
      return;
    }
    if (new Set(items.map((item) => item.productVariantId)).size !== items.length) {
      toast.error('একই প্যাক/সাইজ একবারের বেশি যোগ করবেন না');
      return;
    }
    setSavingPurchase(true);
    try {
      const result = await createPurchase({ purchaseDate, note: note.trim() || undefined, items });
      toast.success(`${result.batches.length}টি স্টক ব্যাচ যোগ হয়েছে`);
      setRows([{ productVariantId: '', amount: '', amountUnit: 'PIECE', unitBuyingCost: '' }]);
      setNote('');
      load();
    } catch (error) {
      toast.error(getErrorMessage(error, 'ক্রয় সংরক্ষণ হয়নি'));
    } finally {
      setSavingPurchase(false);
    }
  }

  async function submitAdjustment(event: React.FormEvent) {
    event.preventDefault();
    const quantity = toBaseQuantity(adjustQuantity, adjustAmountUnit);
    if (!adjustVariantId || quantity === null || adjustReason.trim().length < 3) {
      toast.error('পণ্য, ধনাত্মক পরিমাণ ও কারণ দিন');
      return;
    }
    if (direction === 'DECREASE' && quantity > (availableByVariant.get(adjustVariantId) ?? 0)) {
      toast.error('বর্তমান স্টকের চেয়ে বেশি কমানো যাবে না');
      return;
    }
    if (direction === 'INCREASE' && (!Number.isFinite(Number(adjustCost)) || Number(adjustCost) <= 0)) {
      toast.error('স্টক বাড়াতে ধনাত্মক ক্রয়মূল্য দিন');
      return;
    }
    setSavingAdjustment(true);
    try {
      await adjustStock(direction === 'INCREASE' ? {
        direction, productVariantId: adjustVariantId, amount: adjustQuantity, amountUnit: adjustAmountUnit,
        unitBuyingCost: Number(adjustCost), purchaseDate: adjustDate, reason: adjustReason.trim(),
      } : {
        direction, productVariantId: adjustVariantId, amount: adjustQuantity, amountUnit: adjustAmountUnit, reason: adjustReason.trim(),
      });
      toast.success('স্টক সমন্বয় সংরক্ষিত হয়েছে');
      setAdjustQuantity(''); setAdjustCost(''); setAdjustReason('');
      load();
    } catch (error) {
      toast.error(getErrorMessage(error, 'স্টক সমন্বয় হয়নি'));
    } finally {
      setSavingAdjustment(false);
    }
  }

  if (loading) return <div className="py-16 text-center text-muted-foreground">ইনভেন্টরি লোড হচ্ছে…</div>;

  return <div className="space-y-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">ক্রয় ও ইনভেন্টরি</h1><p className="text-sm text-muted-foreground">প্রতিটি ক্রয় আলাদা ব্যাচ হিসেবে রাখা হয়। আগে কেনা স্টক আগে কমবে।</p></div><Button variant="outline" onClick={load}><RefreshCw size={15} className="mr-2" />রিফ্রেশ</Button></div>

    <section className="overflow-hidden rounded-lg border bg-card" aria-labelledby="stock-alerts-title">
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 id="stock-alerts-title" className="flex items-center gap-2 text-lg font-semibold"><AlertTriangle size={18} />স্টক সতর্কতা</h2><p className="mt-1 text-sm text-muted-foreground">যেসব পণ্য আবার কেনা দরকার, সেগুলো এখানে দেখুন।</p></div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="স্টক সতর্কতা ফিল্টার">
          <StockAlertFilterButton active={stockAlertFilter === 'ALL'} onClick={() => setStockAlertFilter('ALL')}>সব ({stockAlerts.all.length})</StockAlertFilterButton>
          <StockAlertFilterButton active={stockAlertFilter === 'OUT_OF_STOCK'} onClick={() => setStockAlertFilter('OUT_OF_STOCK')}>স্টক নেই ({stockAlerts.outOfStock.length})</StockAlertFilterButton>
          <StockAlertFilterButton active={stockAlertFilter === 'LOW_STOCK'} onClick={() => setStockAlertFilter('LOW_STOCK')}>কম স্টক ({stockAlerts.lowStock.length})</StockAlertFilterButton>
        </div>
      </div>
      {visibleStockAlerts.length === 0
        ? <div className="px-4 py-8 text-center text-sm text-muted-foreground"><PackageX className="mx-auto mb-2" size={24} />{stockAlerts.all.length === 0 ? 'এখন কোনো স্টক সতর্কতা নেই।' : 'এই তালিকায় কোনো পণ্য নেই।'}</div>
        : <div className="divide-y">{visibleStockAlerts.map(({ product, variant }) => {
          const isSelected = rows.some((row) => row.productVariantId === variant.id);
          const quantityUnit = quantityUnitForKind(product.kind);
          return <div key={variant.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><strong className="break-words">{productPackLabel(product.name, variant.name)}</strong><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${variant.availableStock === 0 ? 'bg-destructive/10 text-destructive' : 'bg-amber-100 text-amber-800'}`}>{variant.availableStock === 0 ? 'স্টক নেই' : 'কম স্টক'}</span><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{productKindLabel(product.kind)}</span></div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground"><span>বর্তমান স্টক: <strong className="text-foreground">{formatQuantity(variant.availableStock, quantityUnit)}</strong></span><span>সতর্কতার সীমা: {formatQuantity(variant.lowStockThreshold, quantityUnit)}</span></div>
            </div>
            <Button type="button" variant={isSelected ? 'secondary' : 'outline'} className="w-full sm:w-auto" onClick={() => addAlertToPurchase(product, variant)}><Plus size={15} />{isSelected ? 'ক্রয় ফর্মে দেখুন' : 'ক্রয়ে যোগ করুন'}</Button>
          </div>;
        })}</div>}
    </section>

    <form onSubmit={submitPurchase} className="bg-card border rounded-lg p-5 space-y-4">
      <h2 className="font-semibold text-lg">নতুন ক্রয়</h2>
      <div className="grid sm:grid-cols-2 gap-4"><Field label="ক্রয়ের তারিখ"><Input type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} required /></Field><Field label="নোট (ঐচ্ছিক)"><Input value={note} onChange={(event) => setNote(event.target.value)} /></Field></div>
      <div className="space-y-3">{rows.map((row, index) => <div id={`purchase-row-${index}`} tabIndex={-1} key={index} className="grid lg:grid-cols-[2fr_1fr_1fr_auto] gap-3 items-end border rounded p-3 outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
        <Field label="পণ্য / প্যাক/সাইজ"><VariantSelect ariaLabel={`ক্রয়ের পণ্য / প্যাক/সাইজ ${index + 1}`} variants={variants} value={row.productVariantId} onChange={(value) => { const selected = variantById.get(value); setRow(index, { productVariantId: value, amountUnit: defaultAmountUnit(selected?.product.kind), amount: '' }); }} /></Field>
        <Field label="পরিমাণ"><AmountInput kind={variantById.get(row.productVariantId)?.product.kind} amount={row.amount} unit={row.amountUnit} onAmountChange={(amount) => setRow(index, { amount })} onUnitChange={(amountUnit) => setRow(index, { amountUnit, amount: '' })} /></Field>
        <Field label={`ক্রয়মূল্য (৳, ${rateLabel(variantById.get(row.productVariantId)?.product.kind)})`}><Input type="number" min="0.01" step="0.01" value={row.unitBuyingCost} onChange={(event) => setRow(index, { unitBuyingCost: event.target.value })} /></Field>
        <Button type="button" variant="ghost" aria-label="আইটেম বাদ দিন" disabled={rows.length === 1} onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={16} /></Button>
      </div>)}</div>
      <div className="grid gap-2 sm:flex sm:justify-between"><Button className="w-full sm:w-auto" type="button" variant="outline" onClick={() => setRows((current) => [...current, { productVariantId: '', amount: '', amountUnit: 'PIECE', unitBuyingCost: '' }])}><Plus size={15} className="mr-2" />আরেকটি আইটেম</Button><Button className="w-full sm:w-auto" type="submit" disabled={savingPurchase}>{savingPurchase ? 'সংরক্ষণ হচ্ছে…' : 'ক্রয় সংরক্ষণ'}</Button></div>
    </form>

    <form onSubmit={submitAdjustment} className="bg-card border rounded-lg p-5 space-y-4">
      <h2 className="font-semibold text-lg">স্টক সমন্বয়</h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Field label="পণ্য / প্যাক/সাইজ"><VariantSelect ariaLabel="স্টক সমন্বয়ের পণ্য / প্যাক/সাইজ" variants={variants} value={adjustVariantId} onChange={(value) => { setAdjustVariantId(value); setAdjustAmountUnit(defaultAmountUnit(variantById.get(value)?.product.kind)); setAdjustQuantity(''); }} /></Field>
        <Field label="ধরন"><select className="h-11 w-full rounded-md border bg-background px-3 md:h-10" value={direction} onChange={(event) => setDirection(event.target.value as 'INCREASE' | 'DECREASE')}><option value="DECREASE">স্টক কমান, আগের স্টক আগে</option><option value="INCREASE">স্টক বাড়ান, নতুন ব্যাচ</option></select></Field>
        <Field label="পরিমাণ"><AmountInput kind={variantById.get(adjustVariantId)?.product.kind} amount={adjustQuantity} unit={adjustAmountUnit} onAmountChange={setAdjustQuantity} onUnitChange={(unit) => { setAdjustAmountUnit(unit); setAdjustQuantity(''); }} /></Field>
        {direction === 'INCREASE' && <Field label={`ক্রয়মূল্য (৳, ${rateLabel(variantById.get(adjustVariantId)?.product.kind)})`}><Input type="number" min="0.01" step="0.01" value={adjustCost} onChange={(event) => setAdjustCost(event.target.value)} /></Field>}
        {direction === 'INCREASE' && <Field label="স্টক যোগ করার তারিখ"><Input type="date" value={adjustDate} onChange={(event) => setAdjustDate(event.target.value)} /></Field>}
      </div>
      <Field label="সমন্বয়ের কারণ *"><Input value={adjustReason} onChange={(event) => setAdjustReason(event.target.value)} placeholder="যেমন: ক্ষতিগ্রস্ত ২ ইউনিট" /></Field>
      <div className="text-right"><Button type="submit" disabled={savingAdjustment}>{direction === 'INCREASE' ? <Plus size={15} className="mr-2" /> : <Minus size={15} className="mr-2" />}{savingAdjustment ? 'সংরক্ষণ হচ্ছে…' : 'সমন্বয় সংরক্ষণ'}</Button></div>
    </form>

    <section><h2 className="font-semibold text-lg mb-3">স্টকের বিস্তারিত ও ক্রয়মূল্য</h2><div className="border rounded-lg overflow-x-auto bg-card"><table className="w-full text-sm"><thead className="bg-muted"><tr><th className="text-left p-3">পণ্য / প্যাক/সাইজ</th><th className="text-left p-3">উৎস ও তারিখ</th><th className="text-right p-3">ক্রয়</th><th className="text-right p-3">অবশিষ্ট</th><th className="text-right p-3">রিজার্ভ</th><th className="text-right p-3">ক্রয়মূল্য</th><th className="text-left p-3">কারণ/নোট</th></tr></thead><tbody>{batches.map((batch) => <tr key={batch.id} className="border-t"><td className="p-3"><strong>{batch.productName}</strong><div className="text-xs text-muted-foreground">{batch.productKind === 'PACKAGED' ? visiblePackSize(batch.variantName) : productKindLabel(batch.productKind)}</div></td><td className="p-3">{batch.source === 'PURCHASE' ? 'ক্রয়' : 'সমন্বয়'}<div className="text-xs">{new Date(batch.purchaseDate).toLocaleDateString('bn-BD')}</div></td><td className="p-3 text-right">{formatQuantity(batch.purchasedQuantity, batch.quantityUnit)}</td><td className="p-3 text-right font-medium">{formatQuantity(batch.availableQuantity, batch.quantityUnit)}</td><td className="p-3 text-right">{formatQuantity(batch.reservedQuantity, batch.quantityUnit)}</td><td className="p-3 text-right">৳{batch.unitBuyingCost.toFixed(2)}<div className="text-xs text-muted-foreground">{rateLabel(batch.productKind)}</div></td><td className="p-3 text-xs">{batch.adjustmentReason ?? batch.note ?? 'নোট নেই'}</td></tr>)}</tbody></table>{batches.length === 0 && <p className="p-6 text-center text-muted-foreground">এখনো কোনো স্টক ব্যাচ নেই</p>}</div></section>
  </div>;
}

function VariantSelect({ ariaLabel, variants, value, onChange }: { ariaLabel: string; variants: Array<{ product: Product; variant: ProductVariant }>; value: string; onChange: (value: string) => void }) {
  return <select aria-label={ariaLabel} className="h-11 w-full rounded-md border bg-background px-3 md:h-10" value={value} onChange={(event) => onChange(event.target.value)}><option value="">নির্বাচন করুন</option>{variants.map(({ product, variant }) => <option key={variant.id} value={variant.id}>{productPackLabel(product.name, variant.name)} · {productKindLabel(product.kind)} · স্টক {formatQuantity(variant.availableStock, quantityUnitForKind(product.kind))}</option>)}</select>;
}

function StockAlertFilterButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return <Button type="button" size="sm" variant={active ? 'default' : 'outline'} aria-pressed={active} onClick={onClick}>{children}</Button>;
}

function AmountInput({ kind, amount, unit, onAmountChange, onUnitChange }: { kind?: Product['kind']; amount: string; unit: AmountUnit; onAmountChange: (value: string) => void; onUnitChange: (value: AmountUnit) => void }) {
  const units = amountUnitsForKind(kind);
  return <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2"><Input type="number" min="0" step={unit === 'KG' || unit === 'LITER' ? '0.001' : '1'} value={amount} onChange={(event) => onAmountChange(event.target.value)} /><select className="h-11 rounded-md border bg-background px-2 md:h-10" value={unit} onChange={(event) => onUnitChange(event.target.value as AmountUnit)}>{units.map((item) => <option key={item} value={item}>{item === 'PIECE' ? 'ইউনিট' : item === 'KG' ? 'কেজি' : item === 'G' ? 'গ্রাম' : item === 'LITER' ? 'লিটার' : 'মিলি'}</option>)}</select></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="text-xs">{label}</Label><div className="mt-1">{children}</div></div>;
}
