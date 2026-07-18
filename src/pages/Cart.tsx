import { useEffect, useState } from 'react';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { getProducts, createOrder } from '@/lib/api';
import { Product } from '@/lib/types';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, Plus, Minus, ShoppingBag, ArrowLeft, Loader2, CheckCircle, Tag, LogIn } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

const SHIPPING_INSIDE = 80;
const SHIPPING_OUTSIDE = 130;

// Demo coupons — replace with API call if needed
const COUPONS: Record<string, number> = {
  SAVE50: 50,
  KHAMARBARI10: 10,
};

type PaymentMethod = 'cod' | 'mobilebank' | 'sslcommerz';

const paymentLabels: Record<PaymentMethod, string> = {
  cod: 'ক্যাশ অন ডেলিভারি (COD)',
  mobilebank: 'মোবাইল ব্যাংকিং (বিকাশ/নগদ)',
  sslcommerz: 'SSLCommerz (কার্ড/অনলাইন)',
};

const Cart = () => {
  const { items, removeItem, updateQuantity, clearCart, totalPrice } = useCart();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [productMap, setProductMap] = useState<Record<string, Product>>({});
  const [showCheckout, setShowCheckout] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);

  // Checkout fields
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [insideDhaka, setInsideDhaka] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod');
  const [couponCode, setCouponCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [couponApplied, setCouponApplied] = useState(false);

  const shippingCost = insideDhaka ? SHIPPING_INSIDE : SHIPPING_OUTSIDE;
  const grandTotal = totalPrice + shippingCost - discount;

  // Auto-fill customer name from logged-in user
  useEffect(() => {
    if (user?.name && !customerName) {
      setCustomerName(user.name);
    }
  }, [user]);

  useEffect(() => {
    if (items.length === 0) return;
    getProducts({ limit: 1000 }).then(page => {
      const map: Record<string, Product> = {};
      page.data.forEach(p => { map[p.id] = p; });
      setProductMap(map);
    });
  }, [items.length]);

  const getAttrLabel = (productId: string, groupName: string, value: string) => {
    const product = productMap[productId];
    if (!product) return value;
    const group = product.attributes.find(g => g.name === groupName);
    return group?.options.find(o => o.value === value)?.label ?? value;
  };

  function handleApplyCoupon() {
    const code = couponCode.trim().toUpperCase();
    if (!code) return toast.error('কুপন কোড দিন');
    if (couponApplied) return toast.error('ইতোমধ্যে কুপন প্রয়োগ করা হয়েছে');
    const amount = COUPONS[code];
    if (amount == null) return toast.error('কুপন কোডটি সঠিক নয়');
    setDiscount(amount);
    setCouponApplied(true);
    toast.success(`৳${amount} ছাড় প্রযোজ্য হয়েছে!`);
  }

  function handleRemoveCoupon() {
    setDiscount(0);
    setCouponApplied(false);
    setCouponCode('');
  }

  async function handlePlaceOrder() {
    if (!customerName.trim()) return toast.error('আপনার নাম দিন');
    if (!customerPhone.trim()) return toast.error('ফোন নম্বর দিন');
    if (!customerAddress.trim()) return toast.error('ঠিকানা দিন');

    setPlacing(true);
    try {
      const enrichedItems = items.map(item => ({
        ...item,
        productName: item.productName || productMap[item.productId]?.name || item.productId,
      }));
      await createOrder({
        items: enrichedItems,
        subtotal: totalPrice,
        shippingCost,
        discount,
        total: grandTotal,
        paymentMethod,
        status: 'pending',
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        source: 'online',
      });
      clearCart();
      setOrderPlaced(true);
      toast.success('অর্ডার সফলভাবে প্লেস করা হয়েছে!');
    } catch {
      toast.error('অর্ডার প্লেস করতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।');
    } finally {
      setPlacing(false);
    }
  }

  if (orderPlaced) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <CheckCircle size={64} className="mx-auto text-green-500 mb-4" />
            <h1 className="text-2xl font-bold mb-2">অর্ডার সফল হয়েছে!</h1>
            <p className="text-muted-foreground mb-6">আমরা শীঘ্রই আপনার সাথে যোগাযোগ করবো।</p>
            <Button asChild className="bg-secondary text-secondary-foreground hover:bg-secondary/90">
              <Link to="/shop">আরও কেনাকাটা করুন</Link>
            </Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <ShoppingBag size={64} className="mx-auto text-muted-foreground/40 mb-4" />
            <h1 className="text-2xl font-bold mb-2">আপনার কার্ট খালি</h1>
            <p className="text-muted-foreground mb-6">দোকান থেকে পণ্য যোগ করুন</p>
            <Button asChild className="bg-secondary text-secondary-foreground hover:bg-secondary/90">
              <Link to="/shop">দোকানে যান</Link>
            </Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <div className="container mx-auto px-4 py-8 flex-1">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">কার্ট</h1>
          <Button
            variant="ghost"
            onClick={() => { clearCart(); toast.success('কার্ট খালি করা হয়েছে'); }}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 size={16} className="mr-1" /> সব মুছুন
          </Button>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Cart items */}
          <div className="lg:col-span-2 space-y-4">
            {items.map((item, idx) => {
              const product = productMap[item.productId];
              return (
                <div key={idx} className="bg-card rounded-lg p-4 card-shadow flex gap-4">
                  <div className="w-20 h-20 bg-muted rounded flex-shrink-0 flex items-center justify-center text-muted-foreground text-xs overflow-hidden">
                    {product?.images[0] ? (
                      <img src={product.images[0]} alt="" className="w-full h-full object-cover" />
                    ) : '📦'}
                  </div>
                  <div className="flex-1 min-w-0">
                    {product ? (
                      <Link to={`/products/${product.slug}`} className="font-semibold hover:text-secondary transition-colors line-clamp-1">
                        {product.name}
                      </Link>
                    ) : (
                      <span className="font-semibold text-muted-foreground">পণ্য লোড হচ্ছে...</span>
                    )}
                    <div className="text-xs text-muted-foreground mt-1 space-x-2">
                      {Object.entries(item.selectedAttributes).map(([k, v]) => (
                        <span key={k}>{k}: {getAttrLabel(item.productId, k, v)}</span>
                      ))}
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQuantity(item.productId, item.selectedAttributes, item.quantity - 1)}
                          className="w-8 h-8 rounded-full border flex items-center justify-center hover:bg-muted transition-colors"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="font-semibold w-8 text-center">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.productId, item.selectedAttributes, item.quantity + 1)}
                          className="w-8 h-8 rounded-full border flex items-center justify-center hover:bg-muted transition-colors"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-secondary">৳{item.unitPrice * item.quantity}</span>
                        <button
                          onClick={() => { removeItem(item.productId, item.selectedAttributes); toast.success('পণ্য সরানো হয়েছে'); }}
                          className="text-destructive hover:text-destructive/80 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary & Checkout */}
          <div className="bg-card rounded-lg p-6 card-shadow h-fit sticky top-24">
            <h2 className="font-bold text-lg mb-4">অর্ডার সারাংশ</h2>

            {/* Pricing breakdown */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">মোট পণ্য</span>
                <span>{items.reduce((s, i) => s + i.quantity, 0)}টি</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">সাবটোটাল</span>
                <span>৳{totalPrice}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ডেলিভারি চার্জ</span>
                <span>৳{shippingCost}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>ছাড়</span>
                  <span>- ৳{discount}</span>
                </div>
              )}
            </div>
            <div className="border-t mt-4 pt-4 flex justify-between font-bold text-lg">
              <span>মোট</span>
              <span className="text-secondary">৳{grandTotal}</span>
            </div>

            {!showCheckout ? (
              <>
                {/* Shipping zone */}
                <div className="mt-4">
                  <p className="text-sm font-medium mb-2">ডেলিভারি এলাকা</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setInsideDhaka(true)}
                      className={`text-sm rounded-lg border px-3 py-2 transition-all ${insideDhaka ? 'border-secondary bg-secondary/10 font-semibold' : 'border-border hover:border-secondary'}`}
                    >
                      ঢাকার ভিতরে<br />
                      <span className="text-xs font-normal text-muted-foreground">৳{SHIPPING_INSIDE}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInsideDhaka(false)}
                      className={`text-sm rounded-lg border px-3 py-2 transition-all ${!insideDhaka ? 'border-secondary bg-secondary/10 font-semibold' : 'border-border hover:border-secondary'}`}
                    >
                      ঢাকার বাইরে<br />
                      <span className="text-xs font-normal text-muted-foreground">৳{SHIPPING_OUTSIDE}</span>
                    </button>
                  </div>
                </div>

                {/* Coupon */}
                <div className="mt-4">
                  <p className="text-sm font-medium mb-2">কুপন কোড</p>
                  {couponApplied ? (
                    <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm">
                      <span className="text-green-700 flex items-center gap-1">
                        <Tag size={14} /> {couponCode.toUpperCase()} — ৳{discount} ছাড়
                      </span>
                      <button type="button" onClick={handleRemoveCoupon} className="text-destructive text-xs hover:underline">সরান</button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        value={couponCode}
                        onChange={e => setCouponCode(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleApplyCoupon()}
                        placeholder="কুপন কোড লিখুন"
                        className="bg-background text-sm"
                      />
                      <Button type="button" variant="outline" size="sm" onClick={handleApplyCoupon}>
                        প্রয়োগ
                      </Button>
                    </div>
                  )}
                </div>

                {/* Login gate: show message if not logged in */}
                {!authLoading && !isAuthenticated ? (
                  <div className="mt-4 space-y-3">
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                      <LogIn size={24} className="mx-auto text-amber-600 mb-2" />
                      <p className="text-sm font-medium text-amber-800">
                        অর্ডার করতে লগইন বা রেজিস্ট্রেশন করতে হবে
                      </p>
                      <div className="flex gap-2 mt-3 justify-center">
                        <Button asChild size="sm" className="bg-secondary text-secondary-foreground hover:bg-secondary/90">
                          <Link to="/login">লগইন</Link>
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <Link to="/register">রেজিস্ট্রেশন</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <Button
                    className="w-full mt-4 bg-secondary text-secondary-foreground hover:bg-secondary/90"
                    size="lg"
                    onClick={() => setShowCheckout(true)}
                    disabled={authLoading}
                  >
                    অর্ডার করুন
                  </Button>
                )}
                <Button asChild variant="ghost" className="w-full mt-2">
                  <Link to="/shop"><ArrowLeft size={16} className="mr-1" /> আরও পণ্য দেখুন</Link>
                </Button>
              </>
            ) : (
              <div className="mt-4 space-y-3 border-t pt-4">
                <h3 className="font-semibold">আপনার তথ্য দিন</h3>
                <div>
                  <Label htmlFor="name">নাম *</Label>
                  <Input
                    id="name"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="আপনার নাম"
                    className="mt-1 bg-background"
                    autoFocus
                    readOnly={!!user?.name}
                    disabled={!!user?.name}
                  />
                  {user?.name && (
                    <p className="text-xs text-muted-foreground mt-1">লগইন অ্যাকাউন্ট থেকে নেওয়া হয়েছে</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="phone">ফোন নম্বর *</Label>
                  <Input
                    id="phone"
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    placeholder="০১XXXXXXXXX"
                    className="mt-1 bg-background"
                    type="tel"
                  />
                </div>
                <div>
                  <Label htmlFor="address">ডেলিভারি ঠিকানা *</Label>
                  <textarea
                    id="address"
                    value={customerAddress}
                    onChange={e => setCustomerAddress(e.target.value)}
                    placeholder="সম্পূর্ণ ঠিকানা লিখুন"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[80px] resize-none"
                  />
                </div>

                {/* Payment method */}
                <div>
                  <Label>পেমেন্ট পদ্ধতি *</Label>
                  <div className="mt-1 space-y-2">
                    {(Object.keys(paymentLabels) as PaymentMethod[]).map(method => (
                      <label key={method} className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-all ${paymentMethod === method ? 'border-secondary bg-secondary/10' : 'border-border hover:border-secondary/50'}`}>
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={method}
                          checked={paymentMethod === method}
                          onChange={() => setPaymentMethod(method)}
                          className="accent-secondary"
                        />
                        <span className="text-sm">{paymentLabels[method]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Final total recap */}
                <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between text-muted-foreground">
                    <span>সাবটোটাল</span><span>৳{totalPrice}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>ডেলিভারি ({insideDhaka ? 'ঢাকার ভিতরে' : 'ঢাকার বাইরে'})</span>
                    <span>৳{shippingCost}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>ছাড়</span><span>- ৳{discount}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-base pt-1 border-t">
                    <span>মোট পরিশোধ</span><span className="text-secondary">৳{grandTotal}</span>
                  </div>
                </div>

                <Button
                  className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90"
                  size="lg"
                  onClick={handlePlaceOrder}
                  disabled={placing}
                >
                  {placing ? (
                    <span className="flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin" /> অর্ডার হচ্ছে...
                    </span>
                  ) : (
                    'অর্ডার নিশ্চিত করুন'
                  )}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => setShowCheckout(false)}
                  disabled={placing}
                >
                  পিছনে যান
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Cart;
