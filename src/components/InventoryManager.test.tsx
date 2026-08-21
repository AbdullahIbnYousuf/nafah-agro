import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product, ProductKind } from '@/lib/types';
import InventoryManager from './InventoryManager';

const mocks = vi.hoisted(() => ({
  adjustStock: vi.fn(),
  createPurchase: vi.fn(),
  getAdminProducts: vi.fn(),
  getStockBatches: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api')>(),
  adjustStock: mocks.adjustStock,
  createPurchase: mocks.createPurchase,
  getAdminProducts: mocks.getAdminProducts,
  getStockBatches: mocks.getStockBatches,
}));

function product(input: {
  id: string;
  name: string;
  kind: ProductKind;
  availableStock: number;
  lowStockThreshold: number;
  productActive?: boolean;
  variantActive?: boolean;
}): Product {
  return {
    id: input.id,
    name: input.name,
    slug: input.id,
    description: '',
    kind: input.kind,
    price: 100,
    categoryId: '50000000-0000-4000-8000-000000000001',
    images: [],
    youtubeLinks: [],
    stock: input.availableStock,
    featured: false,
    tags: [],
    isActive: input.productActive ?? true,
    variants: [{
      id: `variant-${input.id}`,
      name: input.kind === 'PACKAGED' ? '১ কেজি' : 'Default',
      sku: `INTERNAL-${input.id}`,
      sellingPrice: 100,
      availableStock: input.availableStock,
      reservedStock: 0,
      lowStockThreshold: input.lowStockThreshold,
      isDefault: true,
      isActive: input.variantActive ?? true,
    }],
  };
}

const outOfStock = product({ id: 'rice', name: 'প্যাকেট চাল', kind: 'PACKAGED', availableStock: 0, lowStockThreshold: 5 });
const lowWeight = product({ id: 'lentil', name: 'খোলা ডাল', kind: 'LOOSE_WEIGHT', availableStock: 2_000, lowStockThreshold: 5_000 });
const normalVolume = product({ id: 'oil', name: 'খোলা তেল', kind: 'LOOSE_VOLUME', availableStock: 8_000, lowStockThreshold: 5_000 });
const inactiveProduct = product({ id: 'inactive-product', name: 'বন্ধ পণ্য', kind: 'PACKAGED', availableStock: 0, lowStockThreshold: 5, productActive: false });
const inactiveVariant = product({ id: 'inactive-variant', name: 'বন্ধ প্যাক', kind: 'PACKAGED', availableStock: 0, lowStockThreshold: 5, variantActive: false });

function page(data: Product[]) {
  return { data, total: data.length, page: 1, limit: 100, totalPages: 1 };
}

describe('inventory stock alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminProducts.mockResolvedValue(page([outOfStock, lowWeight, normalVolume, inactiveProduct, inactiveVariant]));
    mocks.getStockBatches.mockResolvedValue([]);
  });

  it('classifies active variants and formats piece, weight, and threshold quantities', async () => {
    render(<InventoryManager />);

    const alerts = await screen.findByRole('region', { name: 'স্টক সতর্কতা' });
    expect(within(alerts).getByRole('button', { name: 'সব (2)' })).toHaveAttribute('aria-pressed', 'true');
    const packagedAlert = within(alerts).getByText('প্যাকেট চাল · ১ কেজি').closest('div.grid');
    expect(packagedAlert).not.toBeNull();
    expect(within(alerts).getByText('খোলা ডাল')).toBeInTheDocument();
    expect(within(packagedAlert as HTMLElement).getByText(/বর্তমান স্টক:/)).toHaveTextContent('০ ইউনিট');
    expect(within(alerts).getByText('সতর্কতার সীমা: ৫ ইউনিট')).toBeInTheDocument();
    expect(within(alerts).getByText('সতর্কতার সীমা: ৫ কেজি')).toBeInTheDocument();
    expect(within(alerts).queryByText('খোলা তেল')).not.toBeInTheDocument();
    expect(within(alerts).queryByText('বন্ধ পণ্য')).not.toBeInTheDocument();
    expect(within(alerts).queryByText('বন্ধ প্যাক · ১ কেজি')).not.toBeInTheDocument();

    fireEvent.click(within(alerts).getByRole('button', { name: 'কম স্টক (1)' }));
    expect(within(alerts).queryByText('প্যাকেট চাল · ১ কেজি')).not.toBeInTheDocument();
    expect(within(alerts).getByText('খোলা ডাল')).toBeInTheDocument();
  });

  it('adds an alert to the first empty purchase row and focuses it without duplicates', async () => {
    render(<InventoryManager />);
    const alerts = await screen.findByRole('region', { name: 'স্টক সতর্কতা' });
    const outOfStockRow = within(alerts).getByText('প্যাকেট চাল · ১ কেজি').closest('div.grid');
    expect(outOfStockRow).not.toBeNull();

    fireEvent.click(within(outOfStockRow as HTMLElement).getByRole('button', { name: 'ক্রয়ে যোগ করুন' }));

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'ক্রয়ের পণ্য / প্যাক/সাইজ 1' })).toHaveValue('variant-rice'));
    await waitFor(() => expect(document.getElementById('purchase-row-0')).toHaveFocus());
    expect(within(alerts).getByRole('button', { name: 'ক্রয় ফর্মে দেখুন' })).toBeInTheDocument();

    fireEvent.click(within(alerts).getByRole('button', { name: 'ক্রয় ফর্মে দেখুন' }));
    expect(screen.getAllByRole('combobox', { name: /ক্রয়ের পণ্য \/ প্যাক\/সাইজ/ })).toHaveLength(1);
    await waitFor(() => expect(document.getElementById('purchase-row-0')).toHaveFocus());
  });

  it('removes alerts when refreshed catalog stock is healthy', async () => {
    mocks.getAdminProducts
      .mockResolvedValueOnce(page([outOfStock]))
      .mockResolvedValueOnce(page([{ ...outOfStock, stock: 10, variants: [{ ...outOfStock.variants![0], availableStock: 10 }] }]));
    render(<InventoryManager />);
    const alerts = await screen.findByRole('region', { name: 'স্টক সতর্কতা' });
    expect(within(alerts).getByText('প্যাকেট চাল · ১ কেজি')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'রিফ্রেশ' }));

    const refreshedAlerts = await screen.findByRole('region', { name: 'স্টক সতর্কতা' });
    expect(await within(refreshedAlerts).findByText('এখন কোনো স্টক সতর্কতা নেই।')).toBeInTheDocument();
    expect(within(refreshedAlerts).getByRole('button', { name: 'সব (0)' })).toBeInTheDocument();
  });
});
