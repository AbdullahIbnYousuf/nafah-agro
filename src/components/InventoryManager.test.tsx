import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryItem, StockBatch } from '@/lib/types';
import InventoryManager from './InventoryManager';

const mocks = vi.hoisted(() => ({
  adjustStock: vi.fn(),
  createPurchase: vi.fn(),
  getAdminCategories: vi.fn(),
  getInventoryItemBatches: vi.fn(),
  getInventoryItems: vi.fn(),
  getInventoryRecords: vi.fn(),
  getInventorySummary: vi.fn(),
  updateVariant: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api')>(),
  ...mocks,
}));

const rice: InventoryItem = {
  productVariantId: '10000000-0000-4000-8000-000000000001',
  productId: '20000000-0000-4000-8000-000000000001',
  productName: 'মিনিকেট চাল',
  variantName: '৫ কেজি',
  productKind: 'PACKAGED',
  quantityUnit: 'PIECE',
  categoryId: '30000000-0000-4000-8000-000000000001',
  categoryName: 'চাল',
  availableStock: 2,
  reservedStock: 1,
  lowStockThreshold: 5,
  isOperational: true,
  status: 'LOW_STOCK',
  lastStockAddedAt: '2026-09-10',
};

const liveBatch: StockBatch = {
  id: '40000000-0000-4000-8000-000000000001',
  purchaseGroupId: '50000000-0000-4000-8000-000000000001',
  productVariantId: rice.productVariantId,
  productName: rice.productName,
  variantName: rice.variantName,
  productKind: rice.productKind,
  quantityUnit: 'PIECE',
  sku: 'INTERNAL',
  source: 'PURCHASE',
  purchasedQuantity: 10,
  availableQuantity: 2,
  reservedQuantity: 1,
  unitBuyingCost: 300,
  purchaseDate: '2026-09-10',
  note: 'প্রথম চালান',
  adjustmentReason: null,
  variantAvailableStock: 2,
  variantReservedStock: 1,
  createdBy: { fullName: 'Owner', role: 'OWNER' },
  createdAt: '2026-09-10T06:00:00.000Z',
};

function inventoryPage(data: InventoryItem[] = [rice]) {
  return { data, total: data.length, page: 1, limit: 25, totalPages: data.length ? 1 : 0 };
}

