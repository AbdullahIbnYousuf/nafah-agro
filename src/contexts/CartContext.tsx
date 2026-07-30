import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { CartItem } from '@/lib/types';

interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (productId: string, attributes: Record<string, string>) => void;
  updateQuantity: (productId: string, attributes: Record<string, string>, quantity: number) => void;
  clearCart: () => void;
  totalPrice: number;
  totalItems: number;
}

const CartContext = createContext<CartContextType | null>(null);

const CART_KEY = 'nafah-agro-cart';

function getItemKey(productId: string, attrs: Record<string, string>) {
  return `${productId}_${Object.values(attrs).sort().join('_')}`;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const stored = localStorage.getItem(CART_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = useCallback((newItem: CartItem) => {
    setItems(prev => {
      const key = getItemKey(newItem.productId, newItem.selectedAttributes);
      const existing = prev.find(
        i => getItemKey(i.productId, i.selectedAttributes) === key
      );
      if (existing) {
        return prev.map(i =>
          getItemKey(i.productId, i.selectedAttributes) === key
            ? { ...i, quantity: i.quantity + newItem.quantity }
            : i
        );
      }
      return [...prev, newItem];
    });
  }, []);

  const removeItem = useCallback((productId: string, attributes: Record<string, string>) => {
    const key = getItemKey(productId, attributes);
    setItems(prev => prev.filter(i => getItemKey(i.productId, i.selectedAttributes) !== key));
  }, []);

  const updateQuantity = useCallback((productId: string, attributes: Record<string, string>, quantity: number) => {
    const key = getItemKey(productId, attributes);
    if (quantity <= 0) {
      setItems(prev => prev.filter(i => getItemKey(i.productId, i.selectedAttributes) !== key));
      return;
    }
    setItems(prev =>
      prev.map(i =>
        getItemKey(i.productId, i.selectedAttributes) === key ? { ...i, quantity } : i
      )
    );
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const totalPrice = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, clearCart, totalPrice, totalItems }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
