import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';
import VariantManager from './VariantManager';

const mocks = vi.hoisted(() => ({
  createVariant: vi.fn(),
  updateVariant: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  bulkChangeSellingPrices: vi.fn(),
  changeSellingPrice: vi.fn(),
  createVariant: mocks.createVariant,
  getSellingPriceHistory: vi.fn(),
  updateVariant: mocks.updateVariant,
}));

vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));

function product(optionName: string): Product {
  return {
    id: 'product-1',
    name: 'Raw Honey',
    slug: 'raw-honey',
    description: '',
    price: 500,
    categoryId: 'category-1',
    images: [],
    youtubeLinks: [],
    stock: 0,
    featured: false,
    tags: [],
    variants: [{
      id: 'variant-1',
      name: optionName,
      sku: 'INTERNAL-SKU',
      sellingPrice: 500,
      availableStock: 0,
      reservedStock: 0,
      lowStockThreshold: 5,
      isDefault: true,
      isActive: true,
    }],
  };
}

describe('pack/size management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createVariant.mockResolvedValue(product('500 g'));
  });

  it('creates a named pack/size without exposing or submitting SKU', async () => {
    render(<VariantManager product={product('500 g')} onClose={vi.fn()} onUpdated={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'প্যাক/সাইজ ও দাম' })).toBeInTheDocument();
    expect(screen.queryByText(/SKU/)).not.toBeInTheDocument();
    fireEvent.change(screen.getAllByPlaceholderText('যেমন: 1 কেজি')[0], { target: { value: '1 kg' } });
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '900' } });
    fireEvent.click(screen.getByRole('button', { name: 'প্যাক/সাইজ অ্যাড করুন' }));

    await waitFor(() => expect(mocks.createVariant).toHaveBeenCalledWith('product-1', {
      name: '1 kg',
      sellingPrice: 900,
      lowStockThreshold: 5,
      isDefault: false,
      priceReason: undefined,
    }));
    expect(JSON.stringify(mocks.createVariant.mock.calls)).not.toContain('INTERNAL-SKU');
  });

  it('hides Default and explains why a second option cannot be added yet', () => {
    render(<VariantManager product={product('Default')} onClose={vi.fn()} onUpdated={vi.fn()} />);

    expect(screen.queryByText('Default')).not.toBeInTheDocument();
    expect(screen.getByText('প্যাক/সাইজ দেওয়া হয়নি')).toBeInTheDocument();
    const addButton = screen.getByRole('button', { name: 'প্যাক/সাইজ অ্যাড করুন' });
    expect(addButton).toHaveAttribute('aria-disabled', 'true');
    expect(addButton).not.toBeDisabled();
    expect(screen.getByText(/আরেকটি প্যাক\/সাইজ অ্যাড করার আগে/)).toBeInTheDocument();
    fireEvent.click(addButton);
    expect(mocks.toastError).toHaveBeenCalledWith('নতুন প্যাক/সাইজ অ্যাড করার আগে আগেরটির নাম দিন');
    expect(mocks.createVariant).not.toHaveBeenCalled();
  });
});
