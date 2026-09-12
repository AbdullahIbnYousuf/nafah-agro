import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreditSummary, PhysicalSale } from '@/lib/types';
import CreditSalesManager from './CreditSalesManager';

const mocks = vi.hoisted(() => ({
  getCreditSales: vi.fn(),
  getCreditSummary: vi.fn(),
  recordCreditPayment: vi.fn(),
  rescheduleCreditFollowUp: vi.fn(),
  voidCreditPayment: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api')>(),
  ...mocks,
}));

const sale: PhysicalSale = {
  id: '10000000-0000-4000-8000-000000000001', orderNumber: 'PS-CREDIT-1', source: 'PHYSICAL_SHOP', status: 'COMPLETED',
  paymentMethod: 'CREDIT', paymentStatus: 'PARTIALLY_PAID', nextFollowUpDate: '2099-08-29', customerName: 'রহিম', customerPhone: '01300000000',
  subtotal: 1000, discountTotal: 0, grandTotal: 1000, totalBuyingCost: 600, grossProfit: 400, grossProfitMargin: 40,
  refundedAmount: 0, remainingRevenue: 1000, collectedAmount: 400, outstandingAmount: 600, remainingBuyingCost: 600, remainingGrossProfit: 400,
  unprofitableOverrideConfirmed: false, createdBy: { fullName: 'Owner', role: 'OWNER' }, completedAt: '2026-08-22T10:00:00.000Z',
  items: [{
    id: '20000000-0000-4000-8000-000000000001', productId: '30000000-0000-4000-8000-000000000001', productVariantId: '40000000-0000-4000-8000-000000000001',
    productName: 'মিনিকেট চাল', variantName: '5 kg', quantityUnit: 'PIECE', sku: 'INTERNAL', quantity: 2, unitSellingPrice: 500,
    grossLineRevenue: 1000, allocatedDiscount: 0, netLineRevenue: 1000, totalBuyingCost: 600, grossProfit: 400, returnedQuantity: 0, returnableQuantity: 2, allocations: [],
  }],
  returns: [],
  creditPayments: [{ id: '50000000-0000-4000-8000-000000000001', amount: 400, paidOn: '2026-08-22', note: null, createdBy: { fullName: 'Owner', role: 'OWNER' }, createdAt: '2026-08-22T10:00:00.000Z', voidedAt: null, voidReason: null, voidedBy: null }],
};

const summary: CreditSummary = { totalOutstanding: 600, openSaleCount: 1, customerCount: 1, overdueCount: 0, dueTodayCount: 0, upcomingCount: 1 };

describe('credit sales manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCreditSales.mockResolvedValue({ data: [sale], total: 1, page: 1, limit: 30, totalPages: 1 });
    mocks.getCreditSummary.mockResolvedValue(summary);
    mocks.recordCreditPayment.mockResolvedValue({ ...sale, collectedAmount: 600, outstandingAmount: 400 });
    mocks.rescheduleCreditFollowUp.mockResolvedValue(sale);
    mocks.voidCreditPayment.mockResolvedValue(sale);
  });

  it('shows customer-grouped balances and expands exact sale details', async () => {
    render(<CreditSalesManager />);
    expect((await screen.findAllByText('৳600.00')).length).toBeGreaterThan(0);
    expect(screen.getByText('রহিম')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /PS-CREDIT-1/ }));
    expect(screen.getByText('আগের পেমেন্টের রেকর্ড')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '01300000000' })).toHaveAttribute('href', 'tel:01300000000');
  });

  it('records a partial payment with amount, date, optional note, and an idempotency key', async () => {
    render(<CreditSalesManager />);
    fireEvent.click(await screen.findByRole('button', { name: /PS-CREDIT-1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'পেমেন্ট যোগ করুন' }));
    fireEvent.change(screen.getByLabelText('জমা টাকা'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('নোট (ঐচ্ছিক)'), { target: { value: 'দুইশ টাকা' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'পেমেন্ট যোগ করুন' }).at(-1)!);
    await waitFor(() => expect(mocks.recordCreditPayment).toHaveBeenCalledWith(sale.id, expect.objectContaining({
      amount: 200, note: 'দুইশ টাকা', idempotencyKey: expect.any(String),
    })));
  });

  it('closing a dialog changes nothing and follow-up rescheduling stays explicit', async () => {
    render(<CreditSalesManager />);
    fireEvent.click(await screen.findByRole('button', { name: /PS-CREDIT-1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'তারিখ বদলান' }));
    fireEvent.click(screen.getByRole('button', { name: 'বন্ধ করুন' }));
    expect(mocks.rescheduleCreditFollowUp).not.toHaveBeenCalled();
  });

  it('requires a reason before voiding an incorrect payment', async () => {
    render(<CreditSalesManager />);
    fireEvent.click(await screen.findByRole('button', { name: /PS-CREDIT-1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'ভুল পেমেন্ট' }));
    fireEvent.click(screen.getByRole('button', { name: 'পেমেন্ট বাতিল করুন' }));
    expect(screen.getByRole('alert')).toHaveTextContent('কেন পেমেন্টটি বাতিল করছেন');
    expect(mocks.voidCreditPayment).not.toHaveBeenCalled();
  });
});
