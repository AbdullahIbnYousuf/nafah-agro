export interface Category {
  id: string;
  name: string;
  slug: string;
  isActive?: boolean;
  isVisibleInShop?: boolean;
  canDelete?: boolean;
}

export type Role = 'OWNER' | 'CUSTOMER';
export type ProductKind = 'PACKAGED' | 'LOOSE_WEIGHT' | 'LOOSE_VOLUME' | 'EGG';
export type QuantityUnit = 'PIECE' | 'GRAM' | 'MILLILITER';
export type AmountUnit = 'PIECE' | 'KG' | 'G' | 'LITER' | 'ML';
export type SellingPriceTier = 'REGULAR' | 'EGG_BULK';

export interface ProductVariant {
  id: string;
  name: string;
  unitLabel?: string;
  canEditUnitLabel?: boolean;
  sku: string;
  sellingPrice: number;
  bulkSellingPrice?: number | null;
  bulkMinimumQuantity?: number | null;
  availableStock: number;
  reservedStock: number;
  lowStockThreshold: number;
  isDefault: boolean;
  isActive: boolean;
}

export type VariantOptionContext = 'INVENTORY' | 'PHYSICAL_SALE' | 'MANUAL_ORDER';

export interface VariantOption {
  productVariantId: string;
  productId: string;
  productName: string;
  variantName: string;
  productKind: ProductKind;
  quantityUnit: QuantityUnit;
  unitLabel?: string;
  availableStock: number;
  reservedStock: number;
  sellingPrice: number;
  bulkSellingPrice: number | null;
  bulkMinimumQuantity: number | null;
  isOperational: boolean;
}

