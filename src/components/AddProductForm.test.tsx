import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AddProductForm from './AddProductForm';

vi.mock('@/lib/api', () => ({
  createProduct: vi.fn(),
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
});
