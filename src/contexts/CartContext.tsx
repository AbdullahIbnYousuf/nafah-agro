import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { CartItem } from '@/lib/types';

interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (productVariantId: string) => void;
  updateQuantity: (productVariantId: string, quantity: number) => void;
  clearCart: () => void;
  totalPrice: number;
  totalItems: number;
}

const CartContext = createContext<CartContextType | null>(null);

const CART_KEY = 'nafah-agro-cart';

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const stored = localStorage.getItem(CART_KEY);
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed)
        ? parsed.filter((item): item is CartItem => Boolean(item && typeof item === 'object' && 'productVariantId' in item))
        : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = useCallback((newItem: CartItem) => {
    setItems(prev => {
      const existing = prev.find(i => i.productVariantId === newItem.productVariantId);
      if (existing) {
        return prev.map(i =>
          i.productVariantId === newItem.productVariantId
            ? { ...i, quantity: i.quantity + newItem.quantity }
            : i
        );
      }
      return [...prev, newItem];
    });
  }, []);

  const removeItem = useCallback((productVariantId: string) => {
    setItems(prev => prev.filter(i => i.productVariantId !== productVariantId));
  }, []);

  const updateQuantity = useCallback((productVariantId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems(prev => prev.filter(i => i.productVariantId !== productVariantId));
      return;
    }
    setItems(prev =>
      prev.map(i =>
        i.productVariantId === productVariantId ? { ...i, quantity } : i
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