export interface SellingPriceHistoryEntry {
  id: string;
  previousPrice: number | null;
  newPrice: number;
  priceTier: SellingPriceTier;
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
  productKind: ProductKind;
  quantityUnit?: QuantityUnit;
  unitLabel?: string;
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

export type InventoryStockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'INACTIVE';

export interface InventorySummary {
  totalStockItems: number;
  lowStockItems: number;
  outOfStockItems: number;
  inventoryValue: number;
}

export interface InventoryItem {
  productVariantId: string;
  productId: string;
  productName: string;
  variantName: string;
  unitLabel?: string;
  productKind: ProductKind;
  quantityUnit: QuantityUnit;
  categoryId: string;
  categoryName: string;
  availableStock: number;
  reservedStock: number;
  lowStockThreshold: number;
  isOperational: boolean;
  status: InventoryStockStatus;
  lastStockAddedAt: string | null;
}

export interface InventoryItemsPage {
  data: InventoryItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface InventoryBatchesPage {
  data: StockBatch[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasDepleted: boolean;
}

export interface InventoryRecordItem {
  batchId?: string;
  canCorrect?: boolean;
  unitLabel?: string;
  productVariantId: string;
  productName: string;
  variantName: string;
  productKind: ProductKind;
  quantityUnit: QuantityUnit;
  direction: 'INCREASE' | 'DECREASE';
  quantity: number;
  unitBuyingCost: number | null;
}

export type InventoryRecordType = 'PURCHASE' | 'ADJUSTMENT' | 'STOCK_LOSS' | 'ENTRY_CORRECTION' | 'STOCK_RECONCILIATION';

export interface InventoryRecord {
  id: string;
  type: InventoryRecordType;
  occurredAt: string;
  effectiveDate: string;
  note: string | null;
  createdBy: { fullName: string; role: Role };
  items: InventoryRecordItem[];
  quantityDelta?: number;
  inventoryValueImpact?: number;
  stockLossAmount?: number;
  recognizedCostImpact?: number;
  availableBefore?: number;
  reservedBefore?: number;
  onHandBefore?: number;
  availableAfter?: number;
  reservedAfter?: number;
  onHandAfter?: number;
  actualPhysicalStock?: number | null;
}

export interface InventoryRecordsPage {
  data: InventoryRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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
  unitLabel?: string;
  productId: string;
  productVariantId: string;
  productName: string;
  variantName: string;
  quantityUnit?: QuantityUnit;
  sku: string;
  quantity: number;
  unitSellingPrice: number;
  sellingPriceTier?: SellingPriceTier;
  grossLineRevenue: number;
  allocatedDiscount: number;
  allocatedPriceIncrease: number;
  netLineRevenue: number;
  totalBuyingCost: number;
  grossProfit: number;
  returnedQuantity: number;
  returnableQuantity: number;
  allocations: PhysicalSaleAllocation[];
}

export interface PhysicalSaleReturn {
  id: string;
  condition: 'SELLABLE' | 'DAMAGED';
  reason: string;
  refundAmount: number;
  creditOffsetAmount: number;
  cashRefundAmount: number;
  reversedBuyingCost: number;
  reversedGrossProfit: number;
  createdBy: { fullName: string; role: Role };
  createdAt: string;
  items: Array<{
    id: string;
    salesOrderItemId: string;
    productName: string;
    variantName: string;
    quantityUnit: QuantityUnit;
    unitLabel?: string;
    quantity: number;
    refundAmount: number;
    reversedBuyingCost: number;
    reversedGrossProfit: number;
  }>;
}

export interface PhysicalSale {
  id: string;
  orderNumber: string;
  source: 'PHYSICAL_SHOP';
  status: 'COMPLETED';
  paymentMethod: 'CASH' | 'CREDIT';
  paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
  creditCustomerId?: string | null;
  nextFollowUpDate: string | null;
  customerName: string | null;
  customerPhone: string | null;
  subtotal: number;
  discountTotal: number;
  priceIncreaseTotal: number;
  grandTotal: number;
  totalBuyingCost: number;
  grossProfit: number;
  grossProfitMargin: number | null;
  refundedAmount: number;
  remainingRevenue: number;
  collectedAmount: number;
  outstandingAmount: number;
  remainingBuyingCost: number;
  remainingGrossProfit: number;
  unprofitableOverrideConfirmed: boolean;
  createdBy: { fullName: string; role: Role };
  completedAt: string;
  soldOn: string;
  items: PhysicalSaleItem[];
  returns: PhysicalSaleReturn[];
  creditPayments: CreditPayment[];
  followUpHistory?: Array<{
    id: string;
    previousData: unknown;
    newData: unknown;
    createdAt: string;
    actor: { fullName: string; role: Role } | null;
  }>;
}

export interface CreditPayment {
  id: string;
  amount: number;
  paidOn: string;
  note: string | null;
  createdBy: { fullName: string; role: Role };
  createdAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  voidedBy: { fullName: string; role: Role } | null;
  allocations?: Array<{ salesOrderId: string; amount: number }>;
}

export type CreditSaleState = 'OPEN' | 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'SETTLED' | 'ALL';

export interface CreditSalesPage {
  data: PhysicalSale[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreditSummary {
  totalOutstanding: number;
  openSaleCount: number;
  customerCount: number;
  overdueCount: number;
  dueTodayCount: number;
  upcomingCount: number;
}

export interface CreditCustomerSuggestion {
  id: string;
  name: string;
  phone: string | null;
  nextFollowUpDate: string | null;
  outstandingAmount: number;
}

export interface CreditCustomer extends CreditCustomerSuggestion {
  totalSaleAmount: number;
  collectedAmount: number;
  saleCount: number;
  createdBy: { fullName: string; role: Role };
  createdAt: string;
  updatedAt: string;
  payments: CreditPayment[];
  sales?: PhysicalSale[];
  history?: Array<{
    id: string;
    action: string;
    previousData: unknown;
    newData: unknown;
    reason: string | null;
    createdAt: string;
    actor: { fullName: string; role: Role } | null;
  }>;
}

export interface CreditCustomersPage {
  data: CreditCustomer[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  kind?: ProductKind;
  price: number;
  bulkSellingPrice?: number | null;
  bulkMinimumQuantity?: number | null;
  categoryId: string;
  category?: Category;
  images: string[];
  youtubeLinks: string[];
  stock: number;
  featured: boolean;
  tags: string[];
  isActive?: boolean;
  isVisibleInShop?: boolean;
  canDelete?: boolean;
  variants?: ProductVariant[];
  unitLabel?: string;
  defaultVariantId?: string;
  sku?: string;
  variantName?: string;
  initialLowStockThreshold?: number;
}

export interface ProductsPage {
  data: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CartItem {
  unitLabel?: string;
  productId: string;
  productVariantId: string;
  productName: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  productKind?: ProductKind;
  bulkSellingPrice?: number | null;
  bulkMinimumQuantity?: number | null;
  imageUrl?: string;
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
  unitLabel?: string;
  productId: string;
  productVariantId: string;
  productName: string;
  variantName: string;
  quantityUnit?: QuantityUnit;
  sku: string;
  quantity: number;
  unitSellingPrice: number;
  sellingPriceTier?: SellingPriceTier;
  grossLineRevenue: number;
  allocatedDiscount: number;
  allocatedPriceIncrease: number;
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
  priceIncreaseTotal: number;
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
  canDelete: boolean;
  promotedFromCustomer: boolean;
  canDemote: boolean;
  demotionBlockedReason: 'SELF' | 'INACTIVE' | 'LAST_ACTIVE_OWNER' | 'OWNER_HISTORY' | null;
}

export interface CustomerPromotionCandidate {
  customerProfileId: string;
  fullName: string;
  phoneNumber: string | null;
  email: string;
  isActive: boolean;
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

export interface AnalyticsTrendBucket {
  from: string;
  to: string;
  recognizedSales: number;
  grossProfit: number;
}

export interface AnalyticsProductRow {
  productId: string;
  productVariantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  quantityUnit: 'PIECE' | 'KG' | 'LITER';
  unitLabel?: string;
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
  productKind: ProductKind;
  quantityUnit: 'PIECE' | 'KG' | 'LITER';
  unitLabel?: string;
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
    cashProductRevenue: ComparedAnalyticsMetric;
    creditProductRevenue: ComparedAnalyticsMetric;
    deliveryCharges: ComparedAnalyticsMetric;
    grossProfit: ComparedAnalyticsMetric;
    grossMargin: ComparedAnalyticsMetric;
    recognizedOrderCount: ComparedAnalyticsMetric;
    soldQuantities: {
      pieces: ComparedAnalyticsMetric;
      weightKg: ComparedAnalyticsMetric;
      volumeLitres: ComparedAnalyticsMetric;
    };
    averageOrderValue: ComparedAnalyticsMetric;
    pendingCodOrderCount: number;
    lowStockVariantCount: number;
    outOfStockVariantCount: number;
  };
  trendGranularity: 'DAY' | 'MONTH';
  trend: Array<{
    current: AnalyticsTrendBucket;
    previous: AnalyticsTrendBucket | null;
  }>;
  salesBySource: Array<{ source: OrderSource; orderCount: number; recognizedSales: number }>;
  bestSelling: AnalyticsProductRow[];
  mostProfitable: AnalyticsProductRow[];
  inventory: {
    availableQuantities: { pieces: number; weightKg: number; volumeLitres: number };
    reservedQuantities: { pieces: number; weightKg: number; volumeLitres: number };
    onHandQuantities: { pieces: number; weightKg: number; volumeLitres: number };
    fifoValuation: number;
    lowStock: AnalyticsStockVariant[];
    outOfStock: AnalyticsStockVariant[];
  };
  pendingCod: { total: number; pending: number; confirmed: number; processing: number };
}
