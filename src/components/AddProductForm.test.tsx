import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AddProductForm from './AddProductForm';

vi.mock('@/lib/api', () => ({
  createProduct: vi.fn(),
  changeProductKind: vi.fn(),
  getProductTags: vi.fn(() => new Promise<string[]>(() => undefined)),
  updateProduct: vi.fn(),
  uploadImages: vi.fn(),
}));

describe('product creation form', () => {
  it('keeps initial pack/size, SKU, and slug management out of product creation', () => {
    render(<AddProductForm
      categories={[{ id: 'category-1', name: 'Rice', slug: 'rice', isActive: true }]}
      onClose={vi.fn()}
      onCreated={vi.fn()}
    />);

    expect(screen.queryByText('প্যাক/সাইজ (ঐচ্ছিক)')).not.toBeInTheDocument();
    expect(screen.queryByText('একাধিক প্যাক/সাইজ থাকলে এখানে প্রথমটির নাম দিন।')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('যেমন: ১ কেজি')).not.toBeInTheDocument();
    expect(screen.queryByText(/SKU/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('স্লাগ (URL)')).not.toBeInTheDocument();
    expect(screen.queryByText(/^URL:/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'পণ্য সেভ করুন' })).not.toHaveClass('bg-secondary');
  });

  it('uses a rate and stock threshold instead of pack/size for loose products', () => {
    render(<AddProductForm
      categories={[{ id: 'category-1', name: 'Rice', slug: 'rice', isActive: true }]}
      onClose={vi.fn()}
      onCreated={vi.fn()}
    />);

    fireEvent.change(screen.getByLabelText('পণ্যের ধরন *'), { target: { value: 'LOOSE_WEIGHT' } });

    expect(screen.queryByText('প্যাক/সাইজ (ঐচ্ছিক)')).not.toBeInTheDocument();
    expect(screen.getByText('প্রতি কেজি বিক্রির দাম (টাকা) *')).toBeInTheDocument();
    expect(screen.getByText('কম স্টকের লিমিট (কেজি)')).toBeInTheDocument();
  });
});
