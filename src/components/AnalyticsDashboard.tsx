import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  CircleDollarSign,
  ClipboardList,
  HandCoins,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Truck,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getAnalyticsDashboard, getCreditSummary } from '@/lib/api';
import type {
  AnalyticsDashboardData,
  AnalyticsPreset,
  AnalyticsProductRow,
  ComparedAnalyticsMetric,
  CreditSummary,
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import { FormattedDateInput } from '@/components/ui/formatted-date-input';
import { formatAppDate } from '@/lib/date';
import { productPackLabel } from '@/lib/productOptions';
import { formatMajorQuantity } from '@/lib/quantity';

type QuickPreset = Exclude<AnalyticsPreset, 'custom'>;
type ChartMetric = 'SALES' | 'PROFIT';

interface DashboardPreferences {
  preset: AnalyticsPreset;
  from?: string;
  to?: string;
  chartMetric: ChartMetric;
}

const presets: Array<{ value: QuickPreset; label: string }> = [
  { value: 'today', label: 'আজ' },
  { value: 'yesterday', label: 'গতকাল' },
  { value: 'week', label: 'এই সপ্তাহ' },
  { value: 'month', label: 'এই মাস' },
  { value: 'year', label: 'এই বছর' },
];

const numberFormatter = new Intl.NumberFormat('en-BD', { maximumFractionDigits: 2 });
const axisNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const graphMonthFormatter = new Intl.DateTimeFormat('bn-BD-u-ca-gregory-nu-latn', {
  month: 'long', year: 'numeric',
});
const CUSTOM_RANGE_MAX_DAYS = 366;
const DAY_MS = 86_400_000;
const DASHBOARD_PREFERENCES_KEY = 'nafah_dashboard_preferences_v1';

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function presetRange(preset: QuickPreset, today: string) {
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'yesterday') {
    const yesterday = addDays(today, -1);
    return { from: yesterday, to: yesterday };
  }
  if (preset === 'week') {
    const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
    const from = addDays(today, -weekday);
    return { from, to: today };
  }
  if (preset === 'month') {
    return {
      from: `${today.slice(0, 7)}-01`,
      to: today,
    };
  }
  const year = today.slice(0, 4);
  return { from: `${year}-01-01`, to: today };
}

function money(value: number | null) {
  return value === null ? 'প্রযোজ্য নয়' : `৳${numberFormatter.format(value)}`;
}

function count(value: number | null) {
  return value === null ? 'প্রযোজ্য নয়' : numberFormatter.format(value);
}

function dateLabel(value: string) {
  return formatAppDate(value);
}

function shortDate(value: string) {
  return formatAppDate(value);
}

function monthLabel(value: string) {
  return graphMonthFormatter.format(new Date(`${value}T12:00:00.000Z`));
}

function rangeLabel(from: string, to: string) {
  return from === to ? dateLabel(from) : `${dateLabel(from)} থেকে ${dateLabel(to)}`;
}

function comparisonScaleNotice(metric: ComparedAnalyticsMetric, label: string) {
  if (metric.value === null || metric.previousValue === null) return null;
  const current = Math.abs(metric.value);
  const previous = Math.abs(metric.previousValue);
  const larger = Math.max(current, previous);
  const smaller = Math.min(current, previous);
  if (larger === 0 || smaller / larger > 0.1) return null;
  const smallerPeriod = current <= previous ? 'এই সময়ের' : 'আগের সময়ের';
  return `দুই সময় একই স্কেলে দেখানো হচ্ছে। ${smallerPeriod} ${label} অনেক কম, তাই সেই লাইনটি নিচের দিকে দেখা যাচ্ছে।`;
}

interface ComparisonChartPoint {
  currentFrom: string;
  currentTo: string;
  previousFrom: string | null;
  previousTo: string | null;
  currentValue: number;
  previousValue: number | null;
}

