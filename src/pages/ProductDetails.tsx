import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getProductBySlug, getCategories } from '@/lib/api';
import { Product, Category } from '@/lib/types';
import { useCart } from '@/contexts/CartContext';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { ShoppingCart, CreditCard, Leaf, ArrowLeft, Loader2, Plus, Minus } from 'lucide-react';
import { toast } from 'sonner';

const ProductDetails = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { addItem, items, updateQuantity, removeItem } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAttrs, setSelectedAttrs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!slug) return;
    Promise.all([getProductBySlug(slug), getCategories()])
      .then(([prod, cats]) => {
        if (prod) {
          setProduct(prod);
          const initial: Record<string, string> = {};
          prod.attributes.forEach(g => {
            if (g.options.length > 0) initial[g.name] = g.options[0].value;
          });
          setSelectedAttrs(initial);
          setCategory(cats.find(c => c.id === prod.categoryId) ?? null);
        }
      })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 size={22} className="animate-spin" /> লোড হচ্ছে...
        </div>
        <Footer />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">পণ্য পাওয়া যায়নি</h1>
            <Button onClick={() => navigate('/shop')} variant="outline">দোকানে ফিরে যান</Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const currentPrice = product.attributes.reduce((price, group) => {
    const selectedOption = group.options.find(o => o.value === selectedAttrs[group.name]);
    return price + (selectedOption?.priceModifier || 0);
  }, product.price);

  const getSelectedLabels = () => {
    const labels: Record<string, string> = {};
    product.attributes.forEach(group => {
      const opt = group.options.find(o => o.value === selectedAttrs[group.name]);
      if (opt) labels[group.name] = opt.label;
    });
    return labels;
  };

  // Find the matching cart item for current product + selected attributes
  const getCartItemKey = () => {
    return `${product.id}_${Object.values(selectedAttrs).sort().join('_')}`;
  };
  const cartItem = items.find(
    i => `${i.productId}_${Object.values(i.selectedAttributes).sort().join('_')}` === getCartItemKey()
  );
  const quantityInCart = cartItem?.quantity ?? 0;

  const handleAddToCart = () => {
    if (quantityInCart > 0) {
      // Already in cart — increase quantity
      updateQuantity(product.id, selectedAttrs, quantityInCart + 1);
      toast.success('কার্টে পরিমাণ বাড়ানো হয়েছে!');
    } else {
      addItem({ productId: product.id, productName: product.name, quantity: 1, selectedAttributes: selectedAttrs, unitPrice: currentPrice });
      toast.success('কার্টে যোগ করা হয়েছে!');
    }
  };

  const handleDecreaseQuantity = () => {
    if (quantityInCart <= 1) {
      removeItem(product.id, selectedAttrs);
      toast.success('কার্ট থেকে সরানো হয়েছে');
    } else {
      updateQuantity(product.id, selectedAttrs, quantityInCart - 1);
      toast.success('কার্টে পরিমাণ কমানো হয়েছে');
    }
  };

  const handleBuyNow = () => {
    if (quantityInCart === 0) {
      addItem({ productId: product.id, productName: product.name, quantity: 1, selectedAttributes: selectedAttrs, unitPrice: currentPrice });
    }
    navigate('/cart');
  };

  const youtubeEmbedUrl = (url: string) => {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{11})/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : null;
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <div className="container mx-auto px-4 py-8 flex-1">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft size={18} /> পিছনে যান
        </button>

        <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
          {/* Gallery */}
          <div>
            <div className="aspect-square bg-muted rounded-lg overflow-hidden flex items-center justify-center">
              {product.images.length > 0 ? (
                <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <Leaf size={64} className="text-secondary" />
                  <span>নাফাহ এগ্রো</span>
                </div>
              )}
            </div>

            {product.images.length > 1 && (
              <div className="grid grid-cols-4 gap-2 mt-3">
                {product.images.slice(1).map((img, i) => (
                  <div key={i} className="aspect-square bg-muted rounded overflow-hidden">
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}

            {product.youtubeLinks.length > 0 && (
              <div className="mt-4 space-y-3">
                {product.youtubeLinks.map((url, i) => {
                  const embed = youtubeEmbedUrl(url);
                  return embed ? (
                    <div key={i} className="aspect-video rounded-lg overflow-hidden">
                      <iframe src={embed} className="w-full h-full" allowFullScreen title={`Video ${i + 1}`} />
                    </div>
                  ) : null;
                })}
              </div>
            )}
          </div>

          {/* Info */}
          <div>
            {category && (
              <span className="inline-block bg-secondary/10 text-secondary text-sm font-medium px-3 py-1 rounded-full mb-3">
                {category.name}
              </span>
            )}
            <h1 className="text-3xl font-bold mb-3">{product.name}</h1>
            {product.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {product.tags.map(tag => (
                  <span key={tag} className="text-xs bg-secondary/15 text-secondary font-medium px-2.5 py-1 rounded-full">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
            <p className="text-muted-foreground mb-6 leading-relaxed">{product.description}</p>

            <div className="text-3xl font-bold text-secondary mb-6">৳{currentPrice}</div>

            {product.attributes.map(group => (
              <div key={group.name} className="mb-6">
                <h3 className="font-semibold mb-2">
                  {group.name}: <span className="text-secondary">{getSelectedLabels()[group.name]}</span>
                </h3>
                <div className="flex flex-wrap gap-2">
                  {group.options.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setSelectedAttrs(prev => ({ ...prev, [group.name]: opt.value }))}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                        selectedAttrs[group.name] === opt.value
                          ? 'border-secondary bg-secondary text-secondary-foreground'
                          : 'border-border hover:border-secondary'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div className="mb-6 text-sm text-muted-foreground">
              স্টক অর্ডার নিশ্চিত করার সময় যাচাই করা হবে।
            </div>

            {/* Quantity controls + Add to Cart */}
            {quantityInCart > 0 ? (
              <div className="mb-4">
                <p className="text-sm font-medium text-muted-foreground mb-2">কার্টে আছে:</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleDecreaseQuantity}
                    className="w-10 h-10 rounded-full border-2 border-secondary flex items-center justify-center hover:bg-secondary/10 transition-colors"
                  >
                    <Minus size={18} className="text-secondary" />
                  </button>
                  <span className="text-xl font-bold w-12 text-center">{quantityInCart}</span>
                  <button
                    onClick={handleAddToCart}
                    className="w-10 h-10 rounded-full border-2 border-secondary flex items-center justify-center hover:bg-secondary/10 transition-colors"
                  >
                    <Plus size={18} className="text-secondary" />
                  </button>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={handleAddToCart}
                size="lg"
                className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/90"
              >
                <ShoppingCart className="mr-2" size={20} />
                {quantityInCart > 0 ? `আরও যোগ করুন (${quantityInCart})` : 'কার্টে যোগ করুন'}
              </Button>
              <Button
                onClick={handleBuyNow}
                size="lg"
                className="flex-1"
              >
                <CreditCard className="mr-2" size={20} />
                এখনই কিনুন
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default ProductDetails;
