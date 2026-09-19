import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreditCustomer, CreditSummary, PhysicalSale } from '@/lib/types';
import CreditSalesManager from './CreditSalesManager';

const mocks = vi.hoisted(() => ({
  getCreditCustomer: vi.fn(), getCreditCustomers: vi.fn(), getCreditCustomerSummary: vi.fn(),
  recordCreditCustomerPayment: vi.fn(), rescheduleCreditCustomerFollowUp: vi.fn(),
  updateCreditCustomer: vi.fn(), voidCreditCustomerPayment: vi.fn(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/api')>(), ...mocks }));

const sale: PhysicalSale = {
  id: '10000000-0000-4000-8000-000000000001', orderNumber: 'PS-CREDIT-1', source: 'PHYSICAL_SHOP', status: 'COMPLETED',
  paymentMethod: 'CREDIT', paymentStatus: 'PARTIALLY_PAID', nextFollowUpDate: '2099-08-29', customerName: 'রহিম', customerPhone: null,
  subtotal: 1000, discountTotal: 0, grandTotal: 1000, totalBuyingCost: 600, grossProfit: 400, grossProfitMargin: 40,
  refundedAmount: 0, remainingRevenue: 1000, collectedAmount: 400, outstandingAmount: 600, remainingBuyingCost: 600, remainingGrossProfit: 400,
  unprofitableOverrideConfirmed: false, createdBy: { fullName: 'Owner', role: 'OWNER' }, completedAt: '2026-08-22T10:00:00.000Z',
  items: [{ id: '20000000-0000-4000-8000-000000000001', productId: '30000000-0000-4000-8000-000000000001', productVariantId: '40000000-0000-4000-8000-000000000001', productName: 'মিনিকেট চাল', variantName: '5 kg', quantityUnit: 'PIECE', sku: 'INTERNAL', quantity: 2, unitSellingPrice: 500, grossLineRevenue: 1000, allocatedDiscount: 0, netLineRevenue: 1000, totalBuyingCost: 600, grossProfit: 400, returnedQuantity: 0, returnableQuantity: 2, allocations: [] }],
  returns: [], creditPayments: [],
};

const payment = { id: '50000000-0000-4000-8000-000000000001', amount: 400, paidOn: '2026-08-22', note: null, createdBy: { fullName: 'Owner', role: 'OWNER' as const }, createdAt: '2026-08-22T10:00:00.000Z', voidedAt: null, voidReason: null, voidedBy: null };
const customer: CreditCustomer = {
  id: '60000000-0000-4000-8000-000000000001', name: 'রহিম', phone: null, nextFollowUpDate: '2099-08-29',
  totalSaleAmount: 1000, collectedAmount: 400, outstandingAmount: 600, saleCount: 1,
  createdBy: { fullName: 'Owner', role: 'OWNER' }, createdAt: '2026-08-22T10:00:00.000Z', updatedAt: '2026-08-22T10:00:00.000Z',
  payments: [payment], sales: [sale], history: [],
};
const summary: CreditSummary = { totalOutstanding: 600, openSaleCount: 1, customerCount: 1, overdueCount: 0, dueTodayCount: 0, upcomingCount: 1 };

describe('customer-based credit manager', () => {
  beforeEach(() => {
    vi.clearAllMocks(); window.sessionStorage.removeItem('nafah_credit_customers_view_v1');
    mocks.getCreditCustomers.mockResolvedValue({ data: [customer], total: 1, page: 1, limit: 30, totalPages: 1 });
    mocks.getCreditCustomerSummary.mockResolvedValue(summary); mocks.getCreditCustomer.mockResolvedValue(customer);
    mocks.recordCreditCustomerPayment.mockResolvedValue(customer); mocks.rescheduleCreditCustomerFollowUp.mockResolvedValue(customer);
    mocks.updateCreditCustomer.mockResolvedValue(customer); mocks.voidCreditCustomerPayment.mockResolvedValue(customer);
  });

  it('restores the customer filter and applied search after refresh', async () => {
    window.sessionStorage.setItem('nafah_credit_customers_view_v1', JSON.stringify({ state: 'OVERDUE', query: 'রহিম' }));
    render(<CreditSalesManager />);
    await waitFor(() => expect(mocks.getCreditCustomers).toHaveBeenCalledWith({ state: 'OVERDUE', query: 'রহিম', page: 1, limit: 30 }));
    expect(screen.getByPlaceholderText('ক্রেতার নাম বা ফোন')).toHaveValue('রহিম');
  });

  it('searches automatically while typing without a separate search button', async () => {
    render(<CreditSalesManager />);
    await waitFor(() => expect(mocks.getCreditCustomers).toHaveBeenCalledWith({ state: 'OPEN', query: undefined, page: 1, limit: 30 }));

    fireEvent.change(screen.getByLabelText('ক্রেতা খুঁজুন'), { target: { value: 'রহিম' } });

    expect(screen.queryByRole('button', { name: 'খুঁজুন' })).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.getCreditCustomers).toHaveBeenCalledWith({ state: 'OPEN', query: 'রহিম', page: 1, limit: 30 }), { timeout: 1_500 });
  });

  it('shows one customer total and loads combined previous records', async () => {
    render(<CreditSalesManager />);
    const customerButton = await screen.findByRole('button', { name: /রহিম.*মোট বাকি/ });
    fireEvent.click(customerButton);
    expect(await screen.findByText('বিক্রির আগের রেকর্ড')).toBeInTheDocument();
    expect(screen.getByText('PS-CREDIT-1')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /কল করুন/ })).not.toBeInTheDocument();
  });

  it('records one payment against the customer total', async () => {
    render(<CreditSalesManager />); fireEvent.click(await screen.findByRole('button', { name: /রহিম.*মোট বাকি/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'পেমেন্ট অ্যাড করুন' }));
    fireEvent.change(screen.getByLabelText('জমা টাকা'), { target: { value: '200' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'পেমেন্ট অ্যাড করুন' }).at(-1)!);
    await waitFor(() => expect(mocks.recordCreditCustomerPayment).toHaveBeenCalledWith(customer.id, expect.objectContaining({ amount: 200, idempotencyKey: expect.any(String) })));
  });

  it('edits the customer name and allows an empty phone', async () => {
    render(<CreditSalesManager />); fireEvent.click(await screen.findByRole('button', { name: /রহিম.*মোট বাকি/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'তথ্য বদলান' }));
    fireEvent.change(screen.getByLabelText('ক্রেতার নাম সম্পাদনা'), { target: { value: 'করিম' } });
    fireEvent.click(screen.getByRole('button', { name: 'সেভ করুন' }));
    await waitFor(() => expect(mocks.updateCreditCustomer).toHaveBeenCalledWith(customer.id, { name: 'করিম', phone: null }));
  });

  it('requires a reason before voiding a customer payment', async () => {
    render(<CreditSalesManager />); fireEvent.click(await screen.findByRole('button', { name: /রহিম.*মোট বাকি/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'পেমেন্ট বাতিল' }));
    fireEvent.click(screen.getByRole('button', { name: 'পেমেন্ট বাতিল করুন' }));
    expect(screen.getByRole('alert')).toHaveTextContent('কেন পেমেন্টটি বাতিল করছেন');
    expect(mocks.voidCreditCustomerPayment).not.toHaveBeenCalled();
  });
});
