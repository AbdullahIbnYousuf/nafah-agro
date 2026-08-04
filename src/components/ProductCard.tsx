import { Link } from 'react-router-dom';
import { Product } from '@/lib/types';
import { Leaf } from 'lucide-react';

interface Props {
  product: Product;
}

const ProductCard = ({ product }: Props) => {
  return (
    <Link
      to={`/products/${product.slug}`}
      className="group block bg-card rounded-lg overflow-hidden card-shadow hover:card-hover-shadow transition-all duration-300 hover:-translate-y-1"
    >
      <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
        {product.images.length > 0 ? (
          <img src={product.images[0]} alt={product.name} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Leaf size={40} className="text-secondary" />
            <span className="text-sm">নাফাহ এগ্রো</span>
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-foreground group-hover:text-secondary transition-colors line-clamp-1">
          {product.name}
        </h3>
        <p className="mt-1 text-lg font-bold text-secondary">৳{product.price}</p>
        {product.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {product.tags.slice(0, 3).map(tag => (
              <span key={tag} className="text-[10px] bg-secondary/15 text-secondary font-medium px-1.5 py-0.5 rounded-full">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
};

export default ProductCard;
