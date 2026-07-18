import mongoose, { Schema, Document } from 'mongoose';

interface CartItem {
  productId: string;
  productName: string;
  quantity: number;
  selectedAttributes: Record<string, string>;
  unitPrice: number;
}

export interface IOrder extends Document {
  items: CartItem[];
  subtotal: number;
  shippingCost: number;
  discount: number;
  total: number;
  paymentMethod: 'cod' | 'mobilebank' | 'sslcommerz';
  paymentStatus: 'unpaid' | 'paid' | 'refunded';
  paymentReference: string;
  status: 'pending' | 'confirmed' | 'processing' | 'delivered' | 'cancelled';
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  source: 'online' | 'phone' | 'offline';
  placedBy: {
    userId: string;
    userName: string;
    userRole: 'admin' | 'moderator' | 'customer';
  };
  deliveryTeam: string;
  deliveryRider: string;
  deliveryNotes: string;
  createdAt: Date;
}

const CartItemSchema = new Schema<CartItem>(
  {
    productId: { type: String, required: true },
    productName: { type: String, required: true },
    quantity: { type: Number, required: true },
    selectedAttributes: { type: Map, of: String, default: {} },
    unitPrice: { type: Number, required: true },
  },
  { _id: false }
);

const OrderSchema = new Schema<IOrder>(
  {
    items: [CartItemSchema],
    subtotal: { type: Number, required: true },
    shippingCost: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    paymentMethod: {
      type: String,
      enum: ['cod', 'mobilebank', 'sslcommerz'],
      default: 'cod',
    },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'paid', 'refunded'],
      default: 'unpaid',
    },
    paymentReference: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'processing', 'delivered', 'cancelled'],
      default: 'pending',
    },
    customerName: { type: String, required: true },
    customerPhone: { type: String, required: true },
    customerAddress: { type: String, required: true },
    source: {
      type: String,
      enum: ['online', 'phone', 'offline'],
      default: 'online',
    },
    placedBy: {
      userId: { type: String, required: true },
      userName: { type: String, required: true },
      userRole: {
        type: String,
        enum: ['admin', 'moderator', 'customer'],
        required: true,
      },
    },
    deliveryTeam: { type: String, default: '' },
    deliveryRider: { type: String, default: '' },
    deliveryNotes: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model<IOrder>('Order', OrderSchema);
