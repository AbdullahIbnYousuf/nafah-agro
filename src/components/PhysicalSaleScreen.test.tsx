import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhysicalSale, Product } from '@/lib/types';
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

const product: Product = {
  id: '30000000-0000-4000-8000-000000000001',
  name: 'খোলা মিনিকেট চাল',
  slug: 'khola-miniket-rice',
  description: '',
  kind: 'LOOSE_WEIGHT',
  price: 100,
  categoryId: '50000000-0000-4000-8000-000000000001',
  images: [],
  youtubeLinks: [],
  stock: 10_000,
  featured: false,
  tags: [],
  isActive: true,
  variants: [{
    id: '40000000-0000-4000-8000-000000000001',
    name: 'Default',
    sku: 'INTERNAL-TEST',
    sellingPrice: 100,
    availableStock: 10_000,
    reservedStock: 0,
    lowStockThreshold: 1_000,
    isDefault: true,
    isActive: true,
  }],
};

const packagedProduct: Product = {
  ...product,
  id: '30000000-0000-4000-8000-000000000002',
  name: 'প্যাকেট আটা',
  slug: 'packaged-flour',
  kind: 'PACKAGED',
  price: 80,
  stock: 12,
  variants: [{
    ...product.variants![0],
    id: '40000000-0000-4000-8000-000000000002',
    name: '১ কেজি',
    sellingPrice: 80,
    availableStock: 12,
    lowStockThreshold: 2,
  }],
};

describe('physical sale history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminProducts.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 });
    mocks.getPhysicalSales.mockResolvedValue([sale]);
  });

  it('uses the same explicit expand-and-add flow for packaged and loose products', async () => {
    mocks.getAdminProducts.mockResolvedValue({ data: [packagedProduct, product], total: 2, page: 1, limit: 100, totalPages: 1 });
    render(<PhysicalSaleScreen />);
    await screen.findByRole('button', { name: 'প্যাকেট আটা · ১ কেজি পরিমাণ বেছে নিন' });

    fireEvent.click(screen.getByRole('button', { name: 'প্যাকেট আটা · ১ কেজি পরিমাণ বেছে নিন' }));
    expect(screen.getByRole('spinbutton', { name: 'প্যাকেট আটা · ১ কেজি পরিমাণ' })).toHaveValue(1);
    expect(screen.getByLabelText('প্যাকেট আটা · ১ কেজি একক')).toHaveTextContent('ইউনিট');
    expect(screen.getByRole('button', { name: 'বিক্রয় তালিকায় যোগ করুন' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'খোলা মিনিকেট চাল পরিমাণ বেছে নিন' }));
    expect(screen.queryByRole('spinbutton', { name: 'প্যাকেট আটা · ১ কেজি পরিমাণ' })).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'খোলা মিনিকেট চাল পরিমাণ' })).toHaveValue(1);
    expect(screen.getByRole('combobox', { name: 'খোলা মিনিকেট চাল একক' })).toHaveValue('KG');
  });

  it('adds the chosen loose amount and validates it against available stock', async () => {
    mocks.getAdminProducts.mockResolvedValue({ data: [product], total: 1, page: 1, limit: 100, totalPages: 1 });
    render(<PhysicalSaleScreen />);
    await screen.findByRole('button', { name: 'খোলা মিনিকেট চাল পরিমাণ বেছে নিন' });

    fireEvent.click(screen.getByRole('button', { name: 'খোলা মিনিকেট চাল পরিমাণ বেছে নিন' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'খোলা মিনিকেট চাল পরিমাণ' }), { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: 'বিক্রয় তালিকায় যোগ করুন' }));
    expect(screen.getByRole('alert')).toHaveTextContent('স্টকে সর্বোচ্চ ১০ কেজি আছে।');

    fireEvent.change(screen.getByRole('spinbutton', { name: 'খোলা মিনিকেট চাল পরিমাণ' }), { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'বিক্রয় তালিকায় যোগ করুন' }));

    expect(screen.queryByRole('button', { name: 'বিক্রয় তালিকায় যোগ করুন' })).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'খোলা মিনিকেট চাল পরিমাণ' })).toHaveValue(2.5);
    expect(screen.getByText('তালিকায় আছে')).toBeInTheDocument();
  });

  it('closes an expanded product without adding when the owner clicks elsewhere', async () => {
    mocks.getAdminProducts.mockResolvedValue({ data: [product], total: 1, page: 1, limit: 100, totalPages: 1 });
    render(<PhysicalSaleScreen />);
    await screen.findByRole('button', { name: 'খোলা মিনিকেট চাল পরিমাণ বেছে নিন' });

    fireEvent.click(screen.getByRole('button', { name: 'খোলা মিনিকেট চাল পরিমাণ বেছে নিন' }));
    fireEvent.pointerDown(screen.getByRole('textbox', { name: 'বিক্রির পণ্য খুঁজুন' }));

    expect(screen.queryByRole('button', { name: 'বিক্রয় তালিকায় যোগ করুন' })).not.toBeInTheDocument();
    expect(screen.getByText('বাম পাশ থেকে পণ্য যোগ করুন')).toBeInTheDocument();
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

  it('suggests catalog products and searches immediately after selection', async () => {
    mocks.getAdminProducts.mockResolvedValue({ data: [product], total: 1, page: 1, limit: 100, totalPages: 1 });
    render(<PhysicalSaleScreen />);
    await screen.findByText('PS-20260815-TEST');

    const search = screen.getByRole('combobox', { name: 'পণ্য বেছে নিন' });
    fireEvent.focus(search);
    fireEvent.click(await screen.findByRole('option', { name: /খোলা মিনিকেট চাল/ }));

    expect(search).toHaveValue('খোলা মিনিকেট চাল');
    await waitFor(() => expect(mocks.getPhysicalSales).toHaveBeenCalledWith({
      limit: 50,
      product: 'খোলা মিনিকেট চাল',
    }));
  });

  it('combines the product filter with customer or sale information', async () => {
    mocks.getAdminProducts.mockResolvedValue({ data: [product], total: 1, page: 1, limit: 100, totalPages: 1 });
    render(<PhysicalSaleScreen />);
    await screen.findByText('PS-20260815-TEST');

    const productSearch = screen.getByRole('combobox', { name: 'পণ্য বেছে নিন' });
    fireEvent.focus(productSearch);
    fireEvent.click(await screen.findByRole('option', { name: /খোলা মিনিকেট চাল/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'ক্রেতা বা বিক্রির তথ্য' }), {
      target: { value: '01300000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'খুঁজুন' }));

    await waitFor(() => expect(mocks.getPhysicalSales).toHaveBeenLastCalledWith({
      limit: 50,
      product: 'খোলা মিনিকেট চাল',
      query: '01300000000',
    }));
  });

  it('clearly reports when the sale product search has no match', async () => {
    mocks.getAdminProducts.mockResolvedValue({ data: [product], total: 1, page: 1, limit: 100, totalPages: 1 });
    render(<PhysicalSaleScreen />);
    await screen.findByRole('button', { name: /খোলা মিনিকেট চাল/ });

    fireEvent.change(screen.getByRole('textbox', { name: 'বিক্রির পণ্য খুঁজুন' }), {
      target: { value: 'সরিষার তেল' },
    });

    expect(screen.getByRole('status')).toHaveTextContent('এমন কোনো পণ্য পাওয়া যায়নি।');
  });
});
