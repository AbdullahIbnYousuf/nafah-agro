import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UnifiedOrderManager from './UnifiedOrderManager';

const mocks = vi.hoisted(() => ({
  getOrders: vi.fn(),
  getVariantOptions: vi.fn(),
  getAdminDeliveryRates: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...original,
    getOrders: mocks.getOrders,
    getVariantOptions: mocks.getVariantOptions,
    getAdminDeliveryRates: mocks.getAdminDeliveryRates,
  };
});

describe('order list view preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.removeItem('nafah_order_filters_v1');
    mocks.getOrders.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 });
    mocks.getVariantOptions.mockResolvedValue([]);
    mocks.getAdminDeliveryRates.mockResolvedValue([]);
  });

  it('restores safe order filters after refresh', async () => {
    window.sessionStorage.setItem('nafah_order_filters_v1', JSON.stringify({
      source: 'WEBSITE',
      status: 'PENDING',
      orderNumber: 'NA-1001',
      phone: '01300000000',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-31',
    }));

    render(<MemoryRouter><UnifiedOrderManager /></MemoryRouter>);

    await waitFor(() => expect(mocks.getOrders).toHaveBeenCalledWith({
      source: 'WEBSITE',
      status: 'PENDING',
      orderNumber: 'NA-1001',
      phone: '01300000000',
      dateFrom: '2026-07-31T18:00:00.000Z',
      dateTo: '2026-08-31T17:59:59.999Z',
      limit: 100,
    }));
    expect(screen.getByLabelText('অর্ডারের উৎস')).toHaveValue('WEBSITE');
    expect(screen.getByLabelText('অর্ডারের স্ট্যাটাস')).toHaveValue('PENDING');
    expect(screen.getByLabelText('অর্ডার নম্বর')).toHaveValue('NA-1001');
    expect(screen.getByLabelText('গ্রাহকের ফোন')).toHaveValue('01300000000');
  });

  it('shows one editable product total while keeping delivery charge separate', async () => {
    mocks.getAdminDeliveryRates.mockResolvedValue([{ id: 'rate-1', name: 'Bogura', code: 'BOGURA', charge: 80, isActive: true }]);
    render(<MemoryRouter><UnifiedOrderManager /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'ম্যানুয়াল অর্ডার' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'ডেলিভারি চার্জ' })).toBeInTheDocument());
    expect(screen.getByLabelText('মোট পণ্যের দাম (৳)')).toBeInTheDocument();
    expect(screen.queryByLabelText('ছাড়')).not.toBeInTheDocument();
    expect(screen.getByText('গ্রাহকের মোট দাম')).toBeInTheDocument();
  });

});
