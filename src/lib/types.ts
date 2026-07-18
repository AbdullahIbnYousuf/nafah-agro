export interface Category {
  id: string;
  name: string;
  slug: string;
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
    userRole: 'admin' | 'moderator' | 'customer';
  };
  deliveryTeam?: string;
  deliveryRider?: string;
  deliveryNotes?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'moderator' | 'customer';
}

export interface Moderator {
  id: string;
  name: string;
  email: string;
  role: 'moderator';
  isActive: boolean;
  passwordResetRequested: boolean;
  createdBy?: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
