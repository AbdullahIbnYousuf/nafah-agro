import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, ChevronDown, HandCoins, Loader2, Phone, Search, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getCreditSales, getCreditSummary, recordCreditPayment, rescheduleCreditFollowUp, voidCreditPayment } from '@/lib/api';
import type { CreditPayment, CreditSaleState, CreditSummary, PhysicalSale } from '@/lib/types';
import { getErrorMessage } from '@/lib/utils';
import { productPackLabel } from '@/lib/productOptions';
import { formatQuantity } from '@/lib/quantity';

const states: Array<{ value: CreditSaleState; label: string }> = [
  { value: 'OPEN', label: 'সব বাকি' },
  { value: 'OVERDUE', label: 'সময় পার হয়েছে' },
  { value: 'TODAY', label: 'আজ যোগাযোগ' },
  { value: 'UPCOMING', label: 'সামনে আছে' },
  { value: 'SETTLED', label: 'বাকি শেষ' },
];

function today() {
  return new Date(Date.now() + 6 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

function money(value: number) {
  return `৳${value.toFixed(2)}`;
}

function dateLabel(value: string | null) {
  if (!value) return 'বাকি শেষ';
  return new Date(`${value}T00:00:00+06:00`).toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' });
}

function followUpState(value: string | null) {
  if (!value) return { label: 'বাকি শেষ', className: 'bg-green-100 text-green-800' };
  if (value < today()) return { label: 'সময় পার হয়েছে', className: 'bg-destructive/10 text-destructive' };
  if (value === today()) return { label: 'আজ যোগাযোগ করুন', className: 'bg-amber-100 text-amber-900' };
  return { label: dateLabel(value), className: 'bg-muted text-muted-foreground' };
}

export default function CreditSalesManager() {
  const [sales, setSales] = useState<PhysicalSale[]>([]);
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [state, setState] = useState<CreditSaleState>('OPEN');
  const [queryDraft, setQueryDraft] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [paymentSale, setPaymentSale] = useState<PhysicalSale | null>(null);
  const [followUpSale, setFollowUpSale] = useState<PhysicalSale | null>(null);
  const [voidTarget, setVoidTarget] = useState<{ sale: PhysicalSale; payment: CreditPayment } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [result, currentSummary] = await Promise.all([
        getCreditSales({ state, query: query || undefined, page, limit: 30 }),
        getCreditSummary(),
      ]);
      setSales(result.data);
      setTotalPages(result.totalPages);
      setSummary(currentSummary);
    } catch (error) {
      setLoadError(getErrorMessage(error, 'বাকি হিসাব লোড করা যায়নি।'));
    } finally {
      setLoading(false);
    }
  }, [page, query, state]);

  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => {
    const result = new Map<string, PhysicalSale[]>();
    for (const sale of sales) {
      const key = sale.customerPhone ?? sale.id;
      result.set(key, [...(result.get(key) ?? []), sale]);
    }
    return [...result.entries()];
  }, [sales]);

  function search(event: React.FormEvent) {
    event.preventDefault();
    setPage(1);
    setQuery(queryDraft.trim());
  }

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">বাকি হিসাব</h1><p className="text-sm text-muted-foreground">বাকি বিক্রি, জমা টাকা এবং পরবর্তী যোগাযোগের তারিখ দেখুন।</p></div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard label="মোট বাকি" value={summary ? money(summary.totalOutstanding) : '...'} icon={<HandCoins size={18} />} />
      <SummaryCard label="সময় পার হয়েছে" value={summary ? `${summary.overdueCount}টি` : '...'} icon={<CalendarClock size={18} />} />
      <SummaryCard label="আজ যোগাযোগ" value={summary ? `${summary.dueTodayCount}টি` : '...'} icon={<Phone size={18} />} />
      <SummaryCard label="বাকি থাকা ক্রেতা" value={summary ? `${summary.customerCount} জন` : '...'} icon={<CheckCircle2 size={18} />} />
    </div>

    <section className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap gap-2">{states.map((item) => <Button key={item.value} size="sm" variant={state === item.value ? 'default' : 'outline'} onClick={() => { setState(item.value); setPage(1); }}>{item.label}</Button>)}</div>
      <form onSubmit={search} className="mt-3 flex flex-col gap-2 sm:flex-row"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3 text-muted-foreground" size={17} /><Input className="pl-10" value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} placeholder="নাম, ফোন বা বিক্রয় নম্বর" /></div><Button type="submit">খুঁজুন</Button>{query && <Button type="button" variant="ghost" onClick={() => { setQueryDraft(''); setQuery(''); setPage(1); }}>খোঁজা মুছুন</Button>}</form>
    </section>

    {loading && <div className="flex min-h-48 items-center justify-center"><Loader2 className="animate-spin" /><span className="ml-2">বাকি হিসাব লোড হচ্ছে...</span></div>}
    {!loading && loadError && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center"><p className="text-destructive">{loadError}</p><Button className="mt-3" onClick={() => void load()}>আবার চেষ্টা করুন</Button></div>}
    {!loading && !loadError && groups.length === 0 && <div className="rounded-xl border bg-card px-4 py-12 text-center text-muted-foreground">এই তালিকায় কোনো বাকি বিক্রি নেই।</div>}

    {!loading && !loadError && <div className="space-y-5">{groups.map(([phone, customerSales]) => {
      const outstanding = customerSales.reduce((total, sale) => total + sale.outstandingAmount, 0);
      const customer = customerSales[0];
      return <section key={phone} className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 p-4"><div><h2 className="font-bold">{customer.customerName}</h2><a className="mt-1 inline-flex min-h-9 items-center gap-1 text-sm text-secondary hover:underline" href={`tel:${customer.customerPhone}`}><Phone size={15} />{customer.customerPhone}</a></div><div className="text-right"><div className="text-xs text-muted-foreground">এই পাতায় মোট বাকি</div><strong className="text-xl text-primary">{money(outstanding)}</strong></div></div>
        <div className="divide-y">{customerSales.map((sale) => <CreditSaleRow key={sale.id} sale={sale} open={expanded === sale.id} onToggle={() => setExpanded((current) => current === sale.id ? null : sale.id)} onPayment={() => setPaymentSale(sale)} onFollowUp={() => setFollowUpSale(sale)} onVoid={(payment) => setVoidTarget({ sale, payment })} />)}</div>
      </section>;
    })}</div>}

    {totalPages > 1 && <div className="flex items-center justify-center gap-3"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>আগের পাতা</Button><span className="text-sm">পৃষ্ঠা {page} / {totalPages}</span><Button variant="outline" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>পরের পাতা</Button></div>}

    <PaymentDialog sale={paymentSale} onClose={() => setPaymentSale(null)} onSaved={() => { setPaymentSale(null); void load(); }} />
    <FollowUpDialog sale={followUpSale} onClose={() => setFollowUpSale(null)} onSaved={() => { setFollowUpSale(null); void load(); }} />
    <VoidPaymentDialog target={voidTarget} onClose={() => setVoidTarget(null)} onSaved={() => { setVoidTarget(null); void load(); }} />
  </div>;
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="rounded-xl border bg-card p-4"><div className="flex items-center justify-between text-sm text-muted-foreground"><span>{label}</span><span className="rounded-full bg-secondary/10 p-2 text-secondary">{icon}</span></div><div className="mt-2 text-2xl font-bold">{value}</div></div>;
}

