import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PersonalOrders from './PersonalOrders';
import OrderConfirmation from './OrderConfirmation';
import { clearOtherCheckoutScope, PENDING_CHECKOUT_KEY, RECEIPT_KEY } from '@/lib/checkoutStorage';

const mocks = vi.hoisted(() => ({ auth: { user: { id: 'A', role: 'CUSTOMER' } as { id: string; role: string } | null, loading: false, sessionError: null, session: null }, list: vi.fn(), detail: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/lib/api', () => ({ getMyOrders: mocks.list, getMyOrder: mocks.detail, ApiError: class extends Error {} }));
vi.mock('@/components/Navbar', () => ({ default: () => <nav /> }));
vi.mock('@/components/Footer', () => ({ default: () => <footer /> }));
const order = { id: 'order', orderNumber: 'WEB-1', status: 'PENDING', placedAt: '2026-10-12T02:00:00Z', grandTotal: 180, subtotal: 100, deliveryCharge: 80, discountTotal: 0, priceIncreaseTotal: 0, customerName: 'Alif', customerPhone: '01700000000', customerAddress: 'Bogura', deliveryArea: 'Dhaka', items: [{ id: 'item', productName: 'Rice', variantName: 'Default', quantity: 1, quantityUnit: 'PIECE', unitLabel: 'বস্তা', unitSellingPrice: 100, netLineRevenue: 100 }] };
const page = { data: [order], page: 1, total: 16, totalPages: 2, limit: 15 };
function view(path: string) { return <MemoryRouter initialEntries={[path]}><Routes><Route path="/orders" element={<PersonalOrders />} /><Route path="/orders/:orderId" element={<PersonalOrders />} /></Routes></MemoryRouter>; }
describe('personal website orders', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.auth.user = { id: 'A', role: 'CUSTOMER' }; mocks.list.mockResolvedValue(page); mocks.detail.mockResolvedValue(order); sessionStorage.clear(); });
  it.each(['CUSTOMER', 'OWNER'])('shows personal orders and pagination for %s', async role => {
    mocks.auth.user = { id: 'A', role }; render(view('/orders'));
    expect(await screen.findByRole('link', { name: /WEB-1/ })).toHaveAttribute('href', '/orders/order');
    fireEvent.click(screen.getByRole('button', { name: 'পরের পেজ' }));
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(2, expect.anything()));
  });
  it('shows recipient details and refreshes the current status on browser focus', async () => {
    render(view('/orders/order')); await screen.findByText('Bogura');
    expect(screen.getByText('PENDING')).toBeInTheDocument();
    expect(screen.getByText(/1 বস্তা/)).toBeInTheDocument();
    mocks.detail.mockResolvedValueOnce({ ...order, status: 'CONFIRMED' });
    fireEvent(window, new Event('focus'));
    await screen.findByText('CONFIRMED');
    expect(screen.queryByText(/ক্রয়মূল্য|লাভ/)).not.toBeInTheDocument();
  });
  it('shows retry rather than a false empty state after errors', async () => {
    mocks.list.mockRejectedValueOnce(new Error('offline')); render(view('/orders'));
    expect(await screen.findByRole('alert')).toHaveTextContent('রিট্রাই');
    expect(screen.queryByText(/এখনও কোনো/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'রিট্রাই করুন' })); await screen.findByText('WEB-1');
  });
});
describe('refresh-safe order receipt', () => {
  beforeEach(() => { sessionStorage.clear(); mocks.auth.user = null; });
  function receipt(scope: string) { sessionStorage.setItem(RECEIPT_KEY, JSON.stringify({ scope, id: 'order', orderNumber: 'WEB-1', grandTotal: 180, placedAt: order.placedAt })); }
  it('thanks guests after a refresh without promising online tracking', () => {
    receipt('guest'); render(<MemoryRouter><OrderConfirmation /></MemoryRouter>);
    expect(screen.getByText('ধন্যবাদ! আপনার অর্ডার পেয়েছি।')).toBeInTheDocument();
    expect(screen.getByText(/যত দ্রুত সম্ভব/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'অর্ডারের স্ট্যাটাস দেখুন' })).not.toBeInTheDocument();
  });
  it('links a signed-in owner to their own status page', () => {
    mocks.auth.user = { id: 'A', role: 'OWNER' }; receipt('A'); render(<MemoryRouter><OrderConfirmation /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'অর্ডারের স্ট্যাটাস দেখুন' })).toHaveAttribute('href', '/orders/order');
  });
  it('never displays another account’s receipt and clears its pending checkout', () => {
    mocks.auth.user = { id: 'B', role: 'CUSTOMER' }; receipt('A');
    sessionStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify({ scope: 'A', input: { customer: { address: 'private' } } }));
    render(<MemoryRouter><OrderConfirmation /></MemoryRouter>);
    expect(screen.queryByText(/WEB-1/)).not.toBeInTheDocument();
    clearOtherCheckoutScope('B'); expect(sessionStorage.getItem(RECEIPT_KEY)).toBeNull(); expect(sessionStorage.getItem(PENDING_CHECKOUT_KEY)).toBeNull();
  });
});
