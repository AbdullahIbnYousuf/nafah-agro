import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product, SellingPriceHistoryEntry } from '@/lib/types';
import VariantManager from './VariantManager';

const mocks = vi.hoisted(() => ({
  createVariant: vi.fn(),
  updateVariant: vi.fn(),
  changeSellingPrice: vi.fn(),
  bulkChangeSellingPrices: vi.fn(),
  getSellingPriceHistory: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  bulkChangeSellingPrices: mocks.bulkChangeSellingPrices,
  changeSellingPrice: mocks.changeSellingPrice,
  createVariant: mocks.createVariant,
  getSellingPriceHistory: mocks.getSellingPriceHistory,
  updateVariant: mocks.updateVariant,
}));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }));

function product(optionName = '500 g'): Product {
  return {
    id: 'product-1', name: 'Raw Honey', slug: 'raw-honey', description: '',
    price: 500, categoryId: 'category-1', images: [], youtubeLinks: [],
    stock: 0, featured: false, tags: [], kind: 'PACKAGED',
    variants: [{
      id: 'variant-1', name: optionName, sku: 'INTERNAL-SKU', unitLabel: 'ক্যান',
      sellingPrice: 500, availableStock: 0, reservedStock: 0,
      lowStockThreshold: 5, isDefault: true, isActive: true,
    }],
  };
}

function twoPacks() {
  const value = product();
  value.variants!.push({ ...value.variants![0], id: 'variant-2', name: '1 kg', sellingPrice: 900, isDefault: false });
  return value;
}

function StatefulManager({ initial, onUpdated = vi.fn() }: { initial: Product; onUpdated?: (value: Product) => void }) {
  const [value, setValue] = useState(initial);
  return <VariantManager product={value} onClose={vi.fn()} onUpdated={(updated) => { onUpdated(updated); setValue(updated); }} />;
}

function switchTab(name: string) {
  fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0, ctrlKey: false });
}
function prices() { return within(screen.getByRole('tabpanel', { name: 'দাম আপডেট' })); }
function openCreate() {
  switchTab('প্যাক/সাইজ ও সেটিংস');
  fireEvent.click(screen.getByRole('button', { name: 'নতুন প্যাক/সাইজ অ্যাড করুন' }));
  return within(screen.getByLabelText('দাম').closest('form')!);
}

const historyEntry: SellingPriceHistoryEntry = {
  id: 'history-1', previousPrice: 500, newPrice: 550, priceTier: 'REGULAR',
  reason: 'নতুন দাম', changedByProfileId: 'owner-1',
  changedBy: { fullName: 'Owner', role: 'OWNER' }, effectiveAt: '2026-10-12T04:00:00.000Z',
};

