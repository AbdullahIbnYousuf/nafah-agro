export interface Category {
  id: string;
  name: string;
  slug: string;
  isActive?: boolean;
}

export type Role = 'OWNER' | 'ADMIN' | 'CUSTOMER';

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
  source: 'PURCHASE' | 'ADJUSTMENT';
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

export interface AttributeOption {
  label: string;
  value: string;
  priceModifier: number; // added to base price
}

export interface AttributeGroup {
  name: string;
  options: AttributeOption[];
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
  attributes: AttributeGroup[];
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
  productName: string;
  quantity: number;
  selectedAttributes: Record<string, string>; // groupName -> optionValue
  unitPrice: number;
}

export interface Order {
  id: string;
  items: CartItem[];
  subtotal?: number;
  shippingCost?: number;
  discount?: number;
  total: number;
  paymentMethod?: 'cod' | 'mobilebank' | 'sslcommerz';
  paymentStatus?: 'unpaid' | 'paid' | 'refunded';
  paymentReference?: string;
  status: 'pending' | 'confirmed' | 'processing' | 'delivered' | 'cancelled';
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  createdAt: string;
  source: 'online' | 'phone' | 'offline';
  placedBy?: {
    userId: string;
    userName: string;
    userRole: Role;
  };
  deliveryTeam?: string;
  deliveryRider?: string;
  deliveryNotes?: string;
}

export interface User {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  role: Role;
  isActive: boolean;
}
