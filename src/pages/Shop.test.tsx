import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Shop from './Shop';

const mocks = vi.hoisted(() => ({
  getProducts: vi.fn(),
  getCategories: vi.fn(),
  getProductTags: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api')>(),
  getProducts: mocks.getProducts,
  getCategories: mocks.getCategories,
  getProductTags: mocks.getProductTags,
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
    mocks.getCategories.mockResolvedValue([{ id: 'category-1', name: 'Rice', slug: 'rice', isActive: true }]);
    mocks.getProductTags.mockResolvedValue(['premium']);
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
    }));
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

    fireEvent.change(screen.getByPlaceholderText('পণ্য খুঁজুন...'), { target: { value: 'milk' } });
    await waitFor(() => expect(screen.getByTestId('location').textContent).toContain('q=milk'), { timeout: 1200 });

    fireEvent.click(screen.getByRole('button', { name: 'পরের পৃষ্ঠা' }));
    await waitFor(() => {
      const location = screen.getByTestId('location').textContent ?? '';
      expect(location).toContain('q=milk');
      expect(location).toContain('page=2');
    });
  });
});
