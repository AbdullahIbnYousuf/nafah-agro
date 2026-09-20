import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Shop from './Shop';

const mocks = vi.hoisted(() => ({
  getProducts: vi.fn(),
  getStorefrontFilters: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api')>(),
  getProducts: mocks.getProducts,
  getStorefrontFilters: mocks.getStorefrontFilters,
}));
vi.mock('@/components/Navbar', () => ({ default: () => <nav>Navbar</nav> }));
vi.mock('@/components/Footer', () => ({ default: () => <footer>Footer</footer> }));
vi.mock('@/components/ProductCard', () => ({ default: ({ product }: { product: { name: string } }) => <div>{product.name}</div> }));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderShop(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/shop" element={<><Shop /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('shop URL filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStorefrontFilters.mockResolvedValue({
      categories: [{ id: 'category-1', name: 'Rice', slug: 'rice', isActive: true }],
      tags: ['premium'],
    });
    mocks.getProducts.mockResolvedValue({ data: [], total: 0, page: 1, limit: 12, totalPages: 3 });
  });

  it('loads valid filters and pagination from a shareable URL', async () => {
    renderShop('/shop?q=miniket&category=rice&tag=premium&featured=1&sort=price_asc&page=2');

    await waitFor(() => expect(mocks.getProducts).toHaveBeenCalledWith({
      limit: 12,
      page: 2,
      sort: 'price_asc',
      query: 'miniket',
      category: 'rice',
      tag: 'premium',
      featured: true,
    }, expect.any(AbortSignal)));
    expect(screen.getByDisplayValue('miniket')).toBeInTheDocument();
  });

  it('removes invalid URL filter values safely', async () => {
    renderShop('/shop?category=missing&tag=wrong&featured=false&sort=wrong&page=zero');
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/shop'));
  });

  it('writes debounced search and pagination into the URL', async () => {
    mocks.getProducts.mockResolvedValue({
      data: [{ id: 'product-1', name: 'Milk' }], total: 25, page: 1, limit: 12, totalPages: 3,
    });
    renderShop('/shop');

    fireEvent.change(screen.getByPlaceholderText('পণ্য সার্চ করুন...'), { target: { value: 'milk' } });
    await waitFor(() => expect(screen.getByTestId('location').textContent).toContain('q=milk'), { timeout: 1200 });

    fireEvent.click(screen.getByRole('button', { name: 'পরের পেজ' }));
    await waitFor(() => {
      const location = screen.getByTestId('location').textContent ?? '';
      expect(location).toContain('q=milk');
      expect(location).toContain('page=2');
    });
  });

  it('shows a stable loading grid while products are pending', async () => {
    mocks.getProducts.mockReturnValue(new Promise(() => undefined));
    renderShop('/shop');
    expect(screen.getByLabelText('পণ্য লোড হচ্ছে')).toBeInTheDocument();
  });

  it('shows a retry action after a product request fails', async () => {
    mocks.getProducts
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 12, totalPages: 0 });
    renderShop('/shop');

    expect(await screen.findByText(/পণ্য লোড করা যায়নি/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /রিট্রাই করুন/ }));
    await waitFor(() => expect(mocks.getProducts).toHaveBeenCalledTimes(2));
  });

  it('cancels the obsolete product request when filters change', async () => {
    mocks.getProducts.mockReturnValue(new Promise(() => undefined));
    renderShop('/shop');
    await waitFor(() => expect(mocks.getProducts).toHaveBeenCalledOnce());
    const firstSignal = mocks.getProducts.mock.calls[0][1] as AbortSignal;

    fireEvent.change(screen.getByPlaceholderText('পণ্য সার্চ করুন...'), { target: { value: 'rice' } });
    await waitFor(() => expect(mocks.getProducts.mock.calls.length).toBeGreaterThan(1), { timeout: 1200 });
    expect(firstSignal.aborted).toBe(true);
  });
});
