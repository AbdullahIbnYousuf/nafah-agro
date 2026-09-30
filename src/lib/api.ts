import type {
  Category,
  CustomerPromotionCandidate,
  CreditSalesPage,
  CreditCustomer,
  CreditCustomersPage,
  CreditCustomerSuggestion,
  CreditSaleState,
  CreditSummary,
  AmountUnit,
  AnalyticsDashboardData,
  AnalyticsPreset,
  DeliveryRate,
  OrderSource,
  OrderStatus,
  OwnerAccount,
  OwnerManagementState,
  OrdersPage,
  Product,
  ProductKind,
  ProductsPage,
  ProductVariant,
  PhysicalSale,
  SellingPriceHistoryEntry,
  StockBatch,
  InventoryBatchesPage,
  InventoryItemsPage,
  InventoryRecordsPage,
  InventorySummary,
  User,
  UnifiedOrder,
} from './types';
import { supabase } from './supabase';

const BASE = '/api';
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

interface ApiRequestInit extends RequestInit {
  auth?: boolean;
  timeoutMs?: number;
}

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

export function apiErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error?: unknown }).error;
    if (error && typeof error === 'object') {
      const details = 'details' in error && error.details && typeof error.details === 'object'
        ? error.details as { issues?: unknown }
        : undefined;
      if (Array.isArray(details?.issues)) {
        const issues = details.issues.flatMap((issue) => {
          if (!issue || typeof issue !== 'object' || !('message' in issue) || typeof issue.message !== 'string') return [];
          const path = 'path' in issue && Array.isArray(issue.path) && issue.path.length > 0
            ? `${issue.path.join('.')}: `
            : '';
          return [`${path}${issue.message}`];
        });
        if (issues.length > 0) return issues.join(' ');
      }
      if ('message' in error && typeof error.message === 'string') return error.message;
    }
    if (typeof error === 'string') return error;
  }
  return `Request failed: ${status}`;
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

