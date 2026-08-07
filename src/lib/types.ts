export interface Category {
  id: string;
  name: string;
  slug: string;
  isActive?: boolean;
}

export type Role = 'OWNER' | 'CUSTOMER';

export interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  sellingPrice: number;
  availableStock: number;
  reservedStock: number;
  lowStockThreshold: number;
  isDefault: boolean;
  isActive: boolean;
}

export interface SellingPriceHistoryEntry {
  id: string;
  previousPrice: number | null;
  newPrice: number;
  reason: string;
  changedByProfileId: string;
  changedBy: {
    fullName: string;
    role: Role;
  };
  effectiveAt: string;
}

export interface StockBatch {
  id: string;
  purchaseGroupId: string | null;
  productVariantId: string;
  productName: string;
  variantName: string;
  sku: string;
  source: 'PURCHASE' | 'ADJUSTMENT' | 'SELLABLE_RETURN';
  purchasedQuantity: number;
  availableQuantity: number;
  reservedQuantity: number;
  unitBuyingCost: number;
  purchaseDate: string;
  note: string | null;
  adjustmentReason: string | null;
  variantAvailableStock: number;
  variantReservedStock: number;
  createdBy: { fullName: string; role: Role };
  createdAt: string;
}

export interface PhysicalSaleAllocation {
  id: string;
  stockBatchId: string;
  quantity: number;
  unitBuyingCost: number;
  totalBuyingCost: number;
  state: 'CONSUMED';
  purchaseDate: string;
}

export interface PhysicalSaleItem {
  id: string;
  productId: string;
  productVariantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  unitSellingPrice: number;
  grossLineRevenue: number;
  allocatedDiscount: number;
  netLineRevenue: number;
  totalBuyingCost: number;
  grossProfit: number;
  allocations: PhysicalSaleAllocation[];
}

export interface PhysicalSale {
  id: string;
  orderNumber: string;
  source: 'PHYSICAL_SHOP';
  status: 'COMPLETED';
  paymentMethod: 'CASH';
  paymentStatus: 'PAID';
  customerName: string | null;
  customerPhone: string | null;
  subtotal: number;
  discountTotal: number;
  grandTotal: number;
  totalBuyingCost: number;
  grossProfit: number;
  grossProfitMargin: number | null;
  unprofitableOverrideConfirmed: boolean;
  createdBy: { fullName: string; role: Role };
  completedAt: string;
  items: PhysicalSaleItem[];
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  categoryId: string;
  images: string[];
  youtubeLinks: string[];
  stock: number;
  featured: boolean;
  tags: string[];
  isActive?: boolean;
  variants?: ProductVariant[];
  defaultVariantId?: string;
  sku?: string;
  variantName?: string;
}

export interface ProductsPage {
  data: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CartItem {
  productId: string;
  productVariantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
}

export type OrderSource = 'WEBSITE' | 'PHYSICAL_SHOP' | 'FACEBOOK' | 'PHONE' | 'WHATSAPP' | 'OTHER';
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'DELIVERED' | 'COMPLETED' | 'CANCELLED' | 'RETURNED_SELLABLE' | 'RETURNED_DAMAGED';

export interface DeliveryRate {
  id: string;
  code: 'DHAKA' | 'OUTSIDE_DHAKA';
  name: string;
  charge: number | null;
  isActive: boolean;
}

export interface UnifiedOrderItem {
  id: string;
  productId: string;
  productVariantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  unitSellingPrice: number;
  grossLineRevenue: number;
  allocatedDiscount: number;
  netLineRevenue: number;
  totalBuyingCost: number | null;
  grossProfit: number | null;
  allocations: Array<{
    id: string;
    stockBatchId: string;
    quantity: number;
    unitBuyingCost: number;
    totalBuyingCost: number;
    state: 'RESERVED' | 'CONSUMED' | 'RELEASED';
    purchaseDate: string;
  }>;
}

export interface UnifiedOrder {
  id: string;
  orderNumber: string;
  source: OrderSource;
  status: OrderStatus;
  paymentMethod: 'CASH' | 'CASH_ON_DELIVERY';
  paymentStatus: 'UNPAID' | 'PAID' | 'REFUNDED';
  customerProfileId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  customerAddress: string | null;
  deliveryRate: Pick<DeliveryRate, 'id' | 'code' | 'name' | 'charge'> | null;
  subtotal: number;
  discountTotal: number;
  deliveryCharge: number;
  grandTotal: number;
  totalBuyingCost: number | null;
  grossProfit: number | null;
  grossProfitMargin: number | null;
  unprofitableOverrideConfirmed: boolean;
  createdBy: { fullName: string; role: Role } | null;
  placedAt: string;
  confirmedAt: string | null;
  completedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  returnedAt: string | null;
  statusReason: string | null;
  returnCondition: 'SELLABLE' | 'DAMAGED' | null;
  items: UnifiedOrderItem[];
}

export interface OrdersPage {
  data: UnifiedOrder[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface User {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  role: Role;
  isActive: boolean;
}

export interface OwnerAccount {
  id: string;
  role: 'OWNER';
  fullName: string;
  phoneNumber: string | null;
  email: string | null;
  isActive: boolean;
  invitedAt: string | null;
  lastSignInAt: string | null;
  createdAt: string;
}

export interface OwnerManagementState {
  owners: OwnerAccount[];
  invitationsConfigured: boolean;
}

export type AnalyticsPreset = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom';

export interface ComparedAnalyticsMetric {
  value: number | null;
  previousValue: number | null;
  absoluteChange: number | null;
  percentChange: number | null;
}

export interface AnalyticsProductRow {
  productId: string;
  productVariantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  productRevenue: number;
  fifoCost: number;
  grossProfit: number;
  grossMargin: number | null;
}

export interface AnalyticsStockVariant {
  productVariantId: string;
  productName: string;
  variantName: string;
  sku: string;
  availableStock: number;
  reservedStock: number;
  onHandStock: number;
  lowStockThreshold: number;
}

export interface AnalyticsDashboardData {
  generatedAt: string;
  currency: 'BDT';
  timezone: 'Asia/Dhaka';
  week: { startsOn: 'SUNDAY'; endsOn: 'SATURDAY' };
  range: {
    preset: AnalyticsPreset;
    current: { from: string; to: string };
    previous: { from: string; to: string };
  };
  summary: {
    recognizedSales: ComparedAnalyticsMetric;
    productRevenue: ComparedAnalyticsMetric;
    deliveryCharges: ComparedAnalyticsMetric;
    grossProfit: ComparedAnalyticsMetric;
    grossMargin: ComparedAnalyticsMetric;
    recognizedOrderCount: ComparedAnalyticsMetric;
    unitsSold: ComparedAnalyticsMetric;
    averageOrderValue: ComparedAnalyticsMetric;
    pendingCodOrderCount: number;
    lowStockVariantCount: number;
    outOfStockVariantCount: number;
  };
  trend: Array<{ date: string; recognizedSales: number; grossProfit: number }>;
  salesBySource: Array<{ source: OrderSource; orderCount: number; recognizedSales: number }>;
  bestSelling: AnalyticsProductRow[];
  mostProfitable: AnalyticsProductRow[];
  inventory: {
    availableUnits: number;
    reservedUnits: number;
    onHandUnits: number;
    fifoValuation: number;
    lowStock: AnalyticsStockVariant[];
    outOfStock: AnalyticsStockVariant[];
  };
  pendingCod: { total: number; pending: number; confirmed: number; processing: number };
}
