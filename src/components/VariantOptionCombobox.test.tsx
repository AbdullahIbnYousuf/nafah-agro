import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VariantOption } from '@/lib/types';
import VariantOptionCombobox from './VariantOptionCombobox';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

const mocks = vi.hoisted(() => ({
  getVariantOption: vi.fn(),
  getVariantOptions: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api')>(),
  getVariantOption: mocks.getVariantOption,
  getVariantOptions: mocks.getVariantOptions,
}));

const rice: VariantOption = {
  productId: '10000000-0000-4000-8000-000000000001',
  productVariantId: '20000000-0000-4000-8000-000000000001',
  productName: 'মিনিকেট চাল',
  variantName: '৫ কেজি',
  productKind: 'PACKAGED',
  quantityUnit: 'PIECE',
  availableStock: 8,
  reservedStock: 2,
  sellingPrice: 550,
  bulkSellingPrice: null,
  bulkMinimumQuantity: null,
  isOperational: true,
};

describe('async variant option combobox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getVariantOptions.mockResolvedValue([rice]);
    mocks.getVariantOption.mockResolvedValue(rice);
  });

  it('loads the first ten options before typing and selects with the keyboard', async () => {
    const onSelect = vi.fn();
    render(<VariantOptionCombobox context="INVENTORY" ariaLabel="পণ্য" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('combobox', { name: 'পণ্য' }));
    await waitFor(() => expect(mocks.getVariantOptions).toHaveBeenCalledWith(
      { context: 'INVENTORY', q: '', limit: 10 },
      expect.any(AbortSignal),
    ));
    expect(await screen.findByText('স্টক 8 ইউনিট')).toBeInTheDocument();

    const search = screen.getByRole('combobox', { name: 'পণ্য সার্চ' });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(rice);
  });

  it('debounces server search and explains disabled zero-stock results', async () => {
    const empty = { ...rice, availableStock: 0 };
    mocks.getVariantOptions.mockResolvedValue([empty]);
    render(<VariantOptionCombobox
      context="PHYSICAL_SALE"
      ariaLabel="পণ্য"
      onSelect={vi.fn()}
      disabledReason={(option) => option.availableStock <= 0 ? 'এই পণ্যের স্টক নেই।' : undefined}
    />);

    fireEvent.click(screen.getByRole('combobox', { name: 'পণ্য' }));
    const search = screen.getByRole('combobox', { name: 'পণ্য সার্চ' });
    fireEvent.change(search, { target: { value: 'মিনি' } });

    await waitFor(() => expect(mocks.getVariantOptions).toHaveBeenLastCalledWith(
      { context: 'PHYSICAL_SALE', q: 'মিনি', limit: 10 },
      expect.any(AbortSignal),
    ));
    const option = await screen.findByRole('option');
    expect(option).toHaveAttribute('aria-disabled', 'true');
    expect(option).toHaveTextContent('এই পণ্যের স্টক নেই।');
  });

  it('restores a selected option by id after direct navigation', async () => {
    const onSelect = vi.fn();
    render(<VariantOptionCombobox
      context="INVENTORY"
      ariaLabel="পণ্য"
      selectedId={rice.productVariantId}
      onSelect={onSelect}
    />);

    await waitFor(() => expect(mocks.getVariantOption).toHaveBeenCalledWith(
      rice.productVariantId,
      'INVENTORY',
      expect.any(AbortSignal),
    ));
    expect(onSelect).toHaveBeenCalledWith(rice);
  });
});
