import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Product } from '@/lib/types';
import ProductDetails from './ProductDetails';

const mocks = vi.hoisted(() => ({
  addItem: vi.fn(),
  updateQuantity: vi.fn(),
  removeItem: vi.fn(),
  toastError: vi.fn(),
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
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));

describe('product pack/size selection', () => {
  it('uses one pack/size selector for package, price, and cart identity without exposing SKU', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/products/premium-miniket-rice', state: { from: '/shop?category=rice&page=2' } }]}>
        <Routes>
          <Route path="/products/:slug" element={<ProductDetails />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Premium Miniket Rice')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'পিছনে যান' })).toHaveAttribute('href', '/shop?category=rice&page=2');
    await waitFor(() => expect(document.title).toBe('Premium Miniket Rice | নাফাহ এগ্রো'));
    expect(screen.getByText('বিকল্প নির্বাচন করুন')).toBeInTheDocument();
    expect(screen.queryByText(/^Weight:/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '5 kg · ৳620' })).toHaveClass('min-h-11');
    expect(screen.getByRole('button', { name: 'কার্টে অ্যাড করুন' })).toHaveClass('min-h-12');

    fireEvent.click(screen.getByRole('button', { name: '10 kg · ৳1180' }));
    expect(screen.getByText(/10 kg। স্টক অর্ডার কনফার্ম করার সময় যাচাই করা হবে/)).toBeInTheDocument();
    expect(screen.queryByText(/SKU/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'কার্টে অ্যাড করুন' }));
    await waitFor(() => expect(mocks.addItem).toHaveBeenCalledWith({
      productId: 'product-1',
      productVariantId: 'variant-10',
      productName: 'Premium Miniket Rice',
      variantName: '10 kg',
      quantity: 1,
      unitPrice: 1180,
      imageUrl: undefined,
    }));
  }, 10_000);

  it('uses the shop as a safe fallback when opened directly', async () => {
    render(
      <MemoryRouter initialEntries={['/products/premium-miniket-rice']}>
        <Routes><Route path="/products/:slug" element={<ProductDetails />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('link', { name: 'পিছনে যান' })).toHaveAttribute('href', '/shop');
  });

  it('shows both egg rates and stores tier data in the cart item', async () => {
    const original = { kind: product.kind, price: product.price, bulkSellingPrice: product.bulkSellingPrice, bulkMinimumQuantity: product.bulkMinimumQuantity, variants: product.variants };
    product.kind = 'EGG';
    product.price = 12;
    product.bulkSellingPrice = 10;
    product.bulkMinimumQuantity = 15;
    product.variants = [{
      ...product.variants![0],
      id: 'egg-variant',
      name: 'Default',
      sellingPrice: 12,
      bulkSellingPrice: 10,
      bulkMinimumQuantity: 15,
    }];
    try {
      render(
        <MemoryRouter initialEntries={['/products/premium-miniket-rice']}>
          <Routes><Route path="/products/:slug" element={<ProductDetails />} /></Routes>
        </MemoryRouter>,
      );
      expect(await screen.findByText('১–১৪টি: ৳12 প্রতি ডিম · ১৫টি বা বেশি: ৳10 প্রতি ডিম')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'কার্টে অ্যাড করুন' }));
      await waitFor(() => expect(mocks.addItem).toHaveBeenCalledWith(expect.objectContaining({
        productVariantId: 'egg-variant',
        productKind: 'EGG',
        unitPrice: 12,
        bulkSellingPrice: 10,
        bulkMinimumQuantity: 15,
      })));
    } finally {
      Object.assign(product, original);
    }
  });

  it('explains why a product without an active pack cannot be purchased', async () => {
    const originalVariants = product.variants;
    product.variants = originalVariants?.map((variant) => ({ ...variant, isActive: false }));
    try {
      render(
        <MemoryRouter initialEntries={['/products/premium-miniket-rice']}>
          <Routes><Route path="/products/:slug" element={<ProductDetails />} /></Routes>
        </MemoryRouter>,
      );
      const addButton = await screen.findByRole('button', { name: 'কার্টে অ্যাড করুন' });
      expect(addButton).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(addButton);
      expect(mocks.toastError).toHaveBeenCalledWith('এই পণ্যের কোনো অ্যাকটিভ প্যাক/সাইজ নেই');
    } finally {
      product.variants = originalVariants;
    }
  });
});
