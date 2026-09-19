import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  setProductVisibleInShop: vi.fn(),
  setCategoryActive: vi.fn(),
  setCategoryVisibleInShop: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api')>(),
  getAdminProducts: mocks.getAdminProducts,
  getAdminProduct: mocks.getAdminProduct,
  getAdminCategories: mocks.getAdminCategories,
  deleteUnusedProduct: mocks.deleteUnusedProduct,
  deleteUnusedCategory: mocks.deleteUnusedCategory,
  setProductActive: mocks.setProductActive,
  setProductVisibleInShop: mocks.setProductVisibleInShop,
  setCategoryActive: mocks.setCategoryActive,
  setCategoryVisibleInShop: mocks.setCategoryVisibleInShop,
}));
vi.mock('@/components/AnalyticsDashboard', () => ({ default: () => <div>Analytics</div> }));
vi.mock('@/components/AddProductForm', () => ({
  default: ({ editProduct, onClose }: { editProduct?: { name: string }; onClose: () => void }) => <div role="dialog"><span>{editProduct ? `Edit ${editProduct.name}` : 'Create product'}</span><button onClick={onClose}>Close product form</button></div>,
}));
vi.mock('@/components/VariantManager', () => ({
  default: ({ product, onClose }: { product: { name: string }; onClose: () => void }) => <div role="dialog"><span>{`Variants ${product.name}`}</span><button onClick={onClose}>Close variants</button></div>,
}));
vi.mock('@/components/Footer', () => ({ default: () => <footer>Footer</footer> }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));

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
  isVisibleInShop: true,
  canDelete: true,
  variants: [],
};