function CreditSaleRow({ sale, open, onToggle, onPayment, onFollowUp, onVoid }: { sale: PhysicalSale; open: boolean; onToggle: () => void; onPayment: () => void; onFollowUp: () => void; onVoid: (payment: CreditPayment) => void }) {
  const followUp = followUpState(sale.nextFollowUpDate);
  return <div>
    <button type="button" className="grid w-full gap-3 p-4 text-left hover:bg-muted/20 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center" onClick={onToggle} aria-expanded={open}>
      <div><strong>{sale.orderNumber}</strong><div className="mt-1 text-sm text-muted-foreground">{sale.items.map((item) => productPackLabel(item.productName, item.variantName)).join(', ')}</div><div className="mt-1 text-xs text-muted-foreground">{new Date(sale.completedAt).toLocaleString('bn-BD')}</div></div>
      <div className="sm:text-right"><div className="text-xs text-muted-foreground">বাকি</div><strong className="text-lg text-primary">{money(sale.outstandingAmount)}</strong><div className="text-xs">জমা {money(sale.collectedAmount)}</div></div>
      <div className="flex items-center justify-between gap-2 sm:justify-end"><span className={`rounded-full px-2 py-1 text-xs font-medium ${followUp.className}`}>{followUp.label}</span><ChevronDown size={18} className={`transition-transform ${open ? 'rotate-180' : ''}`} /></div>
    </button>
    {open && <div className="border-t bg-muted/10 p-4">
      <div className="grid gap-3 sm:grid-cols-3"><SmallMetric label="বর্তমান বিক্রয়" value={money(sale.remainingRevenue)} /><SmallMetric label="জমা হয়েছে" value={money(sale.collectedAmount)} /><SmallMetric label="এখনো বাকি" value={money(sale.outstandingAmount)} /></div>
      <div className="mt-4 divide-y rounded-lg border bg-background">{sale.items.map((item) => <div key={item.id} className="flex flex-wrap justify-between gap-2 p-3 text-sm"><span>{productPackLabel(item.productName, item.variantName)}</span><span>{formatQuantity(item.quantity, item.quantityUnit)} · {money(item.netLineRevenue)}</span></div>)}</div>
      <div className="mt-4"><h3 className="text-sm font-semibold">পেমেন্টের ইতিহাস</h3>{sale.creditPayments.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">এখনো কোনো টাকা জমা হয়নি।</p> : <div className="mt-2 space-y-2">{sale.creditPayments.map((payment) => <div key={payment.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm ${payment.voidedAt ? 'opacity-60' : ''}`}><div><strong>{money(payment.amount)}</strong><div className="text-xs text-muted-foreground">{dateLabel(payment.paidOn)} · {payment.createdBy.fullName}{payment.note ? ` · ${payment.note}` : ''}</div>{payment.voidedAt && <div className="text-xs text-destructive">বাতিল করা হয়েছে: {payment.voidReason}</div>}</div>{!payment.voidedAt && <Button size="sm" variant="ghost" onClick={() => onVoid(payment)}><Undo2 size={15} className="mr-1" />ভুল পেমেন্ট</Button>}</div>)}</div>}</div>
      {sale.outstandingAmount > 0 && <div className="mt-4 flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={onFollowUp}><CalendarClock size={16} className="mr-2" />তারিখ বদলান</Button><Button onClick={onPayment}><HandCoins size={16} className="mr-2" />পেমেন্ট যোগ করুন</Button></div>}
    </div>}
  </div>;
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-muted/50 p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="font-bold">{value}</div></div>;
}

function PaymentDialog({ sale, onClose, onSaved }: { sale: PhysicalSale | null; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(today());
  const [note, setNote] = useState('');
  const [requestKey, setRequestKey] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (sale) { setAmount(String(sale.outstandingAmount)); setPaidOn(today()); setNote(''); setError(''); setRequestKey(crypto.randomUUID()); } }, [sale]);
  async function submit() {
    if (!sale) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || value > sale.outstandingAmount) { setError(`১ থেকে ${money(sale.outstandingAmount)} এর মধ্যে টাকা দিন।`); return; }
    if (!paidOn || paidOn > today()) { setError('আজ বা আগের পেমেন্টের তারিখ দিন।'); return; }
    setSaving(true); setError('');
    try { await recordCreditPayment(sale.id, { idempotencyKey: requestKey, amount: value, paidOn, note: note.trim() || undefined }); onSaved(); }
    catch (value) { setError(getErrorMessage(value, 'পেমেন্ট যোগ করা যায়নি।')); }
    finally { setSaving(false); }
  }
  return <Dialog open={Boolean(sale)} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <DialogContent>
      <DialogHeader><DialogTitle>পেমেন্ট যোগ করুন</DialogTitle><DialogDescription>{sale ? `${sale.customerName} · বাকি ${money(sale.outstandingAmount)}` : ''}</DialogDescription></DialogHeader>
      <div className="space-y-3">
        <Field label="জমা টাকা"><Input aria-label="জমা টাকা" type="number" min="0.01" step="0.01" max={sale?.outstandingAmount} value={amount} onChange={(event) => setAmount(event.target.value)} /></Field>
        <Field label="পেমেন্টের তারিখ"><Input aria-label="পেমেন্টের তারিখ" type="date" max={today()} value={paidOn} onChange={(event) => setPaidOn(event.target.value)} /></Field>
        <Field label="নোট (ঐচ্ছিক)"><Input aria-label="নোট (ঐচ্ছিক)" value={note} onChange={(event) => setNote(event.target.value)} /></Field>
        {error && <p role="alert" className="rounded-md bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter><Button variant="outline" disabled={saving} onClick={onClose}>বন্ধ করুন</Button><Button disabled={saving} onClick={() => void submit()}>{saving && <Loader2 className="mr-2 animate-spin" size={16} />}পেমেন্ট যোগ করুন</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function FollowUpDialog({ sale, onClose, onSaved }: { sale: PhysicalSale | null; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(''); const [note, setNote] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  useEffect(() => { if (sale) { setDate(sale.nextFollowUpDate ?? today()); setNote(''); setError(''); } }, [sale]);
  async function submit() { if (!sale) return; if (!date || date < today()) { setError('আজ বা পরের কোনো তারিখ দিন।'); return; } setSaving(true); setError(''); try { await rescheduleCreditFollowUp(sale.id, { nextFollowUpDate: date, note: note.trim() || undefined }); onSaved(); } catch (value) { setError(getErrorMessage(value, 'তারিখ বদলানো যায়নি।')); } finally { setSaving(false); } }
  return <Dialog open={Boolean(sale)} onOpenChange={(open) => { if (!open && !saving) onClose(); }}><DialogContent><DialogHeader><DialogTitle>যোগাযোগের তারিখ বদলান</DialogTitle><DialogDescription>নতুন তারিখে বাকি হিসাব আবার মনে করিয়ে দেওয়া হবে।</DialogDescription></DialogHeader><div className="space-y-3"><Field label="পরবর্তী যোগাযোগ"><Input aria-label="পরবর্তী যোগাযোগ" type="date" min={today()} value={date} onChange={(event) => setDate(event.target.value)} /></Field><Field label="নোট (ঐচ্ছিক)"><Input aria-label="তারিখ বদলানোর নোট" value={note} onChange={(event) => setNote(event.target.value)} /></Field>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div><DialogFooter><Button variant="outline" disabled={saving} onClick={onClose}>বন্ধ করুন</Button><Button disabled={saving} onClick={() => void submit()}>{saving && <Loader2 className="mr-2 animate-spin" size={16} />}তারিখ বদলান</Button></DialogFooter></DialogContent></Dialog>;
}

function VoidPaymentDialog({ target, onClose, onSaved }: { target: { sale: PhysicalSale; payment: CreditPayment } | null; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  useEffect(() => { if (target) { setReason(''); setError(''); } }, [target]);
  async function submit() { if (!target) return; if (reason.trim().length < 3) { setError('কেন পেমেন্টটি বাতিল করছেন তা লিখুন।'); return; } setSaving(true); setError(''); try { await voidCreditPayment(target.sale.id, target.payment.id, reason.trim()); onSaved(); } catch (value) { setError(getErrorMessage(value, 'পেমেন্ট বাতিল করা যায়নি।')); } finally { setSaving(false); } }
  return <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open && !saving) onClose(); }}><DialogContent><DialogHeader><DialogTitle>ভুল পেমেন্ট ঠিক করুন</DialogTitle><DialogDescription>{target ? `${money(target.payment.amount)} পেমেন্টটি বাতিল হলে টাকা আবার বাকি হিসেবে দেখা যাবে।` : ''}</DialogDescription></DialogHeader><Field label="কারণ"><Input aria-label="পেমেন্ট বাতিলের কারণ" value={reason} onChange={(event) => setReason(event.target.value)} /></Field>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button variant="outline" disabled={saving} onClick={onClose}>বন্ধ করুন</Button><Button variant="destructive" disabled={saving} onClick={() => void submit()}>{saving && <Loader2 className="mr-2 animate-spin" size={16} />}পেমেন্ট বাতিল করুন</Button></DialogFooter></DialogContent></Dialog>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="text-xs">{label}</Label><div className="mt-1">{children}</div></div>;
}
