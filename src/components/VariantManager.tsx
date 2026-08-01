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

interface VariantManagerProps {
  product: Product;
  onClose: () => void;
  onUpdated: (product: Product) => void;
}

export default function VariantManager({ product, onClose, onUpdated }: VariantManagerProps) {
  const variants = useMemo(() => product.variants ?? [], [product.variants]);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState('');
  const [threshold, setThreshold] = useState('5');
  const [isDefault, setIsDefault] = useState(false);
  const [reason, setReason] = useState('Initial variant price');
  const [creating, setCreating] = useState(false);
  const [bulkPrices, setBulkPrices] = useState<Record<string, string>>({});
  const [bulkReason, setBulkReason] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  const bulkUpdates = useMemo(() => variants.flatMap((variant) => {
    const value = bulkPrices[variant.id]?.trim();
    if (!value || Number(value) === variant.sellingPrice) return [];
    return [{ variantId: variant.id, sellingPrice: Number(value) }];
  }), [bulkPrices, variants]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !sku.trim() || price === '') {
      toast.error('নাম, SKU এবং দাম দিন');
      return;
    }
    setCreating(true);
    try {
      const updated = await createVariant(product.id, {
        name: name.trim(),
        sku: sku.trim().toUpperCase(),
        sellingPrice: Number(price),
        lowStockThreshold: Number(threshold) || 0,
        isDefault: isDefault || variants.length === 0,
        priceReason: reason.trim() || 'Initial variant price',
      });
      onUpdated(updated);
      setName('');
      setSku('');
      setPrice('');
      setThreshold('5');
      setIsDefault(false);
      toast.success('ভ্যারিয়েন্ট যোগ হয়েছে');
    } catch (error) {
      toast.error(getErrorMessage(error, 'ভ্যারিয়েন্ট যোগ করা যায়নি'));
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
    if (bulkReason.trim().length < 3) {
      toast.error('দাম পরিবর্তনের কারণ দিন');
      return;
    }
    setBulkSaving(true);
    try {
      const updatedProducts = await bulkChangeSellingPrices(bulkUpdates, bulkReason.trim());
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
        <header className="flex items-center justify-between px-5 py-4 bg-primary text-primary-foreground">
          <div>
            <h2 className="text-lg font-bold">{product.name}: ভ্যারিয়েন্ট ও দাম</h2>
            <p className="text-xs opacity-80">SKU অনন্য; প্রতিটি দাম পরিবর্তনে ইতিহাস তৈরি হয়</p>
          </div>
          <button type="button" onClick={onClose} className="p-1"><X size={20} /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <form onSubmit={handleCreate} className="border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold flex items-center gap-2"><Plus size={17} />নতুন ভ্যারিয়েন্ট</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Field label="নাম"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="যেমন: ১ কেজি" /></Field>
              <Field label="অনন্য SKU"><Input value={sku} onChange={(event) => setSku(event.target.value.toUpperCase())} placeholder="NAFAH-001" /></Field>
              <Field label="দাম"><Input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} /></Field>
              <Field label="লো-স্টক সীমা"><Input type="number" min="0" value={threshold} onChange={(event) => setThreshold(event.target.value)} /></Field>
            </div>
            <Field label="প্রাথমিক দামের কারণ"><Input value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />ডিফল্ট ভ্যারিয়েন্ট</label>
              <Button type="submit" disabled={creating}>{creating ? 'যোগ হচ্ছে…' : 'ভ্যারিয়েন্ট যোগ করুন'}</Button>
            </div>
          </form>

          <div className="space-y-4">
            {variants.map((variant) => (
              <VariantEditor key={variant.id} variant={variant} onUpdated={onUpdated} />
            ))}
          </div>

          {variants.length >= 2 && (
            <section className="border rounded-lg p-4 space-y-3">
              <div>
                <h3 className="font-semibold">বাল্ক দাম আপডেট</h3>
                <p className="text-xs text-muted-foreground">সব পরিবর্তন একটি transaction-এ হবে; একটি ব্যর্থ হলে কোনোটিই সংরক্ষিত হবে না।</p>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {variants.map((variant) => (
                  <Field key={variant.id} label={`${variant.name} (${variant.sku})`}>
                    <Input type="number" min="0" step="0.01" placeholder={`বর্তমান ৳${variant.sellingPrice}`} value={bulkPrices[variant.id] ?? ''} onChange={(event) => setBulkPrices((current) => ({ ...current, [variant.id]: event.target.value }))} />
                  </Field>
                ))}
              </div>
              <Field label="সবার জন্য পরিবর্তনের কারণ"><Input value={bulkReason} onChange={(event) => setBulkReason(event.target.value)} /></Field>
              <div className="text-right"><Button type="button" disabled={bulkSaving} onClick={() => void handleBulkPriceUpdate()}>{bulkSaving ? 'আপডেট হচ্ছে…' : 'বাল্ক দাম সংরক্ষণ'}</Button></div>
            </section>
          )}
        </div>
      </section>
    </>
  );
}