async function request<T>(path: string, options: ApiRequestInit = {}, explicitToken?: string): Promise<T> {
  const {
    auth = true,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    signal: externalSignal,
    ...fetchOptions
  } = options;
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const cancel = () => controller.abort();
  externalSignal?.addEventListener('abort', cancel, { once: true });

  try {
    const response = await fetch(`${BASE}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? await authorizationHeaders(explicitToken) : {}),
        ...fetchOptions.headers,
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = apiErrorMessage(body, response.status);
      throw new ApiError(message, body?.error?.code ?? 'REQUEST_FAILED', response.status, body?.error?.details ?? {});
    }
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (timedOut) {
      throw new ApiError('Request timed out. Please try again.', 'REQUEST_TIMEOUT', 408);
    }
    if (externalSignal?.aborted) {
      throw new ApiError('Request cancelled.', 'REQUEST_CANCELLED', 0);
    }
    throw new ApiError('Network request failed. Check your connection and try again.', 'NETWORK_ERROR', 0);
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', cancel);
  }
}

async function requestV1<T>(path: string, options?: ApiRequestInit, explicitToken?: string): Promise<T> {
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

export function customerPromotionCandidate(error: ApiError): CustomerPromotionCandidate | null {
  const details = error.details;
  if (error.code !== 'CUSTOMER_EMAIL_EXISTS'
    || typeof details.customerProfileId !== 'string'
    || typeof details.fullName !== 'string'
    || typeof details.email !== 'string'
    || typeof details.isActive !== 'boolean'
    || (details.phoneNumber !== null && typeof details.phoneNumber !== 'string')) return null;
  return {
    customerProfileId: details.customerProfileId,
    fullName: details.fullName,
    phoneNumber: typeof details.phoneNumber === 'string' ? details.phoneNumber : null,
    email: details.email,
    isActive: details.isActive,
  };
}

export function promoteCustomerToOwner(input: {
  customerProfileId: string;
  reason: string;
}): Promise<OwnerAccount> {
  return requestV1<OwnerAccount>('/owners/promotions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function demoteOwnerToCustomer(
  ownerId: string,
  input: { reason: string },
): Promise<{ id: string; role: 'CUSTOMER' }> {
  return requestV1<{ id: string; role: 'CUSTOMER' }>(`/owners/${ownerId}/demotion`, {
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

export function deleteUnusedOwner(ownerId: string): Promise<{ id: string }> {
  return requestV1<{ id: string }>(`/owners/${ownerId}`, {
    method: 'DELETE',
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

export async function getProducts(params?: GetProductsParams, signal?: AbortSignal): Promise<ProductsPage> {
  const query = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return requestV1<ProductsPage>(`/products${query.size ? `?${query}` : ''}`, { auth: false, signal });
}

export async function getAdminProducts(params?: GetProductsParams): Promise<ProductsPage> {
  const query = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return requestV1<ProductsPage>(`/admin/products${query.size ? `?${query}` : ''}`);
}

export function getAdminProduct(id: string): Promise<Product> {
  return requestV1<Product>(`/admin/products/${encodeURIComponent(id)}`);
}

export function getVariantOptions(input: {
  q?: string;
  context: import('./types').VariantOptionContext;
  limit?: number;
}, signal?: AbortSignal): Promise<import('./types').VariantOption[]> {
  const query = new URLSearchParams({ context: input.context });
  if (input.q?.trim()) query.set('q', input.q.trim());
  if (input.limit) query.set('limit', String(input.limit));
  return requestV1<import('./types').VariantOption[]>(`/admin/variant-options?${query}`, { signal });
}

export function getVariantOption(
  id: string,
  context: import('./types').VariantOptionContext,
  signal?: AbortSignal,
): Promise<import('./types').VariantOption> {
  const query = new URLSearchParams({ context });
  return requestV1<import('./types').VariantOption>(`/admin/variant-options/${encodeURIComponent(id)}?${query}`, { signal });
}

export async function getProductBySlug(slug: string, signal?: AbortSignal): Promise<Product | undefined> {
  try {
    return await requestV1<Product>(`/products/${encodeURIComponent(slug)}`, { auth: false, signal });
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
      kind: product.kind ?? 'PACKAGED',
      featured: product.featured,
      tags: product.tags,
      images: product.images,
      youtubeLinks: product.youtubeLinks,
      initialVariant: {
        name: product.variantName?.trim() ?? '',
        unitLabel: product.kind === 'PACKAGED' ? product.unitLabel : undefined,
        sellingPrice: String(product.price),
        bulkSellingPrice: product.kind === 'EGG' && product.bulkSellingPrice != null
          ? String(product.bulkSellingPrice)
          : undefined,
        lowStockThreshold: product.initialLowStockThreshold ?? 5,
      },
      priceReason: 'প্রাথমিক দাম',
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
      isVisibleInShop: data.isVisibleInShop,
    }),
  });
}

export function changeProductKind(id: string, input: {
  kind: ProductKind;
  unitLabel?: string;
  sellingPrice: number;
  bulkSellingPrice?: number;
  lowStockThreshold: number;
  reason?: string;
}): Promise<Product> {
  return requestV1<Product>(`/products/${id}/kind`, {
    method: 'PATCH',
    body: JSON.stringify({
      ...input,
      sellingPrice: String(input.sellingPrice),
      bulkSellingPrice: input.bulkSellingPrice == null ? undefined : String(input.bulkSellingPrice),
    }),
  });
}

export async function changeSellingPrice(
  variantId: string,
  price: number,
  reason?: string,
  bulkSellingPrice?: number,
): Promise<Product> {
  return requestV1<Product>(`/variants/${variantId}/selling-price`, {
    method: 'PATCH',
    body: JSON.stringify({
      sellingPrice: String(price),
      bulkSellingPrice: bulkSellingPrice == null ? undefined : String(bulkSellingPrice),
      reason,
    }),
  });
}

export function setProductActive(id: string, isActive: boolean): Promise<Product> {
  return updateProduct(id, { isActive });
}

export function setProductVisibleInShop(id: string, isVisibleInShop: boolean): Promise<Product> {
  return updateProduct(id, { isVisibleInShop });
}

export function deleteUnusedProduct(id: string): Promise<{ id: string }> {
  return requestV1<{ id: string }>(`/products/${id}`, { method: 'DELETE' });
}

export interface VariantCreateInput {
  name: string;
  unitLabel?: string;
  sellingPrice: number;
  lowStockThreshold: number;
  isDefault: boolean;
  priceReason?: string;
}

export function createVariant(productId: string, input: VariantCreateInput): Promise<Product> {
  return requestV1<Product>(`/products/${productId}/variants`, {
    method: 'POST',
    body: JSON.stringify({ ...input, sellingPrice: String(input.sellingPrice) }),
  });
}

export function updateVariant(
  variantId: string,
  input: Partial<Pick<ProductVariant, 'name' | 'unitLabel' | 'lowStockThreshold' | 'isDefault' | 'isActive'>>,
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
  updates: Array<{ variantId: string; sellingPrice: number; bulkSellingPrice?: number }>,
  reason?: string,
): Promise<Product[]> {
  return requestV1<Product[]>('/variants/selling-prices/bulk', {
    method: 'POST',
    body: JSON.stringify({
      reason,
      updates: updates.map((update) => ({
        variantId: update.variantId,
        sellingPrice: String(update.sellingPrice),
        bulkSellingPrice: update.bulkSellingPrice == null ? undefined : String(update.bulkSellingPrice),
      })),
    }),
  });
}

export async function getProductTags(): Promise<string[]> {
  return (await getStorefrontFilters()).tags;
}

export interface StorefrontFilters {
  categories: Category[];
  tags: string[];
}

export function getStorefrontFilters(signal?: AbortSignal): Promise<StorefrontFilters> {
  return requestV1<StorefrontFilters>('/storefront/filters', { auth: false, signal });
}

export function getCategories(signal?: AbortSignal): Promise<Category[]> {
  return requestV1<Category[]>('/categories', { auth: false, signal });
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

export function setCategoryActive(id: string, isActive: boolean): Promise<Category> {
  return updateCategory(id, { isActive });
}

export function setCategoryVisibleInShop(id: string, isVisibleInShop: boolean): Promise<Category> {
  return updateCategory(id, { isVisibleInShop });
}

export function deleteUnusedCategory(id: string): Promise<{ id: string }> {
  return requestV1<{ id: string }>(`/categories/${id}`, { method: 'DELETE' });
}

export interface PurchaseItemInput {
  productVariantId: string;
  amount: string;
  amountUnit: AmountUnit;
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

export function getInventorySummary(): Promise<InventorySummary> {
  return requestV1<InventorySummary>('/inventory/summary');
}

export function getInventoryItems(input: {
  query?: string;
  categoryId?: string;
  status?: 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'INACTIVE';
  sort?: 'URGENCY' | 'NAME' | 'STOCK_ASC' | 'LAST_ADDED';
  page?: number;
  limit?: number;
} = {}): Promise<InventoryItemsPage> {
  const query = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return requestV1<InventoryItemsPage>(`/inventory/items?${query}`);
}

export function getInventoryItemBatches(productVariantId: string, input: {
  includeDepleted?: boolean;
  page?: number;
  limit?: number;
} = {}): Promise<InventoryBatchesPage> {
  const query = new URLSearchParams();
  if (input.includeDepleted) query.set('includeDepleted', 'true');
  if (input.page) query.set('page', String(input.page));
  if (input.limit) query.set('limit', String(input.limit));
  return requestV1<InventoryBatchesPage>(`/inventory/items/${productVariantId}/batches?${query}`);
}

export function getInventoryRecords(input: {
  query?: string;
  type?: 'ALL' | 'PURCHASE' | 'ADJUSTMENT' | 'STOCK_LOSS' | 'ENTRY_CORRECTION' | 'STOCK_RECONCILIATION';
  page?: number;
  limit?: number;
} = {}): Promise<InventoryRecordsPage> {
  const query = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return requestV1<InventoryRecordsPage>(`/inventory/records?${query}`);
}

export function adjustStock(input:
  | { direction: 'INCREASE'; productVariantId: string; amount: string; amountUnit: AmountUnit; unitBuyingCost: number; purchaseDate: string; reason: string }
  | { direction: 'DECREASE'; productVariantId: string; amount: string; amountUnit: AmountUnit; reason: string }
): Promise<StockBatch[]> {
  return requestV1<StockBatch[]>('/stock-adjustments', {
    method: 'POST',
    body: JSON.stringify(input.direction === 'INCREASE'
      ? { ...input, unitBuyingCost: String(input.unitBuyingCost) }
      : input),
  });
}

export function createStockLoss(input: {
  productVariantId: string;
  amount: string;
  amountUnit: AmountUnit;
  note?: string;
}): Promise<unknown> {
  return requestV1<unknown>('/inventory/stock-losses', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function reconcileStock(input: {
  productVariantId: string;
  actualAmount: string;
  amountUnit: AmountUnit;
  note?: string;
}): Promise<unknown> {
  return requestV1<unknown>('/inventory/reconciliations', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function correctStockBatch(batchId: string, input: {
  correctedAmount: string;
  amountUnit: AmountUnit;
  unitBuyingCost: number;
}): Promise<unknown> {
  return requestV1<unknown>(`/inventory/stock-batches/${batchId}/correction`, {
    method: 'POST',
    body: JSON.stringify({ ...input, unitBuyingCost: String(input.unitBuyingCost) }),
  });
}

export function createPhysicalSale(input: {
  items: Array<{ productVariantId: string; amount: string; amountUnit: AmountUnit }>;
  customerName?: string;
  customerPhone?: string;
  creditCustomerId?: string;
  createCreditCustomer?: boolean;
  discountTotal: number;
  paymentMode?: 'PAID_NOW' | 'CREDIT';
  nextFollowUpDate?: string;
  confirmUnprofitable?: boolean;
}): Promise<PhysicalSale> {
  return requestV1<PhysicalSale>('/physical-sales', {
    method: 'POST',
    body: JSON.stringify({ ...input, discountTotal: String(input.discountTotal) }),
  });
}

export function suggestCreditCustomers(query: string): Promise<CreditCustomerSuggestion[]> {
  const params = new URLSearchParams({ query, limit: '8' });
  return requestV1<CreditCustomerSuggestion[]>(`/credit-customers/suggestions?${params}`);
}

export function getCreditCustomers(input: {
  state?: CreditSaleState;
  query?: string;
  page?: number;
  limit?: number;
} = {}): Promise<CreditCustomersPage> {
  const query = new URLSearchParams();
  Object.entries({ state: 'OPEN', page: 1, limit: 30, ...input }).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return requestV1<CreditCustomersPage>(`/credit-customers?${query}`);
}

export function getCreditCustomerSummary(): Promise<CreditSummary> {
  return requestV1<CreditSummary>('/credit-customers/summary');
}

export function getCreditCustomer(id: string): Promise<CreditCustomer> {
  return requestV1<CreditCustomer>(`/credit-customers/${id}`);
}

export function updateCreditCustomer(id: string, input: { name: string; phone: string | null }): Promise<CreditCustomer> {
  return requestV1<CreditCustomer>(`/credit-customers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function recordCreditCustomerPayment(id: string, input: {
  idempotencyKey: string;
  amount: number;
  paidOn: string;
  note?: string;
}): Promise<CreditCustomer> {
  return requestV1<CreditCustomer>(`/credit-customers/${id}/payments`, {
    method: 'POST',
    body: JSON.stringify({ ...input, amount: String(input.amount) }),
  });
}

export function voidCreditCustomerPayment(id: string, paymentId: string, reason: string): Promise<CreditCustomer> {
  return requestV1<CreditCustomer>(`/credit-customers/${id}/payments/${paymentId}/void`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function rescheduleCreditCustomerFollowUp(id: string, input: {
  nextFollowUpDate: string;
  note?: string;
}): Promise<CreditCustomer> {
  return requestV1<CreditCustomer>(`/credit-customers/${id}/follow-up`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function getCreditSales(input: {
  state?: CreditSaleState;
  query?: string;
  page?: number;
  limit?: number;
} = {}): Promise<CreditSalesPage> {
  const query = new URLSearchParams();
  Object.entries({ state: 'OPEN', page: 1, limit: 30, ...input }).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return requestV1<CreditSalesPage>(`/credit-sales?${query}`);
}

export function getCreditSummary(): Promise<CreditSummary> {
  return requestV1<CreditSummary>('/credit-customers/summary');
}

export function getCreditSale(id: string): Promise<PhysicalSale> {
  return requestV1<PhysicalSale>(`/credit-sales/${id}`);
}

export function recordCreditPayment(id: string, input: {
  idempotencyKey: string;
  amount: number;
  paidOn: string;
  note?: string;
}): Promise<PhysicalSale> {
  return requestV1<PhysicalSale>(`/credit-sales/${id}/payments`, {
    method: 'POST',
    body: JSON.stringify({ ...input, amount: String(input.amount) }),
  });
}

export function voidCreditPayment(id: string, paymentId: string, reason: string): Promise<PhysicalSale> {
  return requestV1<PhysicalSale>(`/credit-sales/${id}/payments/${paymentId}/void`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function rescheduleCreditFollowUp(id: string, input: {
  nextFollowUpDate: string;
  note?: string;
}): Promise<PhysicalSale> {
  return requestV1<PhysicalSale>(`/credit-sales/${id}/follow-up`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function getPhysicalSales(input: {
  product?: string;
  query?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
} = {}): Promise<PhysicalSale[]> {
  const query = new URLSearchParams();
  Object.entries({ limit: 30, ...input }).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return requestV1<PhysicalSale[]>(`/physical-sales?${query}`);
}

export function returnPhysicalSale(id: string, input: {
  condition: 'SELLABLE' | 'DAMAGED';
  reason?: string;
  items: Array<{ salesOrderItemId: string; amount: string; amountUnit: AmountUnit }>;
}): Promise<PhysicalSale> {
  return requestV1<PhysicalSale>(`/physical-sales/${id}/returns`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getDeliveryRates(): Promise<DeliveryRate[]> {
  return requestV1<DeliveryRate[]>('/delivery-rates', { auth: false });
}

export function getAdminDeliveryRates(): Promise<DeliveryRate[]> {
  return requestV1<DeliveryRate[]>('/admin/delivery-rates');
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
    | { action: 'CANCEL' | 'FAILED_DELIVERY'; reason?: string }
    | { action: 'RETURN'; condition: 'SELLABLE' | 'DAMAGED'; reason?: string },
): Promise<UnifiedOrder> {
  return requestV1<UnifiedOrder>(`/orders/${id}/status`, {
    method: 'PATCH', body: JSON.stringify(action),
  });
}

export function getAnalyticsDashboard(input: {
  preset: AnalyticsPreset;
  from?: string;
  to?: string;
}): Promise<AnalyticsDashboardData> {
  const query = new URLSearchParams({ preset: input.preset });
  if (input.preset === 'custom' && input.from && input.to) {
    query.set('from', input.from);
    query.set('to', input.to);
  }
  return requestV1<AnalyticsDashboardData>(`/analytics/dashboard?${query}`);
}

export function getPushConfig(): Promise<{ publicKey: string }> {
  return requestV1('/push/config');
}

export function registerPushSubscription(input: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<{ enabled: true }> {
  return requestV1('/push/subscriptions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function removePushSubscription(endpoint: string): Promise<{ enabled: false }> {
  return requestV1('/push/subscriptions', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint }),
  });
}

export function sendTestPush(endpoint: string): Promise<{
  sent: number;
  failed: number;
  expired: number;
  skipped: number;
}> {
  return requestV1('/push/test', {
    method: 'POST',
    body: JSON.stringify({ endpoint }),
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
  if (!response.ok) throw new Error(body?.error?.message ?? 'Image upload failed');
  return body.data.urls as string[];
}
