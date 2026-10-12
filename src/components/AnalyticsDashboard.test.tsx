import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyticsDashboardData } from '@/lib/types';
import AnalyticsDashboard, { ComparisonTooltip } from './AnalyticsDashboard';

const mocks = vi.hoisted(() => ({
  getAnalyticsDashboard: vi.fn(),
  getCreditSummary: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  getAnalyticsDashboard: mocks.getAnalyticsDashboard,
  getCreditSummary: mocks.getCreditSummary,
}));
vi.mock('recharts', () => ({
  CartesianGrid: () => null,
  Legend: () => null,
  Line: ({ dataKey, strokeDasharray }: { dataKey: string; strokeDasharray?: string }) => (
    <div data-testid={`line-${dataKey}`} data-dashed={strokeDasharray ?? ''} />
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: ({ tickFormatter }: { tickFormatter: (value: string) => string }) => (
    <div data-testid="graph-date">{tickFormatter('2026-08-07')}</div>
  ),
  YAxis: ({ tickFormatter }: { tickFormatter: (value: number) => string }) => (
    <div data-testid="graph-amount">{tickFormatter(1000)}</div>
  ),
}));

const metric = {
  value: 0,
  previousValue: 0,
  absoluteChange: 0,
  percentChange: 0,
};

const salesMetric = {
  value: 14,
  previousValue: 3030,
  absoluteChange: -3016,
  percentChange: -99.54,
};

const profitMetric = {
  value: 250,
  previousValue: 200,
  absoluteChange: 50,
  percentChange: 25,
};

const dashboard: AnalyticsDashboardData = {
  generatedAt: '2026-08-07T12:00:00.000Z',
  paymentChannels: [
    { method: 'CASH', received: 100, refunded: 10, net: 90 },
    { method: 'BKASH', received: 50, refunded: 0, net: 50 },
  ],
  currency: 'BDT',
  timezone: 'Asia/Dhaka',
  week: { startsOn: 'SUNDAY', endsOn: 'SATURDAY' },
  range: {
    preset: 'month',
    current: { from: '2026-08-01', to: '2026-08-07' },
    previous: { from: '2026-07-01', to: '2026-07-07' },
  },
  summary: {
    recognizedSales: salesMetric,
    productRevenue: metric,
    cashProductRevenue: metric,
    creditProductRevenue: metric,
    deliveryCharges: metric,
    grossProfit: profitMetric,
    grossMargin: metric,
    recognizedOrderCount: metric,
    soldQuantities: { pieces: metric, weightKg: metric, volumeLitres: metric },
    averageOrderValue: metric,
    pendingCodOrderCount: 0,
    lowStockVariantCount: 0,
    outOfStockVariantCount: 0,
  },
  trendGranularity: 'DAY',
  trend: [{
    current: { from: '2026-08-07', to: '2026-08-07', recognizedSales: 14, grossProfit: 250 },
    previous: { from: '2026-07-07', to: '2026-07-07', recognizedSales: 3030, grossProfit: 200 },
  }],
  salesBySource: [
    { source: 'WEBSITE', orderCount: 1, recognizedSales: 100 },
    { source: 'PHYSICAL_SHOP', orderCount: 2, recognizedSales: 200 },
    { source: 'FACEBOOK', orderCount: 3, recognizedSales: 300 },
    { source: 'PHONE', orderCount: 4, recognizedSales: 400 },
    { source: 'WHATSAPP', orderCount: 5, recognizedSales: 500 },
    { source: 'OTHER', orderCount: 6, recognizedSales: 600 },
  ],
  bestSelling: [],
  mostProfitable: [],
  inventory: {
    availableQuantities: { pieces: 0, weightKg: 0, volumeLitres: 0 },
    reservedQuantities: { pieces: 0, weightKg: 0, volumeLitres: 0 },
    onHandQuantities: { pieces: 0, weightKg: 0, volumeLitres: 0 },
    fifoValuation: 0,
    lowStock: [],
    outOfStock: [],
  },
  pendingCod: { total: 0, pending: 0, confirmed: 0, processing: 0 },
};

describe('analytics dashboard date controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.getCreditSummary.mockResolvedValue({
      totalOutstanding: 0,
      openSaleCount: 0,
      customerCount: 0,
      overdueCount: 0,
      dueTodayCount: 0,
      upcomingCount: 0,
    });
    mocks.getAnalyticsDashboard.mockImplementation(async (input: {
      preset: string;
      from?: string;
      to?: string;
    }) => {
      if (input.preset === 'today') {
        return {
          ...dashboard,
          range: {
            preset: 'today' as const,
            current: { from: '2026-08-07', to: '2026-08-07' },
            previous: { from: '2026-08-06', to: '2026-08-06' },
          },
        };
      }
      if (input.preset === 'year') {
        return {
          ...dashboard,
          range: {
            preset: 'year' as const,
            current: { from: '2026-01-01', to: '2026-08-07' },
            previous: { from: '2025-01-01', to: '2025-08-07' },
          },
        };
      }
      if (input.preset === 'custom' && input.from && input.to) {
        return {
          ...dashboard,
          range: {
            preset: 'custom' as const,
            current: { from: input.from, to: input.to },
            previous: { from: '2026-02-02', to: '2026-03-09' },
          },
        };
      }
      return dashboard;
    });
  });

  it('keeps editable dates visible, syncs presets, and validates manual ranges', async () => {
    render(<MemoryRouter><AnalyticsDashboard /></MemoryRouter>);

    await waitFor(() => expect(screen.getByLabelText('তারিখ থেকে')).toHaveValue('2026-08-01'));
    const currentStatusHeading = screen.getByRole('heading', { name: 'এখনকার স্ট্যাটাস' });
    expect(screen.getByText('তারিখের ফিল্টার এই কার্ডগুলোতে কাজ করে না।')).toBeInTheDocument();
    expect(currentStatusHeading.compareDocumentPosition(screen.getByLabelText('তারিখ থেকে')) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(screen.getByLabelText('তারিখ পর্যন্ত')).toHaveValue('2026-08-07');
    expect(screen.queryByRole('button', { name: 'নিজস্ব সময়সীমা' })).not.toBeInTheDocument();
    expect(screen.getByTestId('graph-date')).toHaveTextContent('07/08/2026');
    expect(screen.getByTestId('graph-amount')).toHaveTextContent('1,000');
    expect(screen.getByRole('button', { name: 'বিক্রি' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('প্রতিদিনের বিক্রি তুলনা')).toBeInTheDocument();
    expect(screen.getByTestId('line-currentValue')).toHaveAttribute('data-dashed', '');
    expect(screen.getByTestId('line-previousValue')).toHaveAttribute('data-dashed', '7 5');
    expect(screen.getAllByText('এই সময়').length).toBeGreaterThan(1);
    expect(screen.getAllByText('আগের সময়').length).toBeGreaterThan(1);
    expect(screen.getByText(/এই সময়ের বিক্রি অনেক কম/)).toBeInTheDocument();
    expect(screen.queryByText('বিক্রি হওয়া প্যাক/ইউনিট')).not.toBeInTheDocument();
    expect(screen.queryByText('বিক্রি হওয়া ওজন')).not.toBeInTheDocument();
    expect(screen.queryByText('বিক্রি হওয়া তরল')).not.toBeInTheDocument();
    expect(screen.queryByText('গড় অর্ডার মূল্য')).not.toBeInTheDocument();
    expect(screen.queryByText('মোট সম্পন্ন বিক্রি')).not.toBeInTheDocument();
    expect(screen.getByText('বাকি ছাড়া বিক্রি')).toBeInTheDocument();
    expect(screen.getByText('বাকিতে বিক্রি')).toBeInTheDocument();
    expect(screen.getByText('কোন মাধ্যমে টাকা এসেছে')).toBeInTheDocument();
    const sourceSection = screen.getByRole('heading', { name: 'উৎস অনুযায়ী বিক্রয়' }).closest('section');
    const paymentSection = screen.getByRole('heading', { name: 'কোন মাধ্যমে টাকা এসেছে' }).closest('section')!;
    expect(sourceSection?.nextElementSibling).toBe(paymentSection);
    expect(within(paymentSection).getAllByText('নেট')).toHaveLength(2);
    expect(within(paymentSection).getByText('নেট = মোট পাওয়া টাকা থেকে রিফান্ডের টাকা বাদ দেওয়ার পর যে পরিমাণ থাকে। এটি বর্তমান ব্যালেন্স নয়।')).toBeVisible();
    const breakdown = paymentSection.querySelector('details')!;
    expect(breakdown).not.toHaveAttribute('open');
    expect(within(paymentSection).queryByText('জমা হয়েছে')).not.toBeInTheDocument();
    fireEvent.click(within(paymentSection).getByText('বিস্তারিত দেখুন'));
    expect(breakdown).toHaveAttribute('open');
    expect(within(paymentSection).getByRole('columnheader', { name: 'পেয়েছেন' })).toBeVisible();
    expect(within(paymentSection).getByRole('columnheader', { name: 'রিফান্ড' })).toBeVisible();
    expect(screen.getByText('পুরোনো পেমেন্ট ও টাকা ফেরতের মাধ্যম রেকর্ড না থাকলে ক্যাশ ধরা হয়েছে।')).toBeInTheDocument();
    expect(screen.getByText('ডিসকাউন্ট বাদ দিয়ে পণ্য বিক্রি থেকে মোট আয়।')).toBeInTheDocument();
    const deliveredCard = screen.getByText('ডেলিভারড অর্ডার').closest('div.rounded-xl');
    const deliveryChargeCard = screen.getByText('ডেলিভারি চার্জ').closest('div.rounded-xl');
    expect(deliveredCard?.compareDocumentPosition(deliveryChargeCard!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(screen.queryByText('ইনভেন্টরি সারাংশ')).not.toBeInTheDocument();
    expect(screen.getByText('ওয়েবসাইট')).toBeInTheDocument();
    expect(screen.getByText('দোকান')).toBeInTheDocument();
    expect(screen.getByText('অন্যান্য')).toBeInTheDocument();
    expect(screen.getByText('18টি সম্পন্ন অর্ডার')).toBeInTheDocument();
    expect(screen.getByText('৳1,800')).toBeInTheDocument();
    expect(screen.queryByText('ফেসবুক')).not.toBeInTheDocument();
    expect(screen.queryByText('ফোন')).not.toBeInTheDocument();
    expect(screen.queryByText('হোয়াটসঅ্যাপ')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'চলমান COD অর্ডার বিস্তারিত দেখুন' })).toHaveAttribute('href', '/admin/orders');
    expect(screen.getByRole('link', { name: 'কম স্টক বিস্তারিত দেখুন' })).toHaveAttribute('href', '/admin/inventory');
    expect(screen.getByRole('link', { name: 'স্টক নেই বিস্তারিত দেখুন' })).toHaveAttribute('href', '/admin/inventory');
    expect(screen.getByRole('link', { name: 'বাকি হিসাব বিস্তারিত দেখুন' })).toHaveAttribute('href', '/admin/dues');

    fireEvent.click(screen.getByRole('button', { name: 'এই বছর' }));
    await waitFor(() => expect(mocks.getAnalyticsDashboard).toHaveBeenCalledWith({ preset: 'year' }));
    await waitFor(() => expect(screen.getByLabelText('তারিখ থেকে')).toHaveValue('2026-01-01'));
    expect(screen.getByLabelText('তারিখ পর্যন্ত')).toHaveValue('2026-08-07');

    fireEvent.change(screen.getByLabelText('তারিখ থেকে'), { target: { value: '2026-03-10' } });
    fireEvent.change(screen.getByLabelText('তারিখ পর্যন্ত'), { target: { value: '2026-04-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'অ্যাপ্লাই' }));
    await waitFor(() => expect(mocks.getAnalyticsDashboard).toHaveBeenCalledWith({
      preset: 'custom', from: '2026-03-10', to: '2026-04-15',
    }));

    fireEvent.change(screen.getByLabelText('তারিখ থেকে'), { target: { value: '2025-01-01' } });
    fireEvent.change(screen.getByLabelText('তারিখ পর্যন্ত'), { target: { value: '2026-04-15' } });
    expect(screen.getByRole('button', { name: 'অ্যাপ্লাই' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('সর্বোচ্চ 366 দিন');
  });

  it('switches the comparison chart from sales to profit while keeping two lines', async () => {
    render(<MemoryRouter><AnalyticsDashboard /></MemoryRouter>);

    expect(await screen.findByText('প্রতিদিনের বিক্রি তুলনা')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'লাভ' }));

    expect(screen.getByText('প্রতিদিনের লাভ তুলনা')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'লাভ' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByText('৳250').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId(/^line-/)).toHaveLength(2);
  });

  it('shows both actual date ranges and values in the comparison tooltip', () => {
    render(<ComparisonTooltip active payload={[{
      payload: {
        currentFrom: '2026-08-01',
        currentTo: '2026-08-07',
        previousFrom: '2026-07-01',
        previousTo: '2026-07-07',
        currentValue: 1000,
        previousValue: 800,
      },
    }]} />);

    expect(screen.getByText(/01\/08\/2026.*07\/08\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/01\/07\/2026.*07\/07\/2026/)).toBeInTheDocument();
    expect(screen.getByText('৳1,000')).toBeInTheDocument();
    expect(screen.getByText('৳800')).toBeInTheDocument();
  });

  it('restores the last valid custom range and chart choice after refresh', async () => {
    window.localStorage.setItem('nafah_dashboard_preferences_v1', JSON.stringify({
      preset: 'custom',
      from: '2026-05-01',
      to: '2026-05-10',
      chartMetric: 'PROFIT',
    }));

    render(<MemoryRouter><AnalyticsDashboard /></MemoryRouter>);

    await waitFor(() => expect(mocks.getAnalyticsDashboard).toHaveBeenCalledWith({
      preset: 'custom', from: '2026-05-01', to: '2026-05-10',
    }));
    expect(screen.getByLabelText('তারিখ থেকে')).toHaveValue('2026-05-01');
    expect(screen.getByLabelText('তারিখ পর্যন্ত')).toHaveValue('2026-05-10');
    expect(screen.getByRole('button', { name: 'লাভ' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('hides the trend graph when the selected range is one day', async () => {
    render(<MemoryRouter><AnalyticsDashboard /></MemoryRouter>);
    expect(await screen.findByTestId('graph-date')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'আজ' }));

    await waitFor(() => expect(mocks.getAnalyticsDashboard).toHaveBeenCalledWith({ preset: 'today' }));
    expect(await screen.findByText('এক দিনের জন্য ট্রেন্ড গ্রাফ দেখানো হয় না।')).toBeInTheDocument();
    expect(screen.queryByTestId('graph-date')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('তারিখ থেকে')).toHaveValue('2026-08-07'));
    expect(screen.getByLabelText('তারিখ পর্যন্ত')).toHaveValue('2026-08-07');
  });
  it('links dated paid expenses and shows an expense-adjusted profit estimate', async () => {
    mocks.getAnalyticsDashboard.mockResolvedValue({
      ...dashboard,
      expenseSummary: {
        total: { ...metric, value: 50 },
        stockLoss: { ...metric, value: 10 },
        profitAfterExpenses: { ...metric, value: 200 },
      },
    });
    render(<MemoryRouter><AnalyticsDashboard /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'রিফ্রেশ' }));
    const link = (await screen.findByText('খরচ দেখুন')).closest('a');
    expect(link).toHaveAttribute('href', '/admin/expenses?from=2026-08-01&to=2026-08-07');
    expect(screen.getByText('খরচ বাদে লাভ')).toBeInTheDocument();
    expect(screen.getByText('পণ্যের লাভ')).toBeInTheDocument();
    expect(screen.queryByText('মোট লাভ')).not.toBeInTheDocument();
    expect(screen.getByText('আনুমানিক লাভ')).toBeVisible();
    const explanation = screen.getByText(/স্টক লস.*পণ্যের লাভে আগেই ধরা আছে/).closest('details')!;
    expect(explanation).not.toHaveAttribute('open');
    fireEvent.click(within(explanation).getByText('হিসাবের বিস্তারিত'));
    expect(explanation).toHaveAttribute('open');
    expect(screen.getByText(/ডেলিভারি চার্জ ও সেভ না করা খরচ এতে নেই/)).toBeVisible();
  });

  it('prioritizes four financial cards, keeps server values, and groups the five secondary metrics', async () => {
    mocks.getAnalyticsDashboard.mockResolvedValue({ ...dashboard,
      summary: { ...dashboard.summary, productRevenue: { ...metric, value: 1000 } },
      expenseSummary: { total: { ...metric, value: 50, previousValue: 40, absoluteChange: 10, percentChange: 25 }, stockLoss: { ...metric, value: 10 }, profitAfterExpenses: { ...metric, value: 200 } },
    });
    render(<MemoryRouter><AnalyticsDashboard /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'রিফ্রেশ' }));
    await within(screen.getByRole('region', { name: 'সিলেক্ট করা সময়ের মূল হিসাব' })).findByText('৳1,000');
    const main = screen.getByRole('region', { name: 'সিলেক্ট করা সময়ের মূল হিসাব' });
    const cards = Array.from(main.querySelector('.grid')!.children);
    const names = ['পণ্য আয়', 'পণ্যের লাভ', 'দোকানের খরচ', 'খরচ বাদে লাভ'];
    const values = ['৳1,000', '৳250', '৳50', '৳200'];
    expect(cards).toHaveLength(4);
    cards.forEach((card, index) => { expect(within(card as HTMLElement).getByText(names[index])).toBeInTheDocument(); expect(within(card as HTMLElement).getByText(values[index])).toBeInTheDocument(); });
    expect(main.querySelector('.grid')).toHaveClass('grid-cols-2', 'xl:grid-cols-4');
    const expenseChange = within(cards[2] as HTMLElement).getByText(/আগের সময়ের তুলনায়/);
    expect(expenseChange).toHaveClass('text-muted-foreground');
    expect(expenseChange).not.toHaveClass('text-secondary', 'text-destructive');
    expect(expenseChange).toHaveTextContent('+25%');
    const secondary = screen.getByRole('region', { name: 'আরও হিসাব' });
    expect(secondary.querySelector('.grid')!.children).toHaveLength(5);
    for (const label of ['বাকি ছাড়া বিক্রি', 'বাকিতে বিক্রি', 'লাভের মার্জিন', 'ডেলিভারড অর্ডার', 'ডেলিভারি চার্জ']) expect(within(secondary).getByText(label)).toBeInTheDocument();
    expect(main.nextElementSibling).toBe(secondary);
  });

  it('shows unavailable expense information rather than fabricated zeros', async () => {
    render(<MemoryRouter><AnalyticsDashboard /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'রিফ্রেশ' }));
    await screen.findByRole('heading', { name: 'এই মাসের হিসাব' });
    const main = screen.getByRole('region', { name: 'সিলেক্ট করা সময়ের মূল হিসাব' });
    expect(await within(main).findAllByText('তথ্য পাওয়া যায়নি')).toHaveLength(2);
    const expense = within(main).getByText('দোকানের খরচ').closest('a')!;
    expect(expense).toHaveAttribute('href', '/admin/expenses?from=2026-08-01&to=2026-08-07');
    expect(within(expense).queryByText('৳0')).not.toBeInTheDocument();
    expect(within(expense).queryByText(/আগের সময়ের তুলনায়/)).not.toBeInTheDocument();
  });

  it('uses the applied response dates in the period heading, not draft date edits', async () => {
    render(<MemoryRouter><AnalyticsDashboard /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'এই মাসের হিসাব' });
    const main = screen.getByRole('region', { name: 'সিলেক্ট করা সময়ের মূল হিসাব' });
    expect(within(main).getByText('01/08/2026 থেকে 07/08/2026')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('তারিখ থেকে'), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText('তারিখ পর্যন্ত'), { target: { value: '2026-03-09' } });
    expect(within(main).getByText('01/08/2026 থেকে 07/08/2026')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'অ্যাপ্লাই' }));
    await screen.findByRole('heading', { name: 'সিলেক্ট করা সময়ের হিসাব' });
    expect(within(screen.getByRole('region', { name: 'সিলেক্ট করা সময়ের মূল হিসাব' })).getByText('01/03/2026 থেকে 09/03/2026')).toBeInTheDocument();
  });

});
