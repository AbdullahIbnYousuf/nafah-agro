import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { PhysicalSale, Product, VariantOption } from '@/lib/types';
import PhysicalSaleScreen from './PhysicalSaleScreen';

const mocks = vi.hoisted(() => ({
  createPhysicalSale: vi.fn(),
  getVariantOptions: vi.fn(),
  getPhysicalSales: vi.fn(),
  returnPhysicalSale: vi.fn(),
  suggestCreditCustomers: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api')>(),
  createPhysicalSale: mocks.createPhysicalSale,
  getVariantOptions: mocks.getVariantOptions,
  getPhysicalSales: mocks.getPhysicalSales,
  returnPhysicalSale: mocks.returnPhysicalSale,
  suggestCreditCustomers: mocks.suggestCreditCustomers,
}));

const sale: PhysicalSale = {
  id: '10000000-0000-4000-8000-000000000001',
  orderNumber: 'PS-20260815-TEST',
  source: 'PHYSICAL_SHOP',
  status: 'COMPLETED',
  paymentMethod: 'CASH',
  paymentStatus: 'PAID',
  nextFollowUpDate: null,
  customerName: 'রহিম',
  customerPhone: '01300000000',
  subtotal: 200,
  discountTotal: 20,
  priceIncreaseTotal: 0,
  grandTotal: 180,
  totalBuyingCost: 120,
  grossProfit: 60,
  grossProfitMargin: 33.33,
  refundedAmount: 0,
  remainingRevenue: 180,
  collectedAmount: 0,
  outstandingAmount: 0,
  remainingBuyingCost: 120,
  remainingGrossProfit: 60,
  unprofitableOverrideConfirmed: false,
  createdBy: { fullName: 'দোকান মালিক', role: 'OWNER' },
  completedAt: '2026-08-15T12:00:00.000Z',
  soldOn: '2026-08-15',
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
    allocatedPriceIncrease: 0,
    netLineRevenue: 180,
    totalBuyingCost: 120,
    grossProfit: 60,
    returnedQuantity: 0,
    returnableQuantity: 2_000,
    allocations: [],
  }],
  returns: [],
  creditPayments: [],
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

function renderScreen() {
  return render(<MemoryRouter><PhysicalSaleScreen /></MemoryRouter>);
}

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

const eggProduct: Product = {
  ...packagedProduct,
  id: '30000000-0000-4000-8000-000000000003',
  name: 'দেশি ডিম',
  slug: 'deshi-eggs',
  kind: 'EGG',
  price: 12,
  bulkSellingPrice: 10,
  bulkMinimumQuantity: 15,
  stock: 50,
  variants: [{
    ...product.variants![0],
    id: '40000000-0000-4000-8000-000000000003',
    name: 'Default',
    sellingPrice: 12,
    bulkSellingPrice: 10,
    bulkMinimumQuantity: 15,
    availableStock: 50,
    lowStockThreshold: 10,
  }],
};

function productOptions(...products: Product[]): VariantOption[] {
  return products.flatMap((entry) => (entry.variants ?? []).map((variant) => ({
    productId: entry.id,
    productVariantId: variant.id,
    productName: entry.name,
    variantName: variant.name,
    productKind: entry.kind,
    quantityUnit: entry.kind === 'LOOSE_WEIGHT' ? 'GRAM' : entry.kind === 'LOOSE_VOLUME' ? 'MILLILITER' : 'PIECE',
    availableStock: variant.availableStock,
    reservedStock: variant.reservedStock,
    sellingPrice: variant.sellingPrice,
    bulkSellingPrice: variant.bulkSellingPrice ?? null,
    bulkMinimumQuantity: variant.bulkMinimumQuantity ?? null,
    isOperational: true,
  })));
}