describe('price-first pack/size drawer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createVariant.mockResolvedValue(product());
    mocks.changeSellingPrice.mockResolvedValue(product());
    mocks.updateVariant.mockResolvedValue(product());
    mocks.getSellingPriceHistory.mockResolvedValue([]);
    mocks.bulkChangeSellingPrices.mockResolvedValue([twoPacks()]);
  });

  it('opens prices first and keeps creation, metadata, reasons, and history out of the initial view', () => {
    render(<VariantManager product={product()} onClose={vi.fn()} onUpdated={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'প্যাক/সাইজ ও দাম' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'দাম আপডেট' })).toHaveAttribute('aria-selected', 'true');
    expect(prices().getByLabelText('নতুন দাম')).toBeVisible();
    expect(prices().getByText('৳500')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'প্যাক/সাইজের নাম' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'নতুন প্যাক/সাইজ অ্যাড করুন' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'পরিবর্তনের কারণ (ঐচ্ছিক)' })).not.toBeInTheDocument();
    expect(mocks.getSellingPriceHistory).not.toHaveBeenCalled();
    expect(screen.queryByText(/SKU/)).not.toBeInTheDocument();
  });

  it('creates a named pack/size from the collapsed settings form and clears it after success', async () => {
    render(<StatefulManager initial={product()} />);
    const form = openCreate();
    fireEvent.change(form.getByLabelText('প্যাক/সাইজের নাম'), { target: { value: '1 kg' } });
    fireEvent.change(form.getByLabelText('বিক্রির ইউনিট *'), { target: { value: 'বস্তা' } });
    fireEvent.change(form.getByLabelText('দাম'), { target: { value: '900' } });
    expect(form.getByText('পুরো বস্তা একসাথে বিক্রি হবে।')).toBeInTheDocument();
    expect(form.queryByText(/^স্টক:/)).not.toBeInTheDocument();
    fireEvent.click(form.getByRole('button', { name: 'প্যাক/সাইজ অ্যাড করুন' }));
    await waitFor(() => expect(mocks.createVariant).toHaveBeenCalledWith('product-1', {
      name: '1 kg', unitLabel: 'বস্তা', sellingPrice: 900, lowStockThreshold: 5,
      isDefault: false, priceReason: undefined,
    }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'নতুন প্যাক/সাইজ অ্যাড করুন' })).toHaveAttribute('aria-expanded', 'false'));
    fireEvent.click(screen.getByRole('button', { name: 'নতুন প্যাক/সাইজ অ্যাড করুন' }));
    expect(screen.getByLabelText('দাম')).toHaveValue(null);
    expect(within(screen.getByLabelText('দাম').closest('form')!).getByLabelText('প্যাক/সাইজের নাম')).toHaveValue('');
    expect(JSON.stringify(mocks.createVariant.mock.calls)).not.toContain('INTERNAL-SKU');
  });

  it('preserves the unnamed-default guard with guidance and a toast', () => {
    render(<VariantManager product={product('Default')} onClose={vi.fn()} onUpdated={vi.fn()} />);
    const form = openCreate();
    expect(form.getByText(/উপরে থাকা.*প্যাক\/সাইজ দেওয়া হয়নি/)).toBeInTheDocument();
    expect(screen.queryByText('Default')).not.toBeInTheDocument();
    const add = form.getByRole('button', { name: 'প্যাক/সাইজ অ্যাড করুন' });
    expect(add).toHaveAttribute('aria-disabled', 'true');
    expect(add).not.toBeDisabled();
    fireEvent.click(add);
    expect(mocks.toastError).toHaveBeenCalledWith('নতুন প্যাক/সাইজ অ্যাড করার আগে আগেরটির নাম দিন');
    expect(mocks.createVariant).not.toHaveBeenCalled();
  });

  it('saves one selling price without loading history automatically', async () => {
    const updated = product();
    updated.price = 550;
    updated.variants![0].sellingPrice = 550;
    mocks.changeSellingPrice.mockResolvedValue(updated);
    render(<StatefulManager initial={product()} />);
    fireEvent.change(prices().getByLabelText('নতুন দাম'), { target: { value: '550' } });
    fireEvent.click(prices().getByRole('button', { name: 'দাম সেভ করুন' }));
    await waitFor(() => expect(mocks.changeSellingPrice).toHaveBeenCalledWith('variant-1', 550, undefined, undefined));
    expect(await prices().findByText('৳550')).toBeInTheDocument();
    expect(prices().getByLabelText('নতুন দাম')).toHaveValue(null);
    expect(mocks.getSellingPriceHistory).not.toHaveBeenCalled();
  });

  it('keeps price, optional reason, metadata, and creation drafts when switching tabs', () => {
    render(<VariantManager product={product()} onClose={vi.fn()} onUpdated={vi.fn()} />);
    fireEvent.change(prices().getByLabelText('নতুন দাম'), { target: { value: '550' } });
    fireEvent.click(prices().getByRole('button', { name: 'কারণ লিখুন (ঐচ্ছিক)' }));
    fireEvent.change(prices().getByLabelText('পরিবর্তনের কারণ (ঐচ্ছিক)'), { target: { value: 'নতুন চালান' } });
    const form = openCreate();
    fireEvent.change(form.getByLabelText('প্যাক/সাইজের নাম'), { target: { value: '1 kg' } });
    const settings = within(screen.getByRole('tabpanel', { name: 'প্যাক/সাইজ ও সেটিংস' }));
    fireEvent.change(settings.getAllByLabelText('প্যাক/সাইজের নাম')[0], { target: { value: '500 ml' } });
    switchTab('দাম আপডেট');
    expect(prices().getByLabelText('নতুন দাম')).toHaveValue(550);
    expect(prices().getByLabelText('পরিবর্তনের কারণ (ঐচ্ছিক)')).toHaveValue('নতুন চালান');
    switchTab('প্যাক/সাইজ ও সেটিংস');
    expect(settings.getAllByLabelText('প্যাক/সাইজের নাম')[0]).toHaveValue('500 ml');
    expect(settings.getAllByLabelText('প্যাক/সাইজের নাম')[1]).toHaveValue('1 kg');
  });

  it('does not erase an unsaved settings draft after saving a price', async () => {
    const updated = product();
    updated.variants![0].sellingPrice = 550;
    mocks.changeSellingPrice.mockResolvedValue(updated);
    render(<StatefulManager initial={product()} />);
    switchTab('প্যাক/সাইজ ও সেটিংস');
    fireEvent.change(screen.getByRole('textbox', { name: 'প্যাক/সাইজের নাম' }), { target: { value: '500 ml' } });
    switchTab('দাম আপডেট');
    fireEvent.change(prices().getByLabelText('নতুন দাম'), { target: { value: '550' } });
    fireEvent.click(prices().getByRole('button', { name: 'দাম সেভ করুন' }));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('দাম আপডেট হয়েছে'));
    switchTab('প্যাক/সাইজ ও সেটিংস');
    expect(screen.getByRole('textbox', { name: 'প্যাক/সাইজের নাম' })).toHaveValue('500 ml');
  });

  it('keeps entered price and reason with an inline save error', async () => {
    mocks.changeSellingPrice.mockRejectedValue(new Error('Price request failed'));
    render(<VariantManager product={product()} onClose={vi.fn()} onUpdated={vi.fn()} />);
    fireEvent.change(prices().getByLabelText('নতুন দাম'), { target: { value: '550' } });
    fireEvent.click(prices().getByRole('button', { name: 'কারণ লিখুন (ঐচ্ছিক)' }));
    fireEvent.change(prices().getByLabelText('পরিবর্তনের কারণ (ঐচ্ছিক)'), { target: { value: 'নতুন চালান' } });
    fireEvent.click(prices().getByRole('button', { name: 'দাম সেভ করুন' }));
    expect(await prices().findByRole('alert')).toHaveTextContent('Price request failed');
    expect(prices().getByLabelText('নতুন দাম')).toHaveValue(550);
    expect(prices().getByLabelText('পরিবর্তনের কারণ (ঐচ্ছিক)')).toHaveValue('নতুন চালান');
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('shows progress and prevents another submission while saving', async () => {
    let finish!: (value: Product) => void;
    mocks.changeSellingPrice.mockImplementation(() => new Promise<Product>((resolve) => { finish = resolve; }));
    render(<VariantManager product={product()} onClose={vi.fn()} onUpdated={vi.fn()} />);
    fireEvent.change(prices().getByLabelText('নতুন দাম'), { target: { value: '550' } });
    fireEvent.click(prices().getByRole('button', { name: 'দাম সেভ করুন' }));
    const saving = prices().getByRole('button', { name: 'সেভ হচ্ছে' });
    expect(saving).toBeDisabled();
    fireEvent.click(saving);
    expect(mocks.changeSellingPrice).toHaveBeenCalledTimes(1);
    await act(async () => { finish(product()); });
    expect(prices().getByRole('button', { name: 'দাম সেভ করুন' })).toBeEnabled();
  });

  it('keeps a successful price save successful when refreshing open history fails', async () => {
    const updated = product();
    updated.variants![0].sellingPrice = 550;
    mocks.changeSellingPrice.mockResolvedValue(updated);
    mocks.getSellingPriceHistory.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('History unavailable')).mockResolvedValue([historyEntry]);
    render(<StatefulManager initial={product()} />);
    fireEvent.click(prices().getByRole('button', { name: 'আগের রেকর্ড' }));
    await prices().findByText('আগের কোনো রেকর্ড নেই');
    fireEvent.change(prices().getByLabelText('নতুন দাম'), { target: { value: '550' } });
    fireEvent.click(prices().getByRole('button', { name: 'দাম সেভ করুন' }));
    expect(await prices().findByRole('alert')).toHaveTextContent('History unavailable');
    expect(mocks.toastSuccess).toHaveBeenCalledWith('দাম আপডেট হয়েছে');
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(prices().getByLabelText('নতুন দাম')).toHaveValue(null);
    expect(prices().getByText('৳550')).toBeInTheDocument();
    fireEvent.click(prices().getByRole('button', { name: 'রিট্রাই করুন' }));
    expect(await prices().findByText('Owner (OWNER)')).toBeInTheDocument();
    expect(prices().getByRole('button', { name: 'আগের রেকর্ড' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('saves paired egg prices and rejects a bulk rate that is not lower', async () => {
    const eggs = product('Default');
    eggs.kind = 'EGG';
    eggs.variants![0].sellingPrice = 12;
    eggs.variants![0].bulkSellingPrice = 10;
    mocks.changeSellingPrice.mockResolvedValue(eggs);
    render(<VariantManager product={eggs} onClose={vi.fn()} onUpdated={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'সেটিংস' })).toBeInTheDocument();
    expect(prices().getByText('৳12')).toBeInTheDocument();
    expect(prices().getByText('৳10')).toBeInTheDocument();
    fireEvent.change(prices().getByLabelText('নতুন দাম (1–14টি)'), { target: { value: '14' } });
    fireEvent.change(prices().getByLabelText('নতুন দাম (15টি+)'), { target: { value: '14' } });
    fireEvent.click(prices().getByRole('button', { name: 'দাম সেভ করুন' }));
    expect(prices().getByRole('alert')).toHaveTextContent('সাধারণ দামের চেয়ে কম');
    expect(mocks.changeSellingPrice).not.toHaveBeenCalled();
    fireEvent.change(prices().getByLabelText('নতুন দাম (15টি+)'), { target: { value: '11' } });
    fireEvent.click(prices().getByRole('button', { name: 'দাম সেভ করুন' }));
    await waitFor(() => expect(mocks.changeSellingPrice).toHaveBeenCalledWith('variant-1', 14, undefined, 11));
    switchTab('সেটিংস');
    expect(screen.queryByRole('button', { name: 'নতুন প্যাক/সাইজ অ্যাড করুন' })).not.toBeInTheDocument();
  });

  it('keeps bulk editing collapsed and submits only changed prices together', async () => {
    const value = twoPacks();
    render(<VariantManager product={value} onClose={vi.fn()} onUpdated={vi.fn()} />);
    expect(prices().queryByRole('button', { name: 'সব দাম সেভ করুন' })).not.toBeInTheDocument();
    fireEvent.click(prices().getByRole('button', { name: 'একসাথে দাম আপডেট' }));
    fireEvent.change(prices().getByPlaceholderText('বর্তমান ৳500'), { target: { value: '550' } });
    fireEvent.click(prices().getByRole('button', { name: 'সব দাম সেভ করুন' }));
    expect(prices().getByRole('alert')).toHaveTextContent('কমপক্ষে দুইটি');
    expect(mocks.bulkChangeSellingPrices).not.toHaveBeenCalled();
    fireEvent.change(prices().getByPlaceholderText('বর্তমান ৳900'), { target: { value: '950' } });
    fireEvent.click(prices().getByRole('button', { name: 'সব দাম সেভ করুন' }));
    await waitFor(() => expect(mocks.bulkChangeSellingPrices).toHaveBeenCalledWith([
      { variantId: 'variant-1', sellingPrice: 550 }, { variantId: 'variant-2', sellingPrice: 950 },
    ], undefined));
    expect(prices().getByPlaceholderText('বর্তমান ৳500')).toHaveValue(null);
  });

  it('keeps unit-lock explanations and settings mutations in the settings tab', async () => {
    const value = product();
    value.variants![0].canEditUnitLabel = false;
    render(<VariantManager product={value} onClose={vi.fn()} onUpdated={vi.fn()} />);
    switchTab('প্যাক/সাইজ ও সেটিংস');
    const settings = within(screen.getByRole('tabpanel', { name: 'প্যাক/সাইজ ও সেটিংস' }));
    expect(settings.getByLabelText('বিক্রির ইউনিট')).toBeDisabled();
    expect(settings.getByText(/স্টক বা আগের ব্যবসার রেকর্ড থাকায়/)).toBeInTheDocument();
    fireEvent.change(settings.getByLabelText('কম স্টকের লিমিট (ক্যান)'), { target: { value: '7' } });
    fireEvent.click(settings.getByRole('button', { name: 'তথ্য সেভ করুন' }));
    await waitFor(() => expect(mocks.updateVariant).toHaveBeenCalledWith('variant-1', { name: '500 g', unitLabel: 'ক্যান', lowStockThreshold: 7 }));
    await waitFor(() => expect(settings.getByRole('button', { name: 'ইনঅ্যাকটিভ করুন' })).toBeEnabled());
    fireEvent.click(settings.getByRole('button', { name: 'ইনঅ্যাকটিভ করুন' }));
    await waitFor(() => expect(mocks.updateVariant).toHaveBeenCalledWith('variant-1', { isActive: false }));
  });

  it.each(['LOOSE_WEIGHT', 'LOOSE_VOLUME'] as const)('preserves measured limits and excludes pack creation for %s', async (kind) => {
    const value = product('Default');
    value.kind = kind;
    value.variants![0].lowStockThreshold = 500;
    render(<VariantManager product={value} onClose={vi.fn()} onUpdated={vi.fn()} />);
    expect(prices().getByText(kind === 'LOOSE_WEIGHT' ? 'প্রতি কেজি' : 'প্রতি লিটার')).toBeInTheDocument();
    switchTab('সেটিংস');
    expect(screen.queryByRole('button', { name: 'নতুন প্যাক/সাইজ অ্যাড করুন' })).not.toBeInTheDocument();
    const limit = screen.getByLabelText(kind === 'LOOSE_WEIGHT' ? 'কম স্টকের লিমিট (কেজি)' : 'কম স্টকের লিমিট (লিটার)');
    expect(limit).toHaveValue(0.5);
    fireEvent.change(limit, { target: { value: '1.25' } });
    fireEvent.click(screen.getByRole('button', { name: 'তথ্য সেভ করুন' }));
    await waitFor(() => expect(mocks.updateVariant).toHaveBeenCalledWith('variant-1', { lowStockThreshold: 1250 }));
  });

  it('closes through the drawer close action', () => {
    const close = vi.fn();
    render(<VariantManager product={product()} onClose={close} onUpdated={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'বন্ধ করুন' }));
    expect(close).toHaveBeenCalledTimes(1);
    expect(mocks.changeSellingPrice).not.toHaveBeenCalled();
  });
});