function renderInventory(path = '/admin/inventory') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/inventory" element={<InventoryManager />} />
        <Route path="/admin/inventory/purchase" element={<InventoryManager />} />
        <Route path="/admin/inventory/adjustment" element={<InventoryManager />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('streamlined inventory workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.removeItem('nafah_inventory_workspace_v1');
    mocks.getInventorySummary.mockResolvedValue({ totalStockItems: 3, lowStockItems: 1, outOfStockItems: 1, inventoryValue: 1500 });
    mocks.getAdminCategories.mockResolvedValue([{ id: rice.categoryId, name: 'চাল', slug: 'rice', isActive: true }]);
    mocks.getInventoryItems.mockResolvedValue(inventoryPage());
    mocks.getInventoryItemBatches.mockResolvedValue({ data: [liveBatch], total: 1, page: 1, limit: 100, totalPages: 1, hasDepleted: true });
    mocks.getInventoryRecords.mockResolvedValue({
      data: [{
        id: '60000000-0000-4000-8000-000000000001',
        type: 'ADJUSTMENT',
        occurredAt: '2026-09-11T06:00:00.000Z',
        effectiveDate: '2026-09-11',
        note: 'ভাঙা প্যাকেট',
        createdBy: { fullName: 'Owner', role: 'OWNER' },
        items: [{
          productVariantId: rice.productVariantId,
          productName: rice.productName,
          variantName: rice.variantName,
          productKind: rice.productKind,
          quantityUnit: 'PIECE',
          direction: 'DECREASE',
          quantity: 1,
          unitBuyingCost: null,
        }],
      }],
      total: 1,
      page: 1,
      limit: 25,
      totalPages: 1,
    });
    mocks.adjustStock.mockResolvedValue([]);
    mocks.updateVariant.mockResolvedValue({});
  });

  it('shows summary cards and one main row for each stock identity', async () => {
    renderInventory();

    expect(await screen.findByText('মিনিকেট চাল · ৫ কেজি')).toBeInTheDocument();
    const summary = screen.getByRole('region', { name: 'ইনভেন্টরি সারাংশ' });
    expect(within(summary).getByText('মোট স্টক আইটেম')).toBeInTheDocument();
    expect(within(summary).getByText('স্টকের মূল্য')).toBeInTheDocument();
    expect(screen.getAllByText('মিনিকেট চাল · ৫ কেজি')).toHaveLength(1);

    fireEvent.click(within(summary).getByRole('button', { name: /কম স্টক/ }));
    await waitFor(() => expect(mocks.getInventoryItems).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'LOW_STOCK' })));
  });

  it('loads live batches only after expanding a stock row', async () => {
    renderInventory();
    const row = await screen.findByRole('button', { name: /মিনিকেট চাল.*প্যাকেট/ });
    expect(mocks.getInventoryItemBatches).not.toHaveBeenCalled();

    fireEvent.click(row);

    await waitFor(() => expect(mocks.getInventoryItemBatches).toHaveBeenCalledWith(rice.productVariantId, { includeDepleted: false, page: 1, limit: 25 }));
    expect(await screen.findByText('প্রথম চালান')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'রিফ্রেশ' }));
    await waitFor(() => expect(mocks.getInventoryItemBatches).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'আগের স্টক দেখুন' }));
    await waitFor(() => expect(mocks.getInventoryItemBatches).toHaveBeenLastCalledWith(rice.productVariantId, { includeDepleted: true, page: 1, limit: 25 }));
  });

  it('shows adjustment reasons in previous records', async () => {
    renderInventory();
    fireEvent.click(await screen.findByRole('tab', { name: 'আগের রেকর্ড' }));

    expect(await screen.findByText('ভাঙা প্যাকেট')).toBeInTheDocument();
    expect(mocks.getInventoryRecords).toHaveBeenCalledWith(expect.objectContaining({ type: 'ALL' }));
  });

  it('opens a direct adjustment route and confirms the stock effect before saving', async () => {
    renderInventory(`/admin/inventory/adjustment?variant=${rice.productVariantId}`);
    const productSelect = await screen.findByRole('combobox', { name: 'স্টক আপডেটের পণ্য / প্যাক/সাইজ' });
    await waitFor(() => expect(productSelect).toHaveValue(rice.productVariantId));

    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '1' } });
    fireEvent.change(screen.getByPlaceholderText('যেমন: ক্ষতিগ্রস্ত ২ ইউনিট'), { target: { value: 'ভাঙা প্যাকেট' } });
    fireEvent.click(screen.getByRole('button', { name: 'রিভিউ করুন' }));

    expect(await screen.findByRole('heading', { name: 'স্টক আপডেট কনফার্ম করুন' })).toBeInTheDocument();
    expect(screen.getByText('আপডেটের পর')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ফিরে যান' }));
    expect(mocks.adjustStock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'রিভিউ করুন' }));
    fireEvent.click(await screen.findByRole('button', { name: 'কনফার্ম করুন' }));
    await waitFor(() => expect(mocks.adjustStock).toHaveBeenCalledWith(expect.objectContaining({
      direction: 'DECREASE',
      productVariantId: rice.productVariantId,
      amount: '1',
      reason: 'ভাঙা প্যাকেট',
    })));
  });

  it('shows and clears the active stock filters', async () => {
    renderInventory();
    await screen.findByText('মিনিকেট চাল · ৫ কেজি');

    fireEvent.change(screen.getByRole('combobox', { name: 'স্টকের অবস্থা' }), { target: { value: 'LOW_STOCK' } });
    const reset = await screen.findByRole('button', { name: 'ফিল্টার রিসেট' });
    fireEvent.click(reset);

    expect(screen.getByRole('combobox', { name: 'স্টকের অবস্থা' })).toHaveValue('ALL');
    expect(screen.queryByRole('button', { name: 'ফিল্টার রিসেট' })).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.getInventoryItems).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'ALL', sort: 'URGENCY' })));
  });

  it('updates a packaged low-stock limit and closing the dialog does nothing', async () => {
    renderInventory();
    const edit = await screen.findByRole('button', { name: /কম স্টকের লিমিট আপডেট করুন: মিনিকেট চাল/ });
    fireEvent.click(edit);
    expect(screen.getByRole('dialog', { name: 'কম স্টকের লিমিট আপডেট করুন' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'বন্ধ করুন' }));
    expect(mocks.updateVariant).not.toHaveBeenCalled();

    fireEvent.click(edit);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'কম স্টকের লিমিট' }), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'সেভ করুন' }));
    await waitFor(() => expect(mocks.updateVariant).toHaveBeenCalledWith(rice.productVariantId, { lowStockThreshold: 7 }));
  });

  it.each([
    ['LOOSE_WEIGHT', 'GRAM', '1.25', 1250],
    ['LOOSE_VOLUME', 'MILLILITER', '0.75', 750],
  ] as const)('converts %s low-stock limits to exact base units', async (productKind, quantityUnit, value, expected) => {
    const loose = { ...rice, productVariantId: `${productKind}-id`, productKind, quantityUnit, variantName: 'Default', lowStockThreshold: 500 };
    mocks.getInventoryItems.mockResolvedValue(inventoryPage([loose]));
    renderInventory();

    fireEvent.click(await screen.findByRole('button', { name: /কম স্টকের লিমিট আপডেট করুন/ }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'কম স্টকের লিমিট' }), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'সেভ করুন' }));

    await waitFor(() => expect(mocks.updateVariant).toHaveBeenCalledWith(loose.productVariantId, { lowStockThreshold: expected }));
  });

  it('rejects an over-precision measured low-stock limit', async () => {
    const loose = { ...rice, productVariantId: 'weight-id', productKind: 'LOOSE_WEIGHT' as const, quantityUnit: 'GRAM' as const, variantName: 'Default' };
    mocks.getInventoryItems.mockResolvedValue(inventoryPage([loose]));
    renderInventory();

    fireEvent.click(await screen.findByRole('button', { name: /কম স্টকের লিমিট আপডেট করুন/ }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'কম স্টকের লিমিট' }), { target: { value: '1.2345' } });
    fireEvent.click(screen.getByRole('button', { name: 'সেভ করুন' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('দশমিকের পর সর্বোচ্চ ৩ ঘর');
    expect(mocks.updateVariant).not.toHaveBeenCalled();
  });
});