describe('physical sale history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.removeItem('nafah_physical_sale_history_filters_v1');
    mocks.getVariantOptions.mockResolvedValue([]);
    mocks.getPhysicalSales.mockResolvedValue([sale]);
    mocks.suggestCreditCustomers.mockResolvedValue([]);
    mocks.createPhysicalSale.mockResolvedValue(sale);
  });

  it('defaults to cash and saves a changed method for a paid shop sale', async () => {
    mocks.getVariantOptions.mockResolvedValue(productOptions(packagedProduct));
    renderScreen();
    expect(screen.getByRole('combobox', { name: 'টাকা নেওয়ার মাধ্যম' })).toHaveValue('CASH');
    fireEvent.click(await screen.findByRole('button', { name: 'প্যাকেট আটা · ১ কেজি পরিমাণ সিলেক্ট করুন' }));
    fireEvent.click(screen.getByRole('button', { name: 'বিক্রির তালিকায় অ্যাড করুন' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'টাকা নেওয়ার মাধ্যম' }), { target: { value: 'ROCKET' } });
    fireEvent.click(screen.getByRole('button', { name: 'বিক্রি সম্পন্ন করুন' }));
    await waitFor(() => expect(mocks.createPhysicalSale).toHaveBeenCalledWith(expect.objectContaining({
      paymentMode: 'PAID_NOW',
      paymentChannel: 'ROCKET',
    })));
  });

  it('restores applied sale-history filters after refresh', async () => {
    window.sessionStorage.setItem('nafah_physical_sale_history_filters_v1', JSON.stringify({
      product: 'মিনিকেট', query: '01300000000', dateFrom: '2026-08-01', dateTo: '2026-08-31',
    }));

    renderScreen();

    await waitFor(() => expect(mocks.getPhysicalSales).toHaveBeenCalledWith({
      limit: 50,
      product: 'মিনিকেট',
      query: '01300000000',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-31',
    }));
    expect(screen.getByRole('textbox', { name: 'বিক্রির পণ্য' })).toHaveValue('মিনিকেট');
    expect(screen.getByRole('textbox', { name: 'ক্রেতা বা বিক্রির তথ্য' })).toHaveValue('01300000000');
  });

  it('shows the frequently used dues page as a prominent primary action', async () => {
    renderScreen();

    const duesLink = await screen.findByRole('link', { name: 'বাকি হিসাব' });
    expect(duesLink).toHaveAttribute('href', '/admin/dues');
    expect(duesLink).toHaveClass('bg-primary', 'min-h-12', 'shadow-md');
  });

  it('uses the same explicit expand-and-add flow for packaged and loose products', async () => {
    mocks.getVariantOptions.mockResolvedValue(productOptions(packagedProduct, product));
    renderScreen();
    await screen.findByRole('button', { name: 'প্যাকেট আটা · ১ কেজি পরিমাণ সিলেক্ট করুন' });

    fireEvent.click(screen.getByRole('button', { name: 'প্যাকেট আটা · ১ কেজি পরিমাণ সিলেক্ট করুন' }));
    expect(screen.getByRole('spinbutton', { name: 'প্যাকেট আটা · ১ কেজি পরিমাণ' })).toHaveValue(1);
    expect(screen.getByLabelText('প্যাকেট আটা · ১ কেজি একক')).toHaveTextContent('ইউনিট');
    expect(screen.getByRole('button', { name: 'বিক্রির তালিকায় অ্যাড করুন' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'খোলা মিনিকেট চাল পরিমাণ সিলেক্ট করুন' }));
    expect(screen.queryByRole('spinbutton', { name: 'প্যাকেট আটা · ১ কেজি পরিমাণ' })).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'খোলা মিনিকেট চাল পরিমাণ' })).toHaveValue(1);
    expect(screen.getByRole('combobox', { name: 'খোলা মিনিকেট চাল একক' })).toHaveValue('KG');
  });

  it('adds the chosen loose amount and validates it against available stock', async () => {
    mocks.getVariantOptions.mockResolvedValue(productOptions(product));
    renderScreen();
    await screen.findByRole('button', { name: 'খোলা মিনিকেট চাল পরিমাণ সিলেক্ট করুন' });

    fireEvent.click(screen.getByRole('button', { name: 'খোলা মিনিকেট চাল পরিমাণ সিলেক্ট করুন' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'খোলা মিনিকেট চাল পরিমাণ' }), { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: 'বিক্রির তালিকায় অ্যাড করুন' }));
    expect(screen.getByRole('alert')).toHaveTextContent('স্টকে সর্বোচ্চ 10 কেজি আছে।');

    fireEvent.change(screen.getByRole('spinbutton', { name: 'খোলা মিনিকেট চাল পরিমাণ' }), { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'বিক্রির তালিকায় অ্যাড করুন' }));

    expect(screen.queryByRole('button', { name: 'বিক্রির তালিকায় অ্যাড করুন' })).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'খোলা মিনিকেট চাল পরিমাণ' })).toHaveValue(2.5);
    expect(screen.getByText('তালিকায় আছে')).toBeInTheDocument();
  });

  it('recalculates an egg line immediately when it crosses 15', async () => {
    mocks.getVariantOptions.mockResolvedValue(productOptions(eggProduct));
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'দেশি ডিম পরিমাণ সিলেক্ট করুন' }));
    const amount = screen.getByRole('spinbutton', { name: 'দেশি ডিম পরিমাণ' });
    expect(screen.getByLabelText('দেশি ডিম একক')).toHaveTextContent('টি ডিম');
    fireEvent.change(amount, { target: { value: '14' } });
    fireEvent.click(screen.getByRole('button', { name: 'বিক্রির তালিকায় অ্যাড করুন' }));
    expect(screen.getAllByText('৳168.00').length).toBeGreaterThan(0);
    expect(screen.getByText(/সাধারণ দাম/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole('spinbutton', { name: 'দেশি ডিম পরিমাণ' }), { target: { value: '15' } });
    expect(screen.getAllByText('৳150.00').length).toBeGreaterThan(0);
    expect(screen.getByText(/15টি\+ দাম/)).toBeInTheDocument();
  });

  it('requires the actual price and sale date for an earlier shop sale', async () => {
    mocks.getVariantOptions.mockResolvedValue(productOptions(packagedProduct));
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'প্যাকেট আটা · ১ কেজি পরিমাণ সিলেক্ট করুন' }));
    fireEvent.click(screen.getByRole('button', { name: 'বিক্রির তালিকায় অ্যাড করুন' }));
    fireEvent.click(screen.getByLabelText('আগের বিক্রি রেকর্ড করুন'));
    expect(screen.getByRole('spinbutton', { name: 'মোট পণ্যের দাম' })).toHaveValue(null);
    fireEvent.click(screen.getByRole('button', { name: 'বিক্রি সম্পন্ন করুন' }));
    expect(screen.getByText('আগের বিক্রির আসল মোট দাম লিখুন।')).toBeInTheDocument();
    expect(mocks.createPhysicalSale).not.toHaveBeenCalled();

    const past = new Date(Date.now() + 6 * 60 * 60 * 1_000 - 10 * 86_400_000).toISOString().slice(0, 10);
    fireEvent.change(screen.getByLabelText('আসলে যেদিন বিক্রি হয়েছে'), { target: { value: past } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'মোট পণ্যের দাম' }), { target: { value: '75' } });
    fireEvent.click(screen.getByRole('button', { name: 'বিক্রি সম্পন্ন করুন' }));
    await waitFor(() => expect(mocks.createPhysicalSale).toHaveBeenCalledWith(expect.objectContaining({
      finalProductTotal: 75,
      discountTotal: 0,
      soldOn: past,
      idempotencyKey: expect.any(String),
    })));
  });

  it('explains how to make an out-of-stock product available', async () => {
    const emptyProduct = {
      ...packagedProduct,
      stock: 0,
      variants: packagedProduct.variants!.map((variant) => ({ ...variant, availableStock: 0 })),
    };
    mocks.getVariantOptions.mockResolvedValue(productOptions(emptyProduct));
    renderScreen();

    const productButton = await screen.findByRole('button', { name: 'প্যাকেট আটা · ১ কেজি পরিমাণ সিলেক্ট করুন' });
    expect(productButton).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(productButton);
    expect(mocks.toastError).toHaveBeenCalledWith('এই পণ্যের স্টক নেই। আগে ক্রয় ও ইনভেন্টরি থেকে নতুন স্টক অ্যাড করুন।');
  });

  it('closes an expanded product without adding when the owner clicks elsewhere', async () => {
    mocks.getVariantOptions.mockResolvedValue(productOptions(product));
    renderScreen();
    await screen.findByRole('button', { name: 'খোলা মিনিকেট চাল পরিমাণ সিলেক্ট করুন' });

    fireEvent.click(screen.getByRole('button', { name: 'খোলা মিনিকেট চাল পরিমাণ সিলেক্ট করুন' }));
    fireEvent.pointerDown(screen.getByRole('textbox', { name: 'বিক্রির পণ্য সার্চ করুন' }));

    expect(screen.queryByRole('button', { name: 'বিক্রির তালিকায় অ্যাড করুন' })).not.toBeInTheDocument();
    expect(screen.getByText('বাম পাশ থেকে পণ্য অ্যাড করুন')).toBeInTheDocument();
  });

  it('keeps sale cards concise and reveals financial details when clicked', async () => {
    renderScreen();

    expect(await screen.findByText('PS-20260815-TEST')).toBeInTheDocument();
    expect(screen.getByText('খোলা মিনিকেট চাল')).toBeInTheDocument();
    expect(screen.getByText('2 কেজি')).toBeInTheDocument();
    expect(screen.getByText('রহিম · 01300000000')).toBeInTheDocument();
    expect(screen.getAllByText('৳180.00')).not.toHaveLength(0);
    expect(screen.queryByText(/2 কেজি × ৳100\.00 প্রতি কেজি/)).not.toBeInTheDocument();
    expect(screen.queryByText('বিক্রি করেছেন: দোকান মালিক')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'PS-20260815-TEST বিস্তারিত দেখুন' }));

    expect(screen.getByText(/2 কেজি × ৳100\.00 প্রতি কেজি/)).toBeInTheDocument();
    expect(screen.getByText('বিক্রি করেছেন: দোকান মালিক')).toBeInTheDocument();
    expect(screen.getAllByText('৳120.00')).not.toHaveLength(0);
    expect(screen.getAllByText('৳60.00')).not.toHaveLength(0);
    expect(screen.getByRole('button', { name: 'PS-20260815-TEST বিস্তারিত বন্ধ করুন' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText(/SKU/)).not.toBeInTheDocument();
  });

  it('searches sale history by the saved product snapshot text', async () => {
    renderScreen();
    await screen.findByText('PS-20260815-TEST');

    const search = screen.getByRole('textbox', { name: 'বিক্রির পণ্য' });
    fireEvent.change(search, { target: { value: 'খোলা মিনিকেট চাল' } });
    fireEvent.click(screen.getByRole('button', { name: 'সার্চ করুন' }));
    await waitFor(() => expect(mocks.getPhysicalSales).toHaveBeenCalledWith({
      limit: 50,
      product: 'খোলা মিনিকেট চাল',
    }));
  });

  it('combines the product filter with customer or sale information', async () => {
    renderScreen();
    await screen.findByText('PS-20260815-TEST');

    fireEvent.change(screen.getByRole('textbox', { name: 'বিক্রির পণ্য' }), {
      target: { value: 'খোলা মিনিকেট চাল' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'ক্রেতা বা বিক্রির তথ্য' }), {
      target: { value: '01300000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'সার্চ করুন' }));

    await waitFor(() => expect(mocks.getPhysicalSales).toHaveBeenLastCalledWith({
      limit: 50,
      product: 'খোলা মিনিকেট চাল',
      query: '01300000000',
    }));
  });

  it('clearly reports when the sale product search has no match', async () => {
    mocks.getVariantOptions
      .mockResolvedValueOnce(productOptions(product))
      .mockResolvedValueOnce([]);
    renderScreen();
    await screen.findByRole('button', { name: /খোলা মিনিকেট চাল/ });

    fireEvent.change(screen.getByRole('textbox', { name: 'বিক্রির পণ্য সার্চ করুন' }), {
      target: { value: 'সরিষার তেল' },
    });

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('এমন কোনো পণ্য পাওয়া যায়নি।'));
  });

  it('explains why a sale cannot be completed without products', async () => {
    renderScreen();
    await screen.findByText(sale.orderNumber);

    const completeButton = screen.getByRole('button', { name: 'বিক্রি সম্পন্ন করুন' });
    expect(completeButton).toHaveAttribute('aria-disabled', 'true');
    expect(completeButton).not.toBeDisabled();
    fireEvent.click(completeButton);

    expect(mocks.toastError).toHaveBeenCalledWith('বিক্রি সম্পন্ন করতে আগে কমপক্ষে একটি পণ্য অ্যাড করুন।');
    expect(screen.getByText('কমপক্ষে একটি পণ্য অ্যাড করুন।')).toBeInTheDocument();
    expect(mocks.createPhysicalSale).not.toHaveBeenCalled();
  });

  it('requires a selected or explicitly new customer and keeps phone optional', async () => {
    mocks.getVariantOptions.mockResolvedValue(productOptions(packagedProduct));
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'প্যাকেট আটা · ১ কেজি পরিমাণ সিলেক্ট করুন' }));
    fireEvent.click(screen.getByRole('button', { name: 'বিক্রির তালিকায় অ্যাড করুন' }));
    fireEvent.click(screen.getByRole('button', { name: 'বাকি' }));
    fireEvent.click(screen.getByRole('button', { name: 'বাকি বিক্রি সম্পন্ন করুন' }));
    expect(screen.getByText('বাকি বিক্রির জন্য ক্রেতার নাম দিন।')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('ক্রেতার নাম'), { target: { value: 'করিম' } });
    fireEvent.click(await screen.findByRole('option', { name: /করিম.*নামে নতুন ক্রেতা অ্যাড করুন/ }));
    const followUp = screen.getByLabelText('পরের যোগাযোগের তারিখ');
    expect((followUp as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    fireEvent.click(screen.getByRole('button', { name: 'বাকি বিক্রি সম্পন্ন করুন' }));

    await waitFor(() => expect(mocks.createPhysicalSale).toHaveBeenCalledWith(expect.objectContaining({
      paymentMode: 'CREDIT', customerName: 'করিম', customerPhone: undefined, createCreditCustomer: true, nextFollowUpDate: expect.any(String),
    })), { timeout: 3_000 });
  });

  it('selects an existing customer by name and fills saved credit details', async () => {
    mocks.getVariantOptions.mockResolvedValue(productOptions(packagedProduct));
    mocks.suggestCreditCustomers.mockResolvedValue([{
      id: '70000000-0000-4000-8000-000000000001', name: 'রহিম', phone: '01300000000',
      nextFollowUpDate: '2099-09-20', outstandingAmount: 700,
    }]);
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'প্যাকেট আটা · ১ কেজি পরিমাণ সিলেক্ট করুন' }));
    fireEvent.click(screen.getByRole('button', { name: 'বিক্রির তালিকায় অ্যাড করুন' }));
    fireEvent.click(screen.getByRole('button', { name: 'বাকি' }));
    fireEvent.change(screen.getByLabelText('ক্রেতার নাম'), { target: { value: 'রহ' } });
    fireEvent.click(await screen.findByRole('option', { name: 'রহিম' }));

    expect(screen.getByLabelText('ক্রেতার ফোন')).toHaveValue('01300000000');
    expect(screen.getByLabelText('পরের যোগাযোগের তারিখ')).toHaveValue('2099-09-20');
    expect(screen.getByText('আগের বাকি')).toBeInTheDocument();
    expect(screen.getByText('৳700.00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'বাকি বিক্রি সম্পন্ন করুন' }));
    await waitFor(() => expect(mocks.createPhysicalSale).toHaveBeenCalledWith(expect.objectContaining({
      creditCustomerId: '70000000-0000-4000-8000-000000000001', createCreditCustomer: false,
      customerName: 'রহিম', customerPhone: '01300000000', nextFollowUpDate: '2099-09-20',
    })));
  });

  it('allows a new customer whose name is part of an existing customer name', async () => {
    mocks.getVariantOptions.mockResolvedValue(productOptions(packagedProduct));
    mocks.suggestCreditCustomers.mockResolvedValue([{
      id: '70000000-0000-4000-8000-000000000002', name: 'Alif', phone: null,
      nextFollowUpDate: '2099-09-20', outstandingAmount: 100,
    }]);
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'প্যাকেট আটা · ১ কেজি পরিমাণ সিলেক্ট করুন' }));
    fireEvent.click(screen.getByRole('button', { name: 'বিক্রির তালিকায় অ্যাড করুন' }));
    fireEvent.click(screen.getByRole('button', { name: 'বাকি' }));
    fireEvent.change(screen.getByLabelText('ক্রেতার নাম'), { target: { value: 'Ali' } });

    const customerNameInput = screen.getByRole('combobox', { name: 'ক্রেতার নাম' });
    const existingOption = await screen.findByRole('option', { name: 'Alif' });
    const createOption = screen.getByRole('option', { name: /Ali.*নামে নতুন ক্রেতা অ্যাড করুন/ });
    fireEvent.keyDown(customerNameInput, { key: 'ArrowDown' });
    expect(existingOption).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(customerNameInput, { key: 'ArrowDown' });
    expect(createOption).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(customerNameInput, { key: 'Enter' });
    expect(screen.getByText('নতুন ক্রেতা অ্যাড হবে')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'বাকি বিক্রি সম্পন্ন করুন' }));
    await waitFor(() => expect(mocks.createPhysicalSale).toHaveBeenCalledWith(expect.objectContaining({
      paymentMode: 'CREDIT', customerName: 'Ali', creditCustomerId: undefined, createCreditCustomer: true,
    })));
  });

  it('does not offer duplicate creation when the typed name exactly matches a customer', async () => {
    mocks.suggestCreditCustomers.mockResolvedValue([{
      id: '70000000-0000-4000-8000-000000000002', name: '  ALI  ', phone: null,
      nextFollowUpDate: null, outstandingAmount: 0,
    }]);
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'বাকি' }));
    fireEvent.change(screen.getByLabelText('ক্রেতার নাম'), { target: { value: 'ali' } });

    expect(await screen.findByRole('option', { name: /ALI/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /নামে নতুন ক্রেতা অ্যাড করুন/ })).not.toBeInTheDocument();
  });
});
