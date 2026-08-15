import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhysicalSale } from '@/lib/types';
import PhysicalSaleScreen from './PhysicalSaleScreen';

const mocks = vi.hoisted(() => ({
  createPhysicalSale: vi.fn(),
  getAdminProducts: vi.fn(),
  getPhysicalSales: vi.fn(),
  returnPhysicalSale: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api')>(),
  createPhysicalSale: mocks.createPhysicalSale,
  getAdminProducts: mocks.getAdminProducts,
  getPhysicalSales: mocks.getPhysicalSales,
  returnPhysicalSale: mocks.returnPhysicalSale,
}));

const sale: PhysicalSale = {
  id: '10000000-0000-4000-8000-000000000001',
  orderNumber: 'PS-20260815-TEST',
  source: 'PHYSICAL_SHOP',
  status: 'COMPLETED',
  paymentMethod: 'CASH',
  paymentStatus: 'PAID',
  customerName: 'রহিম',
  customerPhone: '01300000000',
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
  createdBy: { fullName: 'দোকান মালিক', role: 'OWNER' },
  completedAt: '2026-08-15T12:00:00.000Z',
  items: [{
    id: '20000000-0000-4000-8000-000000000001',
    productId: '30000000-0000-4000-8000-000000000001',
    productVariantId: '40000000-0000-4000-8000-000000000001',
    productName: 'খোলা মিনিকেট চাল',
    variantName: 'Default',
    quantityUnit: 'GRAM',
    sku: 'INTERNAL-TEST',
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

describe('physical sale history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminProducts.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 });
    mocks.getPhysicalSales.mockResolvedValue([sale]);
  });

  it('keeps sale cards concise and reveals financial details when clicked', async () => {
    render(<PhysicalSaleScreen />);

    expect(await screen.findByText('PS-20260815-TEST')).toBeInTheDocument();
    expect(screen.getByText('খোলা মিনিকেট চাল')).toBeInTheDocument();
    expect(screen.getByText('২ কেজি')).toBeInTheDocument();
    expect(screen.getByText('রহিম · 01300000000')).toBeInTheDocument();
    expect(screen.getAllByText('৳180.00')).not.toHaveLength(0);
    expect(screen.queryByText(/২ কেজি × ৳100\.00 প্রতি কেজি/)).not.toBeInTheDocument();
    expect(screen.queryByText('বিক্রি করেছেন: দোকান মালিক')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'PS-20260815-TEST বিস্তারিত দেখুন' }));

    expect(screen.getByText(/২ কেজি × ৳100\.00 প্রতি কেজি/)).toBeInTheDocument();
    expect(screen.getByText('বিক্রি করেছেন: দোকান মালিক')).toBeInTheDocument();
    expect(screen.getAllByText('৳120.00')).not.toHaveLength(0);
    expect(screen.getAllByText('৳60.00')).not.toHaveLength(0);
    expect(screen.getByRole('button', { name: 'PS-20260815-TEST বিস্তারিত বন্ধ করুন' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText(/SKU/)).not.toBeInTheDocument();
  });
});
