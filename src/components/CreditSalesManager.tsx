import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, ChevronDown, HandCoins, Loader2, Pencil, Phone, Search, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FormattedDateInput } from '@/components/ui/formatted-date-input';
import { Label } from '@/components/ui/label';
import { FilterField, FilterFields, FilterPanel, FilterResetButton } from '@/components/ui/filter-panel';
import { useDebounce } from '@/hooks/useDebounce';
import { PaymentChannelSelect } from '@/components/PaymentChannelSelect';
import { paymentChannelLabel } from '@/lib/paymentChannels';
import { PaymentChannelCorrectionDialog } from '@/components/PaymentChannelCorrectionDialog';
import {
  ApiError,
  correctCreditCustomerPaymentChannel,
  getCreditCustomer,
  getCreditCustomers,
  getCreditCustomerSummary,
  recordCreditCustomerPayment,
  rescheduleCreditCustomerFollowUp,
  updateCreditCustomer,
  voidCreditCustomerPayment,
} from '@/lib/api';
import type { CreditCustomer, CreditPayment, CreditSaleState, CreditSummary, PaymentChannel, PhysicalSale } from '@/lib/types';
import { getErrorMessage } from '@/lib/utils';
import { productPackLabel } from '@/lib/productOptions';
import { formatQuantity } from '@/lib/quantity';
import { formatAppDate, formatAppDateTime } from '@/lib/date';

const states: Array<{ value: CreditSaleState; label: string }> = [
  { value: 'OPEN', label: 'সব বাকি' },
  { value: 'OVERDUE', label: 'সময় পার হয়েছে' },
  { value: 'TODAY', label: 'আজ যোগাযোগ' },
  { value: 'UPCOMING', label: 'সামনে আছে' },
  { value: 'SETTLED', label: 'বাকি শেষ' },
];

const VIEW_KEY = 'nafah_credit_customers_view_v1';

function readView(): { state: CreditSaleState; query: string } {
  const fallback = { state: 'OPEN' as const, query: '' };
  try {
    const value = JSON.parse(window.sessionStorage.getItem(VIEW_KEY) ?? '{}') as Record<string, unknown>;
    return {
      state: states.some((item) => item.value === value.state) ? value.state as CreditSaleState : fallback.state,
      query: typeof value.query === 'string' ? value.query : '',
    };
  } catch { return fallback; }
}

function saveView(update: Partial<{ state: CreditSaleState; query: string }>) {
  try {
    const current = JSON.parse(window.sessionStorage.getItem(VIEW_KEY) ?? '{}') as Record<string, unknown>;
    window.sessionStorage.setItem(VIEW_KEY, JSON.stringify({ ...current, ...update }));
  } catch { /* Filters still work without browser storage. */ }
}

function today() { return new Date(Date.now() + 6 * 60 * 60 * 1_000).toISOString().slice(0, 10); }
function money(value: number) { return `৳${value.toFixed(2)}`; }
function dateLabel(value: string | null) {
  if (!value) return 'বাকি শেষ';
  return formatAppDate(value);
}
function followUpState(value: string | null) {
  if (!value) return { label: 'বাকি শেষ', className: 'bg-green-100 text-green-800' };
  if (value < today()) return { label: 'সময় পার হয়েছে', className: 'bg-destructive/10 text-destructive' };
  if (value === today()) return { label: 'আজ যোগাযোগ করুন', className: 'bg-amber-100 text-amber-900' };
  return { label: dateLabel(value), className: 'bg-muted text-muted-foreground' };
}

