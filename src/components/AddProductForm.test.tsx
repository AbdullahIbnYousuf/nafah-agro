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
  it('offers an optional pack/size without exposing SKU', () => {
    render(<AddProductForm
      categories={[{ id: 'category-1', name: 'Rice', slug: 'rice', isActive: true }]}
      onClose={vi.fn()}
      onCreated={vi.fn()}
    />);

    expect(screen.getByText('প্যাক/সাইজ (ঐচ্ছিক)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('যেমন: ১ কেজি')).not.toBeRequired();
    expect(screen.queryByText(/SKU/)).not.toBeInTheDocument();
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
    expect(screen.getByText('লো-স্টক সীমা (কেজি)')).toBeInTheDocument();
  });
});
