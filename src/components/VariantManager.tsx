import { useEffect, useMemo, useState } from 'react';
import { History, Plus, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  bulkChangeSellingPrices,
  changeSellingPrice,
  createVariant,
  getSellingPriceHistory,
  updateVariant,
} from '@/lib/api';
import type { Product, ProductVariant, SellingPriceHistoryEntry } from '@/lib/types';
import { getErrorMessage } from '@/lib/utils';
import { packSizeAdminLabel, visiblePackSize } from '@/lib/productOptions';
import { productKindLabel, rateLabel } from '@/lib/quantity';

interface VariantManagerProps {
  product: Product;
  onClose: () => void;
  onUpdated: (product: Product) => void;
}

export default function VariantManager({ product, onClose, onUpdated }: VariantManagerProps) {
  const variants = useMemo(() => product.variants ?? [], [product.variants]);
  const isPackaged = (product.kind ?? 'PACKAGED') === 'PACKAGED';
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [threshold, setThreshold] = useState('5');
  const [isDefault, setIsDefault] = useState(false);
  const [reason, setReason] = useState('');
  const [creating, setCreating] = useState(false);
  const [bulkPrices, setBulkPrices] = useState<Record<string, string>>({});
  const [bulkReason, setBulkReason] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const hasUnnamedPackSize = isPackaged && variants.some((variant) => !visiblePackSize(variant.name));

  const bulkUpdates = useMemo(() => variants.flatMap((variant) => {
    const value = bulkPrices[variant.id]?.trim();
    if (!value || Number(value) === variant.sellingPrice) return [];
    return [{ variantId: variant.id, sellingPrice: Number(value) }];
  }), [bulkPrices, variants]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (hasUnnamedPackSize) {
      toast.error('নতুন প্যাক/সাইজ যোগ করার আগে আগেরটির নাম দিন');
      return;
    }
    if (!name.trim() || price === '') {
      toast.error('প্যাক/সাইজের নাম এবং দাম দিন');
      return;
    }
    setCreating(true);
    try {
      const updated = await createVariant(product.id, {
        name: name.trim(),
        sellingPrice: Number(price),
        lowStockThreshold: Number(threshold) || 0,
        isDefault: isDefault || variants.length === 0,
        priceReason: reason.trim() || undefined,
      });
      onUpdated(updated);
      setName('');
      setPrice('');
      setThreshold('5');
      setIsDefault(false);
      toast.success('প্যাক/সাইজ যোগ হয়েছে');
    } catch (error) {
      toast.error(getErrorMessage(error, 'প্যাক/সাইজ যোগ করা যায়নি'));
    } finally {
      setCreating(false);
    }
  }

  async function handleBulkPriceUpdate() {
    if (bulkUpdates.length < 2) {
      toast.error('বাল্ক আপডেটের জন্য অন্তত দুইটি নতুন দাম দিন');
      return;
    }
    if (bulkUpdates.some((update) => !Number.isFinite(update.sellingPrice) || update.sellingPrice < 0)) {
      toast.error('সব দাম সঠিক হতে হবে');
      return;
    }
    setBulkSaving(true);
    try {
      const updatedProducts = await bulkChangeSellingPrices(bulkUpdates, bulkReason.trim() || undefined);
      const updated = updatedProducts.find((item) => item.id === product.id);
      if (updated) onUpdated(updated);
      setBulkPrices({});
      setBulkReason('');
      toast.success(`${bulkUpdates.length}টি দাম একসাথে আপডেট হয়েছে`);
    } catch (error) {
      toast.error(getErrorMessage(error, 'কোনো দাম পরিবর্তন হয়নি'));
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <>
      <button type="button" aria-label="বন্ধ করুন" className="fixed inset-0 z-40 bg-foreground/30" onClick={onClose} />
      <section className="fixed inset-y-0 right-0 z-50 w-full max-w-4xl bg-background shadow-2xl flex flex-col">
        <header className="flex items-start justify-between gap-3 bg-primary px-4 py-4 text-primary-foreground sm:px-5">
          <div className="min-w-0">
            <h2 className="text-lg font-bold">{isPackaged ? 'প্যাক/সাইজ ও দাম' : 'দাম ও স্টক সীমা'}</h2>
            <p className="break-words text-sm font-medium opacity-90">{product.name}</p>
            <p className="text-xs opacity-80">দাম বদলালে আগের দামের রেকর্ড থাকবে।</p>
          </div>
          <button type="button" aria-label="বন্ধ করুন" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-primary-foreground/10"><X size={20} /></button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-3 sm:p-5">
          {isPackaged && <form onSubmit={handleCreate} className="border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold flex items-center gap-2"><Plus size={17} />নতুন প্যাক/সাইজ</h3>
            {hasUnnamedPackSize && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">আরেকটি প্যাক/সাইজ যোগ করার আগে নিচে থাকা “প্যাক/সাইজ দেওয়া হয়নি” অপশনটির নাম দিন।</p>}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Field label="প্যাক/সাইজের নাম"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="যেমন: ১ কেজি" /></Field>
              <Field label="দাম"><Input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} /></Field>
              <Field label="লো-স্টক সীমা"><Input type="number" min="0" value={threshold} onChange={(event) => setThreshold(event.target.value)} /></Field>
            </div>
            <Field label="প্রাথমিক দামের কারণ (ঐচ্ছিক)"><Input value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
            <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
              <label className="flex min-h-11 items-center gap-2 text-sm"><input className="h-5 w-5" type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />মূল প্যাক/সাইজ</label>
              <Button className="w-full aria-disabled:border aria-disabled:border-amber-600 aria-disabled:bg-amber-50 aria-disabled:text-amber-950 aria-disabled:hover:bg-amber-100 sm:w-auto" type="submit" disabled={creating} aria-disabled={hasUnnamedPackSize}>{creating ? 'যোগ হচ্ছে…' : 'প্যাক/সাইজ যোগ করুন'}</Button>
            </div>
          </form>}

          {!isPackaged && <p className="rounded-lg border bg-muted/40 p-4 text-sm">{productKindLabel(product.kind)} পণ্য। দাম {rateLabel(product.kind)} হিসেবে রাখা হয় এবং এই পণ্যে আলাদা প্যাক/সাইজ যোগ করা যায় না।</p>}

          <div className="space-y-4">
            {variants.map((variant) => (
              <VariantEditor key={variant.id} variant={variant} product={product} onUpdated={onUpdated} />
            ))}
          </div>

          {isPackaged && variants.length >= 2 && (
            <section className="border rounded-lg p-4 space-y-3">
              <div>
                <h3 className="font-semibold">বাল্ক দাম আপডেট</h3>
                <p className="text-xs text-muted-foreground">দামগুলো একসাথে পরিবর্তন হবে। কোনো একটি পরিবর্তন ব্যর্থ হলে কোনো দামই বদলাবে না।</p>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {variants.map((variant) => (
                  <Field key={variant.id} label={packSizeAdminLabel(variant.name)}>
                    <Input type="number" min="0" step="0.01" placeholder={`বর্তমান ৳${variant.sellingPrice}`} value={bulkPrices[variant.id] ?? ''} onChange={(event) => setBulkPrices((current) => ({ ...current, [variant.id]: event.target.value }))} />
                  </Field>
                ))}
              </div>
              <Field label="দাম পরিবর্তনের কারণ (ঐচ্ছিক)"><Input value={bulkReason} onChange={(event) => setBulkReason(event.target.value)} /></Field>
              <div className="text-right"><Button type="button" disabled={bulkSaving} onClick={() => void handleBulkPriceUpdate()}>{bulkSaving ? 'আপডেট হচ্ছে…' : 'বাল্ক দাম সংরক্ষণ'}</Button></div>
            </section>
          )}
        </div>
      </section>
    </>
  );
}

function VariantEditor({ variant, product, onUpdated }: { variant: ProductVariant; product: Product; onUpdated: (product: Product) => void }) {
  const isPackaged = (product.kind ?? 'PACKAGED') === 'PACKAGED';
  const quantityScale = isPackaged ? 1 : 1_000;
  const [name, setName] = useState(variant.name);
  const [threshold, setThreshold] = useState(String(variant.lowStockThreshold / quantityScale));
  const [newPrice, setNewPrice] = useState('');
  const [priceReason, setPriceReason] = useState('');
  const [history, setHistory] = useState<SellingPriceHistoryEntry[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(variant.name);
    setThreshold(String(variant.lowStockThreshold / quantityScale));
  }, [quantityScale, variant]);

  async function saveMetadata() {
    if (isPackaged && !visiblePackSize(name)) {
      toast.error('প্যাক/সাইজের নাম দিন');
      return;
    }
    setSaving(true);
    try {
      onUpdated(await updateVariant(variant.id, {
        ...(isPackaged ? { name: name.trim() } : {}),
        lowStockThreshold: Math.round((Number(threshold) || 0) * quantityScale),
      }));
      toast.success(isPackaged ? 'প্যাক/সাইজ আপডেট হয়েছে' : 'তথ্য আপডেট হয়েছে');
    } catch (error) {
      toast.error(getErrorMessage(error, isPackaged ? 'প্যাক/সাইজ আপডেট হয়নি' : 'তথ্য আপডেট হয়নি'));
    } finally {
      setSaving(false);
    }
  }

  async function updatePrice() {
    if (newPrice === '') {
      toast.error('নতুন দাম দিন');
      return;
    }
    setSaving(true);
    try {
      onUpdated(await changeSellingPrice(variant.id, Number(newPrice), priceReason.trim() || undefined));
      setNewPrice('');
      setPriceReason('');
      setHistory(await getSellingPriceHistory(variant.id));
      toast.success('দাম আপডেট হয়েছে');
    } catch (error) {
      toast.error(getErrorMessage(error, 'দাম আপডেট হয়নি'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    try {
      onUpdated(await updateVariant(variant.id, { isActive: !variant.isActive }));
    } catch (error) {
      toast.error(getErrorMessage(error, 'অবস্থা পরিবর্তন করা যায়নি'));
    }
  }

  async function makeDefault() {
    try {
      onUpdated(await updateVariant(variant.id, { isDefault: true, isActive: true }));
    } catch (error) {
      toast.error(getErrorMessage(error, 'মূল প্যাক/সাইজ করা যায়নি'));
    }
  }

  async function toggleHistory() {
    if (history) {
      setHistory(null);
      return;
    }
    try {
      setHistory(await getSellingPriceHistory(variant.id));
    } catch (error) {
      toast.error(getErrorMessage(error, 'আগের দামের রেকর্ড লোড হয়নি'));
    }
  }

  return (
    <article className={`border rounded-lg p-4 space-y-4 ${variant.isActive ? '' : 'opacity-70 bg-muted/30'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><strong>{isPackaged ? packSizeAdminLabel(variant.name) : productKindLabel(product.kind)}</strong>{isPackaged && variant.isDefault && <span className="text-xs bg-secondary/15 text-secondary px-2 py-1 rounded">মূল</span>}<span className={`text-xs px-2 py-1 rounded ${variant.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'}`}>{variant.isActive ? 'অ্যাকটিভ' : 'ইনঅ্যাকটিভ'}</span></div>
        <div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => void toggleHistory()}><History size={14} className="mr-1" />আগের রেকর্ড</Button>{isPackaged && !variant.isDefault && <Button type="button" size="sm" variant="outline" onClick={() => void makeDefault()}>মূল করুন</Button>}<Button type="button" size="sm" variant={variant.isActive ? 'destructive' : 'default'} onClick={() => void toggleActive()}>{variant.isActive ? 'ইনঅ্যাকটিভ' : 'অ্যাকটিভ'}</Button></div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {isPackaged && <Field label="প্যাক/সাইজের নাম"><Input value={name.toLowerCase() === 'default' ? '' : name} onChange={(event) => setName(event.target.value)} placeholder="যেমন: ১ কেজি" /></Field>}
        <Field label={`লো-স্টক সীমা (${isPackaged ? 'ইউনিট' : product.kind === 'LOOSE_WEIGHT' ? 'কেজি' : 'লিটার'})`}><Input type="number" min="0" step={isPackaged ? '1' : '0.001'} value={threshold} onChange={(event) => setThreshold(event.target.value)} /></Field>
      </div>
      <div className="text-right"><Button type="button" size="sm" disabled={saving} onClick={() => void saveMetadata()}><Save size={14} className="mr-1" />তথ্য সংরক্ষণ</Button></div>

      <div className="grid sm:grid-cols-[1fr_2fr_auto] gap-3 items-end border-t pt-4">
        <Field label={`বর্তমান দাম: ৳${variant.sellingPrice} (${rateLabel(product.kind)})`}><Input type="number" min="0" step="0.01" value={newPrice} onChange={(event) => setNewPrice(event.target.value)} placeholder="নতুন দাম" /></Field>
        <Field label="পরিবর্তনের কারণ (ঐচ্ছিক)"><Input value={priceReason} onChange={(event) => setPriceReason(event.target.value)} /></Field>
        <Button type="button" disabled={saving} onClick={() => void updatePrice()}>দাম সংরক্ষণ</Button>
      </div>

      {history && <PriceHistory entries={history} />}
    </article>
  );
}

function PriceHistory({ entries }: { entries: SellingPriceHistoryEntry[] }) {
  return <div className="border-t pt-4 overflow-x-auto"><table className="w-full text-xs"><thead><tr><th className="text-left py-2">সময়</th><th className="text-right">পুরনো</th><th className="text-right">নতুন</th><th className="text-left pl-3">কারণ</th><th className="text-left pl-3">পরিবর্তনকারী</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id} className="border-t"><td className="py-2">{new Date(entry.effectiveAt).toLocaleString('bn-BD')}</td><td className="text-right">{entry.previousPrice === null ? 'প্রথম মূল্য' : `৳${entry.previousPrice}`}</td><td className="text-right">৳{entry.newPrice}</td><td className="pl-3">{entry.reason}</td><td className="pl-3">{entry.changedBy.fullName} ({entry.changedBy.role})</td></tr>)}</tbody></table>{entries.length === 0 && <p className="text-muted-foreground">আগের কোনো রেকর্ড নেই</p>}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="text-xs">{label}</Label><div className="mt-1">{children}</div></div>;
}
