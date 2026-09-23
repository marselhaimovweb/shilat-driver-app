import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { storage } from '../lib/storage';

export interface CartLine {
  productId: number;
  quantity: number;
}

interface CartContextValue {
  lines: CartLine[];
  count: number;
  add(productId: number, quantity?: number): void;
  setQuantity(productId: number, quantity: number): void;
  remove(productId: number): void;
  clear(): void;
}

const KEY = 'carwash.cart';
const CartContext = createContext<CartContextValue | null>(null);

/** Shopping cart, kept on the device between app launches. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

  useEffect(() => {
    storage.get(KEY).then((raw) => raw && setLines(JSON.parse(raw))).catch(() => undefined);
  }, []);

  const save = useCallback((next: CartLine[]) => {
    setLines(next);
    storage.set(KEY, JSON.stringify(next)).catch(() => undefined);
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      count: lines.reduce((s, l) => s + l.quantity, 0),
      add(productId, quantity = 1) {
        const existing = lines.find((l) => l.productId === productId);
        save(existing ? lines.map((l) => (l.productId === productId ? { ...l, quantity: Math.min(50, l.quantity + quantity) } : l)) : [...lines, { productId, quantity }]);
      },
      setQuantity(productId, quantity) {
        save(quantity <= 0 ? lines.filter((l) => l.productId !== productId) : lines.map((l) => (l.productId === productId ? { ...l, quantity: Math.min(50, quantity) } : l)));
      },
      remove(productId) {
        save(lines.filter((l) => l.productId !== productId));
      },
      clear() {
        save([]);
      },
    }),
    [lines, save],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
