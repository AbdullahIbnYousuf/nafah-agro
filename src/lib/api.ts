import { Product, ProductsPage, Category, Order, AuthResponse, User, Moderator } from './types';
import { frontendEnv } from './env';

const BASE = frontendEnv.VITE_API_URL;

// ── Token management ────────────────────────────────────────────────────────────
export function getStoredToken(): string | null {
  return localStorage.getItem('auth_token');
}

export function setStoredToken(token: string): void {
  localStorage.setItem('auth_token', token);
}

export function removeStoredToken(): void {
  localStorage.removeItem('auth_token');
}

// Recursively map Mongoose `_id` to `id` so the frontend types work.
function normalizeIds(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(normalizeIds);
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const { _id, ...rest } = obj;
    const out: Record<string, unknown> = _id !== undefined ? { id: _id, ...rest } : { ...rest };
    for (const key of Object.keys(out)) {
      out[key] = normalizeIds(out[key]);
    }
    return out;
  }
  return data;
}

function authHeaders(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...options?.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  const json = await res.json();
  return normalizeIds(json) as T;
}

// ── Auth ─────────────────────────────────────────────────────────────────────────
export async function loginUser(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function loginModerator(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/login/moderator', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function registerUser(name: string, email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
}

export async function registerAdmin(
  name: string,
  email: string,
  password: string,
  unlockCode: string
): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/register/admin', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, unlockCode }),
  });
}

export async function registerModerator(
  name: string,
  email: string,
  password: string
): Promise<{ user: Moderator }> {
  return request<{ user: Moderator }>('/auth/register/moderator', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
}

export async function getCurrentUser(): Promise<User> {
  return request<User>('/auth/me');
}

// ── Moderator Management (admin only) ────────────────────────────────────────────
export async function getModerators(): Promise<Moderator[]> {
  return request<Moderator[]>('/auth/moderators');
}

export async function resetModeratorPassword(id: string, newPassword: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/auth/moderators/${id}/reset-password`, {
    method: 'PATCH',
    body: JSON.stringify({ newPassword }),
  });
}

export async function toggleModeratorActive(id: string): Promise<Moderator> {
  return request<Moderator>(`/auth/moderators/${id}/toggle-active`, {
    method: 'PATCH',
  });
}

export async function deleteModerator(id: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/auth/moderators/${id}`, {
    method: 'DELETE',
  });
}

// ── Moderator password reset request (unauthenticated) ───────────────────────────
export async function requestModeratorPasswordReset(email: string): Promise<{ message: string }> {
  return request<{ message: string }>('/auth/moderator/request-reset', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

// ── Products ─────────────────────────────────────────────────────────────────────
export interface GetProductsParams {
  query?: string;
  type?: 'product' | 'category';
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
  const q = new URLSearchParams();
  if (params?.query)    q.set('query', params.query);
  if (params?.type)     q.set('type', params.type);
  if (params?.category) q.set('category', params.category);
  if (params?.tag)      q.set('tag', params.tag);
  if (params?.featured != null) q.set('featured', String(params.featured));
  if (params?.minPrice != null) q.set('minPrice', String(params.minPrice));
  if (params?.maxPrice != null) q.set('maxPrice', String(params.maxPrice));
  if (params?.sort)     q.set('sort', params.sort);
  if (params?.page)     q.set('page', String(params.page));
  if (params?.limit)    q.set('limit', String(params.limit));
  const qs = q.toString() ? `?${q.toString()}` : '';
  return request<ProductsPage>(`/products${qs}`);
}

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  try {
    return await request<Product>(`/products/${slug}`);
  } catch {
    return undefined;
  }
}

export async function createProduct(product: Omit<Product, 'id'>): Promise<Product> {
  return request<Product>('/products', {
    method: 'POST',
    body: JSON.stringify(product),
  });
}

export async function updateProduct(id: string, data: Partial<Product>): Promise<Product> {
  return request<Product>(`/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function updateProductStock(id: string, stock: number): Promise<Product> {
  return request<Product>(`/products/${id}/stock`, {
    method: 'PATCH',
    body: JSON.stringify({ stock }),
  });
}

export async function deleteProduct(id: string): Promise<void> {
  await request(`/products/${id}`, { method: 'DELETE' });
}

export async function getProductTags(): Promise<string[]> {
  return request<string[]>('/products/tags');
}

// ── Categories ───────────────────────────────────────────────────────────────────
export async function getCategories(): Promise<Category[]> {
  return request<Category[]>('/categories');
}

export async function createCategory(category: Omit<Category, 'id'>): Promise<Category> {
  return request<Category>('/categories', {
    method: 'POST',
    body: JSON.stringify(category),
  });
}

export async function updateCategory(id: string, data: Partial<Category>): Promise<Category> {
  return request<Category>(`/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteCategory(id: string): Promise<void> {
  await request(`/categories/${id}`, { method: 'DELETE' });
}

// ── Orders ───────────────────────────────────────────────────────────────────────
export async function getOrders(): Promise<Order[]> {
  return request<Order[]>('/orders');
}

export async function getMyOrders(): Promise<Order[]> {
  return request<Order[]>('/orders/my');
}

export async function createOrder(order: Omit<Order, 'id' | 'createdAt'>): Promise<Order> {
  return request<Order>('/orders', {
    method: 'POST',
    body: JSON.stringify(order),
  });
}

export async function updateOrderStatus(id: string, status: Order['status']): Promise<Order> {
  return request<Order>(`/orders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function updateOrderPayment(
  id: string,
  data: { paymentStatus?: string; paymentReference?: string }
): Promise<Order> {
  return request<Order>(`/orders/${id}/payment`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function updateOrderDelivery(
  id: string,
  data: { deliveryTeam?: string; deliveryRider?: string; deliveryNotes?: string }
): Promise<Order> {
  return request<Order>(`/orders/${id}/delivery`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ── Image Upload ─────────────────────────────────────────────────────────────────
export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('image', file);
  const res = await fetch(`${BASE}/upload`, {
    method: 'POST',
    body: form,
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Image upload failed');
  }
  const data = await res.json();
  return data.url as string;
}

export async function uploadImages(files: File[]): Promise<string[]> {
  const form = new FormData();
  files.forEach((f) => form.append('images', f));
  const res = await fetch(`${BASE}/upload/multiple`, {
    method: 'POST',
    body: form,
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Image upload failed');
  }
  const data = await res.json();
  return data.urls as string[];
}
