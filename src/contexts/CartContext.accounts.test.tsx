import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import type { CartItem } from '@/lib/types';
import { CartProvider, useCart } from './CartContext';

const mocks = vi.hoisted(() => ({
  auth: { user: null as { id: string } | null, loading: false, sessionError: null as string | null, session: null as { access_token: string } | null },
  get: vi.fn(), merge: vi.fn(), mutate: vi.fn(), preview: vi.fn(),
}));
vi.mock('./AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/lib/api', () => ({
  getAccountCart: mocks.get, mergeGuestCart: mocks.merge, mutateAccountCart: mocks.mutate, previewCart: mocks.preview,
  ApiError: class extends Error { constructor(message: string, public code: string, public status: number) { super(message); } },
}));
const item: CartItem = { productId: 'p', productVariantId: 'v', productName: 'Rice', variantName: '', unitPrice: 100, quantity: 1 };
function Probe() {
  const cart = useCart();
  return <><output data-testid="names">{cart.items.map(line => line.productName + ':' + line.quantity).join(',')}</output><output data-testid="state">{cart.loading ? 'loading' : 'ready'}</output><p>{cart.error}</p><button onClick={() => void cart.refresh().catch(() => undefined)}>retry</button><button onClick={() => void cart.addItem(item).catch(() => undefined)}>add</button></>;
}
const View = () => <CartProvider><Probe /></CartProvider>;
function login(id: string) { mocks.auth.user = { id }; mocks.auth.session = { access_token: 'token-' + id }; }
describe('account cart isolation and reliability', () => {
  beforeEach(() => {
    vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear();
    mocks.auth.user = null; mocks.auth.session = null; mocks.auth.loading = false; mocks.auth.sessionError = null;
    mocks.get.mockResolvedValue({ revision: 0, items: [] });
    mocks.merge.mockResolvedValue({ revision: 1, items: [item] });
    mocks.preview.mockImplementation(async items => items);
  });
  it('merges a legacy guest cart once and preserves it until the merge succeeds', async () => {
    localStorage.setItem('nafah-agro-cart', JSON.stringify([item])); login('A');
    let resolve!: (value: unknown) => void;
    mocks.merge.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    render(<View />);
    await waitFor(() => expect(mocks.merge).toHaveBeenCalledOnce());
    expect(localStorage.getItem('nafah-agro-cart')).toContain('Rice');
    expect(screen.getByTestId('names')).toBeEmptyDOMElement();
    await act(async () => resolve({ revision: 1, items: [item] }));
    expect(screen.getByTestId('names')).toHaveTextContent('Rice:1');
    expect(localStorage.getItem('nafah-agro-cart')).toBe('[]');
    fireEvent.click(screen.getByText('retry'));
    await waitFor(() => expect(mocks.get).toHaveBeenCalled());
    expect(mocks.merge).toHaveBeenCalledOnce();
  });
  it('retries a failed merge with the same key, but never merges it into a different account', async () => {
    localStorage.setItem('nafah-agro-cart', JSON.stringify([item])); login('A');
    mocks.merge.mockRejectedValueOnce(new Error('network failed'));
    const view = render(<View />);
    await screen.findByText('network failed');
    const firstKey = mocks.merge.mock.calls[0][1];
    login('B'); view.rerender(<View />);
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('token-B', expect.anything()));
    expect(mocks.merge).toHaveBeenCalledOnce();
    login('A'); view.rerender(<View />);
    await waitFor(() => expect(mocks.merge).toHaveBeenCalledTimes(2));
    expect(mocks.merge.mock.calls[1][1]).toBe(firstKey);
  });
  it('immediately hides old account items on switching and ignores late responses', async () => {
    login('A'); mocks.get.mockResolvedValueOnce({ revision: 1, items: [item] });
    const view = render(<View />);
    await waitFor(() => expect(screen.getByTestId('names')).toHaveTextContent('Rice'));
    let resolve!: (value: unknown) => void;
    mocks.get.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    fireEvent.click(screen.getByText('retry'));
    login('B'); mocks.get.mockResolvedValueOnce({ revision: 2, items: [{ ...item, productName: 'Honey' }] }); view.rerender(<View />);
    expect(screen.getByTestId('names')).not.toHaveTextContent('Rice');
    await waitFor(() => expect(screen.getByTestId('names')).toHaveTextContent('Honey'));
    await act(async () => resolve({ revision: 3, items: [item] }));
    expect(screen.getByTestId('names')).toHaveTextContent('Honey');
  });
  it('does not copy account carts to guest storage on logout', async () => {
    login('A'); mocks.get.mockResolvedValueOnce({ revision: 1, items: [item] });
    const view = render(<View />); await waitFor(() => expect(screen.getByTestId('names')).toHaveTextContent('Rice'));
    mocks.auth.user = null; mocks.auth.session = null; view.rerender(<View />);
    expect(screen.getByTestId('names')).toBeEmptyDOMElement();
    expect(localStorage.getItem('nafah-agro-cart')).toBeNull();
  });
  it('never shows a guest cart while a retained session is unresolved', () => {
    localStorage.setItem('nafah-agro-cart', JSON.stringify([item])); mocks.auth.session = { access_token: 'token' }; mocks.auth.sessionError = 'offline';
    render(<View />); expect(screen.getByTestId('names')).toBeEmptyDOMElement(); expect(screen.getByTestId('state')).toHaveTextContent('loading'); expect(mocks.preview).not.toHaveBeenCalled();
  });
  it('keeps saved items after mutation errors and refreshes conflicts instead of overwriting', async () => {
    login('A'); mocks.get.mockResolvedValue({ revision: 3, items: [item] });
    mocks.mutate.mockRejectedValueOnce(new Error('save failed'));
    render(<View />); await waitFor(() => expect(screen.getByTestId('names')).toHaveTextContent('Rice:1'));
    fireEvent.click(screen.getByText('add')); await screen.findByText('save failed');
    expect(screen.getByTestId('names')).toHaveTextContent('Rice:1');
    mocks.mutate.mockRejectedValueOnce(new ApiError('conflict', 'CART_CONFLICT', 409));
    mocks.get.mockResolvedValueOnce({ revision: 4, items: [{ ...item, quantity: 2 }] });
    fireEvent.click(screen.getByText('add')); await waitFor(() => expect(screen.getByTestId('names')).toHaveTextContent('Rice:2'));
    expect(mocks.mutate).toHaveBeenLastCalledWith('token-A', 3, 'ADD', item);
  });
});
