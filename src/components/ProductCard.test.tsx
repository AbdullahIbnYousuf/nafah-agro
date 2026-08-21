import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Product } from '@/lib/types';
import ProductCard from './ProductCard';

const product: Product = {
  id: 'product-1', name: 'Rice', slug: 'rice', description: '', price: 100,
  categoryId: 'category-1', images: [], youtubeLinks: [], stock: 0,
  featured: false, tags: [],
};

function DestinationProbe() {
  const location = useLocation();
  return <div>{String((location.state as { from?: string } | null)?.from)}</div>;
}

describe('ProductCard routing', () => {
  it('preserves the filtered shop URL as the product return destination', () => {
    render(
      <MemoryRouter initialEntries={['/shop?category=rice&page=2']}>
        <Routes>
          <Route path="/shop" element={<ProductCard product={product} />} />
          <Route path="/products/:slug" element={<DestinationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('link', { name: /Rice/ }));
    expect(screen.getByText('/shop?category=rice&page=2')).toBeInTheDocument();
  });

  it('prioritizes only cards explicitly marked as initially visible', () => {
    const imageProduct = { ...product, images: ['https://example.com/rice.jpg'] };
    render(<MemoryRouter><ProductCard product={imageProduct} priority /></MemoryRouter>);
    expect(screen.getByRole('img', { name: 'Rice' })).toHaveAttribute('loading', 'eager');
    expect(screen.getByRole('img', { name: 'Rice' })).toHaveAttribute('fetchpriority', 'high');
  });
});
