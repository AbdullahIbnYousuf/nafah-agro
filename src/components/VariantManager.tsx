import { cloneElement, useEffect, useId, useMemo, useState } from 'react';
import { ChevronDown, CircleDollarSign, History, Loader2, Plus, Save, Settings2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { formatAppDateTime } from '@/lib/date';
import { UI_TERMS } from '@/lib/uiTerms';

interface VariantManagerProps {
  product: Product;
  onClose: () => void;
  onUpdated: (product: Product) => void;
}

interface EditorProps {
  variant: ProductVariant;
  product: Product;
  onUpdated: (product: Product) => void;
  savingKey: string | null;
  setSavingKey: (key: string | null) => void;
}

const money = new Intl.NumberFormat('en-BD', { maximumFractionDigits: 2 });
function validPrice(value: string) {
  return /^\d+(?:\.\d{1,2})?$/.test(value) && Number.isFinite(Number(value)) && Number(value) >= 0;
}

export default function VariantManager({ product, onClose, onUpdated }: VariantManagerProps) {
  const variants = useMemo(() => product.variants ?? [], [product.variants]);
  const isPackaged = (product.kind ?? 'PACKAGED') === 'PACKAGED';
  const [activeTab, setActiveTab] = useState('prices');
  const [name, setName] = useState('');
  const [unitLabel, setUnitLabel] = useState('');
  const [price, setPrice] = useState('');
  const [threshold, setThreshold] = useState('5');
  const [isDefault, setIsDefault] = useState(false);
  const [reason, setReason] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState('');
  const [bulkPrices, setBulkPrices] = useState<Record<string, string>>({});
  const [bulkReason, setBulkReason] = useState('');
  const [bulkError, setBulkError] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const hasUnnamedPackSize = isPackaged && variants.some((variant) => !visiblePackSize(variant.name));
  const creating = savingKey === 'create';
  const bulkSaving = savingKey === 'bulk';
  const busy = savingKey !== null;

  const bulkUpdates = useMemo(() => variants.flatMap((variant) => {
    const value = bulkPrices[variant.id]?.trim();
    if (!value || Number(value) === variant.sellingPrice) return [];
    return [{ variantId: variant.id, sellingPrice: Number(value) }];
  }), [bulkPrices, variants]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setCreateError('');
    if (hasUnnamedPackSize) {
      const message = 'নতুন প্যাক/সাইজ অ্যাড করার আগে আগেরটির নাম দিন';
      setCreateError(message);
      toast.error(message);
      return;
    }
    if (!name.trim() || !unitLabel.trim() || !validPrice(price)) {
      setCreateError('প্যাক/সাইজের নাম, বিক্রির ইউনিট এবং সঠিক দাম দিন');
      return;
    }
    if (!/^\d+$/.test(threshold) || Number(threshold) > 2_000_000_000) {
      setCreateError('কম স্টকের লিমিটে সঠিক সংখ্যা দিন');
      return;
    }
    setSavingKey('create');
    try {
      const updated = await createVariant(product.id, {
        name: name.trim(),
        unitLabel: unitLabel.trim(),
        sellingPrice: Number(price),
        lowStockThreshold: Number(threshold),
        isDefault: isDefault || variants.length === 0,
        priceReason: reason.trim() || undefined,
      });
      onUpdated(updated);
      setName('');
      setUnitLabel('');
      setPrice('');
      setThreshold('5');
      setIsDefault(false);
      setReason('');
      setCreateOpen(false);
      toast.success('প্যাক/সাইজ অ্যাড হয়েছে');
    } catch (error) {
      setCreateError(getErrorMessage(error, 'প্যাক/সাইজ অ্যাড করা যায়নি'));
    } finally {
      setSavingKey(null);
    }
  }

  async function handleBulkPriceUpdate(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBulkError('');
    if (Object.values(bulkPrices).some((value) => value.trim() && !validPrice(value.trim()))) {
      setBulkError('সব দাম সঠিক হতে হবে। দশমিকের পর সর্বোচ্চ 2 ঘর দিন।');
      return;
    }
    if (bulkUpdates.length < 2) {
      setBulkError('একসাথে আপডেট করতে কমপক্ষে দুইটি নতুন দাম দিন');
      return;
    }
    setSavingKey('bulk');
    try {
      const updatedProducts = await bulkChangeSellingPrices(bulkUpdates, bulkReason.trim() || undefined);
      const updated = updatedProducts.find((item) => item.id === product.id);
      if (updated) onUpdated(updated);
      setBulkPrices({});
      setBulkReason('');
      toast.success(`${bulkUpdates.length}টি দাম একসাথে আপডেট হয়েছে`);
    } catch (error) {
      setBulkError(getErrorMessage(error, 'কোনো দাম পরিবর্তন হয়নি'));
    } finally {
      setSavingKey(null);
    }
  }

  const editorProps = { product, onUpdated, savingKey, setSavingKey };
  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-3xl [&>button]:hidden">
        <header className="flex shrink-0 items-start justify-between gap-3 bg-primary px-4 py-4 text-primary-foreground sm:px-5">
          <div className="min-w-0">
            <SheetTitle className="text-lg font-bold text-primary-foreground">{isPackaged ? 'প্যাক/সাইজ ও দাম' : 'দাম ও কম স্টকের লিমিট'}</SheetTitle>
            <p className="mt-1 break-words text-sm font-medium opacity-90">{product.name}</p>
            <SheetDescription className="mt-1 text-xs text-primary-foreground/80">দাম আপডেট করলে আগের দামের রেকর্ড থাকবে।</SheetDescription>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="বন্ধ করুন" onClick={onClose} className="shrink-0 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"><X size={20} /></Button>
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b bg-card px-3 py-3 sm:px-5">
            <TabsList aria-label="দাম ও সেটিংস" className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl border bg-muted/40 p-1">
              <TabsTrigger value="prices" className="min-h-11 gap-2 whitespace-normal rounded-lg px-2 font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><CircleDollarSign size={17} className="shrink-0" />দাম আপডেট</TabsTrigger>
              <TabsTrigger value="settings" className="min-h-11 gap-2 whitespace-normal rounded-lg px-2 font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Settings2 size={17} className="shrink-0" />{isPackaged ? 'প্যাক/সাইজ ও সেটিংস' : 'সেটিংস'}</TabsTrigger>
            </TabsList>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-28 sm:p-5 sm:pb-6">
            <TabsContent value="prices" forceMount hidden={activeTab !== 'prices'} className="mt-0 space-y-3 data-[state=inactive]:hidden">
              {variants.map((variant) => <PriceEditor key={variant.id} variant={variant} {...editorProps} />)}
              {variants.length === 0 && <p className="rounded-xl border p-4 text-sm text-muted-foreground">এই পণ্যের দাম সেভ করা নেই।</p>}
              {isPackaged && variants.length >= 2 && (
                <Collapsible className="rounded-xl border bg-muted/20">
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="ghost" className="group h-auto min-h-11 w-full justify-between gap-3 whitespace-normal px-4 py-3 text-left font-medium">
                      একসাথে দাম আপডেট
                      <ChevronDown size={17} className="shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <form onSubmit={handleBulkPriceUpdate} noValidate className="space-y-3 border-t p-4">
                      <p className="text-xs text-muted-foreground">যে প্যাক/সাইজের দাম আপডেট করবেন, তার নতুন দাম লিখুন। সব পরিবর্তন একসাথে সেভ হবে।</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {variants.map((variant) => (
                          <Field key={variant.id} label={packSizeAdminLabel(variant.name)}>
                            <Input type="number" inputMode="decimal" min="0" step="0.01" disabled={busy} placeholder={`বর্তমান ৳${money.format(variant.sellingPrice)}`} value={bulkPrices[variant.id] ?? ''} onChange={(event) => setBulkPrices((current) => ({ ...current, [variant.id]: event.target.value }))} />
                          </Field>
                        ))}
                      </div>
                      <OptionalReason value={bulkReason} onChange={setBulkReason} disabled={busy} />
                      <ErrorNotice message={bulkError} />
                      <div className="text-right"><Button type="submit" disabled={busy} className="w-full sm:w-auto">{bulkSaving && <Loader2 size={16} className="animate-spin" />}{bulkSaving ? UI_TERMS.saving : 'সব দাম সেভ করুন'}</Button></div>
                    </form>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </TabsContent>

            <TabsContent value="settings" forceMount hidden={activeTab !== 'settings'} className="mt-0 space-y-4 data-[state=inactive]:hidden">
              {variants.map((variant) => <SettingsEditor key={variant.id} variant={variant} {...editorProps} />)}
              {isPackaged && (
                <Collapsible open={createOpen} onOpenChange={setCreateOpen} className="rounded-xl border border-dashed">
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="outline" className="group h-auto min-h-12 w-full justify-between gap-3 whitespace-normal border-0 bg-muted/20 px-4 py-3 text-left">
                      <span className="flex items-center gap-2"><Plus size={17} />নতুন প্যাক/সাইজ অ্যাড করুন</span>
                      <ChevronDown size={17} className="shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <form onSubmit={handleCreate} noValidate className="space-y-4 border-t p-4">
                      {hasUnnamedPackSize && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">আরেকটি প্যাক/সাইজ অ্যাড করার আগে উপরে থাকা “প্যাক/সাইজ দেওয়া হয়নি” অপশনের নাম লিখে তথ্য সেভ করুন।</p>}
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="প্যাক/সাইজের নাম"><Input value={name} disabled={busy} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="যেমন: 1 কেজি" /></Field>
                        <Field label="বিক্রির ইউনিট *"><Input value={unitLabel} disabled={busy} maxLength={30} onChange={(event) => setUnitLabel(event.target.value)} placeholder="যেমন: বস্তা, ক্যান, ট্রে" /></Field>
                        <Field label="দাম"><Input type="number" inputMode="decimal" min="0" step="0.01" value={price} disabled={busy} onChange={(event) => setPrice(event.target.value)} /></Field>
                        <Field label={UI_TERMS.stock.lowLimit}><Input type="number" inputMode="numeric" min="0" step="1" value={threshold} disabled={busy} onChange={(event) => setThreshold(event.target.value)} /></Field>
                      </div>
                      <p className="text-xs text-muted-foreground">পুরো {unitLabel.trim() || 'ইউনিট'} একসাথে বিক্রি হবে।</p>
                      <OptionalReason value={reason} onChange={setReason} disabled={busy} label="প্রাথমিক দামের কারণ (ঐচ্ছিক)" />
                      <ErrorNotice message={createError} />
                      <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
                        <label className="flex min-h-11 items-center gap-2 text-sm"><input className="h-5 w-5" type="checkbox" checked={isDefault} disabled={busy} onChange={(event) => setIsDefault(event.target.checked)} />মূল প্যাক/সাইজ</label>
                        <Button className="w-full aria-disabled:border aria-disabled:border-amber-600 aria-disabled:bg-amber-50 aria-disabled:text-amber-950 aria-disabled:hover:bg-amber-100 sm:w-auto" type="submit" disabled={busy} aria-disabled={hasUnnamedPackSize}>{creating && <Loader2 size={16} className="animate-spin" />}{creating ? 'অ্যাড হচ্ছে' : 'প্যাক/সাইজ অ্যাড করুন'}</Button>
                      </div>
                    </form>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function PriceEditor({ variant, product, onUpdated, savingKey, setSavingKey }: EditorProps) {
  const isEgg = product.kind === 'EGG';
  const [newPrice, setNewPrice] = useState('');
  const [newBulkPrice, setNewBulkPrice] = useState('');
  const [priceReason, setPriceReason] = useState('');
  const [error, setError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<SellingPriceHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyRevision, setHistoryRevision] = useState(0);
  const busy = savingKey !== null;
  const saving = savingKey === `price:${variant.id}`;

  useEffect(() => {
    if (!historyOpen) return;
    let active = true;
    setHistoryLoading(true);
    setHistoryError('');
    void getSellingPriceHistory(variant.id)
      .then((entries) => { if (active) setHistory(entries); })
      .catch((failure) => { if (active) setHistoryError(getErrorMessage(failure, 'আগের দামের রেকর্ড লোড হয়নি')); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [historyOpen, variant.id, variant.sellingPrice, variant.bulkSellingPrice, historyRevision]);

  async function updatePrice(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (!validPrice(newPrice)) {
      setError('সঠিক নতুন দাম দিন। দশমিকের পর সর্বোচ্চ 2 ঘর দিন।');
      return;
    }
    if (isEgg && (!validPrice(newBulkPrice) || Number(newPrice) <= 0 || Number(newBulkPrice) <= 0 || Number(newBulkPrice) >= Number(newPrice))) {
      setError('15টি বা তার বেশি ডিমের দাম সাধারণ দামের চেয়ে কম দিন');
      return;
    }
    setSavingKey(`price:${variant.id}`);
    try {
      const updated = await changeSellingPrice(variant.id, Number(newPrice), priceReason.trim() || undefined, isEgg ? Number(newBulkPrice) : undefined);
      onUpdated(updated);
      setNewPrice('');
      setNewBulkPrice('');
      setPriceReason('');
      setHistoryRevision((revision) => revision + 1);
      toast.success('দাম আপডেট হয়েছে');
    } catch (failure) {
      setError(getErrorMessage(failure, 'দাম আপডেট হয়নি'));
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <article className="overflow-hidden rounded-xl border bg-card">
      <div className="px-4 pt-4"><VariantHeading variant={variant} product={product} /></div>
      <form onSubmit={updatePrice} noValidate className="space-y-3 p-4 pt-3">
        {isEgg ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-muted/20 p-3">
              <CurrentPrice label="1–14টি ডিম" value={variant.sellingPrice} unit="প্রতি ডিম" />
              <div className="mt-3"><Field label="নতুন দাম (1–14টি)"><Input type="number" inputMode="decimal" min="0.01" step="0.01" value={newPrice} disabled={busy} onChange={(event) => setNewPrice(event.target.value)} placeholder="নতুন দাম" /></Field></div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <CurrentPrice label="15টি বা তার বেশি" value={variant.bulkSellingPrice ?? 0} unit="প্রতি ডিম" />
              <div className="mt-3"><Field label="নতুন দাম (15টি+)"><Input type="number" inputMode="decimal" min="0.01" step="0.01" value={newBulkPrice} disabled={busy} onChange={(event) => setNewBulkPrice(event.target.value)} placeholder="15টি+ দাম" /></Field></div>
            </div>
          </div>
        ) : (
          <div className="grid items-end gap-3 sm:grid-cols-2">
            <CurrentPrice label="বর্তমান দাম" value={variant.sellingPrice} unit={rateLabel(product.kind, variant.unitLabel)} />
            <Field label="নতুন দাম"><Input type="number" inputMode="decimal" min="0" step="0.01" value={newPrice} disabled={busy} onChange={(event) => setNewPrice(event.target.value)} placeholder="নতুন দাম" /></Field>
          </div>
        )}
        <OptionalReason value={priceReason} onChange={setPriceReason} disabled={busy} />
        <ErrorNotice message={error} />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <Button type="button" size="sm" variant="ghost" className="min-h-11 px-2 text-muted-foreground" aria-expanded={historyOpen} onClick={() => setHistoryOpen((open) => !open)}><History size={15} />আগের রেকর্ড</Button>
          <Button type="submit" disabled={busy} className="min-w-36">{saving && <Loader2 size={16} className="animate-spin" />}{saving ? UI_TERMS.saving : 'দাম সেভ করুন'}</Button>
        </div>
      </form>
      {historyOpen && <div className="border-t bg-muted/10 p-4">
        {historyLoading ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" />আগের রেকর্ড লোড হচ্ছে</p> : historyError ? <div className="space-y-2"><ErrorNotice message={historyError} /><Button type="button" size="sm" variant="outline" onClick={() => setHistoryRevision((revision) => revision + 1)}>রিট্রাই করুন</Button></div> : <PriceHistory entries={history} />}
      </div>}
    </article>
  );
}

function SettingsEditor({ variant, product, onUpdated, savingKey, setSavingKey }: EditorProps) {
  const isPackaged = (product.kind ?? 'PACKAGED') === 'PACKAGED';
  const quantityScale = product.kind === 'LOOSE_WEIGHT' || product.kind === 'LOOSE_VOLUME' ? 1_000 : 1;
  const [name, setName] = useState(variant.name);
  const [unitLabel, setUnitLabel] = useState(variant.unitLabel ?? 'ইউনিট');
  const [threshold, setThreshold] = useState(String(variant.lowStockThreshold / quantityScale));
  const [error, setError] = useState('');
  const busy = savingKey !== null;
  const saving = savingKey === `settings:${variant.id}`;
  const statusSaving = savingKey === `status:${variant.id}`;
  const defaultSaving = savingKey === `default:${variant.id}`;

  useEffect(() => {
    setName(variant.name);
    setUnitLabel(variant.unitLabel ?? 'ইউনিট');
    setThreshold(String(variant.lowStockThreshold / quantityScale));
  }, [quantityScale, variant.name, variant.unitLabel, variant.lowStockThreshold]);

  async function saveMetadata(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (isPackaged && !visiblePackSize(name)) {
      setError('প্যাক/সাইজের নাম দিন');
      return;
    }
    if (isPackaged && !unitLabel.trim()) {
      setError('বিক্রির ইউনিট লিখুন');
      return;
    }
    if (isPackaged && unitLabel.trim() !== (variant.unitLabel ?? 'ইউনিট') && variant.canEditUnitLabel === false) {
      setError('স্টক বা আগের ব্যবসার রেকর্ড থাকায় বিক্রির ইউনিট পরিবর্তন করা যায় না।');
      return;
    }
    const pattern = quantityScale === 1 ? /^\d+$/ : /^\d+(?:\.\d{1,3})?$/;
    if (!pattern.test(threshold) || Number(threshold) * quantityScale > 2_000_000_000) {
      setError(quantityScale === 1 ? 'কম স্টকের লিমিটে সঠিক সংখ্যা দিন' : 'কম স্টকের লিমিটে সঠিক পরিমাণ দিন। দশমিকের পর সর্বোচ্চ 3 ঘর দিন।');
      return;
    }
    setSavingKey(`settings:${variant.id}`);
    try {
      onUpdated(await updateVariant(variant.id, {
        ...(isPackaged ? { name: name.trim(), unitLabel: unitLabel.trim() } : {}),
        lowStockThreshold: Math.round(Number(threshold) * quantityScale),
      }));
      toast.success(isPackaged ? 'প্যাক/সাইজ আপডেট হয়েছে' : 'তথ্য আপডেট হয়েছে');
    } catch (failure) {
      setError(getErrorMessage(failure, isPackaged ? 'প্যাক/সাইজ আপডেট হয়নি' : 'তথ্য আপডেট হয়নি'));
    } finally {
      setSavingKey(null);
    }
  }

  async function changeSetting(type: 'status' | 'default') {
    if (busy) return;
    setError('');
    setSavingKey(`${type}:${variant.id}`);
    try {
      const fields = type === 'status' ? { isActive: !variant.isActive } : { isDefault: true, isActive: true };
      onUpdated(await updateVariant(variant.id, fields));
    } catch (failure) {
      setError(getErrorMessage(failure, type === 'status' ? 'স্ট্যাটাস আপডেট করা যায়নি' : 'মূল প্যাক/সাইজ করা যায়নি'));
    } finally {
      setSavingKey(null);
    }
  }

  const unit = product.kind === 'EGG' ? 'টি ডিম' : isPackaged ? (variant.unitLabel ?? 'ইউনিট') : product.kind === 'LOOSE_WEIGHT' ? 'কেজি' : 'লিটার';
  return (
    <article className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <VariantHeading variant={variant} product={product} showActive />
        <div className="flex flex-wrap gap-2">
          {isPackaged && !variant.isDefault && <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={busy} onClick={() => void changeSetting('default')}>{defaultSaving && <Loader2 size={15} className="animate-spin" />}মূল করুন</Button>}
          <Button type="button" size="sm" variant="outline" className={`min-h-11 ${variant.isActive ? '' : 'border-amber-600 bg-amber-50 text-amber-950 hover:bg-amber-100'}`} disabled={busy} onClick={() => void changeSetting('status')}>{statusSaving && <Loader2 size={15} className="animate-spin" />}{variant.isActive ? 'ইনঅ্যাকটিভ করুন' : 'অ্যাকটিভ করুন'}</Button>
        </div>
      </div>
      <form onSubmit={saveMetadata} noValidate className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {isPackaged && <Field label="প্যাক/সাইজের নাম"><Input value={visiblePackSize(name) ?? ''} disabled={busy} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="যেমন: 1 কেজি" /></Field>}
          {isPackaged && <Field label="বিক্রির ইউনিট"><Input value={unitLabel} maxLength={30} disabled={busy || variant.canEditUnitLabel === false} onChange={(event) => setUnitLabel(event.target.value)} /></Field>}
          <Field label={`${UI_TERMS.stock.lowLimit} (${unit})`}><Input type="number" min="0" step={quantityScale === 1 ? '1' : '0.001'} inputMode={quantityScale === 1 ? 'numeric' : 'decimal'} value={threshold} disabled={busy} onChange={(event) => setThreshold(event.target.value)} /></Field>
        </div>
        {isPackaged && variant.canEditUnitLabel === false && <p className="text-xs text-muted-foreground">স্টক বা আগের ব্যবসার রেকর্ড থাকায় বিক্রির ইউনিট পরিবর্তন করা যায় না।</p>}
        <ErrorNotice message={error} />
        <div className="border-t pt-3 text-right"><Button type="submit" disabled={busy}>{saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}{saving ? UI_TERMS.saving : 'তথ্য সেভ করুন'}</Button></div>
      </form>
    </article>
  );
}

function VariantHeading({ variant, product, showActive = false }: { variant: ProductVariant; product: Product; showActive?: boolean }) {
  const isPackaged = (product.kind ?? 'PACKAGED') === 'PACKAGED';
  return <div className="flex min-w-0 flex-wrap items-center gap-2">
    <h3 className="break-words font-semibold">{isPackaged ? packSizeAdminLabel(variant.name) : productKindLabel(product.kind)}</h3>
    {isPackaged && variant.isDefault && <span className="rounded-full bg-secondary/10 px-2 py-0.5 text-xs text-secondary">মূল</span>}
    {(showActive || !variant.isActive) && <span className={`rounded-full px-2 py-0.5 text-xs ${variant.isActive ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}>{variant.isActive ? 'অ্যাকটিভ' : 'ইনঅ্যাকটিভ'}</span>}
  </div>;
}

function CurrentPrice({ label, value, unit }: { label: string; value: number; unit: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><div className="mt-1 flex flex-wrap items-baseline gap-x-2"><strong className="text-xl text-primary">৳{money.format(value)}</strong><span className="text-xs text-muted-foreground">{unit}</span></div></div>;
}

function OptionalReason({ value, onChange, disabled, label = 'পরিবর্তনের কারণ (ঐচ্ছিক)' }: { value: string; onChange: (value: string) => void; disabled: boolean; label?: string }) {
  return <Collapsible>
    <CollapsibleTrigger asChild><Button type="button" variant="ghost" size="sm" className="group min-h-11 gap-1 px-2 text-muted-foreground"><ChevronDown size={14} className="transition-transform group-data-[state=open]:rotate-180" />কারণ লিখুন (ঐচ্ছিক)</Button></CollapsibleTrigger>
    <CollapsibleContent className="pt-1"><Field label={label}><Input value={value} maxLength={300} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></Field></CollapsibleContent>
  </Collapsible>;
}

function ErrorNotice({ message }: { message: string }) {
  return message ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{message}</p> : null;
}

function PriceHistory({ entries }: { entries: SellingPriceHistoryEntry[] }) {
  return <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr><th className="py-2 text-left">সময়</th><th className="pl-3 text-left">দামের ধরন</th><th className="text-right">পুরনো</th><th className="text-right">নতুন</th><th className="pl-3 text-left">কারণ</th><th className="pl-3 text-left">পরিবর্তনকারী</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id} className="border-t"><td className="py-2">{formatAppDateTime(entry.effectiveAt)}</td><td className="pl-3">{entry.priceTier === 'EGG_BULK' ? '15টি বা তার বেশি' : 'সাধারণ'}</td><td className="text-right">{entry.previousPrice === null ? 'প্রথম মূল্য' : `৳${entry.previousPrice}`}</td><td className="text-right">৳{entry.newPrice}</td><td className="pl-3">{entry.reason}</td><td className="pl-3">{entry.changedBy.fullName} ({entry.changedBy.role})</td></tr>)}</tbody></table>{entries.length === 0 && <p className="text-sm text-muted-foreground">আগের কোনো রেকর্ড নেই</p>}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactElement<{ id?: string }> }) {
  const id = useId();
  return <div><Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label><div className="mt-1">{cloneElement(children, { id })}</div></div>;
}
