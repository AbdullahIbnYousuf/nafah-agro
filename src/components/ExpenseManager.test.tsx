import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShopExpense, ShopExpenseSummary } from '@/lib/types';
import ExpenseManager from './ExpenseManager';

const mocks = vi.hoisted(() => ({
  getExpenses: vi.fn(), getExpenseSummary: vi.fn(), getExpense: vi.fn(),
  suggestExpenseNames: vi.fn(), createExpense: vi.fn(),
  updateExpense: vi.fn(), voidExpense: vi.fn(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/api')>(), ...mocks }));

const expense: ShopExpense = {
  id: '10000000-0000-4000-8000-000000000100',
  name: 'দোকান ভাড়া',
  amount: 500,
  paidOn: '2026-09-01',
  paymentChannel: 'CASH',
  note: 'সেপ্টেম্বর',
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-01T09:00:00.000Z',
  createdBy: 'Owner',
  voidedAt: null,
  voidReason: null,
  voidedBy: null,
  history: [],
};
const summary: ShopExpenseSummary = {
  total: 500, count: 1,
  byMethod: [
    { method: 'CASH', amount: 500, count: 1 },
    { method: 'BKASH', amount: 0, count: 0 },
    { method: 'NAGAD', amount: 0, count: 0 },
    { method: 'ROCKET', amount: 0, count: 0 },
    { method: 'BANK', amount: 0, count: 0 },
  ],
};

function renderAt(path = '/admin/expenses') {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/admin/expenses" element={<ExpenseManager />} />
    <Route path="/admin/expenses/new" element={<ExpenseManager />} />
    <Route path="/admin/expenses/:expenseId/edit" element={<ExpenseManager />} />
  </Routes></MemoryRouter>);
}

describe('shop expense manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getExpenses.mockResolvedValue({ data: [expense], total: 1, page: 1, limit: 20, totalPages: 1 });
    mocks.getExpenseSummary.mockResolvedValue(summary);
    mocks.getExpense.mockResolvedValue(expense);
    mocks.suggestExpenseNames.mockResolvedValue(['দোকান ভাড়া', 'বিদ্যুৎ বিল']);
    mocks.createExpense.mockResolvedValue(expense);
    mocks.updateExpense.mockResolvedValue(expense);
    mocks.voidExpense.mockResolvedValue({ ...expense, voidedAt: '2026-09-02T09:00:00.000Z' });
  });

  it('loads a dated summary and applies the payment-method filter', async () => {
    renderAt('/admin/expenses?from=2026-09-01&to=2026-09-30');
    expect(await screen.findByText('দোকান ভাড়া')).toBeInTheDocument();
    expect(mocks.getExpenseSummary).toHaveBeenCalledWith({ from: '2026-09-01', to: '2026-09-30' });
    fireEvent.change(screen.getByRole('combobox', { name: 'খরচের মাধ্যম' }), { target: { value: 'BKASH' } });
    await waitFor(() => expect(mocks.getExpenses).toHaveBeenCalledWith(expect.objectContaining({ paymentChannel: 'BKASH' })));
    expect(screen.getByRole('button', { name: 'ফিল্টার রিসেট' })).toBeInTheDocument();
  });

  it('creates an expense with cash as default and one idempotency key', async () => {
    renderAt('/admin/expenses/new');
    const name = await screen.findByRole('combobox', { name: 'খরচের নাম' });
    fireEvent.change(name, { target: { value: 'বিদ্যুৎ বিল' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'টাকার পরিমাণ' }), { target: { value: '125.50' } });
    expect(screen.getByRole('combobox', { name: 'টাকা দেওয়ার মাধ্যম' })).toHaveValue('CASH');
    fireEvent.click(screen.getByRole('button', { name: 'সেভ করুন' }));
    await waitFor(() => expect(mocks.createExpense).toHaveBeenCalledWith(expect.objectContaining({
      name: 'বিদ্যুৎ বিল', amount: '125.50', paymentChannel: 'CASH', idempotencyKey: expect.any(String),
    })));
  });

  it('quick-repeat prefills a previous expense without saving automatically', async () => {
    renderAt('/admin/expenses');
    fireEvent.click(await screen.findByRole('button', { name: /দোকান ভাড়া/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'আবার অ্যাড করুন' }));
    expect(await screen.findByRole('combobox', { name: 'খরচের নাম' })).toHaveValue('দোকান ভাড়া');
    expect(screen.getByRole('spinbutton', { name: 'টাকার পরিমাণ' })).toHaveValue(500);
    expect(mocks.createExpense).not.toHaveBeenCalled();
  });

  it('keeps an unsaved void closed until a reason is supplied', async () => {
    renderAt('/admin/expenses');
    fireEvent.click(await screen.findByRole('button', { name: /দোকান ভাড়া/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'বাতিল করুন' }));
    fireEvent.click(screen.getByRole('button', { name: 'রেকর্ড বাতিল করুন' }));
    expect(screen.getByRole('alert')).toHaveTextContent('কারণ লিখুন');
    expect(mocks.voidExpense).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'বাতিলের কারণ' }), { target: { value: 'ভুল রেকর্ড' } });
    fireEvent.click(screen.getByRole('button', { name: 'রেকর্ড বাতিল করুন' }));
    await waitFor(() => expect(mocks.voidExpense).toHaveBeenCalledWith(expense.id, 'ভুল রেকর্ড'));
  });
  it('requires an audit reason before correcting a paid expense', async () => {
    renderAt('/admin/expenses');
    fireEvent.click(await screen.findByRole('button', { name: /দোকান ভাড়া/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'আপডেট করুন' }));
    await screen.findByRole('textbox', { name: 'আপডেটের কারণ' });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'টাকার পরিমাণ' }), { target: { value: '450' } });
    fireEvent.click(screen.getByRole('button', { name: 'সেভ করুন' }));
    expect(screen.getByRole('alert')).toHaveTextContent('কারণ লিখুন');
    expect(mocks.updateExpense).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'আপডেটের কারণ' }), { target: { value: 'ভুল টাকা' } });
    fireEvent.click(screen.getByRole('button', { name: 'সেভ করুন' }));
    await waitFor(() => expect(mocks.updateExpense).toHaveBeenCalledWith(expense.id, expect.objectContaining({ amount: '450', reason: 'ভুল টাকা' })));
  });

  it('explains a reversed date range without sending invalid API requests', async () => {
    renderAt('/admin/expenses?from=2026-09-30&to=2026-09-01');
    expect(await screen.findByRole('alert')).toHaveTextContent('শুরুর তারিখ শেষের তারিখের পরে');
    expect(mocks.getExpenses).not.toHaveBeenCalled();
  });

  it('retries a failed expense-detail request', async () => {
    mocks.getExpense.mockRejectedValueOnce(new Error('Network unavailable'));
    renderAt('/admin/expenses');
    fireEvent.click(await screen.findByRole('button', { name: /দোকান ভাড়া/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'রিট্রাই করুন' }));
    expect(await screen.findByText('সেপ্টেম্বর')).toBeInTheDocument();
  });

});
