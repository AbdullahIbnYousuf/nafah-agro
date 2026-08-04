import type {
  Category,
  DeliveryRate,
  OrderSource,
  OrderStatus,
  OwnerAccount,
  OwnerManagementState,
  OrdersPage,
  Product,
  ProductsPage,
  ProductVariant,
  PhysicalSale,
  SellingPriceHistoryEntry,
  StockBatch,
  User,
  UnifiedOrder,
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
    public readonly details: Record<string, unknown> = {},
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
    throw new ApiError(message, body?.error?.code ?? 'REQUEST_FAILED', response.status, body?.error?.details ?? {});
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

export function updateMyProfile(input: {
  fullName: string;
  phoneNumber: string;
}): Promise<User> {
  return requestV1<User>('/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function getOwners(): Promise<OwnerManagementState> {
  return requestV1<OwnerManagementState>('/owners');
}

export function inviteOwner(input: {
  fullName: string;
  phoneNumber: string;
  email: string;
}): Promise<OwnerAccount> {
  return requestV1<OwnerAccount>('/owners/invitations', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function setOwnerActive(
  ownerId: string,
  input: { isActive: boolean; reason: string },
): Promise<OwnerAccount> {
  return requestV1<OwnerAccount>(`/owners/${ownerId}/status`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
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

export interface PurchaseItemInput {
  productVariantId: string;
  quantity: number;
  unitBuyingCost: number;
}

export function createPurchase(input: {
  purchaseDate: string;
  note?: string;
  items: PurchaseItemInput[];
}): Promise<{ purchaseGroupId: string; batches: StockBatch[] }> {
  return requestV1<{ purchaseGroupId: string; batches: StockBatch[] }>('/purchases', {
    method: 'POST',
    body: JSON.stringify({
      ...input,
      items: input.items.map((item) => ({ ...item, unitBuyingCost: String(item.unitBuyingCost) })),
    }),
  });
}

export function getStockBatches(productVariantId?: string): Promise<StockBatch[]> {
  const query = new URLSearchParams({ limit: '200' });
  if (productVariantId) query.set('productVariantId', productVariantId);
  return requestV1<StockBatch[]>(`/stock-batches?${query}`);
}

export function adjustStock(input:
  | { direction: 'INCREASE'; productVariantId: string; quantity: number; unitBuyingCost: number; purchaseDate: string; reason: string }
  | { direction: 'DECREASE'; productVariantId: string; quantity: number; reason: string }
): Promise<StockBatch[]> {
  return requestV1<StockBatch[]>('/stock-adjustments', {
    method: 'POST',
    body: JSON.stringify(input.direction === 'INCREASE'
      ? { ...input, unitBuyingCost: String(input.unitBuyingCost) }
      : input),
  });
}

export function createPhysicalSale(input: {
  items: Array<{ productVariantId: string; quantity: number }>;
  customerName?: string;
  customerPhone?: string;
  discountTotal: number;
  confirmUnprofitable?: boolean;
}): Promise<PhysicalSale> {
  return requestV1<PhysicalSale>('/physical-sales', {
    method: 'POST',
    body: JSON.stringify({ ...input, discountTotal: String(input.discountTotal) }),
  });
}

export function getPhysicalSales(limit = 30): Promise<PhysicalSale[]> {
  return requestV1<PhysicalSale[]>(`/physical-sales?limit=${limit}`);
}

export function getDeliveryRates(): Promise<DeliveryRate[]> {
  return requestV1<DeliveryRate[]>('/delivery-rates');
}

export function updateDeliveryRate(
  id: string,
  input: { name?: string; charge?: number | null; isActive?: boolean },
): Promise<DeliveryRate> {
  return requestV1<DeliveryRate>(`/delivery-rates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...input, charge: input.charge == null ? input.charge : String(input.charge) }),
  });
}

export function createWebsiteOrder(input: {
  items: Array<{ productVariantId: string; quantity: number }>;
  customer: { name: string; phone: string; email?: string; address: string };
  deliveryRateId: string;
  idempotencyKey: string;
}): Promise<{ order: UnifiedOrder; replayed: boolean }> {
  return requestV1('/orders/website', { method: 'POST', body: JSON.stringify(input) });
}

export function createManualOrder(input: {
  source: Exclude<OrderSource, 'WEBSITE' | 'PHYSICAL_SHOP'>;
  initialStatus: 'PENDING' | 'CONFIRMED';
  items: Array<{ productVariantId: string; quantity: number }>;
  customer: { name: string; phone: string; email?: string; address: string };
  deliveryRateId: string;
  discountTotal: number;
  confirmUnprofitable?: boolean;
}): Promise<UnifiedOrder> {
  return requestV1('/orders/manual', {
    method: 'POST',
    body: JSON.stringify({ ...input, discountTotal: String(input.discountTotal) }),
  });
}

export function getOrders(filters?: {
  source?: OrderSource;
  status?: OrderStatus;
  orderNumber?: string;
  phone?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}): Promise<OrdersPage> {
  const query = new URLSearchParams();
  Object.entries(filters ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return requestV1<OrdersPage>(`/orders${query.size ? `?${query}` : ''}`);
}

export function getMyOrders(): Promise<UnifiedOrder[]> {
  return requestV1<UnifiedOrder[]>('/orders/my');
}

export function transitionOrder(
  id: string,
  action:
    | { action: 'CONFIRM'; confirmUnprofitable?: boolean }
    | { action: 'PROCESS' }
    | { action: 'DELIVER' }
    | { action: 'CANCEL' | 'FAILED_DELIVERY'; reason: string }
    | { action: 'RETURN'; condition: 'SELLABLE' | 'DAMAGED'; reason: string },
): Promise<UnifiedOrder> {
  return requestV1<UnifiedOrder>(`/orders/${id}/status`, {
    method: 'PATCH', body: JSON.stringify(action),
  });
}

// Cloudinary upload route protected by Supabase OWNER middleware.
export async function uploadImages(files: File[]): Promise<string[]> {
  const form = new FormData();
  files.forEach((file) => form.append('images', file));
  const response = await fetch(`${BASE}/v1/upload/multiple`, {
    method: 'POST',
    body: form,
    headers: await authorizationHeaders(),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? 'Image upload failed');
  return body.urls as string[];
}
