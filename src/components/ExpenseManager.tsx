import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FilterField, FilterFields, FilterPanel, FilterRefreshButton, FilterResetButton, filterSelectClassName } from '@/components/ui/filter-panel';
import { FormattedDateInput } from '@/components/ui/formatted-date-input';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { PaymentChannelSelect } from '@/components/PaymentChannelSelect';
import { createExpense, getExpense, getExpenses, getExpenseSummary, suggestExpenseNames, updateExpense, voidExpense } from '@/lib/api';
import { formatAppDate, formatAppDateTime } from '@/lib/date';
import { paymentChannelLabel, paymentChannels } from '@/lib/paymentChannels';
import type { PaymentChannel, ShopExpense, ShopExpenseSummary, ShopExpensesPage } from '@/lib/types';
import { getErrorMessage } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';

function today() { return new Date(Date.now() + 6 * 60 * 60 * 1_000).toISOString().slice(0, 10); }
function money(value: number) { return '৳' + new Intl.NumberFormat('en-BD', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value); }
function startOfMonth() { return today().slice(0, 7) + '-01'; }
function validDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function snapshotText(value: Record<string, unknown> | null) {
  if (!value) return '';
  const parts = [typeof value.name === 'string' ? value.name : '', typeof value.amount === 'string' ? money(Number(value.amount)) : '', typeof value.paidOn === 'string' ? formatAppDate(value.paidOn) : '', typeof value.paymentChannel === 'string' ? paymentChannelLabel(value.paymentChannel as PaymentChannel) : ''];
  return parts.filter(Boolean).join(' · ');
}

