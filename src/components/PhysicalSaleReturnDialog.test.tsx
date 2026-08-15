import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PhysicalSale } from '@/lib/types';
import PhysicalSaleReturnDialog from './PhysicalSaleReturnDialog';

const sale: PhysicalSale = {
  id: '10000000-0000-4000-8000-000000000001',
  orderNumber: 'PS-20260815-RETURN',
  source: 'PHYSICAL_SHOP',
  status: 'COMPLETED',
  paymentMethod: 'CASH',
  paymentStatus: 'PAID',
  customerName: null,
  customerPhone: null,
  subtotal: 200,
  discountTotal: 20,
  grandTotal: 180,
  totalBuyingCost: 120,
  grossProfit: 60,
  grossProfitMargin: 33.33,
  refundedAmount: 0,
  remainingRevenue: 180,
  remainingBuyingCost: 120,
  remainingGrossProfit: 60,
  unprofitableOverrideConfirmed: false,
  createdBy: { fullName: 'Owner', role: 'OWNER' },
  completedAt: '2026-08-15T12:00:00.000Z',
  items: [{
    id: '20000000-0000-4000-8000-000000000001',
    productId: '30000000-0000-4000-8000-000000000001',
    productVariantId: '40000000-0000-4000-8000-000000000001',
    productName: 'খোলা মিনিকেট চাল',
    variantName: 'Default',
    quantityUnit: 'GRAM',
    sku: 'INTERNAL',
    quantity: 2_000,
    unitSellingPrice: 100,
    grossLineRevenue: 200,
    allocatedDiscount: 20,
    netLineRevenue: 180,
    totalBuyingCost: 120,
    grossProfit: 60,
    returnedQuantity: 0,
    returnableQuantity: 2_000,
    allocations: [],
  }],
  returns: [],
};

function setup() {
  const onClose = vi.fn();
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  render(<PhysicalSaleReturnDialog sale={sale} onClose={onClose} onConfirm={onConfirm} />);
  return { onClose, onConfirm };
}

function selectItemAndReason() {
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByLabelText('ফেরতের কারণ *'), { target: { value: 'প্যাকেট নষ্ট ছিল' } });
}

describe('physical sale return dialog', () => {
  it('closes without submitting a return', () => {
    const { onClose, onConfirm } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'বন্ধ করুন' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('submits a SELLABLE return with the selected measured amount', async () => {
    const { onConfirm } = setup();
    selectItemAndReason();
    fireEvent.click(screen.getByRole('button', { name: 'ফেরত নিশ্চিত করুন' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({
      condition: 'SELLABLE',
      reason: 'প্যাকেট নষ্ট ছিল',
      items: [{
        salesOrderItemId: '20000000-0000-4000-8000-000000000001',
        amount: '2',
        amountUnit: 'KG',
      }],
    }));
  });

  it('submits DAMAGED explicitly', async () => {
    const { onConfirm } = setup();
    selectItemAndReason();
    fireEvent.click(screen.getByLabelText(/DAMAGED/));
    fireEvent.click(screen.getByRole('button', { name: 'ফেরত নিশ্চিত করুন' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ condition: 'DAMAGED' })));
  });

  it('requires a return reason', async () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'ফেরত নিশ্চিত করুন' }));
    expect(await screen.findByText(/ফেরতের কারণ লিখুন/)).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
