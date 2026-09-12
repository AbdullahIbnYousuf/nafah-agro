import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import type { UnifiedOrder } from '@/lib/types';
import OrderActionDialog from './OrderActionDialog';

const order = { id: 'order-1', orderNumber: 'WEB-20260804-0001' } as UnifiedOrder;

describe('order action dialog', () => {
  it('closes without changing the order', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn(async () => {});
    render(<OrderActionDialog order={order} action="CANCEL" onClose={onClose} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'বন্ধ করুন' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('submits cancellation without requiring a reason', async () => {
    const onConfirm = vi.fn(async () => {});
    render(<OrderActionDialog order={order} action="CANCEL" onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'অর্ডার বাতিল কনফার্ম করুন' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(undefined, false));
  });

  it('submits a failed-delivery reason', async () => {
    const onConfirm = vi.fn(async () => {});
    render(<OrderActionDialog order={order} action="FAILED_DELIVERY" onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByLabelText('কারণ (ঐচ্ছিক)'), { target: { value: 'Customer was unavailable' } });
    fireEvent.click(screen.getByRole('button', { name: 'ব্যর্থ ডেলিভারি কনফার্ম করুন' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('Customer was unavailable', false));
  });

  it('keeps API errors in the dialog and requires an explicit loss override', async () => {
    const onConfirm = vi.fn()
      .mockRejectedValueOnce(new ApiError('Estimated gross profit is negative.', 'UNPROFITABLE_ORDER_CONFIRMATION_REQUIRED', 409))
      .mockResolvedValueOnce(undefined);
    render(<OrderActionDialog order={order} action="CONFIRM" onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'অর্ডার কনফার্ম ও স্টক রিজার্ভ করুন' }));
    expect(await screen.findByText(/Estimated gross profit is negative/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ক্ষতি মেনে কনফার্ম করুন' }));
    await waitFor(() => expect(onConfirm).toHaveBeenLastCalledWith(undefined, true));
  });
});
