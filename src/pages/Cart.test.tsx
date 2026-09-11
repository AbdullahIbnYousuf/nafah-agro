import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Cart from './Cart';

const mocks = vi.hoisted(() => ({
  createWebsiteOrder: vi.fn(),
  getDeliveryRates: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/contexts/CartContext', () => ({
  useCart: () => ({
    items: [{ productId: 'product-1', productVariantId: 'variant-1', productName: 'Rice', variantName: '1 kg', quantity: 1, unitPrice: 100 }],
    removeItem: vi.fn(), updateQuantity: vi.fn(), clearCart: vi.fn(), totalPrice: 100,
  }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {},
  createWebsiteOrder: mocks.createWebsiteOrder,
  getDeliveryRates: mocks.getDeliveryRates,
}));
vi.mock('@/components/Navbar', () => ({ default: () => <nav>Navbar</nav> }));
vi.mock('@/components/Footer', () => ({ default: () => <footer>Footer</footer> }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));

describe('cart unavailable checkout guidance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDeliveryRates.mockResolvedValue([{ id: 'rate-1', name: 'Dhaka', charge: null, isActive: true }]);
  });

  it('explains an unconfigured delivery charge when confirmation is tapped', async () => {
    render(<MemoryRouter><Cart /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'লগইন ছাড়াও অর্ডার করতে পারবেন' }));

    expect(screen.getByRole('status')).toHaveTextContent('এই এলাকার ডেলিভারি চার্জ এখনো নির্ধারণ করা হয়নি');
    const confirm = screen.getByRole('button', { name: 'অর্ডার নিশ্চিত করুন' });
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(confirm);
    expect(mocks.toastError).toHaveBeenCalledWith('আপনার নাম দিন');

    fireEvent.change(screen.getByLabelText('নাম *'), { target: { value: 'Customer' } });
    fireEvent.change(screen.getByLabelText('ফোন *'), { target: { value: '01700000000' } });
    fireEvent.change(screen.getByLabelText('সম্পূর্ণ ঠিকানা *'), { target: { value: 'Bogura address' } });
    fireEvent.click(confirm);
    expect(mocks.toastError).toHaveBeenLastCalledWith('এই এলাকার ডেলিভারি চার্জ এখনো নির্ধারিত হয়নি');
    expect(mocks.createWebsiteOrder).not.toHaveBeenCalled();
  });
});