function ExpenseNameInput({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  const [focused, setFocused] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const debounced = useDebounce(value, 300);
  useEffect(() => {
    if (!focused) return;
    const controller = new AbortController();
    setLoading(true);
    suggestExpenseNames(debounced, controller.signal).then((names) => { if (!controller.signal.aborted) { setOptions(names); setActive(-1); } }).catch(() => { if (!controller.signal.aborted) setOptions([]); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [debounced, focused]);
  return <div className="relative">
    <Input role="combobox" aria-label="খরচের নাম" aria-autocomplete="list" aria-expanded={focused} aria-controls="expense-names" aria-activedescendant={active >= 0 ? 'expense-name-' + active : undefined} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onKeyDown={(event) => {
      if (event.key === 'Escape') { setFocused(false); return; }
      if (event.key === 'ArrowDown' && options.length) { event.preventDefault(); setActive((index) => (index + 1) % options.length); }
      if (event.key === 'ArrowUp' && options.length) { event.preventDefault(); setActive((index) => (index - 1 + options.length) % options.length); }
      if (event.key === 'Enter' && focused && active >= 0) { event.preventDefault(); onChange(options[active]); setFocused(false); }
    }} placeholder="যেমন: দোকান ভাড়া" required maxLength={120} />
    {focused && <div id="expense-names" role="listbox" aria-label="আগের খরচের নাম" className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-lg">
      {loading && <p className="p-2 text-xs text-muted-foreground">নাম দেখা হচ্ছে...</p>}
      {!loading && options.length === 0 && <p className="p-2 text-xs text-muted-foreground">নতুন নাম লিখে সেভ করতে পারবেন।</p>}
      {!loading && options.map((name, index) => <button key={name} id={'expense-name-' + index} type="button" role="option" aria-selected={active === index} className={'block w-full rounded px-2 py-2 text-left text-sm hover:bg-muted ' + (active === index ? 'bg-muted' : '')} onPointerDown={(event) => { event.preventDefault(); onChange(name); setFocused(false); }}>{name}</button>)}
    </div>}
  </div>;
}

function ExpenseDrawer({ expenseId, repeatId, onClose, onSaved }: { expenseId: string | null; repeatId: string | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(today());
  const [paymentChannel, setPaymentChannel] = useState<PaymentChannel>('CASH');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [requestKey] = useState(() => crypto.randomUUID());
  const [loading, setLoading] = useState(Boolean(expenseId || repeatId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const id = expenseId || repeatId;
    if (!id) return;
    let active = true;
    getExpense(id).then((record) => {
      if (!active) return;
      setName(record.name); setAmount(record.amount.toFixed(2)); setPaidOn(expenseId ? record.paidOn : today());
      setPaymentChannel(record.paymentChannel); setNote(expenseId ? record.note ?? '' : '');
    }).catch((failure) => { if (active) setError(getErrorMessage(failure, 'খরচের তথ্য লোড হয়নি।')); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [expenseId, repeatId]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !Number.isFinite(Number(amount)) || Number(amount) <= 0 || !/^\d+(?:\.\d{1,2})?$/.test(amount)) { setError('নাম ও সঠিক টাকার পরিমাণ দিন।'); return; }
    if (!paidOn || paidOn > today()) { setError('আজ বা আগের পেমেন্টের তারিখ দিন।'); return; }
    if (expenseId && reason.trim().length < 3) { setError('কেন আপডেট করছেন, কারণ লিখুন।'); return; }
    setSaving(true); setError('');
    try {
      const fields = { name: name.trim(), amount, paidOn, paymentChannel, note: note.trim() || undefined };
      if (expenseId) await updateExpense(expenseId, { ...fields, reason: reason.trim() });
      else await createExpense({ ...fields, idempotencyKey: requestKey });
      toast.success(expenseId ? 'খরচ আপডেট হয়েছে' : 'খরচ সেভ হয়েছে');
      onSaved();
    } catch (failure) { setError(getErrorMessage(failure, 'খরচ সেভ করা যায়নি।')); }
    finally { setSaving(false); }
  }
  return <>
    <SheetHeader><SheetTitle>{expenseId ? 'খরচ আপডেট করুন' : 'খরচ অ্যাড করুন'}</SheetTitle><SheetDescription>দোকান চালানোর জন্য ইতিমধ্যে দেওয়া টাকা লিখুন। স্টক কেনা, রিফান্ড বা বাকি পেমেন্ট এখানে লিখবেন না।</SheetDescription></SheetHeader>
    {loading ? <div className="mt-8 flex justify-center"><Loader2 className="animate-spin" /></div> : <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-4">
      <label className="block text-sm font-medium">খরচের নাম<ExpenseNameInput value={name} onChange={setName} disabled={saving} /></label>
      <label className="block text-sm font-medium">টাকার পরিমাণ<Input aria-label="টাকার পরিমাণ" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={saving} required /></label>
      <label className="block text-sm font-medium">টাকা দেওয়ার তারিখ<FormattedDateInput aria-label="টাকা দেওয়ার তারিখ" value={paidOn} max={today()} onChange={(event) => setPaidOn(event.target.value)} required /></label>
      <PaymentChannelSelect value={paymentChannel} onChange={setPaymentChannel} disabled={saving} label="টাকা দেওয়ার মাধ্যম" />
      <label className="block text-sm font-medium">নোট (ঐচ্ছিক)<Textarea aria-label="নোট (ঐচ্ছিক)" value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} disabled={saving} /></label>
      {expenseId && <label className="block text-sm font-medium">আপডেটের কারণ<Textarea aria-label="আপডেটের কারণ" value={reason} onChange={(event) => setReason(event.target.value)} disabled={saving} /></label>}
      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={onClose}>বাতিল</Button><Button type="submit" disabled={saving}>{saving && <Loader2 size={16} className="animate-spin" />}{saving ? 'সেভ হচ্ছে' : 'সেভ করুন'}</Button></div>
    </form>}
  </>;
}

export default function ExpenseManager() {
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const path = location.pathname;
  const expenseId = path.match(/^\/admin\/expenses\/([^/]+)\/edit$/)?.[1] ?? null;
  const drawerOpen = path.endsWith('/new') || expenseId !== null;
  const repeatId = path.endsWith('/new') ? params.get('repeat') : null;
  const from = validDate(params.get('from')) ? params.get('from')! : startOfMonth();
  const to = validDate(params.get('to')) ? params.get('to')! : today();
  const q = params.get('q') || '';
  const method = paymentChannels.some((item) => item.value === params.get('method')) ? params.get('method')! : '';
  const status = ['ACTIVE', 'VOIDED', 'ALL'].includes(params.get('status') || '') ? params.get('status')! : 'ACTIVE';
  const page = Math.max(1, Math.trunc(Number(params.get('page') || 1) || 1));
  const [search, setSearch] = useState(q);
  const debouncedSearch = useDebounce(search, 300);
  const [records, setRecords] = useState<ShopExpensesPage | null>(null);
  const [summary, setSummary] = useState<ShopExpenseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<ShopExpense | null>(null);
  const [detailError, setDetailError] = useState('');
  const [voidTarget, setVoidTarget] = useState<ShopExpense | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState('');
  const [voidSaving, setVoidSaving] = useState(false);
  const rangeError = from > to ? 'শুরুর তারিখ শেষের তারিখের পরে হতে পারে না।' : '';

  useEffect(() => {
    if (debouncedSearch === q) return;
    setParams((previous) => { const next = new URLSearchParams(previous); if (debouncedSearch) next.set('q', debouncedSearch); else next.delete('q'); next.delete('page'); return next; }, { replace: true });
  }, [debouncedSearch, q, setParams]);
  useEffect(() => { setSearch(q); }, [q]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    if (rangeError) { setRecords(null); setSummary(null); setError(''); setLoading(false); return; }
    Promise.all([
      getExpenses({ from, to, q, paymentChannel: method ? method as PaymentChannel : undefined, status: status as 'ACTIVE' | 'VOIDED' | 'ALL', page, limit: 20 }),
      getExpenseSummary({ from, to }),
    ]).then(([list, totals]) => { if (active) { setRecords(list); setSummary(totals); } }).catch((failure) => { if (active) setError(getErrorMessage(failure, 'খরচের রেকর্ড লোড হয়নি।')); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [from, to, q, method, status, page, revision, rangeError]);
  useEffect(() => {
    if (!expanded) { setDetail(null); setDetailError(''); return; }
    let active = true;
    setDetail(null); setDetailError('');
    getExpense(expanded).then((value) => { if (active) setDetail(value); }).catch((failure) => { if (active) setDetailError(getErrorMessage(failure, 'বিস্তারিত লোড হয়নি।')); });
    return () => { active = false; };
  }, [expanded, revision]);
  const activeFilters = q !== '' || method !== '' || status !== 'ACTIVE' || from !== startOfMonth() || to !== today();
  const currentTotal = useMemo(() => summary?.total ?? 0, [summary]);
  function change(key: string, value: string) {
    setParams((previous) => { const next = new URLSearchParams(previous); if (value) next.set(key, value); else next.delete(key); if (key !== 'page') next.delete('page'); return next; });
  }
  function baseUrl() { const next = new URLSearchParams(params); next.delete('repeat'); const query = next.toString(); return '/admin/expenses' + (query ? '?' + query : ''); }
  function openNew(repeat?: string) { const next = new URLSearchParams(params); if (repeat) next.set('repeat', repeat); else next.delete('repeat'); navigate('/admin/expenses/new?' + next.toString()); }
  function refresh() { setRevision((value) => value + 1); }
  async function confirmVoid() {
    if (!voidTarget || voidReason.trim().length < 3) { setVoidError('কেন বাতিল করছেন, কারণ লিখুন।'); return; }
    setVoidSaving(true); setVoidError('');
    try { await voidExpense(voidTarget.id, voidReason.trim()); toast.success('খরচের রেকর্ড বাতিল হয়েছে'); setVoidTarget(null); setVoidReason(''); refresh(); }
    catch (failure) { setVoidError(getErrorMessage(failure, 'রেকর্ড বাতিল হয়নি।')); }
    finally { setVoidSaving(false); }
  }
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">দোকানের খরচ</h1><p className="text-sm text-muted-foreground">ভাড়া, বিদ্যুৎ, কর্মীর খরচ ইত্যাদি। স্টক কেনা এখানে নয়।</p></div><Button onClick={() => openNew()}><Plus size={17} />খরচ অ্যাড করুন</Button></div>
    <section className="rounded-xl border bg-card p-4" aria-label="খরচের সারাংশ">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><div><div className="text-sm text-muted-foreground">সিলেক্ট করা সময়ে মোট খরচ</div><div className="text-2xl font-bold">{money(currentTotal)}</div></div><div className="text-xs text-muted-foreground">{formatAppDate(from)} থেকে {formatAppDate(to)} · {summary?.count ?? 0}টি রেকর্ড</div></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{summary?.byMethod.map((item) => <div key={item.method} className="rounded-lg border bg-background p-2 text-sm"><div>{paymentChannelLabel(item.method)}</div><strong>{money(item.amount)}</strong></div>)}</div>
      <p className="mt-3 text-xs text-muted-foreground">এটি ক্যাশ, অ্যাপ বা ব্যাংকের বর্তমান ব্যালেন্স নয়।</p>
    </section>
    <FilterPanel actions={<><FilterResetButton active={activeFilters} onClick={() => { setSearch(''); setParams(new URLSearchParams()); }} /><FilterRefreshButton loading={loading} onClick={refresh} /></>}>
      <FilterFields className="lg:grid-cols-5">
        <FilterField label="খরচের নাম"><Input aria-label="খরচের নাম সার্চ" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="নাম লিখে সার্চ করুন" /></FilterField>
        <FilterField label="তারিখ থেকে"><FormattedDateInput aria-label="খরচ তারিখ থেকে" value={from} onChange={(event) => change('from', event.target.value)} /></FilterField>
        <FilterField label="তারিখ পর্যন্ত"><FormattedDateInput aria-label="খরচ তারিখ পর্যন্ত" value={to} onChange={(event) => change('to', event.target.value)} /></FilterField>
        <FilterField label="মাধ্যম"><select aria-label="খরচের মাধ্যম" className={filterSelectClassName} value={method} onChange={(event) => change('method', event.target.value)}><option value="">সব মাধ্যম</option>{paymentChannels.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></FilterField>
        <FilterField label="রেকর্ড"><select aria-label="খরচের রেকর্ড" className={filterSelectClassName} value={status} onChange={(event) => change('status', event.target.value)}><option value="ACTIVE">চালু রেকর্ড</option><option value="VOIDED">বাতিল রেকর্ড</option><option value="ALL">সব রেকর্ড</option></select></FilterField>
      </FilterFields>
      {rangeError && <p role="alert" className="mt-2 text-sm text-destructive">{rangeError}</p>}
    </FilterPanel>
    {loading && <div role="status" className="rounded-xl border bg-card p-8 text-center text-muted-foreground">লোড হচ্ছে...</div>}
    {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">{error}<Button variant="outline" className="ml-3" onClick={refresh}>রিট্রাই করুন</Button></div>}
    {!loading && !error && records?.data.length === 0 && <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">এই ফিল্টারে কোনো খরচ পাওয়া যায়নি।{activeFilters && <div className="mt-3"><Button variant="outline" onClick={() => { setSearch(''); setParams(new URLSearchParams()); }}>ফিল্টার রিসেট</Button></div>}</div>}
    {!loading && !error && <div className="space-y-2">{records?.data.map((record) => <article key={record.id} className={'rounded-xl border bg-card p-4 ' + (record.voidedAt ? 'opacity-70' : '')}>
      <button type="button" className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={expanded === record.id} onClick={() => setExpanded(expanded === record.id ? null : record.id)}>
        <div className="min-w-0"><strong className="block truncate">{record.name}</strong><span className="text-xs text-muted-foreground">{formatAppDate(record.paidOn)} · {paymentChannelLabel(record.paymentChannel)} · {record.createdBy}{record.voidedAt ? ' · বাতিল' : ''}</span></div><strong className="shrink-0">{money(record.amount)}</strong>
      </button>
      {expanded === record.id && <div className="mt-3 space-y-3 border-t pt-3 text-sm">
        {detail?.id !== record.id ? detailError ? <p role="alert" className="text-destructive">{detailError} <Button size="sm" variant="outline" onClick={refresh}>রিট্রাই করুন</Button></p> : <p className="text-muted-foreground">বিস্তারিত লোড হচ্ছে...</p> : <><p>{detail.note || 'নোট নেই'}</p><p className="text-xs text-muted-foreground">রেকর্ড হয়েছে {formatAppDateTime(detail.createdAt)}{detail.voidReason ? ' · বাতিলের কারণ: ' + detail.voidReason : ''}</p>
          <div><h3 className="font-semibold">আগের পরিবর্তন</h3><div className="mt-2 space-y-2">{detail.history?.map((entry) => <div key={entry.id} className="rounded-lg bg-muted/40 p-2 text-xs"><strong>{entry.action === 'SHOP_EXPENSE_CREATED' ? 'খরচ অ্যাড হয়েছে' : entry.action === 'SHOP_EXPENSE_VOIDED' ? 'খরচ বাতিল হয়েছে' : 'খরচ আপডেট হয়েছে'}</strong><div>{formatAppDateTime(entry.createdAt)} · {entry.actor}{entry.reason ? ' · কারণ: ' + entry.reason : ''}</div>{entry.previousData && <div>আগে: {snapshotText(entry.previousData)}</div>}{entry.newData && <div>এখন: {snapshotText(entry.newData)}</div>}</div>)}</div></div></>}
        {!record.voidedAt && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => navigate('/admin/expenses/' + record.id + '/edit' + location.search)}>আপডেট করুন</Button><Button size="sm" variant="outline" onClick={() => openNew(record.id)}>আবার অ্যাড করুন</Button><Button size="sm" variant="outline" onClick={() => { setVoidTarget(record); setVoidReason(''); setVoidError(''); }}>বাতিল করুন</Button></div>}
      </div>}
    </article>)}</div>}
    {(records?.totalPages ?? 0) > 1 && <div className="flex items-center justify-center gap-3"><Button variant="outline" disabled={page <= 1} onClick={() => change('page', String(page - 1))}>আগের পেজ</Button><span className="text-sm">পেজ {page} / {records?.totalPages}</span><Button variant="outline" disabled={page >= (records?.totalPages ?? 0)} onClick={() => change('page', String(page + 1))}>পরের পেজ</Button></div>}
    <Sheet open={drawerOpen} onOpenChange={(open) => { if (!open) navigate(baseUrl()); }}><SheetContent className="w-full overflow-y-auto pb-28 sm:max-w-xl md:pb-6">{drawerOpen && <ExpenseDrawer key={expenseId || repeatId || 'new'} expenseId={expenseId} repeatId={repeatId} onClose={() => navigate(baseUrl())} onSaved={() => { navigate(baseUrl()); refresh(); }} />}</SheetContent></Sheet>
    <Dialog open={voidTarget !== null} onOpenChange={(open) => { if (!open && !voidSaving) setVoidTarget(null); }}><DialogContent><DialogHeader><DialogTitle>খরচের রেকর্ড বাতিল করুন</DialogTitle><DialogDescription>রেকর্ডটি থাকবে, কিন্তু মোট খরচ ও লাভের হিসাব থেকে বাদ যাবে।</DialogDescription></DialogHeader><Textarea aria-label="বাতিলের কারণ" value={voidReason} onChange={(event) => setVoidReason(event.target.value)} placeholder="বাতিলের কারণ লিখুন" />{voidError && <p role="alert" className="text-sm text-destructive">{voidError}</p>}<DialogFooter><Button variant="outline" disabled={voidSaving} onClick={() => setVoidTarget(null)}>ফিরে যান</Button><Button variant="destructive" disabled={voidSaving} onClick={() => void confirmVoid()}>{voidSaving ? 'বাতিল হচ্ছে' : 'রেকর্ড বাতিল করুন'}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
