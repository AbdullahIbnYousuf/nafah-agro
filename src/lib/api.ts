import type {
  Category,
  Order,
  Product,
  ProductsPage,
  ProductVariant,
  SellingPriceHistoryEntry,
  User,
} from './types';
import { frontendEnv } from './env';
import { supabase } from './supabase';

const BASE = frontendEnv.VITE_API_URL;

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function accessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.access_token ?? null;
}

async function authorizationHeaders(explicitToken?: string): Promise<Record<string, string>> {
  const token = explicitToken ?? await accessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options?: RequestInit, explicitToken?: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...await authorizationHeaders(explicitToken),
      ...options?.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message ?? body?.error ?? `Request failed: ${response.status}`;
    throw new ApiError(message, body?.error?.code ?? 'REQUEST_FAILED', response.status);
  }
  return body as T;
}

async function requestV1<T>(path: string, options?: RequestInit, explicitToken?: string): Promise<T> {
  const envelope = await request<ApiEnvelope<T>>(`/v1${path}`, options, explicitToken);
  return envelope.data;
}

export function getCurrentProfile(token: string): Promise<User> {
  return requestV1<User>('/auth/me', undefined, token);
}

export function completeCustomerProfile(
  token: string,
): Promise<User> {
  return requestV1<User>('/auth/complete-customer-profile', {
    method: 'POST',
  }, token);
}

export interface GetProductsParams {
  query?: string;
  category?: string;
  tag?: string;
  featured?: boolean;
  minPrice?: number;
  maxPrice?: number;
  sort?: 'newest' | 'oldest' | 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc';
  page?: number;
  limit?: number;
}

export async function getProducts(params?: GetProductsParams): Promise<ProductsPage> {
  const query = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return requestV1<ProductsPage>(`/products${query.size ? `?${query}` : ''}`);
}

export async function getAdminProducts(params?: GetProductsParams): Promise<ProductsPage> {
  const query = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return requestV1<ProductsPage>(`/admin/products${query.size ? `?${query}` : ''}`);
}

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  try {
    return await requestV1<Product>(`/products/${encodeURIComponent(slug)}`);
  } catch {
    return undefined;
  }
}

export async function createProduct(product: Omit<Product, 'id'>): Promise<Product> {
  return requestV1<Product>('/products', {
    method: 'POST',
    body: JSON.stringify({
      name: product.name,
      slug: product.slug,
      description: product.description,
      categoryId: product.categoryId,
      featured: product.featured,
      tags: product.tags,
      images: product.images,
      youtubeLinks: product.youtubeLinks,
      attributes: product.attributes,
      initialVariant: {
        name: product.variantName || 'Default',
        sku: product.sku,
        sellingPrice: String(product.price),
        lowStockThreshold: 5,
      },
      priceReason: 'Initial selling price',
    }),
  });
}

export async function updateProduct(id: string, data: Partial<Product>): Promise<Product> {
  return requestV1<Product>(`/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: data.name,
      slug: data.slug,
      description: data.description,
      categoryId: data.categoryId,
      featured: data.featured,
      tags: data.tags,
      images: data.images,
      youtubeLinks: data.youtubeLinks,
      attributes: data.attributes,
      isActive: data.isActive,
    }),
  });
}

export async function changeSellingPrice(variantId: string, price: number, reason: string): Promise<Product> {
  return requestV1<Product>(`/variants/${variantId}/selling-price`, {
    method: 'PATCH',
    body: JSON.stringify({ sellingPrice: String(price), reason }),
  });
}

export async function deleteProduct(id: string): Promise<void> {
  await requestV1(`/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive: false }),
  });
}

export function setProductActive(id: string, isActive: boolean): Promise<Product> {
  return updateProduct(id, { isActive });
}

export interface VariantCreateInput {
  name: string;
  sku: string;
  sellingPrice: number;
  lowStockThreshold: number;
  isDefault: boolean;
  priceReason: string;
}

export function createVariant(productId: string, input: VariantCreateInput): Promise<Product> {
  return requestV1<Product>(`/products/${productId}/variants`, {
    method: 'POST',
    body: JSON.stringify({ ...input, sellingPrice: String(input.sellingPrice) }),
  });
}

export function updateVariant(
  variantId: string,
  input: Partial<Pick<ProductVariant, 'name' | 'sku' | 'lowStockThreshold' | 'isDefault' | 'isActive'>>,
): Promise<Product> {
  return requestV1<Product>(`/variants/${variantId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function getSellingPriceHistory(variantId: string): Promise<SellingPriceHistoryEntry[]> {
  return requestV1<SellingPriceHistoryEntry[]>(`/variants/${variantId}/price-history`);
}

export function bulkChangeSellingPrices(
  updates: Array<{ variantId: string; sellingPrice: number }>,
  reason: string,
): Promise<Product[]> {
  return requestV1<Product[]>('/variants/selling-prices/bulk', {
    method: 'POST',
    body: JSON.stringify({
      reason,
      updates: updates.map((update) => ({
        variantId: update.variantId,
        sellingPrice: String(update.sellingPrice),
      })),
    }),
  });
}

export async function getProductTags(): Promise<string[]> {
  const products = await getProducts({ limit: 100 });
  return [...new Set(products.data.flatMap((product) => product.tags))].sort();
}

export function getCategories(): Promise<Category[]> {
  return requestV1<Category[]>('/categories');
}

export function getAdminCategories(): Promise<Category[]> {
  return requestV1<Category[]>('/admin/categories');
}

export function createCategory(category: Omit<Category, 'id'>): Promise<Category> {
  return requestV1<Category>('/categories', {
    method: 'POST',
    body: JSON.stringify(category),
  });
}

export function updateCategory(id: string, data: Partial<Category>): Promise<Category> {
  return requestV1<Category>(`/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteCategory(id: string): Promise<void> {
  await updateCategory(id, { isActive: false });
}

export function setCategoryActive(id: string, isActive: boolean): Promise<Category> {
  return updateCategory(id, { isActive });
}

// Temporary MongoDB order API. Guest POST remains public until the order vertical replaces it.
export function getOrders(): Promise<Order[]> {
  return request<Order[]>('/orders');
}

export function getMyOrders(): Promise<Order[]> {
  return request<Order[]>('/orders/my');
}

export function createOrder(order: Omit<Order, 'id' | 'createdAt'>): Promise<Order> {
  return request<Order>('/orders', { method: 'POST', body: JSON.stringify(order) });
}

export function updateOrderStatus(id: string, status: Order['status']): Promise<Order> {
  return request<Order>(`/orders/${id}/status`, {
    method: 'PATCH', body: JSON.stringify({ status }),
  });
}

export function updateOrderPayment(
  id: string,
  data: { paymentStatus?: string; paymentReference?: string },
): Promise<Order> {
  return request<Order>(`/orders/${id}/payment`, {
    method: 'PATCH', body: JSON.stringify(data),
  });
}

export function updateOrderDelivery(
  id: string,
  data: { deliveryTeam?: string; deliveryRider?: string; deliveryNotes?: string },
): Promise<Order> {
  return request<Order>(`/orders/${id}/delivery`, {
    method: 'PATCH', body: JSON.stringify(data),
  });
}

// Temporary Cloudinary upload route, now protected by Supabase OWNER/ADMIN middleware.
export async function uploadImages(files: File[]): Promise<string[]> {
  const form = new FormData();
  files.forEach((file) => form.append('images', file));
  const response = await fetch(`${BASE}/upload/multiple`, {
    method: 'POST',
    body: form,
    headers: await authorizationHeaders(),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? 'Image upload failed');
  return body.urls as string[];
}
