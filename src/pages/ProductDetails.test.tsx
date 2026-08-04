import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';
import ProductDetails from './ProductDetails';

const mocks = vi.hoisted(() => ({
  addItem: vi.fn(),
  updateQuantity: vi.fn(),
  removeItem: vi.fn(),
}));

const product: Product = {
  id: 'product-1',
  name: 'Premium Miniket Rice',
  slug: 'premium-miniket-rice',
  description: 'Premium rice',
  price: 620,
  categoryId: 'category-1',
  images: [],
  youtubeLinks: [],
  stock: 50,
  featured: true,
  tags: ['rice'],
  defaultVariantId: 'variant-5',
  variants: [
    {
      id: 'variant-5', name: '5 kg', sku: 'NA-RICE-MINI-5KG', sellingPrice: 620,
      availableStock: 30, reservedStock: 0, lowStockThreshold: 5, isDefault: true, isActive: true,
    },
    {
      id: 'variant-10', name: '10 kg', sku: 'NA-RICE-MINI-10KG', sellingPrice: 1180,
      availableStock: 20, reservedStock: 0, lowStockThreshold: 5, isDefault: false, isActive: true,
    },
  ],
};

vi.mock('@/lib/api', () => ({
  getProductBySlug: vi.fn(async () => product),
  getCategories: vi.fn(async () => [{ id: 'category-1', name: 'Rice', slug: 'rice', isActive: true }]),
}));

vi.mock('@/contexts/CartContext', () => ({
  useCart: () => ({
    addItem: mocks.addItem,
    items: [],
    updateQuantity: mocks.updateQuantity,
    removeItem: mocks.removeItem,
  }),
}));

vi.mock('@/components/Navbar', () => ({ default: () => <nav>Navbar</nav> }));
vi.mock('@/components/Footer', () => ({ default: () => <footer>Footer</footer> }));

describe('product variant selection', () => {
  it('uses one variant selector for package, price, SKU, and cart identity', async () => {
    render(
      <MemoryRouter initialEntries={['/products/premium-miniket-rice']}>
        <Routes>
          <Route path="/products/:slug" element={<ProductDetails />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Premium Miniket Rice')).toBeInTheDocument();
    expect(screen.getByText('বিকল্প নির্বাচন করুন')).toBeInTheDocument();
    expect(screen.queryByText(/^Weight:/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '10 kg · ৳1180' }));
    expect(screen.getByText(/10 kg · SKU NA-RICE-MINI-10KG/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'কার্টে যোগ করুন' }));
    await waitFor(() => expect(mocks.addItem).toHaveBeenCalledWith({
      productId: 'product-1',
      productVariantId: 'variant-10',
      productName: 'Premium Miniket Rice',
      variantName: '10 kg',
      sku: 'NA-RICE-MINI-10KG',
      quantity: 1,
      unitPrice: 1180,
    }));
  });
});
