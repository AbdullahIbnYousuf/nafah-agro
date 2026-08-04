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

  it('requires a reason for cancellation', () => {
    const onConfirm = vi.fn(async () => {});
    render(<OrderActionDialog order={order} action="CANCEL" onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'অর্ডার বাতিল নিশ্চিত করুন' }));
    expect(screen.getByText(/অন্তত ৩ অক্ষর/)).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('submits a failed-delivery reason', async () => {
    const onConfirm = vi.fn(async () => {});
    render(<OrderActionDialog order={order} action="FAILED_DELIVERY" onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByLabelText('কারণ *'), { target: { value: 'Customer was unavailable' } });
    fireEvent.click(screen.getByRole('button', { name: 'ব্যর্থ ডেলিভারি নিশ্চিত করুন' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('Customer was unavailable', false));
  });

  it('keeps API errors in the dialog and requires an explicit loss override', async () => {
    const onConfirm = vi.fn()
      .mockRejectedValueOnce(new ApiError('Estimated gross profit is negative.', 'UNPROFITABLE_ORDER_CONFIRMATION_REQUIRED', 409))
      .mockResolvedValueOnce(undefined);
    render(<OrderActionDialog order={order} action="CONFIRM" onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'নিশ্চিত ও স্টক সংরক্ষণ করুন' }));
    expect(await screen.findByText(/Estimated gross profit is negative/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ক্ষতি মেনে নিশ্চিত করুন' }));
    await waitFor(() => expect(onConfirm).toHaveBeenLastCalledWith(undefined, true));
  });
});