function VariantEditor({ variant, onUpdated }: { variant: ProductVariant; onUpdated: (product: Product) => void }) {
  const [name, setName] = useState(variant.name);
  const [sku, setSku] = useState(variant.sku);
  const [threshold, setThreshold] = useState(String(variant.lowStockThreshold));
  const [newPrice, setNewPrice] = useState('');
  const [priceReason, setPriceReason] = useState('');
  const [history, setHistory] = useState<SellingPriceHistoryEntry[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(variant.name);
    setSku(variant.sku);
    setThreshold(String(variant.lowStockThreshold));
  }, [variant]);

  async function saveMetadata() {
    setSaving(true);
    try {
      onUpdated(await updateVariant(variant.id, {
        name: name.trim(),
        sku: sku.trim().toUpperCase(),
        lowStockThreshold: Number(threshold) || 0,
      }));
      toast.success('ভ্যারিয়েন্ট আপডেট হয়েছে');
    } catch (error) {
      toast.error(getErrorMessage(error, 'ভ্যারিয়েন্ট আপডেট হয়নি'));
    } finally {
      setSaving(false);
    }
  }

  async function updatePrice() {
    if (newPrice === '' || priceReason.trim().length < 3) {
      toast.error('নতুন দাম এবং কারণ দিন');
      return;
    }
    setSaving(true);
    try {
      onUpdated(await changeSellingPrice(variant.id, Number(newPrice), priceReason.trim()));
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
      toast.error(getErrorMessage(error, 'ডিফল্ট করা যায়নি'));
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
      toast.error(getErrorMessage(error, 'দামের ইতিহাস লোড হয়নি'));
    }
  }

  return (
    <article className={`border rounded-lg p-4 space-y-4 ${variant.isActive ? '' : 'opacity-70 bg-muted/30'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><strong>{variant.name}</strong><code className="text-xs bg-muted px-2 py-1 rounded">{variant.sku}</code>{variant.isDefault && <span className="text-xs bg-secondary/15 text-secondary px-2 py-1 rounded">ডিফল্ট</span>}<span className={`text-xs px-2 py-1 rounded ${variant.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'}`}>{variant.isActive ? 'সক্রিয়' : 'নিষ্ক্রিয়'}</span></div>
        <div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => void toggleHistory()}><History size={14} className="mr-1" />ইতিহাস</Button>{!variant.isDefault && <Button type="button" size="sm" variant="outline" onClick={() => void makeDefault()}>ডিফল্ট করুন</Button>}<Button type="button" size="sm" variant={variant.isActive ? 'destructive' : 'default'} onClick={() => void toggleActive()}>{variant.isActive ? 'নিষ্ক্রিয়' : 'সক্রিয়'}</Button></div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="নাম"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <Field label="SKU"><Input value={sku} onChange={(event) => setSku(event.target.value.toUpperCase())} /></Field>
        <Field label="লো-স্টক সীমা"><Input type="number" min="0" value={threshold} onChange={(event) => setThreshold(event.target.value)} /></Field>
      </div>
      <div className="text-right"><Button type="button" size="sm" disabled={saving} onClick={() => void saveMetadata()}><Save size={14} className="mr-1" />তথ্য সংরক্ষণ</Button></div>

      <div className="grid sm:grid-cols-[1fr_2fr_auto] gap-3 items-end border-t pt-4">
        <Field label={`বর্তমান দাম: ৳${variant.sellingPrice}`}><Input type="number" min="0" step="0.01" value={newPrice} onChange={(event) => setNewPrice(event.target.value)} placeholder="নতুন দাম" /></Field>
        <Field label="পরিবর্তনের কারণ"><Input value={priceReason} onChange={(event) => setPriceReason(event.target.value)} /></Field>
        <Button type="button" disabled={saving} onClick={() => void updatePrice()}>দাম সংরক্ষণ</Button>
      </div>

      {history && <PriceHistory entries={history} />}
    </article>
  );
}

function PriceHistory({ entries }: { entries: SellingPriceHistoryEntry[] }) {
  return <div className="border-t pt-4 overflow-x-auto"><table className="w-full text-xs"><thead><tr><th className="text-left py-2">সময়</th><th className="text-right">পুরনো</th><th className="text-right">নতুন</th><th className="text-left pl-3">কারণ</th><th className="text-left pl-3">পরিবর্তনকারী</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id} className="border-t"><td className="py-2">{new Date(entry.effectiveAt).toLocaleString('bn-BD')}</td><td className="text-right">{entry.previousPrice === null ? '—' : `৳${entry.previousPrice}`}</td><td className="text-right">৳{entry.newPrice}</td><td className="pl-3">{entry.reason}</td><td className="pl-3">{entry.changedBy.fullName} ({entry.changedBy.role})</td></tr>)}</tbody></table>{entries.length === 0 && <p className="text-muted-foreground">কোনো ইতিহাস নেই</p>}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="text-xs">{label}</Label><div className="mt-1">{children}</div></div>;
}
