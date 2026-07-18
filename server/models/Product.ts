import mongoose, { Schema, Document } from 'mongoose';

interface AttributeOption {
  label: string;
  value: string;
  priceModifier: number;
}

interface AttributeGroup {
  name: string;
  options: AttributeOption[];
}

export interface IProduct extends Document {
  name: string;
  slug: string;
  description: string;
  price: number;
  categoryId: mongoose.Types.ObjectId;
  images: string[];
  youtubeLinks: string[];
  attributes: AttributeGroup[];
  stock: number;
  featured: boolean;
  tags: string[];
}

const AttributeOptionSchema = new Schema<AttributeOption>(
  {
    label: { type: String, required: true },
    value: { type: String, required: true },
    priceModifier: { type: Number, default: 0 },
  },
  { _id: false }
);

const AttributeGroupSchema = new Schema<AttributeGroup>(
  {
    name: { type: String, required: true },
    options: [AttributeOptionSchema],
  },
  { _id: false }
);

const ProductSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    images: [{ type: String }],
    youtubeLinks: [{ type: String }],
    attributes: [AttributeGroupSchema],
    stock: { type: Number, default: 0 },
    featured: { type: Boolean, default: false },
    tags: [{ type: String }],
  },
  { timestamps: true }
);

export default mongoose.model<IProduct>('Product', ProductSchema);
