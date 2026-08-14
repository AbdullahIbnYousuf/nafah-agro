import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Admin, {
  AdminCategories,
  AdminDashboard,
  AdminProductCreate,
  AdminProductEdit,
  AdminProducts,
  AdminProductVariants,
} from './Admin';

const mocks = vi.hoisted(() => ({
  getAdminProducts: vi.fn(),
  getAdminProduct: vi.fn(),
  getAdminCategories: vi.fn(),
  deleteUnusedProduct: vi.fn(),
  deleteUnusedCategory: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api')>(),
  getAdminProducts: mocks.getAdminProducts,
  getAdminProduct: mocks.getAdminProduct,
  getAdminCategories: mocks.getAdminCategories,
  deleteUnusedProduct: mocks.deleteUnusedProduct,
  deleteUnusedCategory: mocks.deleteUnusedCategory,
}));
vi.mock('@/components/AnalyticsDashboard', () => ({ default: () => <div>Analytics</div> }));
vi.mock('@/components/AddProductForm', () => ({
  default: ({ editProduct, onClose }: { editProduct?: { name: string }; onClose: () => void }) => <div role="dialog"><span>{editProduct ? `Edit ${editProduct.name}` : 'Create product'}</span><button onClick={onClose}>Close product form</button></div>,
}));
vi.mock('@/components/VariantManager', () => ({
  default: ({ product, onClose }: { product: { name: string }; onClose: () => void }) => <div role="dialog"><span>{`Variants ${product.name}`}</span><button onClick={onClose}>Close variants</button></div>,
}));
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
    mocks.getAdminProduct.mockResolvedValue(product);
    mocks.getAdminCategories.mockResolvedValue([
      { id: product.categoryId, name: 'Empty Category', slug: 'empty-category', isActive: true, canDelete: true },
    ]);
    mocks.deleteUnusedProduct.mockResolvedValue({ id: product.id });
    mocks.deleteUnusedCategory.mockResolvedValue({ id: product.categoryId });
  });

  function renderAdmin(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin" element={<Admin />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="products" element={<AdminProducts />}>
              <Route path="new" element={<AdminProductCreate />} />
              <Route path=":productId/edit" element={<AdminProductEdit />} />
              <Route path=":productId/variants" element={<AdminProductVariants />} />
            </Route>
            <Route path="categories" element={<AdminCategories />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  }

  it('closes product deletion without action and submits only after confirmation', async () => {
    renderAdmin('/admin/products');

    fireEvent.click(await screen.findByRole('button', { name: 'মুছুন' }));
    expect(screen.getByRole('dialog', { name: 'অব্যবহৃত পণ্য মুছুন' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'বাতিল' }));
    expect(mocks.deleteUnusedProduct).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'মুছুন' }));
    fireEvent.click(screen.getByRole('button', { name: 'স্থায়ীভাবে মুছুন' }));
    await waitFor(() => expect(mocks.deleteUnusedProduct).toHaveBeenCalledWith(product.id));
  }, 10_000);

  it('requires explicit confirmation before deleting an empty category', async () => {
    renderAdmin('/admin/categories');

    fireEvent.click(await screen.findByRole('button', { name: 'মুছুন' }));
    expect(screen.getByRole('dialog', { name: 'খালি ক্যাটাগরি মুছুন' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'স্থায়ীভাবে মুছুন' }));
    await waitFor(() => expect(mocks.deleteUnusedCategory).toHaveBeenCalledWith(product.categoryId));
  });

  it('opens product workflows from direct URLs and closes back to the list', async () => {
    renderAdmin(`/admin/products/${product.id}/edit`);
    expect(await screen.findByText('Edit Unused Product')).toBeInTheDocument();
    expect(mocks.getAdminProduct).toHaveBeenCalledWith(product.id);
    fireEvent.click(screen.getByRole('button', { name: 'Close product form' }));
    await waitFor(() => expect(screen.queryByText('Edit Unused Product')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'পণ্য' })).toBeInTheDocument();
  });

  it('keeps the products navigation active on a nested variant URL', async () => {
    renderAdmin(`/admin/products/${product.id}/variants`);
    expect(await screen.findByText('Variants Unused Product')).toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: 'পণ্য' })) {
      expect(link).toHaveAttribute('aria-current', 'page');
    }
  });

  it('redirects the canonical admin entry to the dashboard', async () => {
    renderAdmin('/admin');
    expect(await screen.findByText('Analytics')).toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: 'ড্যাশবোর্ড' })) {
      expect(link).toHaveAttribute('aria-current', 'page');
    }
  });
});