export default function CreditSalesManager() {
  const [initialView] = useState(readView);
  const [customers, setCustomers] = useState<CreditCustomer[]>([]);
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [state, setState] = useState<CreditSaleState>(initialView.state);
  const [queryDraft, setQueryDraft] = useState(initialView.query);
  const [query, setQuery] = useState(initialView.query);
  const debouncedQuery = useDebounce(queryDraft, 350);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, CreditCustomer>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [paymentCustomer, setPaymentCustomer] = useState<CreditCustomer | null>(null);
  const [followUpCustomer, setFollowUpCustomer] = useState<CreditCustomer | null>(null);
  const [editCustomer, setEditCustomer] = useState<CreditCustomer | null>(null);
  const [voidTarget, setVoidTarget] = useState<{ customer: CreditCustomer; payment: CreditPayment } | null>(null);
  const [methodTarget, setMethodTarget] = useState<{ customerId: string; payment: CreditPayment } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const [result, currentSummary] = await Promise.all([
        getCreditCustomers({ state, query: query || undefined, page, limit: 30 }),
        getCreditCustomerSummary(),
      ]);
      setCustomers(result.data); setTotalPages(result.totalPages); setSummary(currentSummary);
    } catch (error) { setLoadError(getErrorMessage(error, 'বাকি হিসাব লোড করা যায়নি।')); }
    finally { setLoading(false); }
  }, [page, query, state]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const value = debouncedQuery.trim();
    setQuery((current) => current === value ? current : value);
    setPage(1);
    saveView({ query: value });
  }, [debouncedQuery]);

  async function toggleCustomer(customer: CreditCustomer) {
    if (expanded === customer.id) { setExpanded(null); return; }
    setExpanded(customer.id);
    if (details[customer.id]) return;
    setDetailLoading(customer.id);
    try {
      const detail = await getCreditCustomer(customer.id);
      setDetails((current) => ({ ...current, [customer.id]: detail }));
    } catch (error) { setLoadError(getErrorMessage(error, 'ক্রেতার আগের রেকর্ড লোড করা যায়নি।')); }
    finally { setDetailLoading(null); }
  }
  function refreshed() { setDetails({}); void load(); }
  function resetFilters() {
    setState('OPEN');
    setQueryDraft('');
    setQuery('');
    setPage(1);
    saveView({ state: 'OPEN', query: '' });
  }

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">বাকি হিসাব</h1><p className="text-sm text-muted-foreground">প্রতি ক্রেতার মোট বাকি, জমা টাকা এবং যোগাযোগের তারিখ দেখুন।</p></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard label="মোট বাকি" value={summary ? money(summary.totalOutstanding) : '...'} icon={<HandCoins size={18} />} />
      <SummaryCard label="সময় পার হয়েছে" value={summary ? `${summary.overdueCount} জন` : '...'} icon={<CalendarClock size={18} />} />
      <SummaryCard label="আজ যোগাযোগ" value={summary ? `${summary.dueTodayCount} জন` : '...'} icon={<Phone size={18} />} />
      <SummaryCard label="বাকি থাকা ক্রেতা" value={summary ? `${summary.customerCount} জন` : '...'} icon={<CheckCircle2 size={18} />} />
    </div>
    <FilterPanel title="বাকি ফিল্টার" actions={<FilterResetButton active={state !== 'OPEN' || Boolean(queryDraft.trim() || query)} onClick={resetFilters} />}>
      <FilterFields className="lg:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)] lg:items-end">
        <FilterField label="ক্রেতা"><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 text-muted-foreground" size={17} /><Input aria-label="ক্রেতা সার্চ করুন" className="pl-10" value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} placeholder="ক্রেতার নাম বা ফোন" /></div></FilterField>
        <FilterField label="বাকির স্ট্যাটাস"><div className="flex min-h-11 flex-wrap items-center gap-2">{states.map((item) => <Button key={item.value} type="button" size="sm" variant={state === item.value ? 'default' : 'outline'} onClick={() => { setState(item.value); setPage(1); saveView({ state: item.value }); }}>{item.label}</Button>)}</div></FilterField>
      </FilterFields>
    </FilterPanel>
    {loading && <div className="flex min-h-48 items-center justify-center"><Loader2 className="animate-spin" /><span className="ml-2">বাকি হিসাব লোড হচ্ছে...</span></div>}
    {!loading && loadError && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center"><p className="text-destructive">{loadError}</p><Button className="mt-3" onClick={() => void load()}>রিট্রাই করুন</Button></div>}
    {!loading && !loadError && customers.length === 0 && <div className="rounded-xl border bg-card px-4 py-12 text-center text-muted-foreground">এই তালিকায় কোনো ক্রেতার বাকি নেই।</div>}
    {!loading && !loadError && <div className="space-y-4">{customers.map((customer) => {
      const open = expanded === customer.id; const followUp = followUpState(customer.nextFollowUpDate); const detail = details[customer.id];
      return <section key={customer.id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <button type="button" className="grid w-full gap-3 p-4 text-left hover:bg-muted/20 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center" onClick={() => void toggleCustomer(customer)} aria-expanded={open}>
          <div><strong className="text-lg">{customer.name}</strong>{customer.phone && <div className="mt-1 text-sm text-muted-foreground">{customer.phone}</div>}<div className="mt-1 text-xs text-muted-foreground">{customer.saleCount}টি বাকি বিক্রি</div></div>
          <div className="sm:text-right"><div className="text-xs text-muted-foreground">মোট বাকি</div><strong className="text-xl text-primary">{money(customer.outstandingAmount)}</strong><div className="text-xs">জমা {money(customer.collectedAmount)}</div></div>
          <div className="flex items-center justify-between gap-2 sm:justify-end"><span className={`rounded-full px-2 py-1 text-xs font-medium ${followUp.className}`}>{followUp.label}</span><ChevronDown size={18} className={`transition-transform ${open ? 'rotate-180' : ''}`} /></div>
        </button>
        {open && <div className="border-t bg-muted/10 p-4"><div className="flex flex-wrap gap-2">
          {customer.phone && <Button asChild size="sm" variant="outline"><a href={`tel:${customer.phone}`}><Phone size={15} />কল করুন</a></Button>}
          <Button size="sm" variant="outline" onClick={() => setEditCustomer(customer)}><Pencil size={15} />তথ্য আপডেট করুন</Button>
          {customer.outstandingAmount > 0 && <><Button size="sm" variant="outline" onClick={() => setFollowUpCustomer(customer)}><CalendarClock size={15} />তারিখ আপডেট করুন</Button><Button size="sm" onClick={() => setPaymentCustomer(customer)}><HandCoins size={15} />পেমেন্ট অ্যাড করুন</Button></>}
        </div>{detailLoading === customer.id && <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>}{detail && <CustomerRecord customer={detail} onVoid={(payment) => setVoidTarget({ customer, payment })} onCorrect={(payment) => setMethodTarget({ customerId: customer.id, payment })} />}</div>}
      </section>;
    })}</div>}
    {totalPages > 1 && <div className="flex items-center justify-center gap-3"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>আগের পেজ</Button><span className="text-sm">পেজ {page} / {totalPages}</span><Button variant="outline" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>পরের পেজ</Button></div>}
    <PaymentDialog customer={paymentCustomer} onClose={() => setPaymentCustomer(null)} onSaved={() => { setPaymentCustomer(null); refreshed(); }} />
    <FollowUpDialog customer={followUpCustomer} onClose={() => setFollowUpCustomer(null)} onSaved={() => { setFollowUpCustomer(null); refreshed(); }} />
    <EditCustomerDialog customer={editCustomer} onClose={() => setEditCustomer(null)} onSaved={() => { setEditCustomer(null); refreshed(); }} />
    <VoidPaymentDialog target={voidTarget} onClose={() => setVoidTarget(null)} onSaved={() => { setVoidTarget(null); refreshed(); }} />
    <PaymentChannelCorrectionDialog open={methodTarget !== null} current={methodTarget?.payment.paymentChannel} title="পেমেন্টের মাধ্যম আপডেট করুন" onClose={() => setMethodTarget(null)} onSave={async (channel) => { if (!methodTarget) return; await correctCreditCustomerPaymentChannel(methodTarget.customerId, methodTarget.payment.id, channel); refreshed(); }} />
  </div>;
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) { return <div className="rounded-xl border bg-card p-4"><div className="flex items-center justify-between text-sm text-muted-foreground"><span>{label}</span><span className="rounded-full bg-secondary/10 p-2 text-secondary">{icon}</span></div><div className="mt-2 text-2xl font-bold">{value}</div></div>; }

function CustomerRecord({ customer, onVoid, onCorrect }: { customer: CreditCustomer; onVoid: (payment: CreditPayment) => void; onCorrect: (payment: CreditPayment) => void }) {
  const sales = customer.sales ?? [];
  return <div className="mt-4 space-y-5">
    <div><h3 className="text-sm font-semibold">বিক্রির রেকর্ড</h3><div className="mt-2 space-y-2">{sales.map((sale) => <SaleRecord key={sale.id} sale={sale} />)}</div></div>
    <div><h3 className="text-sm font-semibold">পেমেন্টের রেকর্ড</h3>{customer.payments.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">এখনো কোনো টাকা জমা হয়নি।</p> : <div className="mt-2 space-y-2">{customer.payments.slice().reverse().map((payment) => <div key={payment.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-3 text-sm ${payment.voidedAt ? 'opacity-60' : ''}`}><div><strong>{money(payment.amount)}</strong><div className="text-xs text-muted-foreground">{dateLabel(payment.paidOn)} · {payment.createdBy.fullName} · {paymentChannelLabel(payment.paymentChannel)}{payment.note ? ` · ${payment.note}` : ''}</div>{payment.voidedAt && <div className="text-xs text-destructive">বাতিল করা হয়েছে: {payment.voidReason}</div>}</div>{!payment.voidedAt && <div className="flex flex-wrap gap-1"><Button size="sm" variant="ghost" onClick={() => onCorrect(payment)}>মাধ্যম আপডেট করুন</Button><Button size="sm" variant="ghost" onClick={() => onVoid(payment)}><Undo2 size={15} />পেমেন্ট বাতিল</Button></div>}</div>)}</div>}</div>
    {(customer.history?.length ?? 0) > 0 && <div><h3 className="text-sm font-semibold">তথ্য ও তারিখ আপডেটের রেকর্ড</h3><div className="mt-2 space-y-2">{customer.history!.map((entry) => <div key={entry.id} className="rounded-lg border bg-background p-3 text-sm"><strong>{entry.action === 'CREDIT_CUSTOMER_UPDATED' ? 'ক্রেতার তথ্য আপডেট হয়েছে' : 'যোগাযোগের তারিখ আপডেট হয়েছে'}</strong><div className="mt-1 text-xs text-muted-foreground">{formatAppDateTime(entry.createdAt)} · {entry.actor?.fullName ?? 'ওনার'}</div></div>)}</div></div>}
  </div>;
}

function SaleRecord({ sale }: { sale: PhysicalSale }) { return <div className="rounded-lg border bg-background p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><div><strong>{sale.orderNumber}</strong><div className="text-xs text-muted-foreground">বিক্রি: {formatAppDate(sale.soldOn)} · রেকর্ড: {formatAppDateTime(sale.completedAt)}</div></div><strong>{money(sale.remainingRevenue)}</strong></div><div className="mt-2 text-muted-foreground">{sale.items.map((item) => `${productPackLabel(item.productName, item.variantName)} · ${formatQuantity(item.quantity, item.quantityUnit, undefined, item.unitLabel)}`).join(', ')}</div>{sale.returns.length > 0 && <div className="mt-2 space-y-1 text-xs text-destructive">{sale.returns.map((entry) => <div key={entry.id}>রিটার্ন {formatAppDateTime(entry.createdAt)} · বাকি কমেছে {money(entry.creditOffsetAmount)}{entry.cashRefundAmount > 0 ? ` · টাকা ফেরত ${money(entry.cashRefundAmount)} (${paymentChannelLabel(entry.refundChannel)})` : ''}</div>)}</div>}</div>; }

function PaymentDialog({ customer, onClose, onSaved }: { customer: CreditCustomer | null; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(''); const [paidOn, setPaidOn] = useState(today()); const [note, setNote] = useState(''); const [requestKey, setRequestKey] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const [paymentChannel, setPaymentChannel] = useState<PaymentChannel>('CASH');
  useEffect(() => { if (customer) { setAmount(String(customer.outstandingAmount)); setPaidOn(today()); setPaymentChannel('CASH'); setNote(''); setError(''); setRequestKey(crypto.randomUUID()); } }, [customer]);
  async function submit() { if (!customer) return; const value = Number(amount); if (!Number.isFinite(value) || value <= 0 || value > customer.outstandingAmount) { setError(`1 থেকে ${money(customer.outstandingAmount)} এর মধ্যে টাকা দিন।`); return; } if (!paidOn || paidOn > today()) { setError('আজ বা আগের পেমেন্টের তারিখ দিন।'); return; } setSaving(true); setError(''); try { await recordCreditCustomerPayment(customer.id, { idempotencyKey: requestKey, amount: value, paidOn, paymentChannel, note: note.trim() || undefined }); onSaved(); } catch (value) { setError(getErrorMessage(value, 'পেমেন্ট অ্যাড করা যায়নি।')); } finally { setSaving(false); } }
  return <Dialog open={Boolean(customer)} onOpenChange={(open) => { if (!open && !saving) onClose(); }}><DialogContent><DialogHeader><DialogTitle>পেমেন্ট অ্যাড করুন</DialogTitle><DialogDescription>{customer ? `${customer.name} · মোট বাকি ${money(customer.outstandingAmount)}` : ''}</DialogDescription></DialogHeader><div className="space-y-3"><Field label="জমা টাকা"><Input aria-label="জমা টাকা" type="number" min="0.01" step="0.01" max={customer?.outstandingAmount} value={amount} onChange={(event) => setAmount(event.target.value)} /></Field><Field label="পেমেন্টের তারিখ"><FormattedDateInput aria-label="পেমেন্টের তারিখ" max={today()} value={paidOn} onChange={(event) => setPaidOn(event.target.value)} /></Field><PaymentChannelSelect value={paymentChannel} onChange={setPaymentChannel} disabled={saving} /><Field label="নোট (ঐচ্ছিক)"><Input aria-label="নোট (ঐচ্ছিক)" value={note} onChange={(event) => setNote(event.target.value)} /></Field>{error && <p role="alert" className="rounded-md bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}</div><DialogFooter><Button variant="outline" disabled={saving} onClick={onClose}>বন্ধ করুন</Button><Button disabled={saving} onClick={() => void submit()}>{saving && <Loader2 className="mr-2 animate-spin" size={16} />}পেমেন্ট অ্যাড করুন</Button></DialogFooter></DialogContent></Dialog>;
}

function FollowUpDialog({ customer, onClose, onSaved }: { customer: CreditCustomer | null; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(''); const [note, setNote] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  useEffect(() => { if (customer) { setDate(customer.nextFollowUpDate ?? today()); setNote(''); setError(''); } }, [customer]);
  async function submit() { if (!customer) return; if (!date || date < today()) { setError('আজ বা পরের কোনো তারিখ দিন।'); return; } setSaving(true); setError(''); try { await rescheduleCreditCustomerFollowUp(customer.id, { nextFollowUpDate: date, note: note.trim() || undefined }); onSaved(); } catch (value) { setError(getErrorMessage(value, 'তারিখ আপডেট করা যায়নি।')); } finally { setSaving(false); } }
  return <Dialog open={Boolean(customer)} onOpenChange={(open) => { if (!open && !saving) onClose(); }}><DialogContent><DialogHeader><DialogTitle>যোগাযোগের তারিখ আপডেট করুন</DialogTitle><DialogDescription>{customer ? `${customer.name} এর পুরো বাকি হিসাবের জন্য নতুন তারিখ দিন।` : ''}</DialogDescription></DialogHeader><div className="space-y-3"><Field label="পরের যোগাযোগ"><FormattedDateInput aria-label="পরের যোগাযোগ" min={today()} value={date} onChange={(event) => setDate(event.target.value)} /></Field><Field label="নোট (ঐচ্ছিক)"><Input aria-label="তারিখ আপডেটের নোট" value={note} onChange={(event) => setNote(event.target.value)} /></Field>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div><DialogFooter><Button variant="outline" disabled={saving} onClick={onClose}>বন্ধ করুন</Button><Button disabled={saving} onClick={() => void submit()}>{saving && <Loader2 className="mr-2 animate-spin" size={16} />}তারিখ আপডেট করুন</Button></DialogFooter></DialogContent></Dialog>;
}

function EditCustomerDialog({ customer, onClose, onSaved }: { customer: CreditCustomer | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  useEffect(() => { if (customer) { setName(customer.name); setPhone(customer.phone ?? ''); setError(''); } }, [customer]);
  async function submit() { if (!customer) return; if (!name.trim()) { setError('ক্রেতার নাম দিন।'); return; } if (phone.trim() && (phone.trim().length < 7 || phone.trim().length > 30)) { setError('ফোন নম্বর 7 থেকে 30 অক্ষরের মধ্যে লিখুন।'); return; } setSaving(true); setError(''); try { await updateCreditCustomer(customer.id, { name: name.trim(), phone: phone.trim() || null }); onSaved(); } catch (value) { setError(value instanceof ApiError && value.code === 'DUPLICATE_CREDIT_CUSTOMER_NAME' ? 'এই নামে আরেকজন বাকি ক্রেতা আছেন। অন্য একটি নাম দিন।' : getErrorMessage(value, 'ক্রেতার তথ্য আপডেট করা যায়নি।')); } finally { setSaving(false); } }
  return <Dialog open={Boolean(customer)} onOpenChange={(open) => { if (!open && !saving) onClose(); }}><DialogContent><DialogHeader><DialogTitle>ক্রেতার তথ্য আপডেট করুন</DialogTitle><DialogDescription>নামটি অন্য কোনো বাকি ক্রেতার নামের সঙ্গে মিলতে পারবে না।</DialogDescription></DialogHeader><div className="space-y-3"><Field label="ক্রেতার নাম"><Input aria-label="ক্রেতার নাম আপডেট" value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="ফোন (ঐচ্ছিক)"><Input aria-label="ক্রেতার ফোন আপডেট" value={phone} onChange={(event) => setPhone(event.target.value)} /></Field>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div><DialogFooter><Button variant="outline" disabled={saving} onClick={onClose}>বন্ধ করুন</Button><Button disabled={saving} onClick={() => void submit()}>{saving && <Loader2 className="mr-2 animate-spin" size={16} />}সেভ করুন</Button></DialogFooter></DialogContent></Dialog>;
}

function VoidPaymentDialog({ target, onClose, onSaved }: { target: { customer: CreditCustomer; payment: CreditPayment } | null; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  useEffect(() => { if (target) { setReason(''); setError(''); } }, [target]);
  async function submit() { if (!target) return; if (reason.trim().length < 3) { setError('কেন পেমেন্টটি বাতিল করছেন তা লিখুন।'); return; } setSaving(true); setError(''); try { await voidCreditCustomerPayment(target.customer.id, target.payment.id, reason.trim()); onSaved(); } catch (value) { setError(getErrorMessage(value, 'পেমেন্ট বাতিল করা যায়নি।')); } finally { setSaving(false); } }
  return <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open && !saving) onClose(); }}><DialogContent><DialogHeader><DialogTitle>পেমেন্ট বাতিল করুন</DialogTitle><DialogDescription>{target ? `${money(target.payment.amount)} পেমেন্টটি বাতিল হলে টাকা আবার মোট বাকিতে অ্যাড হবে।` : ''}</DialogDescription></DialogHeader><Field label="কারণ"><Input aria-label="পেমেন্ট বাতিলের কারণ" value={reason} onChange={(event) => setReason(event.target.value)} /></Field>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button variant="outline" disabled={saving} onClick={onClose}>বন্ধ করুন</Button><Button variant="destructive" disabled={saving} onClick={() => void submit()}>{saving && <Loader2 className="mr-2 animate-spin" size={16} />}পেমেন্ট বাতিল করুন</Button></DialogFooter></DialogContent></Dialog>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><Label className="text-xs">{label}</Label><div className="mt-1">{children}</div></div>; }
