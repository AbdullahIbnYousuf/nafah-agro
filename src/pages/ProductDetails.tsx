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
  const [selectedVariantId, setSelectedVariantId] = useState('');

  useEffect(() => {
    if (!slug) return;
    Promise.all([getProductBySlug(slug), getCategories()])
      .then(([prod, cats]) => {
        if (prod) {
          setProduct(prod);
          const variants = (prod.variants ?? []).filter(variant => variant.isActive);
          setSelectedVariantId(
            variants.find(variant => variant.id === prod.defaultVariantId)?.id
              ?? variants.find(variant => variant.isDefault)?.id
              ?? variants[0]?.id
              ?? '',
          );
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

  const activeVariants = (product.variants ?? []).filter(variant => variant.isActive);
  const selectedVariant = activeVariants.find(variant => variant.id === selectedVariantId)
    ?? activeVariants[0];
  const currentPrice = selectedVariant?.sellingPrice ?? product.price;

  const cartItem = items.find(i => i.productVariantId === selectedVariant?.id);
  const quantityInCart = cartItem?.quantity ?? 0;

  const handleAddToCart = () => {
    if (!selectedVariant) return toast.error('এই পণ্যের কোনো সক্রিয় ভ্যারিয়েন্ট নেই');
    if (quantityInCart > 0) {
      // Already in cart — increase quantity
      updateQuantity(selectedVariant.id, quantityInCart + 1);
      toast.success('কার্টে পরিমাণ বাড়ানো হয়েছে!');
    } else {
      addItem({
        productId: product.id,
        productVariantId: selectedVariant.id,
        productName: product.name,
        variantName: selectedVariant.name,
        sku: selectedVariant.sku,
        quantity: 1,
        unitPrice: currentPrice,
      });
      toast.success('কার্টে যোগ করা হয়েছে!');
    }
  };

  const handleDecreaseQuantity = () => {
    if (!selectedVariant) return;
    if (quantityInCart <= 1) {
      removeItem(selectedVariant.id);
      toast.success('কার্ট থেকে সরানো হয়েছে');
    } else {
      updateQuantity(selectedVariant.id, quantityInCart - 1);
      toast.success('কার্টে পরিমাণ কমানো হয়েছে');
    }
  };

  const handleBuyNow = () => {
    if (!selectedVariant) return toast.error('এই পণ্যের কোনো সক্রিয় ভ্যারিয়েন্ট নেই');
    if (quantityInCart === 0) {
      addItem({
        productId: product.id,
        productVariantId: selectedVariant.id,
        productName: product.name,
        variantName: selectedVariant.name,
        sku: selectedVariant.sku,
        quantity: 1,
        unitPrice: currentPrice,
      });
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

      <div className="container mx-auto flex-1 px-4 py-6 sm:py-8">
        <button onClick={() => navigate(-1)} className="-ml-2 mb-6 flex min-h-11 items-center gap-1 rounded-md px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
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
            <h1 className="mb-3 break-words text-2xl font-bold sm:text-3xl">{product.name}</h1>
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

            {activeVariants.length > 1 && (
              <div className="mb-6">
                <h3 className="font-semibold mb-2">বিকল্প নির্বাচন করুন</h3>
                <div className="flex flex-wrap gap-2">
                  {activeVariants.map(variant => (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => setSelectedVariantId(variant.id)}
                      className={`min-h-11 rounded-lg border px-4 py-2 text-sm font-medium ${selectedVariant?.id === variant.id ? 'border-secondary bg-secondary text-secondary-foreground' : 'border-border'}`}
                    >
                      {variant.name} · ৳{variant.sellingPrice}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-6 text-sm text-muted-foreground">
              {selectedVariant ? `${selectedVariant.name} · SKU ${selectedVariant.sku}` : 'কোনো সক্রিয় ভ্যারিয়েন্ট নেই'}। স্টক অর্ডার নিশ্চিত করার সময় যাচাই করা হবে।
            </div>

            {/* Quantity controls + Add to Cart */}
            {quantityInCart > 0 ? (
              <div className="mb-4">
                <p className="text-sm font-medium text-muted-foreground mb-2">কার্টে আছে:</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleDecreaseQuantity}
                    className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-secondary transition-colors hover:bg-secondary/10"
                  >
                    <Minus size={18} className="text-secondary" />
                  </button>
                  <span className="text-xl font-bold w-12 text-center">{quantityInCart}</span>
                  <button
                    onClick={handleAddToCart}
                    className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-secondary transition-colors hover:bg-secondary/10"
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
                className="min-h-12 flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/90 md:min-h-11"
                disabled={!selectedVariant}
              >
                <ShoppingCart className="mr-2" size={20} />
                {quantityInCart > 0 ? `আরও যোগ করুন (${quantityInCart})` : 'কার্টে যোগ করুন'}
              </Button>
              <Button
                onClick={handleBuyNow}
                size="lg"
                className="min-h-12 flex-1 md:min-h-11"
                disabled={!selectedVariant}
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
