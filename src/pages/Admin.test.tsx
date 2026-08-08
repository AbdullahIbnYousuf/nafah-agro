import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Admin from './Admin';

const mocks = vi.hoisted(() => ({
  getAdminProducts: vi.fn(),
  getAdminCategories: vi.fn(),
  deleteUnusedProduct: vi.fn(),
  deleteUnusedCategory: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api')>(),
  getAdminProducts: mocks.getAdminProducts,
  getAdminCategories: mocks.getAdminCategories,
  deleteUnusedProduct: mocks.deleteUnusedProduct,
  deleteUnusedCategory: mocks.deleteUnusedCategory,
}));
vi.mock('@/components/AnalyticsDashboard', () => ({ default: () => <div>Analytics</div> }));
vi.mock('@/components/Footer', () => ({ default: () => <footer>Footer</footer> }));

const product = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Unused Product',
  slug: 'unused-product',
  description: '',
  price: 100,
  categoryId: '20000000-0000-4000-8000-000000000001',
  images: [],
  youtubeLinks: [],
  stock: 0,
  featured: false,
  tags: [],
  isActive: true,
  canDelete: true,
  variants: [],
};

describe('safe catalog deletion controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminProducts.mockResolvedValue({ data: [product], total: 1, page: 1, limit: 100, totalPages: 1 });
    mocks.getAdminCategories.mockResolvedValue([
      { id: product.categoryId, name: 'Empty Category', slug: 'empty-category', isActive: true, canDelete: true },
    ]);
    mocks.deleteUnusedProduct.mockResolvedValue({ id: product.id });
    mocks.deleteUnusedCategory.mockResolvedValue({ id: product.categoryId });
  });

  it('closes product deletion without action and submits only after confirmation', async () => {
    render(<MemoryRouter><Admin /></MemoryRouter>);
    fireEvent.click(screen.getAllByRole('button', { name: 'পণ্য' })[0]);

    fireEvent.click(await screen.findByRole('button', { name: 'মুছুন' }));
    expect(screen.getByRole('dialog', { name: 'অব্যবহৃত পণ্য মুছুন' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'বাতিল' }));
    expect(mocks.deleteUnusedProduct).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'মুছুন' }));
    fireEvent.click(screen.getByRole('button', { name: 'স্থায়ীভাবে মুছুন' }));
    await waitFor(() => expect(mocks.deleteUnusedProduct).toHaveBeenCalledWith(product.id));
  });

  it('requires explicit confirmation before deleting an empty category', async () => {
    render(<MemoryRouter><Admin /></MemoryRouter>);
    fireEvent.click(screen.getAllByRole('button', { name: 'ক্যাটাগরি' })[0]);

    fireEvent.click(await screen.findByRole('button', { name: 'মুছুন' }));
    expect(screen.getByRole('dialog', { name: 'খালি ক্যাটাগরি মুছুন' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'স্থায়ীভাবে মুছুন' }));
    await waitFor(() => expect(mocks.deleteUnusedCategory).toHaveBeenCalledWith(product.categoryId));
  });
});