describe('safe catalog deletion controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.removeItem('nafah_admin_product_filters_v1');
    mocks.getAdminProducts.mockResolvedValue({ data: [product], total: 1, page: 1, limit: 100, totalPages: 1 });
    mocks.getAdminProduct.mockResolvedValue(product);
    mocks.getAdminCategories.mockResolvedValue([
      { id: product.categoryId, name: 'Empty Category', slug: 'empty-category', isActive: true, isVisibleInShop: true, canDelete: true },
    ]);
    mocks.deleteUnusedProduct.mockResolvedValue({ id: product.id });
    mocks.deleteUnusedCategory.mockResolvedValue({ id: product.categoryId });
    mocks.setProductActive.mockResolvedValue({ ...product, isActive: false });
    mocks.setProductVisibleInShop.mockResolvedValue({ ...product, isVisibleInShop: false });
    mocks.setCategoryActive.mockResolvedValue({ id: product.categoryId, name: 'Empty Category', slug: 'empty-category', isActive: false, isVisibleInShop: true, canDelete: true });
    mocks.setCategoryVisibleInShop.mockResolvedValue({ id: product.categoryId, name: 'Empty Category', slug: 'empty-category', isActive: true, isVisibleInShop: false, canDelete: true });
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

  it('explains why used products and non-empty categories cannot be deleted', async () => {
    mocks.getAdminProducts.mockResolvedValue({ data: [{ ...product, canDelete: false }], total: 1, page: 1, limit: 100, totalPages: 1 });
    mocks.getAdminCategories.mockResolvedValue([
      { id: product.categoryId, name: 'Used Category', slug: 'used-category', isActive: true, isVisibleInShop: true, canDelete: false },
    ]);

    const productView = renderAdmin('/admin/products');
    fireEvent.click(await screen.findByRole('button', { name: 'মুছুন' }));
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('তাই এটি মুছতে পারবেন না'));
    expect(mocks.deleteUnusedProduct).not.toHaveBeenCalled();
    productView.unmount();

    renderAdmin('/admin/categories');
    fireEvent.click(await screen.findByRole('button', { name: 'মুছুন' }));
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('এই ক্যাটাগরিতে পণ্য আছে'));
    expect(mocks.deleteUnusedCategory).not.toHaveBeenCalled();
  });

  it('shows product thumbnails, customer URLs, and confirms state changes', async () => {
    let resolveChange!: (value: typeof product) => void;
    mocks.setProductActive.mockImplementationOnce(() => new Promise((resolve) => { resolveChange = resolve; }));
    renderAdmin('/admin/products');

    expect(await screen.findByRole('img', { name: 'Unused Product পণ্যের ছবি' })).toHaveAttribute('src', product.images[0]);
    expect(screen.getByRole('link', { name: /গ্রাহক পেজ/ })).toHaveAttribute('href', '/products/unused-product');
    expect(screen.getAllByText('অ্যাকটিভ').length).toBeGreaterThan(0);
    expect(screen.getAllByText('শো').length).toBeGreaterThan(0);
    expect(screen.queryByText(/SKU/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'প্যাক/সাইজ ও দাম' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'Unused Product অ্যাকটিভ' }));
    expect(screen.getByRole('dialog', { name: 'Unused Product ইনঅ্যাকটিভ করুন' })).toHaveTextContent('আগের তথ্য মুছে যাবে না');
    expect(mocks.setProductActive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'ইনঅ্যাকটিভ করুন' }));
    await waitFor(() => expect(mocks.setProductActive).toHaveBeenCalledWith(product.id, false));
    expect(screen.getByRole('switch', { name: 'Unused Product অ্যাকটিভ', hidden: true })).toBeDisabled();
    expect(screen.getByLabelText('পরিবর্তন হচ্ছে')).toBeInTheDocument();
    await act(async () => resolveChange({ ...product, isActive: false }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Unused Product অ্যাকটিভ' })).not.toBeChecked());
  });

  it('hides a packaged product online without making it inactive', async () => {
    renderAdmin('/admin/products');

    fireEvent.click(await screen.findByRole('switch', { name: 'Unused Product অনলাইন শপ' }));
    expect(screen.getByRole('dialog', { name: 'Unused Product হাইড করুন' })).toHaveTextContent('স্টক অ্যাড, ইনভেন্টরি ও দোকানের বিক্রিতে ব্যবহার করা যাবে');
    fireEvent.click(screen.getByRole('button', { name: 'হাইড করুন' }));

    await waitFor(() => expect(mocks.setProductVisibleInShop).toHaveBeenCalledWith(product.id, false));
    expect(mocks.setProductActive).not.toHaveBeenCalled();
  });

  it('filters products consistently without moving a changed product to another row', async () => {
    const secondProduct = {
      ...product,
      id: '10000000-0000-4000-8000-000000000002',
      name: 'Second Product',
      slug: 'second-product',
    };
    mocks.getAdminProducts.mockResolvedValueOnce({ data: [product, secondProduct], total: 2, page: 1, limit: 100, totalPages: 1 });
    mocks.setProductActive.mockResolvedValueOnce({ ...product, isActive: false });
    renderAdmin('/admin/products');

    expect(await screen.findByRole('region', { name: 'পণ্যের ফিল্টার' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Unused Product অ্যাকটিভ' }));
    fireEvent.click(screen.getByRole('button', { name: 'ইনঅ্যাকটিভ করুন' }));
    await waitFor(() => expect(mocks.setProductActive).toHaveBeenCalledWith(product.id, false));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Unused Product ইনঅ্যাকটিভ করুন' })).not.toBeInTheDocument());
    expect(screen.getByRole('switch', { name: 'Unused Product অ্যাকটিভ' })).not.toBeChecked();

    let rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('Unused Product')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Second Product')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('পণ্যের অ্যাকটিভ স্ট্যাটাস'), { target: { value: 'INACTIVE' } });
    rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('Unused Product')).toBeInTheDocument();
    expect(screen.queryByText('Second Product')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'ফিল্টার রিসেট' }));
    expect(screen.getByText('Second Product')).toBeInTheDocument();
  });

  it('explains when an active product is hidden by its inactive category', async () => {
    mocks.getAdminCategories.mockResolvedValueOnce([
      { id: product.categoryId, name: 'Hidden Category', slug: 'hidden-category', isActive: false, isVisibleInShop: true, canDelete: false },
    ]);

    renderAdmin('/admin/products');

    const note = await screen.findByRole('button', { name: 'গ্রাহক পেজ লুকানো' });
    fireEvent.focus(note);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('পণ্যটির ক্যাটাগরি ইনঅ্যাকটিভ');
    expect(screen.getByRole('tooltip')).toHaveTextContent('ক্যাটাগরি পেজ থেকে ক্যাটাগরিটি অ্যাকটিভ করলে');
    fireEvent.blur(note);
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
    expect(screen.queryByRole('link', { name: /গ্রাহক পেজ/ })).not.toBeInTheDocument();
  });

  it('blocks individual activation until the parent category is active', async () => {
    const inactiveProduct = { ...product, isActive: false };
    mocks.getAdminProducts.mockResolvedValueOnce({ data: [inactiveProduct], total: 1, page: 1, limit: 100, totalPages: 1 });
    mocks.getAdminCategories.mockResolvedValueOnce([
      { id: product.categoryId, name: 'Hidden Category', slug: 'hidden-category', isActive: false, isVisibleInShop: true, canDelete: false },
    ]);
    mocks.setProductActive.mockResolvedValueOnce({ ...product, isActive: true });

    renderAdmin('/admin/products');

    const activeSwitch = await screen.findByRole('switch', { name: 'Unused Product অ্যাকটিভ' });
    expect(activeSwitch).toBeEnabled();
    expect(screen.getByText('Unused Product').closest('td')).toHaveClass('opacity-60');
    expect(activeSwitch.closest('td')).not.toHaveClass('opacity-60');
    expect(screen.queryByText('আগে ক্যাটাগরি অ্যাকটিভ করুন')).not.toBeInTheDocument();
    fireEvent.click(activeSwitch);
    expect(mocks.toastError).toHaveBeenCalledWith('প্রথমে ক্যাটাগরিটি অ্যাকটিভ করুন');
    expect(mocks.setProductActive).not.toHaveBeenCalled();
  });

  it('explains category activation only when its Show switch is pressed', async () => {
    mocks.getAdminCategories.mockResolvedValueOnce([
      { id: product.categoryId, name: 'Inactive Category', slug: 'inactive-category', isActive: false, isVisibleInShop: true, canDelete: false },
    ]);

    renderAdmin('/admin/categories');

    const showSwitch = await screen.findByRole('switch', { name: 'Inactive Category অনলাইন শপ' });
    expect(showSwitch).toBeEnabled();
    expect(screen.getByText('Inactive Category').parentElement).toHaveClass('opacity-60');
    expect(showSwitch.parentElement).not.toHaveClass('opacity-60');
    expect(screen.queryByText('আগে ক্যাটাগরি অ্যাকটিভ করুন')).not.toBeInTheDocument();
    fireEvent.click(showSwitch);
    expect(mocks.toastError).toHaveBeenCalledWith('প্রথমে ক্যাটাগরিটি অ্যাকটিভ করুন');
    expect(mocks.setCategoryVisibleInShop).not.toHaveBeenCalled();
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
    expect(screen.getByRole('switch', { name: 'Unused Product অ্যাকটিভ' })).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Unused Product অনলাইন শপ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /গ্রাহক পেজ/ })).not.toBeInTheDocument();
    expect(screen.queryByText('গ্রাহক পেজ লুকানো')).not.toBeInTheDocument();
  });

  it('shows the category customer URL and affected products before changing state', async () => {
    renderAdmin('/admin/categories');

    expect(await screen.findByRole('link', { name: /এই ক্যাটাগরির পণ্য দেখুন/ })).toHaveAttribute('href', '/shop?category=empty-category');
    fireEvent.click(screen.getByRole('switch', { name: 'Empty Category অ্যাকটিভ' }));
    const dialog = await screen.findByRole('dialog', { name: 'Empty Category ইনঅ্যাকটিভ করুন' });
    expect(dialog).toHaveTextContent('Unused Product');
    expect(dialog).toHaveTextContent('নতুন স্টক অ্যাড, স্টক আপডেট ও বিক্রিতে বন্ধ হবে');
    expect(mocks.getAdminProducts).toHaveBeenCalledWith({ category: 'empty-category', limit: 100 });
    expect(mocks.setCategoryActive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'ইনঅ্যাকটিভ করুন' }));
    await waitFor(() => expect(mocks.setCategoryActive).toHaveBeenCalledWith(product.categoryId, false));
  });

  it('hides a category online without changing its active state', async () => {
    renderAdmin('/admin/categories');

    fireEvent.click(await screen.findByRole('switch', { name: 'Empty Category অনলাইন শপ' }));
    const dialog = await screen.findByRole('dialog', { name: 'Empty Category হাইড করুন' });
    expect(dialog).toHaveTextContent('স্টক অ্যাড, ইনভেন্টরি ও দোকানের বিক্রিতে কোনো পরিবর্তন হবে না');
    fireEvent.click(screen.getByRole('button', { name: 'হাইড করুন' }));

    await waitFor(() => expect(mocks.setCategoryVisibleInShop).toHaveBeenCalledWith(product.categoryId, false));
    expect(mocks.setCategoryActive).not.toHaveBeenCalled();
  });

  it('explains that an inactive category temporarily hides its active products', async () => {
    mocks.getAdminCategories.mockResolvedValueOnce([
      { id: product.categoryId, name: 'Hidden Category', slug: 'hidden-category', isActive: false, isVisibleInShop: true, canDelete: false },
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
