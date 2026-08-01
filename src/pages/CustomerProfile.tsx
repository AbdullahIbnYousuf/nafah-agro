import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, Loader2, Package, ShoppingBag, User } from 'lucide-react';
import { toast } from 'sonner';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { getMyOrders } from '@/lib/api';
import type { OrderStatus, UnifiedOrder } from '@/lib/types';

const statusLabels: Record<OrderStatus, string> = {
  PENDING: 'অপেক্ষমান', CONFIRMED: 'নিশ্চিত', PROCESSING: 'প্রক্রিয়াধীন',
  DELIVERED: 'ডেলিভারি সম্পন্ন', COMPLETED: 'সম্পন্ন', CANCELLED: 'বাতিল',
  RETURNED_SELLABLE: 'ফেরত (বিক্রয়যোগ্য)', RETURNED_DAMAGED: 'ফেরত (ক্ষতিগ্রস্ত)',
};

export default function CustomerProfile() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<UnifiedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  useEffect(() => {
    void getMyOrders().then(setOrders).catch(() => toast.error('অর্ডার লোড করতে ব্যর্থ হয়েছে')).finally(() => setLoading(false));
  }, []);

  return <div className="min-h-screen flex flex-col"><Navbar /><main className="flex-1 container mx-auto px-4 py-8">
    <section className="bg-card rounded-2xl border p-6 mb-8 flex items-center gap-4"><div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center"><User size={32} /></div><div><h1 className="text-2xl font-bold">{user?.name}</h1><p className="text-muted-foreground">{user?.email}</p><Badge>{user?.role}</Badge></div></section>
    <section className="bg-card rounded-2xl border p-6"><div className="flex items-center gap-2 mb-6"><Package size={22} /><h2 className="text-xl font-bold">আমার ওয়েবসাইট অর্ডার</h2><span className="ml-auto text-sm text-muted-foreground">{orders.length}টি</span></div>
      {loading ? <div className="py-16 flex justify-center"><Loader2 className="animate-spin mr-2" />লোড হচ্ছে…</div> : orders.length === 0 ? <div className="text-center py-16"><ShoppingBag size={48} className="mx-auto text-muted-foreground/40 mb-4" /><p className="mb-4">কোনো অ্যাকাউন্ট-সংযুক্ত ওয়েবসাইট অর্ডার নেই</p><Button asChild><Link to="/shop">দোকানে যান</Link></Button></div> : <div className="space-y-3">{orders.map(order => {
        const expanded = expandedId === order.id;
        return <article key={order.id} className="border rounded-lg overflow-hidden"><button className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setExpandedId(expanded ? null : order.id)}>{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<div className="flex-1"><strong>{order.orderNumber}</strong><div className="text-xs text-muted-foreground">{new Date(order.placedAt).toLocaleString('bn-BD')} · {statusLabels[order.status]}</div></div><strong>৳{order.grandTotal}</strong></button>
          {expanded && <div className="border-t p-4 bg-muted/10"><div className="space-y-2">{order.items.map(item => <div key={item.id} className="flex justify-between text-sm"><span>{item.productName} — {item.variantName} × {item.quantity}</span><span>৳{item.grossLineRevenue}</span></div>)}</div><div className="border-t mt-3 pt-3 text-sm space-y-1"><div className="flex justify-between"><span>সাবটোটাল</span><span>৳{order.subtotal}</span></div><div className="flex justify-between"><span>ডেলিভারি</span><span>৳{order.deliveryCharge}</span></div><div className="flex justify-between font-bold"><span>মোট</span><span>৳{order.grandTotal}</span></div></div>{order.statusReason && <p className="text-sm text-destructive mt-3">{order.statusReason}</p>}</div>}
        </article>;
      })}</div>}
    </section>
  </main><Footer /></div>;
}
