import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import type { UnifiedOrder } from '@/lib/types';
import ReturnOrderDialog from './ReturnOrderDialog';

const order = {
  id: 'order-1',
  orderNumber: 'WEB-20260801-ABCD1234',
  items: [
    { id: 'item-1', productName: 'Raw Honey', variantName: '500 g', quantity: 2 },
    { id: 'item-2', productName: 'Red Rice', variantName: '1 kg', quantity: 1 },
  ],
} as UnifiedOrder;

function setup(onConfirm = vi.fn(async () => {})) {
  const onClose = vi.fn();
  render(<ReturnOrderDialog order={order} onClose={onClose} onConfirm={onConfirm} />);
  return { onClose, onConfirm };
}

describe('whole-order return dialog', () => {
  it('shows the order and items, and closing performs no action', () => {
    const { onClose, onConfirm } = setup();

    expect(screen.getByText(order.orderNumber)).toBeInTheDocument();
    expect(screen.getByText(/Raw Honey/)).toBeInTheDocument();
    expect(screen.getByText(/Red Rice/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'বাতিল / বন্ধ করুন' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('submits a sellable whole-order return', async () => {
    const { onConfirm } = setup();
    fireEvent.change(screen.getByLabelText('ফেরতের কারণ *'), { target: { value: 'Unopened products returned' } });
    fireEvent.click(screen.getByRole('button', { name: 'ফেরত নিশ্চিত করুন' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('SELLABLE', 'Unopened products returned'));
  });

  it('submits a damaged whole-order return', async () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByRole('radio', { name: /DAMAGED/ }));
    expect(screen.getByText(/কোনো স্টক পুনরুদ্ধার হবে না/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('ফেরতের কারণ *'), { target: { value: 'Package and products damaged' } });
    fireEvent.click(screen.getByRole('button', { name: 'ফেরত নিশ্চিত করুন' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('DAMAGED', 'Package and products damaged'));
  });

  it('requires a return reason before submission', () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'ফেরত নিশ্চিত করুন' }));

    expect(screen.getByText(/অন্তত ৩ অক্ষর/)).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows API validation errors inside the dialog', async () => {
    const onConfirm = vi.fn(async () => {
      throw new ApiError('Request validation failed', 'VALIDATION_ERROR', 400, {
        issues: [{ message: 'Only a delivered order can be returned.' }],
      });
    });
    setup(onConfirm);
    fireEvent.change(screen.getByLabelText('ফেরতের কারণ *'), { target: { value: 'Customer return' } });
    fireEvent.click(screen.getByRole('button', { name: 'ফেরত নিশ্চিত করুন' }));

    expect(await screen.findByText('Only a delivered order can be returned.')).toBeInTheDocument();
  });
});
