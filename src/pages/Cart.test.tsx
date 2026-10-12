import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Cart from './Cart';
import type { CartItem, User } from '@/lib/types';
import { ApiError } from '@/lib/api';
import { PENDING_CHECKOUT_KEY, RECEIPT_KEY } from '@/lib/checkoutStorage';

const mocks = vi.hoisted(() => ({
  create: vi.fn(), rates: vi.fn(), refresh: vi.fn(), clear: vi.fn(), toast: vi.fn(),
  auth: { user: null as User | null, loading: false, sessionError: null as string | null, session: null as { access_token: string } | null, retrySession: vi.fn() },
  cart: { items: [] as CartItem[], totalPrice: 100, loading: false, saving: false, error: null },
}));
vi.mock('@/contexts/CartContext', () => ({ useCart: () => ({ ...mocks.cart, removeItem: vi.fn(), updateQuantity: vi.fn(), clearCart: mocks.clear, refresh: mocks.refresh }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/lib/api', () => ({
  ApiError: class extends Error { constructor(message: string, public code: string, public status: number) { super(message); } },
  createWebsiteOrder: mocks.create, getDeliveryRates: mocks.rates,
}));
vi.mock('@/components/Navbar', () => ({ default: () => <nav>Navbar</nav> }));
vi.mock('@/components/Footer', () => ({ default: () => <footer>Footer</footer> }));
vi.mock('sonner', () => ({ toast: { error: mocks.toast, success: vi.fn() } }));
const item: CartItem = { productId: 'p', productVariantId: 'v', productName: 'Rice', variantName: '1 kg', quantity: 1, unitPrice: 100 };
function view() { return <MemoryRouter initialEntries={['/cart']}><Routes><Route path="/cart" element={<Cart />} /><Route path="/order-confirmation" element={<p>receipt page</p>} /></Routes></MemoryRouter>; }
async function openCheckout() {
  fireEvent.click(await screen.findByRole('button', { name: 'অর্ডার করতে এগিয়ে যান' }));
  fireEvent.click(await screen.findByRole('radio'));
}
function fill() {
  fireEvent.change(screen.getByLabelText('নাম *'), { target: { value: 'Customer' } });
  fireEvent.change(screen.getByLabelText('ফোন *'), { target: { value: '01700000000' } });
  fireEvent.change(screen.getByLabelText('সম্পূর্ণ ঠিকানা *'), { target: { value: 'Bogura address' } });
}
describe('checkout basics', () => {
  beforeEach(() => {
    vi.clearAllMocks(); sessionStorage.clear();
    mocks.auth.user = null; mocks.auth.session = null; mocks.auth.loading = false; mocks.auth.sessionError = null;
    mocks.cart.items = [item]; mocks.cart.totalPrice = 100; mocks.cart.loading = false; mocks.cart.error = null;
    mocks.refresh.mockResolvedValue({ revision: 4, items: [item] });
    mocks.rates.mockResolvedValue([{ id: 'rate', name: 'Dhaka', charge: 80, isActive: true }]);
    mocks.clear.mockResolvedValue(undefined); mocks.auth.retrySession.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue({ order: { id: 'order', orderNumber: 'WEB-1', grandTotal: 180, placedAt: '2026-10-12T01:00:00Z' }, replayed: false });
  });
  it('explains an unavailable delivery charge without silently failing', async () => {
    mocks.rates.mockResolvedValue([{ id: 'rate', name: 'Dhaka', charge: null, isActive: true }]);
    render(view()); await openCheckout(); fill();
    fireEvent.click(screen.getByRole('button', { name: 'অর্ডার প্লেস করুন' }));
    expect(mocks.toast).toHaveBeenLastCalledWith('এই এলাকার ডেলিভারি চার্জ এখনো নির্ধারিত হয়নি');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('shows guest guidance only to guests and prefills a signed-in address', async () => {
    mocks.auth.user = { id: 'A', name: 'Alif', phoneNumber: '01700000000', email: 'a@example.com', role: 'OWNER', isActive: true, deliveryAddress: 'Saved address', preferredDeliveryRateId: 'rate' };
    mocks.auth.session = { access_token: 'token-A' };
    render(view()); await openCheckout();
    expect(screen.queryByText('লগইন ছাড়াও অর্ডার করতে পারবেন')).not.toBeInTheDocument();
    expect(screen.getByLabelText('নাম *')).toHaveValue('Alif');
    expect(screen.getByLabelText('সম্পূর্ণ ঠিকানা *')).toHaveValue('Saved address');
    expect(screen.getByLabelText('এই ঠিকানা প্রোফাইলে সেভ করুন')).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'অর্ডার প্লেস করুন' }));
    await screen.findByText('receipt page');
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ cartRevision: 4, saveDeliveryAddress: false }), 'token-A');
    expect(mocks.clear).not.toHaveBeenCalled();
  });
  it('saves an edited address only when explicitly selected', async () => {
    mocks.auth.user = { id: 'A', name: 'Alif', phoneNumber: '01700000000', email: 'a@example.com', role: 'CUSTOMER', isActive: true, deliveryAddress: 'Old address' };
    mocks.auth.session = { access_token: 'token-A' };
    render(view()); await openCheckout();
    fireEvent.change(screen.getByLabelText('সম্পূর্ণ ঠিকানা *'), { target: { value: 'New address' } });
    fireEvent.click(screen.getByLabelText('এই ঠিকানা প্রোফাইলে সেভ করুন'));
    fireEvent.click(screen.getByRole('button', { name: 'অর্ডার প্লেস করুন' }));
    await screen.findByText('receipt page');
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ saveDeliveryAddress: true, customer: expect.objectContaining({ address: 'New address' }) }), 'token-A');
  });
  it('clears another account’s checkout fields immediately', async () => {
    mocks.auth.user = { id: 'A', name: 'Alif', phoneNumber: '01700000000', email: 'a@example.com', role: 'OWNER', isActive: true, deliveryAddress: 'A address' };
    const rendered = render(view()); await openCheckout();
    mocks.auth.user = { ...mocks.auth.user, id: 'B', name: 'Bob', deliveryAddress: 'B address' };
    rendered.rerender(view());
    fireEvent.click(await screen.findByRole('button', { name: 'অর্ডার করতে এগিয়ে যান' }));
    expect(screen.getByLabelText('নাম *')).toHaveValue('Bob'); expect(screen.getByLabelText('সম্পূর্ণ ঠিকানা *')).toHaveValue('B address');
  });
  it('refreshes stale prices and requires reviewing them before submitting', async () => {
    render(view()); await openCheckout(); fill();
    mocks.refresh.mockResolvedValueOnce({ revision: 5, items: [{ ...item, unitPrice: 120 }] });
    fireEvent.click(screen.getByRole('button', { name: 'অর্ডার প্লেস করুন' }));
    await screen.findByRole('alert'); expect(mocks.create).not.toHaveBeenCalled();
    expect(screen.getByLabelText('সম্পূর্ণ ঠিকানা *')).toHaveValue('Bogura address');
  });
  it('persists a timeout retry across refresh using the same key and body', async () => {
    mocks.create.mockRejectedValueOnce(new ApiError('timeout', 'REQUEST_TIMEOUT', 408));
    const first = render(view()); await openCheckout(); fill();
    fireEvent.click(screen.getByRole('button', { name: 'অর্ডার প্লেস করুন' }));
    await screen.findByRole('button', { name: 'অর্ডার রিট্রাই করুন' });
    const input = mocks.create.mock.calls[0][0]; expect(sessionStorage.getItem(PENDING_CHECKOUT_KEY)).toContain(input.idempotencyKey);
    first.unmount(); mocks.cart.items = [];
    render(view());
    fireEvent.click(await screen.findByRole('button', { name: 'অর্ডার রিট্রাই করুন' }));
    await screen.findByText('receipt page');
    expect(mocks.create.mock.calls[1][0]).toEqual(input);
    expect(JSON.parse(sessionStorage.getItem(RECEIPT_KEY)!)).toMatchObject({ scope: 'guest', orderNumber: 'WEB-1' });
    expect(sessionStorage.getItem(PENDING_CHECKOUT_KEY)).toBeNull();
  });
  it('prevents duplicate clicks while a submission is in flight', async () => {
    mocks.create.mockImplementation(() => new Promise(() => undefined));
    render(view()); await openCheckout(); fill();
    const button = screen.getByRole('button', { name: 'অর্ডার প্লেস করুন' }); fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
  });
  it('shows retry instead of an empty cart when loading fails', async () => {
    mocks.cart.items = []; mocks.cart.error = 'network failed'; render(view());
    expect(screen.getByRole('alert')).toHaveTextContent('network failed');
    expect(screen.queryByText('আপনার কার্ট খালি')).not.toBeInTheDocument();
  });
});
