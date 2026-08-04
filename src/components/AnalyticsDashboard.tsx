import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  CircleDollarSign,
  ClipboardList,
  PackageCheck,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Truck,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getAnalyticsDashboard } from '@/lib/api';
import type {
  AnalyticsDashboardData,
  AnalyticsPreset,
  AnalyticsProductRow,
  ComparedAnalyticsMetric,
  OrderSource,
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const presets: Array<{ value: AnalyticsPreset; label: string }> = [
  { value: 'today', label: 'আজ' },
  { value: 'yesterday', label: 'গতকাল' },
  { value: 'week', label: 'এই সপ্তাহ' },
  { value: 'month', label: 'এই মাস' },
  { value: 'custom', label: 'নিজস্ব সময়সীমা' },
];

const sourceLabels: Record<OrderSource, string> = {
  WEBSITE: 'ওয়েবসাইট',
  PHYSICAL_SHOP: 'দোকান',
  FACEBOOK: 'ফেসবুক',
  PHONE: 'ফোন',
  WHATSAPP: 'হোয়াটসঅ্যাপ',
  OTHER: 'অন্যান্য',
};

const banglaNumber = new Intl.NumberFormat('bn-BD', { maximumFractionDigits: 2 });
const compactNumber = new Intl.NumberFormat('bn-BD', { notation: 'compact', maximumFractionDigits: 1 });

function money(value: number | null) {
  return value === null ? '—' : `৳${banglaNumber.format(value)}`;
}

function count(value: number | null) {
  return value === null ? '—' : banglaNumber.format(value);
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('bn-BD', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(`${value}T12:00:00.000Z`));
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('bn-BD', { day: 'numeric', month: 'short' })
    .format(new Date(`${value}T12:00:00.000Z`));
}

function Change({ metric, suffix = '%' }: { metric: ComparedAnalyticsMetric; suffix?: string }) {
  if (metric.absoluteChange === null) return <span className="text-xs text-muted-foreground">আগের সময়ের তুলনা নেই</span>;
  const positive = metric.absoluteChange >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  const value = metric.percentChange === null
    ? `${positive ? '+' : ''}${banglaNumber.format(metric.absoluteChange)}`
    : `${positive ? '+' : ''}${banglaNumber.format(metric.percentChange)}${suffix}`;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${positive ? 'text-secondary' : 'text-destructive'}`}>
      <Icon size={14} />{value} আগের সময়ের তুলনায়
    </span>
  );
}

function MetricCard({
  label,
  metric,
  formatter = money,
  icon: Icon,
}: {
  label: string;
  metric: ComparedAnalyticsMetric;
  formatter?: (value: number | null) => string;
  icon: typeof CircleDollarSign;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="rounded-lg bg-secondary/10 p-2 text-secondary"><Icon size={18} /></span>
      </div>
      <div className="break-words text-2xl font-bold">{formatter(metric.value)}</div>
      <div className="mt-2"><Change metric={metric} /></div>
    </div>
  );
}

function OperationalCard({ label, value, detail, icon: Icon }: {
  label: string;
  value: number;
  detail: string;
  icon: typeof Boxes;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-bold">{count(value)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
        </div>
        <Icon className="shrink-0 text-secondary" size={26} />
      </div>
    </div>
  );
}

function ProductTable({ rows, mode }: { rows: AnalyticsProductRow[]; mode: 'sales' | 'profit' }) {
  if (rows.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">এই সময়ে কোনো স্বীকৃত বিক্রয় নেই।</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-sm">
        <thead className="bg-muted/70">
          <tr>
            <th className="p-3 text-left">পণ্য ও ভ্যারিয়েন্ট</th>
            <th className="p-3 text-left">SKU</th>
            <th className="p-3 text-right">নিট পরিমাণ</th>
            <th className="p-3 text-right">পণ্য আয়</th>
            {mode === 'profit' && <><th className="p-3 text-right">FIFO খরচ</th><th className="p-3 text-right">মোট লাভ</th><th className="p-3 text-right">মার্জিন</th></>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.productVariantId} className="border-t">
              <td className="p-3"><strong>{row.productName}</strong><div className="text-xs text-muted-foreground">{row.variantName}</div></td>
              <td className="p-3 font-mono text-xs">{row.sku}</td>
              <td className="p-3 text-right">{count(row.quantity)}</td>
              <td className="p-3 text-right">{money(row.productRevenue)}</td>
              {mode === 'profit' && <><td className="p-3 text-right">{money(row.fifoCost)}</td><td className="p-3 text-right font-semibold">{money(row.grossProfit)}</td><td className="p-3 text-right">{row.grossMargin === null ? '—' : `${banglaNumber.format(row.grossMargin)}%`}</td></>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DashboardContent({ data }: { data: AnalyticsDashboardData }) {
  const primaryMetrics = [
    { label: 'মোট স্বীকৃত বিক্রয়', metric: data.summary.recognizedSales, icon: CircleDollarSign },
    { label: 'পণ্য আয়', metric: data.summary.productRevenue, icon: ShoppingBag },
    { label: 'ডেলিভারি চার্জ', metric: data.summary.deliveryCharges, icon: Truck },
    { label: 'মোট লাভ', metric: data.summary.grossProfit, icon: TrendingUp },
    { label: 'লাভের মার্জিন', metric: data.summary.grossMargin, formatter: (value: number | null) => value === null ? '—' : `${banglaNumber.format(value)}%`, icon: TrendingUp },
    { label: 'সম্পন্ন/ডেলিভারড অর্ডার', metric: data.summary.recognizedOrderCount, formatter: count, icon: ClipboardList },
    { label: 'নিট বিক্রিত ইউনিট', metric: data.summary.unitsSold, formatter: count, icon: PackageCheck },
    { label: 'গড় অর্ডার মূল্য', metric: data.summary.averageOrderValue, icon: CircleDollarSign },
  ];

  return <div className="space-y-6">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {primaryMetrics.map((item) => <MetricCard key={item.label} {...item} />)}
    </div>

    <div className="grid gap-3 sm:grid-cols-3">
      <OperationalCard label="চলমান COD অর্ডার" value={data.summary.pendingCodOrderCount} detail={`পেন্ডিং ${count(data.pendingCod.pending)} · নিশ্চিত ${count(data.pendingCod.confirmed)} · প্রসেসিং ${count(data.pendingCod.processing)}`} icon={Truck} />
      <OperationalCard label="কম স্টকের ভ্যারিয়েন্ট" value={data.summary.lowStockVariantCount} detail="উপলভ্য স্টক সতর্কতা সীমার মধ্যে" icon={AlertTriangle} />
      <OperationalCard label="স্টক শেষ ভ্যারিয়েন্ট" value={data.summary.outOfStockVariantCount} detail="উপলভ্য স্টক শূন্য" icon={Boxes} />
    </div>

    <section className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="mb-4"><h2 className="text-lg font-bold">দৈনিক বিক্রয় ও মোট লাভ</h2><p className="text-sm text-muted-foreground">ফেরত অর্ডার ফেরতের তারিখে ঋণাত্মক হিসেবে দেখানো হয়েছে।</p></div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.trend} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
            <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={28} />
            <YAxis width={55} tickFormatter={(value: number) => compactNumber.format(value)} />
            <Tooltip labelFormatter={(label) => dateLabel(String(label))} formatter={(value: number, name: string) => [money(Number(value)), name === 'recognizedSales' ? 'বিক্রয়' : 'মোট লাভ']} />
            <Legend formatter={(value) => value === 'recognizedSales' ? 'বিক্রয়' : 'মোট লাভ'} />
            <Line type="monotone" dataKey="recognizedSales" stroke="hsl(var(--secondary))" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="grossProfit" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>

    <section className="rounded-xl border bg-card p-4 sm:p-5">
      <h2 className="mb-4 text-lg font-bold">উৎস অনুযায়ী বিক্রয়</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.salesBySource.map((source) => <div key={source.source} className="rounded-lg border bg-background/40 p-3"><div className="font-semibold">{sourceLabels[source.source]}</div><div className="mt-2 text-xl font-bold">{money(source.recognizedSales)}</div><div className="text-xs text-muted-foreground">{count(source.orderCount)}টি স্বীকৃত অর্ডার</div></div>)}
      </div>
    </section>

    <div className="grid gap-6 2xl:grid-cols-2">
      <section className="overflow-hidden rounded-xl border bg-card"><div className="p-4 sm:p-5"><h2 className="text-lg font-bold">সবচেয়ে বেশি বিক্রি</h2><p className="text-sm text-muted-foreground">ফেরতের পর নিট পরিমাণ অনুসারে</p></div><ProductTable rows={data.bestSelling} mode="sales" /></section>
      <section className="overflow-hidden rounded-xl border bg-card"><div className="p-4 sm:p-5"><h2 className="text-lg font-bold">সবচেয়ে লাভজনক</h2><p className="text-sm text-muted-foreground">সংরক্ষিত FIFO খরচ অনুসারে</p></div><ProductTable rows={data.mostProfitable} mode="profit" /></section>
    </div>

    <section className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="mb-4"><h2 className="text-lg font-bold">ইনভেন্টরি সারাংশ</h2><p className="text-sm text-muted-foreground">উপলভ্য ও সংরক্ষিত ব্যাচ মিলিয়ে বর্তমান FIFO মূল্য</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-muted/60 p-3"><span className="text-sm text-muted-foreground">উপলভ্য ইউনিট</span><div className="text-xl font-bold">{count(data.inventory.availableUnits)}</div></div>
        <div className="rounded-lg bg-muted/60 p-3"><span className="text-sm text-muted-foreground">সংরক্ষিত ইউনিট</span><div className="text-xl font-bold">{count(data.inventory.reservedUnits)}</div></div>
        <div className="rounded-lg bg-muted/60 p-3"><span className="text-sm text-muted-foreground">মোট হাতে আছে</span><div className="text-xl font-bold">{count(data.inventory.onHandUnits)}</div></div>
        <div className="rounded-lg bg-muted/60 p-3"><span className="text-sm text-muted-foreground">FIFO ইনভেন্টরি মূল্য</span><div className="text-xl font-bold">{money(data.inventory.fifoValuation)}</div></div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <StockAlertList title="কম স্টক" rows={data.inventory.lowStock} empty="কোনো কম-স্টক ভ্যারিয়েন্ট নেই।" />
        <StockAlertList title="স্টক শেষ" rows={data.inventory.outOfStock} empty="কোনো স্টক-শেষ ভ্যারিয়েন্ট নেই।" />
      </div>
    </section>
  </div>;
}

function StockAlertList({ title, rows, empty }: { title: string; rows: AnalyticsDashboardData['inventory']['lowStock']; empty: string }) {
  return <div className="rounded-lg border"><h3 className="border-b px-3 py-2 font-semibold">{title}</h3>{rows.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{empty}</p> : <div className="divide-y">{rows.slice(0, 10).map((row) => <div key={row.productVariantId} className="flex items-center justify-between gap-3 p-3 text-sm"><div className="min-w-0"><strong className="block truncate">{row.productName} · {row.variantName}</strong><span className="text-xs text-muted-foreground">{row.sku} · সীমা {count(row.lowStockThreshold)}</span></div><span className="shrink-0 font-bold">{count(row.availableStock)}</span></div>)}</div>}</div>;
}

export default function AnalyticsDashboard() {
  const today = new Date(Date.now() + 6 * 60 * 60 * 1_000).toISOString().slice(0, 10);
  const [preset, setPreset] = useState<AnalyticsPreset>('month');
  const [draftRange, setDraftRange] = useState({ from: today, to: today });
  const [customRange, setCustomRange] = useState(draftRange);
  const queryInput = useMemo(() => preset === 'custom'
    ? { preset, ...customRange }
    : { preset }, [customRange, preset]);
  const query = useQuery({
    queryKey: ['analytics-dashboard', queryInput],
    queryFn: () => getAnalyticsDashboard(queryInput),
    staleTime: 60_000,
  });

  return <div>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold">ব্যবসার ড্যাশবোর্ড</h1><p className="text-sm text-muted-foreground">বিক্রয়, FIFO লাভ এবং বর্তমান ইনভেন্টরি</p></div>
      <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw size={16} className={`mr-2 ${query.isFetching ? 'animate-spin' : ''}`} />হালনাগাদ</Button>
    </div>

    <div className="mb-5 rounded-xl border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap gap-2">{presets.map((item) => <Button key={item.value} type="button" size="sm" variant={preset === item.value ? 'default' : 'outline'} onClick={() => setPreset(item.value)}>{item.label}</Button>)}</div>
      {preset === 'custom' && <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"><label className="text-sm">তারিখ থেকে<Input type="date" value={draftRange.from} onChange={(event) => setDraftRange((current) => ({ ...current, from: event.target.value }))} /></label><label className="text-sm">তারিখ পর্যন্ত<Input type="date" value={draftRange.to} onChange={(event) => setDraftRange((current) => ({ ...current, to: event.target.value }))} /></label><Button type="button" disabled={!draftRange.from || !draftRange.to || draftRange.from > draftRange.to} onClick={() => setCustomRange(draftRange)}>প্রয়োগ করুন</Button></div>}
      {query.data && <p className="mt-3 text-xs text-muted-foreground">বর্তমান: {dateLabel(query.data.range.current.from)} – {dateLabel(query.data.range.current.to)} · তুলনা: {dateLabel(query.data.range.previous.from)} – {dateLabel(query.data.range.previous.to)} · ঢাকা সময়</p>}
    </div>

    {query.isLoading && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-xl border bg-muted/50" />)}</div>}
    {query.isError && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center"><AlertTriangle className="mx-auto mb-2 text-destructive" /><h2 className="font-bold">ড্যাশবোর্ড লোড করা যায়নি</h2><p className="mt-1 text-sm text-muted-foreground">{query.error instanceof Error ? query.error.message : 'আবার চেষ্টা করুন।'}</p><Button className="mt-4" onClick={() => void query.refetch()}>আবার চেষ্টা করুন</Button></div>}
    {query.data && <DashboardContent data={query.data} />}
  </div>;
}
