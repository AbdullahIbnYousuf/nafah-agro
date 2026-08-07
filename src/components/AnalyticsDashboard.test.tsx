import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyticsDashboardData } from '@/lib/types';
import AnalyticsDashboard from './AnalyticsDashboard';

const mocks = vi.hoisted(() => ({ getAnalyticsDashboard: vi.fn() }));

vi.mock('@/lib/api', () => ({ getAnalyticsDashboard: mocks.getAnalyticsDashboard }));
vi.mock('recharts', () => ({
  CartesianGrid: () => null,
  Legend: () => null,
  Line: () => null,
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

const dashboard: AnalyticsDashboardData = {
  generatedAt: '2026-08-07T12:00:00.000Z',
  currency: 'BDT',
  timezone: 'Asia/Dhaka',
  week: { startsOn: 'SUNDAY', endsOn: 'SATURDAY' },
  range: {
    preset: 'month',
    current: { from: '2026-08-01', to: '2026-08-31' },
    previous: { from: '2026-07-01', to: '2026-07-31' },
  },
  summary: {
    recognizedSales: metric,
    productRevenue: metric,
    deliveryCharges: metric,
    grossProfit: metric,
    grossMargin: metric,
    recognizedOrderCount: metric,
    unitsSold: metric,
    averageOrderValue: metric,
    pendingCodOrderCount: 0,
    lowStockVariantCount: 0,
    outOfStockVariantCount: 0,
  },
  trend: [{ date: '2026-08-07', recognizedSales: 1000, grossProfit: 250 }],
  salesBySource: [],
  bestSelling: [],
  mostProfitable: [],
  inventory: {
    availableUnits: 0,
    reservedUnits: 0,
    onHandUnits: 0,
    fifoValuation: 0,
    lowStock: [],
    outOfStock: [],
  },
  pendingCod: { total: 0, pending: 0, confirmed: 0, processing: 0 },
};

describe('analytics dashboard date controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAnalyticsDashboard.mockResolvedValue(dashboard);
  });

  it('uses full Bangla Gregorian months, numeric axes, year, and validated custom ranges', async () => {
    render(<AnalyticsDashboard />);

    expect(await screen.findByText(/১ আগস্ট, ২০২৬/)).toBeInTheDocument();
    expect(screen.getByTestId('graph-date')).toHaveTextContent('৭ আগস্ট');
    expect(screen.getByTestId('graph-amount')).toHaveTextContent('1,000');

    fireEvent.click(screen.getByRole('button', { name: 'এই বছর' }));
    await waitFor(() => expect(mocks.getAnalyticsDashboard).toHaveBeenCalledWith({ preset: 'year' }));

    fireEvent.click(screen.getByRole('button', { name: 'নিজস্ব সময়সীমা' }));
    fireEvent.change(screen.getByLabelText('তারিখ থেকে'), { target: { value: '2026-03-10' } });
    fireEvent.change(screen.getByLabelText('তারিখ পর্যন্ত'), { target: { value: '2026-04-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'প্রয়োগ করুন' }));
    await waitFor(() => expect(mocks.getAnalyticsDashboard).toHaveBeenCalledWith({
      preset: 'custom', from: '2026-03-10', to: '2026-04-15',
    }));

    fireEvent.change(screen.getByLabelText('তারিখ থেকে'), { target: { value: '2025-01-01' } });
    fireEvent.change(screen.getByLabelText('তারিখ পর্যন্ত'), { target: { value: '2026-04-15' } });
    expect(screen.getByRole('button', { name: 'প্রয়োগ করুন' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('সর্বোচ্চ ৩৬৬ দিন');
  });
});