export function ComparisonTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ComparisonChartPoint }>;
}) {
  if (!active || !payload?.[0]) return null;
  const point = payload[0].payload;
  return (
    <div className="max-w-64 rounded-lg border bg-card p-3 text-sm shadow-lg">
      <div className="font-semibold text-primary">এই সময়</div>
      <div className="text-xs text-muted-foreground">{rangeLabel(point.currentFrom, point.currentTo)}</div>
      <div className="mt-1 font-bold">{money(point.currentValue)}</div>
      {point.previousFrom && point.previousTo && point.previousValue !== null && <>
        <div className="mt-3 font-semibold text-muted-foreground">আগের সময়</div>
        <div className="text-xs text-muted-foreground">{rangeLabel(point.previousFrom, point.previousTo)}</div>
        <div className="mt-1 font-bold">{money(point.previousValue)}</div>
      </>}
    </div>
  );
}

function customRangeError(range: { from: string; to: string }) {
  if (!range.from || !range.to) return 'শুরু এবং শেষের তারিখ নির্বাচন করুন।';
  if (range.from > range.to) return 'শেষের তারিখ শুরুর তারিখের আগে হতে পারবে না।';
  const days = Math.floor(
    (Date.parse(`${range.to}T00:00:00.000Z`) - Date.parse(`${range.from}T00:00:00.000Z`))
      / DAY_MS,
  ) + 1;
  return days > CUSTOM_RANGE_MAX_DAYS ? 'নিজস্ব সময়সীমা সর্বোচ্চ 366 দিন হতে পারে।' : '';
}

function readDashboardPreferences(today: string): DashboardPreferences {
  const fallback: DashboardPreferences = { preset: 'month', chartMetric: 'SALES' };
  if (typeof window === 'undefined') return fallback;
  try {
    const value = JSON.parse(window.localStorage.getItem(DASHBOARD_PREFERENCES_KEY) ?? '{}') as Record<string, unknown>;
    const chartMetric: ChartMetric = value.chartMetric === 'PROFIT' ? 'PROFIT' : 'SALES';
    if (value.preset === 'custom' && typeof value.from === 'string' && typeof value.to === 'string') {
      const range = { from: value.from, to: value.to };
      if (!customRangeError(range)) return { preset: 'custom', ...range, chartMetric };
    }
    if (presets.some((preset) => preset.value === value.preset)) {
      return { preset: value.preset as QuickPreset, chartMetric };
    }
    return { ...fallback, chartMetric };
  } catch {
    return fallback;
  }
}

function saveDashboardPreferences(update: Partial<DashboardPreferences>) {
  if (typeof window === 'undefined') return;
  try {
    const current = JSON.parse(window.localStorage.getItem(DASHBOARD_PREFERENCES_KEY) ?? '{}') as Record<string, unknown>;
    window.localStorage.setItem(DASHBOARD_PREFERENCES_KEY, JSON.stringify({ ...current, ...update }));
  } catch {
    // Browser privacy settings may make local storage unavailable.
  }
}

