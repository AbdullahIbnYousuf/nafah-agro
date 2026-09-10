import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
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
  setProductActive: vi.fn(),
  setCategoryActive: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api')>(),
  getAdminProducts: mocks.getAdminProducts,
  getAdminProduct: mocks.getAdminProduct,
  getAdminCategories: mocks.getAdminCategories,
  deleteUnusedProduct: mocks.deleteUnusedProduct,
  deleteUnusedCategory: mocks.deleteUnusedCategory,
  setProductActive: mocks.setProductActive,
  setCategoryActive: mocks.setCategoryActive,
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
  images: ['https://example.com/unused-product.jpg'],
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
    mocks.setProductActive.mockResolvedValue({ ...product, isActive: false });
    mocks.setCategoryActive.mockResolvedValue({ id: product.categoryId, name: 'Empty Category', slug: 'empty-category', isActive: false, canDelete: true });
  });

  function renderAdmin(path: string) {
    return render(
      <TooltipProvider><MemoryRouter initialEntries={[path]}>
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
      </MemoryRouter></TooltipProvider>,
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

  it('shows product thumbnails, customer URLs, and confirms state changes', async () => {
    let resolveChange!: (value: typeof product) => void;
    mocks.setProductActive.mockImplementationOnce(() => new Promise((resolve) => { resolveChange = resolve; }));
    renderAdmin('/admin/products');

    expect(await screen.findByRole('img', { name: 'Unused Product পণ্যের ছবি' })).toHaveAttribute('src', product.images[0]);
    expect(screen.getByRole('link', { name: /গ্রাহক পেজ/ })).toHaveAttribute('href', '/products/unused-product');
    expect(screen.getByText('পণ্য সক্রিয়')).toBeInTheDocument();
    expect(screen.getByText('দোকানে দেখা যাচ্ছে')).toBeInTheDocument();
    expect(screen.queryByText(/SKU/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'প্যাক/সাইজ ও দাম' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'Unused Product সক্রিয় অবস্থা' }));
    expect(screen.getByRole('dialog', { name: 'পণ্য নিষ্ক্রিয় করুন' })).toHaveTextContent('স্টক, দাম, অর্ডার ও ইতিহাস মুছে যাবে না');
    expect(mocks.setProductActive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'নিষ্ক্রিয় করুন' }));
    await waitFor(() => expect(mocks.setProductActive).toHaveBeenCalledWith(product.id, false));
    expect(screen.getByRole('switch', { name: 'Unused Product সক্রিয় অবস্থা', hidden: true })).toBeDisabled();
    expect(screen.getByLabelText('অবস্থা সংরক্ষণ হচ্ছে')).toBeInTheDocument();
    await act(async () => resolveChange({ ...product, isActive: false }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Unused Product সক্রিয় অবস্থা' })).not.toBeChecked());
  });

  it('explains when an active product is hidden by its inactive category', async () => {
    mocks.getAdminCategories.mockResolvedValueOnce([
      { id: product.categoryId, name: 'Hidden Category', slug: 'hidden-category', isActive: false, canDelete: false },
    ]);

    renderAdmin('/admin/products');

    const note = await screen.findByRole('button', { name: 'গ্রাহক পেজ লুকানো' });
    expect(screen.queryByText('দোকানে দেখা যাচ্ছে না: ক্যাটাগরি নিষ্ক্রিয়')).not.toBeInTheDocument();
    fireEvent.focus(note);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('পণ্যটি সক্রিয়, কিন্তু এর ক্যাটাগরি নিষ্ক্রিয়।');
    expect(screen.getByRole('tooltip')).toHaveTextContent('ক্যাটাগরি পেজ থেকে সুইচ চালু করলে পণ্যটি আবার দোকানে দেখা যাবে।');
    expect(screen.getByRole('tooltip')).toHaveTextContent('নতুন করে পণ্য তৈরি বা সক্রিয় করার দরকার নেই।');
    fireEvent.blur(note);
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
    expect(screen.queryByRole('link', { name: /গ্রাহক পেজ/ })).not.toBeInTheDocument();
  });

  it('warns that activation does not override an inactive category', async () => {
    const inactiveProduct = { ...product, isActive: false };
    mocks.getAdminProducts.mockResolvedValueOnce({ data: [inactiveProduct], total: 1, page: 1, limit: 100, totalPages: 1 });
    mocks.getAdminCategories.mockResolvedValueOnce([
      { id: product.categoryId, name: 'Hidden Category', slug: 'hidden-category', isActive: false, canDelete: false },
    ]);
    mocks.setProductActive.mockResolvedValueOnce({ ...product, isActive: true });

    renderAdmin('/admin/products');

    fireEvent.click(await screen.findByRole('switch', { name: 'Unused Product সক্রিয় অবস্থা' }));
    const dialog = screen.getByRole('dialog', { name: 'পণ্য সক্রিয় করুন' });
    expect(dialog).toHaveTextContent('Unused Product সক্রিয় হবে, তবে ক্যাটাগরি নিষ্ক্রিয় থাকায় দোকানে দেখা যাবে না');
    expect(mocks.setProductActive).not.toHaveBeenCalled();
  });

  it('marks loose products as physical-shop-only instead of offering a customer page', async () => {
    mocks.getAdminProducts.mockResolvedValueOnce({
      data: [{ ...product, kind: 'LOOSE_WEIGHT' }],
      total: 1,
      page: 1,
      limit: 100,
      totalPages: 1,
    });

    renderAdmin('/admin/products');

    expect(await screen.findByText('খোলা ওজন')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /গ্রাহক পেজ/ })).not.toBeInTheDocument();
    expect(screen.queryByText('গ্রাহক পেজ লুকানো')).not.toBeInTheDocument();
  });

  it('shows the category customer URL and affected products before changing state', async () => {
    renderAdmin('/admin/categories');

    expect(await screen.findByRole('link', { name: /এই ক্যাটাগরির পণ্য দেখুন/ })).toHaveAttribute('href', '/shop?category=empty-category');
    fireEvent.click(screen.getByRole('switch', { name: 'Empty Category সক্রিয় অবস্থা' }));
    const dialog = await screen.findByRole('dialog', { name: 'ক্যাটাগরি নিষ্ক্রিয় করুন' });
    expect(dialog).toHaveTextContent('Unused Product');
    expect(dialog).toHaveTextContent('সব পণ্য গ্রাহকের দোকান থেকে লুকানো হবে');
    expect(mocks.getAdminProducts).toHaveBeenCalledWith({ category: 'empty-category', limit: 100 });
    expect(mocks.setCategoryActive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'নিষ্ক্রিয় করুন' }));
    await waitFor(() => expect(mocks.setCategoryActive).toHaveBeenCalledWith(product.categoryId, false));
  });

  it('explains that an inactive category temporarily hides its active products', async () => {
    mocks.getAdminCategories.mockResolvedValueOnce([
      { id: product.categoryId, name: 'Hidden Category', slug: 'hidden-category', isActive: false, canDelete: false },
    ]);

    renderAdmin('/admin/categories');

    expect(await screen.findByText('Hidden Category')).toBeInTheDocument();
    expect(screen.getByText('গ্রাহকের দোকানে লুকানো')).toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /এই ক্যাটাগরির পণ্য দেখুন/ })).not.toBeInTheDocument();
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
