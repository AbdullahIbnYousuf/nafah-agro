import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CartItem } from '@/lib/types';
import { CartProvider, useCart } from './CartContext';

const oldCartItem: CartItem = {
  productId: 'product-1',
  productVariantId: 'variant-1',
  productName: 'Rice',
  variantName: '5 kg',
  quantity: 1,
  unitPrice: 500,
};

function CartProbe() {
  const { items, addItem } = useCart();
  return <div>
    <span>{items.map((item) => `${item.productName}:${item.imageUrl ?? 'no-image'}`).join(',')}</span>
    <button onClick={() => addItem({ ...oldCartItem, productVariantId: 'variant-2', imageUrl: 'https://example.com/rice.jpg' })}>
      add image item
    </button>
  </div>;
}

describe('cart persistence compatibility', () => {
  beforeEach(() => window.localStorage.clear());

  it('restores old saved cart items that do not contain a thumbnail', () => {
    window.localStorage.setItem('nafah-agro-cart', JSON.stringify([oldCartItem]));
    render(<CartProvider><CartProbe /></CartProvider>);
    expect(screen.getByText('Rice:no-image')).toBeInTheDocument();
  });

  it('stores thumbnails with newly added cart items', async () => {
    render(<CartProvider><CartProbe /></CartProvider>);
    act(() => screen.getByText('add image item').click());
    await waitFor(() => expect(window.localStorage.getItem('nafah-agro-cart')).toContain('https://example.com/rice.jpg'));
  });
});