function Change({ metric, suffix = '%' }: { metric: ComparedAnalyticsMetric; suffix?: string }) {
  if (metric.absoluteChange === null) return <span className="text-xs text-muted-foreground">আগের সময়ের তথ্য নেই</span>;
  const positive = metric.absoluteChange >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  const value = metric.percentChange === null
    ? `${positive ? '+' : ''}${numberFormatter.format(metric.absoluteChange)}`
    : `${positive ? '+' : ''}${numberFormatter.format(metric.percentChange)}${suffix}`;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${positive ? 'text-secondary' : 'text-destructive'}`}>
      <Icon size={14} />{value} আগের সময়ের তুলনায়
    </span>
  );
}

function MetricCard({
  label,
  detail,
  metric,
  formatter = money,
  icon: Icon,
}: {
  label: string;
  detail: string;
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
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      <div className="mt-2"><Change metric={metric} /></div>
    </div>
  );
}

function OperationalCard({ label, value, detail, icon: Icon, to }: {
  label: string;
  value: number;
  detail: string;
  icon: typeof Boxes;
  to: string;
}) {
  return (
    <Link
      to={to}
      aria-label={`${label} বিস্তারিত দেখুন`}
      className="group rounded-xl border bg-card p-4 transition-all hover:border-secondary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-bold">{count(value)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
          <div className="mt-2 text-xs font-semibold text-secondary group-hover:underline">বিস্তারিত দেখুন</div>
        </div>
        <Icon className="shrink-0 text-secondary" size={26} />
      </div>
    </Link>
  );
}

function ProductTable({ rows, mode }: { rows: AnalyticsProductRow[]; mode: 'sales' | 'profit' }) {
  if (rows.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">এই সময়ে কোনো সম্পন্ন বিক্রি নেই।</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] text-sm">
        <thead className="bg-muted/70">
          <tr>
            <th className="p-3 text-left">পণ্য ও প্যাক/সাইজ</th>
            <th className="p-3 text-right">নিট পরিমাণ</th>
            <th className="p-3 text-right">পণ্য আয়</th>
            {mode === 'profit' && <><th className="p-3 text-right">বিক্রি হওয়া পণ্যের ক্রয়মূল্য</th><th className="p-3 text-right">মোট লাভ</th><th className="p-3 text-right">মার্জিন</th></>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.productVariantId} className="border-t">
              <td className="p-3"><strong>{productPackLabel(row.productName, row.variantName)}</strong></td>
              <td className="p-3 text-right">{formatMajorQuantity(row.quantity, row.quantityUnit)}</td>
              <td className="p-3 text-right">{money(row.productRevenue)}</td>
              {mode === 'profit' && <><td className="p-3 text-right">{money(row.fifoCost)}</td><td className="p-3 text-right font-semibold">{money(row.grossProfit)}</td><td className="p-3 text-right">{row.grossMargin === null ? 'প্রযোজ্য নয়' : `${numberFormatter.format(row.grossMargin)}%`}</td></>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DashboardContent({ data, chartMetric, onChartMetricChange }: {
  data: AnalyticsDashboardData;
  chartMetric: ChartMetric;
  onChartMetricChange: (metric: ChartMetric) => void;
}) {
  const showTrend = data.range.current.from !== data.range.current.to;
  const selectedMetric = chartMetric === 'SALES' ? data.summary.recognizedSales : data.summary.grossProfit;
  const selectedMetricLabel = chartMetric === 'SALES' ? 'বিক্রি' : 'লাভ';
  const scaleNotice = comparisonScaleNotice(selectedMetric, selectedMetricLabel);
  const chartData: ComparisonChartPoint[] = data.trend.map((point) => ({
    currentFrom: point.current.from,
    currentTo: point.current.to,
    previousFrom: point.previous?.from ?? null,
    previousTo: point.previous?.to ?? null,
    currentValue: chartMetric === 'SALES' ? point.current.recognizedSales : point.current.grossProfit,
    previousValue: point.previous
      ? chartMetric === 'SALES' ? point.previous.recognizedSales : point.previous.grossProfit
      : null,
  }));
  const sourceCards = [
    { label: 'ওয়েবসাইট', sources: ['WEBSITE'] },
    { label: 'দোকান', sources: ['PHYSICAL_SHOP'] },
    { label: 'অন্যান্য', sources: ['FACEBOOK', 'PHONE', 'WHATSAPP', 'OTHER'] },
  ].map(({ label, sources }) => data.salesBySource.reduce(
    (summary, source) => sources.includes(source.source)
      ? {
          ...summary,
          orderCount: summary.orderCount + source.orderCount,
          recognizedSales: summary.recognizedSales + source.recognizedSales,
        }
      : summary,
    { label, orderCount: 0, recognizedSales: 0 },
  ));
  const primaryMetrics = [
    { label: 'পণ্য আয়', detail: 'ডিসকাউন্ট বাদ দিয়ে পণ্য বিক্রি থেকে মোট আয়।', metric: data.summary.productRevenue, icon: ShoppingBag },
    { label: 'নগদে বিক্রি', detail: 'সঙ্গে সঙ্গে বা ডেলিভারির সময় টাকা পাওয়া পণ্য বিক্রি।', metric: data.summary.cashProductRevenue, icon: CircleDollarSign },
    { label: 'বাকিতে বিক্রি', detail: 'এই সময়ে বাকিতে দেওয়া পণ্যের মোট দাম।', metric: data.summary.creditProductRevenue, icon: HandCoins },
    { label: 'মোট লাভ', detail: 'পণ্য আয় থেকে বিক্রি হওয়া পণ্যের ক্রয়মূল্য বাদ দেওয়ার পর।', metric: data.summary.grossProfit, icon: TrendingUp },
    { label: 'লাভের মার্জিন', detail: 'প্রতি 100 টাকার পণ্য আয়ে কত টাকা লাভ হয়েছে।', metric: data.summary.grossMargin, formatter: (value: number | null) => value === null ? 'প্রযোজ্য নয়' : `${numberFormatter.format(value)}%`, icon: TrendingUp },
    { label: 'ডেলিভারড অর্ডার', detail: 'দোকানের সম্পন্ন বিক্রি ও গ্রাহকের কাছে পৌঁছানো অর্ডারের সংখ্যা।', metric: data.summary.recognizedOrderCount, formatter: count, icon: ClipboardList },
    { label: 'ডেলিভারি চার্জ', detail: 'ডেলিভারড অর্ডার থেকে নেওয়া মোট ডেলিভারি চার্জ।', metric: data.summary.deliveryCharges, icon: Truck },
  ];

  return <div className="space-y-6">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {primaryMetrics.map((item) => <MetricCard key={item.label} {...item} />)}
    </div>

    {showTrend ? <section className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">{data.trendGranularity === 'DAY' ? 'প্রতিদিনের' : 'মাস অনুযায়ী'} {selectedMetricLabel} তুলনা</h2>
          <p className="text-sm text-muted-foreground">ফেরত দেওয়া অর্ডারের টাকা ফেরতের তারিখে বিয়োগ হিসেবে দেখানো হয়েছে।</p>
        </div>
        <div className="flex w-fit rounded-lg border bg-muted/30 p-1" aria-label="গ্রাফে যা দেখানো হবে">
          <Button type="button" size="sm" variant={chartMetric === 'SALES' ? 'default' : 'ghost'} aria-pressed={chartMetric === 'SALES'} onClick={() => onChartMetricChange('SALES')}>বিক্রি</Button>
          <Button type="button" size="sm" variant={chartMetric === 'PROFIT' ? 'default' : 'ghost'} aria-pressed={chartMetric === 'PROFIT'} onClick={() => onChartMetricChange('PROFIT')}>লাভ</Button>
        </div>
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-background/50 p-3"><div className="text-xs text-muted-foreground">এই সময়</div><div className="mt-1 text-xl font-bold">{money(selectedMetric.value)}</div><div className="mt-1"><Change metric={selectedMetric} /></div><div className="mt-1 text-xs text-muted-foreground">{rangeLabel(data.range.current.from, data.range.current.to)}</div></div>
        <div className="rounded-lg border bg-background/50 p-3"><div className="text-xs text-muted-foreground">আগের সময়</div><div className="mt-1 text-xl font-bold">{money(selectedMetric.previousValue)}</div><div className="mt-1 text-xs text-muted-foreground">{rangeLabel(data.range.previous.from, data.range.previous.to)}</div></div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <span className="inline-flex items-center gap-2 font-medium"><span className="h-0.5 w-8 bg-emerald-700" aria-hidden="true" />এই সময়</span>
        <span className="inline-flex items-center gap-2 text-slate-600"><span className="w-8 border-t-2 border-dashed border-slate-500" aria-hidden="true" />আগের সময়</span>
      </div>
      {scaleNotice && <p className="mb-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{scaleNotice}</p>}
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
            <XAxis dataKey="currentFrom" tickFormatter={data.trendGranularity === 'DAY' ? shortDate : monthLabel} minTickGap={28} />
            <YAxis width={68} tickFormatter={(value: number) => axisNumber.format(value)} />
            <Tooltip content={<ComparisonTooltip />} />
            <Line type="monotone" dataKey="currentValue" name="currentValue" stroke="#047857" strokeWidth={3} dot={chartData.length <= 31 ? { r: 3, strokeWidth: 1 } : false} />
            <Line type="monotone" dataKey="previousValue" name="previousValue" stroke="#64748b" strokeDasharray="7 5" strokeWidth={2.25} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section> : <p className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">এক দিনের জন্য ট্রেন্ড গ্রাফ দেখানো হয় না।</p>}

    <section className="rounded-xl border bg-card p-4 sm:p-5">
      <h2 className="mb-4 text-lg font-bold">উৎস অনুযায়ী বিক্রয়</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sourceCards.map((source) => <div key={source.label} className="rounded-lg border bg-background/40 p-3"><div className="font-semibold">{source.label}</div><div className="mt-2 text-xl font-bold">{money(source.recognizedSales)}</div><div className="text-xs text-muted-foreground">{count(source.orderCount)}টি সম্পন্ন অর্ডার</div></div>)}
      </div>
    </section>

    <div className="grid gap-6 2xl:grid-cols-2">
      <section className="overflow-hidden rounded-xl border bg-card"><div className="p-4 sm:p-5"><h2 className="text-lg font-bold">সবচেয়ে বেশি বিক্রি</h2><p className="text-sm text-muted-foreground">ফেরতের পর পণ্য আয় অনুসারে</p></div><ProductTable rows={data.bestSelling} mode="sales" /></section>
      <section className="overflow-hidden rounded-xl border bg-card"><div className="p-4 sm:p-5"><h2 className="text-lg font-bold">সবচেয়ে লাভজনক</h2><p className="text-sm text-muted-foreground">বিক্রি হওয়া পণ্যের ক্রয়মূল্য ধরে</p></div><ProductTable rows={data.mostProfitable} mode="profit" /></section>
    </div>

  </div>;
}

function CurrentStatusCards({ data, creditSummary }: {
  data: AnalyticsDashboardData;
  creditSummary?: CreditSummary;
}) {
  return <section className="mb-5 rounded-xl border bg-muted/20 p-3 sm:p-4">
    <div className="mb-3">
      <h2 className="text-lg font-bold">এখনকার অবস্থা</h2>
      <p className="text-sm text-muted-foreground">এগুলো সব সময় বর্তমান অবস্থা দেখায়।</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <OperationalCard label="চলমান COD অর্ডার" value={data.summary.pendingCodOrderCount} detail={`পেন্ডিং ${count(data.pendingCod.pending)} · কনফার্মড ${count(data.pendingCod.confirmed)} · প্রসেসিং ${count(data.pendingCod.processing)}`} icon={Truck} to="/admin/orders" />
      <OperationalCard label="কম স্টক" value={data.summary.lowStockVariantCount} detail="কম স্টকের লিমিটে পৌঁছানো অ্যাকটিভ আইটেম।" icon={AlertTriangle} to="/admin/inventory" />
      <OperationalCard label="স্টক নেই" value={data.summary.outOfStockVariantCount} detail="বিক্রির জন্য কোনো স্টক নেই এমন অ্যাকটিভ আইটেম।" icon={Boxes} to="/admin/inventory" />
      <Link to="/admin/dues" aria-label="বাকি হিসাব বিস্তারিত দেখুন" className="group rounded-xl border bg-card p-4 transition-all hover:border-secondary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><div className="flex items-center justify-between gap-3"><div><div className="text-sm text-muted-foreground">বাকি হিসাব</div><div className="mt-1 text-2xl font-bold">{creditSummary ? money(creditSummary.totalOutstanding) : '...'}</div><div className="mt-1 text-xs text-muted-foreground">সময় পার হয়েছে {creditSummary?.overdueCount ?? 0}টি · আজ {creditSummary?.dueTodayCount ?? 0}টি</div><div className="mt-2 text-xs font-semibold text-secondary group-hover:underline">বিস্তারিত দেখুন</div></div><HandCoins size={26} className="shrink-0 text-secondary" /></div></Link>
    </div>
  </section>;
}

function AnalyticsDashboardContent() {
  const today = new Date(Date.now() + 6 * 60 * 60 * 1_000).toISOString().slice(0, 10);
  const [initialPreferences] = useState(() => readDashboardPreferences(today));
  const [activePreset, setActivePreset] = useState<QuickPreset | null>(
    initialPreferences.preset === 'custom' ? null : initialPreferences.preset,
  );
  const [draftRange, setDraftRange] = useState(() => initialPreferences.preset === 'custom'
    ? { from: initialPreferences.from!, to: initialPreferences.to! }
    : presetRange(initialPreferences.preset, today));
  const [queryInput, setQueryInput] = useState<{
    preset: AnalyticsPreset;
    from?: string;
    to?: string;
  }>(() => initialPreferences.preset === 'custom'
    ? { preset: 'custom', from: initialPreferences.from, to: initialPreferences.to }
    : { preset: initialPreferences.preset });
  const [chartMetric, setChartMetric] = useState<ChartMetric>(initialPreferences.chartMetric);
  const rangeError = customRangeError(draftRange);
  const query = useQuery({
    queryKey: ['analytics-dashboard', queryInput],
    queryFn: () => getAnalyticsDashboard(queryInput),
    staleTime: 60_000,
  });
  const creditQuery = useQuery({
    queryKey: ['credit-summary'],
    queryFn: getCreditSummary,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (query.data && activePreset !== null) setDraftRange(query.data.range.current);
  }, [activePreset, query.data]);

  function selectPreset(preset: QuickPreset) {
    setActivePreset(preset);
    setDraftRange(presetRange(preset, today));
    setQueryInput({ preset });
    saveDashboardPreferences({ preset, from: undefined, to: undefined });
  }

  function editRange(field: 'from' | 'to', value: string) {
    setActivePreset(null);
    setDraftRange((current) => ({ ...current, [field]: value }));
  }

  function applyRange() {
    if (rangeError) return;
    setActivePreset(null);
    setQueryInput({ preset: 'custom', ...draftRange });
    saveDashboardPreferences({ preset: 'custom', ...draftRange });
  }

  function selectChartMetric(metric: ChartMetric) {
    setChartMetric(metric);
    saveDashboardPreferences({ chartMetric: metric });
  }

  return <div>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold">ড্যাশবোর্ড</h1><p className="text-sm text-muted-foreground">বিক্রি, লাভ এবং বর্তমান ইনভেন্টরি</p></div>
      <Button variant="outline" onClick={() => { void query.refetch(); void creditQuery.refetch(); }} disabled={query.isFetching || creditQuery.isFetching}><RefreshCw size={16} className={`mr-2 ${query.isFetching || creditQuery.isFetching ? 'animate-spin' : ''}`} />রিফ্রেশ</Button>
    </div>

    {query.data && <CurrentStatusCards data={query.data} creditSummary={creditQuery.data} />}

    <div className="mb-5 rounded-xl border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap gap-2">{presets.map((item) => <Button key={item.value} type="button" size="sm" variant={activePreset === item.value ? 'default' : 'outline'} onClick={() => selectPreset(item.value)}>{item.label}</Button>)}</div>
      <div className="mt-3"><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"><label className="text-sm">তারিখ থেকে<FormattedDateInput aria-label="তারিখ থেকে" value={draftRange.from} onChange={(event) => editRange('from', event.target.value)} /></label><label className="text-sm">তারিখ পর্যন্ত<FormattedDateInput aria-label="তারিখ পর্যন্ত" value={draftRange.to} onChange={(event) => editRange('to', event.target.value)} /></label><Button type="button" disabled={Boolean(rangeError)} onClick={applyRange}>প্রয়োগ করুন</Button></div>{rangeError && <p role="alert" className="mt-2 text-xs text-destructive">{rangeError}</p>}</div>
      {query.data && <p className="mt-3 text-xs text-muted-foreground">তুলনা: {dateLabel(query.data.range.previous.from)} থেকে {dateLabel(query.data.range.previous.to)} · ঢাকা সময়</p>}
    </div>

    {query.isLoading && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-xl border bg-muted/50" />)}</div>}
    {query.isError && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center"><AlertTriangle className="mx-auto mb-2 text-destructive" /><h2 className="font-bold">ড্যাশবোর্ড লোড করা যায়নি</h2><p className="mt-1 text-sm text-muted-foreground">{query.error instanceof Error ? query.error.message : 'আবার চেষ্টা করুন।'}</p><Button className="mt-4" onClick={() => void query.refetch()}>আবার চেষ্টা করুন</Button></div>}
    {query.data && <DashboardContent data={query.data} chartMetric={chartMetric} onChartMetricChange={selectChartMetric} />}
  </div>;
}

const analyticsQueryClient = new QueryClient();

export default function AnalyticsDashboard() {
  return <QueryClientProvider client={analyticsQueryClient}>
    <AnalyticsDashboardContent />
  </QueryClientProvider>;
}
