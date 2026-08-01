import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle, Loader2, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError, createWebsiteOrder, getDeliveryRates, getProducts } from '@/lib/api';
import type { DeliveryRate, Product, UnifiedOrder } from '@/lib/types';

export default function Cart() {
  const { items, removeItem, updateQuantity, clearCart, totalPrice } = useCart();
  const { user } = useAuth();
  const [productMap, setProductMap] = useState<Record<string, Product>>({});
  const [rates, setRates] = useState<DeliveryRate[]>([]);
  const [deliveryRateId, setDeliveryRateId] = useState('');
  const [showCheckout, setShowCheckout] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<UnifiedOrder | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');

  useEffect(() => {
    if (!user) return;
    setCustomerName(current => current || user.name);
    setCustomerPhone(current => current || user.phoneNumber || '');
    setCustomerEmail(current => current || user.email || '');
  }, [user]);

  useEffect(() => {
    void getDeliveryRates()
      .then(data => {
        const active = data.filter(rate => rate.isActive);
        setRates(active);
        setDeliveryRateId(current => current || active.find(rate => rate.charge !== null)?.id || active[0]?.id || '');
      })
      .catch(() => toast.error('ডেলিভারি এলাকার তথ্য লোড করা যায়নি'));
  }, []);

  useEffect(() => {
    if (items.length === 0) return;
    void getProducts({ limit: 100 }).then(page => {
      setProductMap(Object.fromEntries(page.data.map(product => [product.id, product])));
    });
  }, [items.length]);

  const selectedRate = rates.find(rate => rate.id === deliveryRateId);
  const estimatedTotal = useMemo(
    () => selectedRate?.charge == null ? null : totalPrice + selectedRate.charge,
    [selectedRate, totalPrice],
  );

  async function placeOrder() {
    if (!customerName.trim()) return toast.error('আপনার নাম দিন');
    if (!customerPhone.trim()) return toast.error('ফোন নম্বর দিন');
    if (!customerAddress.trim()) return toast.error('সম্পূর্ণ ঠিকানা দিন');
    if (!selectedRate) return toast.error('ডেলিভারি এলাকা নির্বাচন করুন');
    if (selectedRate.charge === null) return toast.error('এই এলাকার ডেলিভারি চার্জ এখনো নির্ধারিত হয়নি');

    setPlacing(true);
    try {
      const result = await createWebsiteOrder({
        items: items.map(item => ({ productVariantId: item.productVariantId, quantity: item.quantity })),
        customer: {
          name: customerName.trim(),
          phone: customerPhone.trim(),
          ...(customerEmail.trim() ? { email: customerEmail.trim() } : {}),
          address: customerAddress.trim(),
        },
        deliveryRateId,
        idempotencyKey,
      });
      setPlacedOrder(result.order);
      clearCart();
      setIdempotencyKey(crypto.randomUUID());
      toast.success(result.replayed ? 'আগের অর্ডারটি পাওয়া গেছে' : 'অর্ডার সফলভাবে প্লেস করা হয়েছে');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'অর্ডার প্লেস করতে ব্যর্থ হয়েছে');
    } finally {
      setPlacing(false);
    }
  }

  if (placedOrder) return (
    <div className="min-h-screen flex flex-col"><Navbar /><main className="flex-1 flex items-center justify-center px-4"><div className="text-center">
      <CheckCircle size={64} className="mx-auto text-green-500 mb-4" />
      <h1 className="text-2xl font-bold mb-2">অর্ডার সফল হয়েছে</h1>
      <p className="font-semibold mb-1">{placedOrder.orderNumber}</p>
      <p className="text-muted-foreground mb-2">অবস্থা: অপেক্ষমান — এখনো স্টক সংরক্ষণ করা হয়নি</p>
      <p className="text-lg font-bold text-secondary mb-6">সার্ভার-নির্ধারিত মোট: ৳{placedOrder.grandTotal}</p>
      <Button asChild><Link to="/shop">আরও কেনাকাটা করুন</Link></Button>
    </div></main><Footer /></div>
  );

  if (items.length === 0) return (
    <div className="min-h-screen flex flex-col"><Navbar /><main className="flex-1 flex items-center justify-center"><div className="text-center">
      <ShoppingBag size={64} className="mx-auto text-muted-foreground/40 mb-4" />
      <h1 className="text-2xl font-bold mb-2">আপনার কার্ট খালি</h1>
      <Button asChild><Link to="/shop">দোকানে যান</Link></Button>
    </div></main><Footer /></div>
  );

  return <div className="min-h-screen flex flex-col"><Navbar /><main className="container mx-auto px-4 py-8 flex-1">
    <div className="flex justify-between items-center mb-6"><h1 className="text-3xl font-bold">কার্ট</h1><Button variant="ghost" className="text-destructive" onClick={clearCart}><Trash2 size={16} className="mr-1" />সব মুছুন</Button></div>
    <div className="grid lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-4">{items.map(item => {
        const product = productMap[item.productId];
        return <div key={item.productVariantId} className="bg-card rounded-lg border p-4 flex gap-4">
          <div className="w-20 h-20 bg-muted rounded overflow-hidden">{product?.images[0] && <img src={product.images[0]} alt="" className="w-full h-full object-cover" />}</div>
          <div className="flex-1"><div className="font-semibold">{item.productName}</div><div className="text-xs text-muted-foreground">{item.variantName} · {item.sku}</div>
            <div className="flex justify-between items-center mt-3"><div className="flex gap-2 items-center">
              <button aria-label="পরিমাণ কমান" onClick={() => updateQuantity(item.productVariantId, item.quantity - 1)} className="w-8 h-8 rounded-full border flex items-center justify-center"><Minus size={14} /></button>
              <span>{item.quantity}</span>
              <button aria-label="পরিমাণ বাড়ান" onClick={() => updateQuantity(item.productVariantId, item.quantity + 1)} className="w-8 h-8 rounded-full border flex items-center justify-center"><Plus size={14} /></button>
            </div><div className="flex gap-3 items-center"><strong>৳{item.unitPrice * item.quantity}</strong><button aria-label="সরান" className="text-destructive" onClick={() => removeItem(item.productVariantId)}><Trash2 size={16} /></button></div></div>
          </div>
        </div>;
      })}</div>
      <aside className="bg-card rounded-lg border p-6 h-fit sticky top-24">
        <h2 className="font-bold text-lg mb-4">অর্ডার সারাংশ</h2>
        <div className="flex justify-between text-sm"><span>কার্টের আনুমানিক সাবটোটাল</span><span>৳{totalPrice}</span></div>
        <div className="mt-4"><Label>ডেলিভারি এলাকা *</Label><div className="space-y-2 mt-2">{rates.map(rate => <label key={rate.id} className={`block border rounded p-3 cursor-pointer ${deliveryRateId === rate.id ? 'border-secondary bg-secondary/10' : ''}`}><input type="radio" className="mr-2" checked={deliveryRateId === rate.id} onChange={() => setDeliveryRateId(rate.id)} />{rate.name} — {rate.charge === null ? 'চার্জ নির্ধারিত নয়' : `৳${rate.charge}`}</label>)}</div></div>
        <div className="border-t mt-4 pt-4 flex justify-between font-bold"><span>আনুমানিক মোট</span><span>{estimatedTotal === null ? '—' : `৳${estimatedTotal}`}</span></div>
        <p className="text-xs text-muted-foreground mt-2">চূড়ান্ত দাম, ছাড় ও ডেলিভারি চার্জ সার্ভার যাচাই করে নির্ধারণ করবে।</p>
        {!showCheckout ? <><Button className="w-full mt-4" onClick={() => setShowCheckout(true)}>অতিথি বা অ্যাকাউন্ট দিয়ে অর্ডার করুন</Button><Button asChild variant="ghost" className="w-full mt-2"><Link to="/shop"><ArrowLeft size={16} className="mr-1" />আরও পণ্য</Link></Button></> : <div className="mt-5 space-y-3 border-t pt-4">
          <div><Label htmlFor="name">নাম *</Label><Input id="name" value={customerName} onChange={event => setCustomerName(event.target.value)} /></div>
          <div><Label htmlFor="phone">ফোন *</Label><Input id="phone" type="tel" value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} /></div>
          <div><Label htmlFor="email">ইমেইল (ঐচ্ছিক)</Label><Input id="email" type="email" value={customerEmail} onChange={event => setCustomerEmail(event.target.value)} /></div>
          <div><Label htmlFor="address">সম্পূর্ণ ঠিকানা *</Label><textarea id="address" value={customerAddress} onChange={event => setCustomerAddress(event.target.value)} className="w-full min-h-20 border rounded-md bg-background p-2" /></div>
          <div className="rounded bg-muted/40 p-3 text-sm">পেমেন্ট: ক্যাশ অন ডেলিভারি</div>
          <Button className="w-full" disabled={placing || selectedRate?.charge == null} onClick={() => void placeOrder()}>{placing ? <><Loader2 size={16} className="animate-spin mr-2" />অর্ডার হচ্ছে…</> : 'অর্ডার নিশ্চিত করুন'}</Button>
          <Button variant="ghost" className="w-full" disabled={placing} onClick={() => setShowCheckout(false)}>পিছনে যান</Button>
        </div>}
      </aside>
    </div>
  </main><Footer /></div>;
}
