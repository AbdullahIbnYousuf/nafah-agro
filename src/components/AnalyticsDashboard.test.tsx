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
    soldQuantities: { pieces: metric, weightKg: metric, volumeLitres: metric },
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
            current: { from: '2026-01-01', to: '2026-12-31' },
            previous: { from: '2025-01-01', to: '2025-12-31' },
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
    render(<AnalyticsDashboard />);

    expect(await screen.findByLabelText('তারিখ থেকে')).toHaveValue('2026-08-01');
    expect(screen.getByLabelText('তারিখ পর্যন্ত')).toHaveValue('2026-08-31');
    expect(screen.queryByRole('button', { name: 'নিজস্ব সময়সীমা' })).not.toBeInTheDocument();
    expect(screen.getByTestId('graph-date')).toHaveTextContent('৭ আগস্ট');
    expect(screen.getByTestId('graph-amount')).toHaveTextContent('1,000');

    fireEvent.click(screen.getByRole('button', { name: 'এই বছর' }));
    await waitFor(() => expect(mocks.getAnalyticsDashboard).toHaveBeenCalledWith({ preset: 'year' }));
    await waitFor(() => expect(screen.getByLabelText('তারিখ থেকে')).toHaveValue('2026-01-01'));
    expect(screen.getByLabelText('তারিখ পর্যন্ত')).toHaveValue('2026-12-31');

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

  it('hides the trend graph when the selected range is one day', async () => {
    render(<AnalyticsDashboard />);
    expect(await screen.findByTestId('graph-date')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'আজ' }));

    await waitFor(() => expect(mocks.getAnalyticsDashboard).toHaveBeenCalledWith({ preset: 'today' }));
    expect(await screen.findByText('এক দিনের জন্য ট্রেন্ড গ্রাফ দেখানো হয় না।')).toBeInTheDocument();
    expect(screen.queryByTestId('graph-date')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('তারিখ থেকে')).toHaveValue('2026-08-07'));
    expect(screen.getByLabelText('তারিখ পর্যন্ত')).toHaveValue('2026-08-07');
  });
});
