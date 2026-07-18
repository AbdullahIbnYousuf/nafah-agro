import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getMyOrders } from '@/lib/api';
import { Order } from '@/lib/types';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User, Package, Loader2, ChevronDown, ChevronRight, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';

const statusLabels: Record<Order['status'], string> = {
  pending: 'অপেক্ষমান',
  confirmed: 'নিশ্চিত',
  processing: 'প্রক্রিয়াধীন',
  delivered: 'ডেলিভারি সম্পন্ন',
  cancelled: 'বাতিল',
};

const statusColors: Record<Order['status'], string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  processing: 'bg-purple-100 text-purple-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

const paymentStatusLabels: Record<string, string> = {
  unpaid: 'পেমেন্ট বাকি',
  paid: 'পেমেন্ট সম্পন্ন',
  refunded: 'রিফান্ড হয়েছে',
};

function prettyOrderId(id: string) {
  return `#ORD-${id.slice(-6).toUpperCase()}`;
}

const CustomerProfile = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    getMyOrders()
      .then(setOrders)
      .catch(() => toast.error('অর্ডার লোড করতে ব্যর্থ হয়েছে'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-8">
        {/* Profile header */}
        <div className="bg-card rounded-2xl p-6 card-shadow mb-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <User size={32} className="text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{user?.name}</h1>
              <p className="text-muted-foreground">{user?.email}</p>
              <Badge className="mt-1">
                {user?.role === 'admin' ? 'অ্যাডমিন' : user?.role === 'moderator' ? 'মডারেটর' : 'কাস্টমার'}
              </Badge>
            </div>
          </div>
        </div>

        {/* Orders section */}
        <div className="bg-card rounded-2xl p-6 card-shadow">
          <div className="flex items-center gap-2 mb-6">
            <Package size={22} className="text-secondary" />
            <h2 className="text-xl font-bold">আমার অর্ডারসমূহ</h2>
            <span className="text-sm text-muted-foreground ml-auto">{orders.length}টি অর্ডার</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
              <Loader2 size={20} className="animate-spin" /> লোড হচ্ছে...
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-16">
              <ShoppingBag size={48} className="mx-auto text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground mb-4">আপনার কোনো অর্ডার নেই</p>
              <Button asChild className="bg-secondary text-secondary-foreground hover:bg-secondary/90">
                <Link to="/shop">দোকানে যান</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map(o => {
                const isExpanded = expandedId === o.id;
                const date = new Date(o.createdAt);

                return (
                  <div key={o.id} className="border rounded-lg overflow-hidden">
                    {/* Order header row */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : o.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                    >
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-primary">{prettyOrderId(o.id)}</span>
                          <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${statusColors[o.status]}`}>
                            {statusLabels[o.status]}
                          </span>
                          {o.paymentStatus && (
                            <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${
                              o.paymentStatus === 'paid' ? 'bg-green-100 text-green-800' :
                              o.paymentStatus === 'refunded' ? 'bg-orange-100 text-orange-800' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {paymentStatusLabels[o.paymentStatus]}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {date.toLocaleDateString('bn-BD')} — {o.items.length}টি আইটেম
                        </div>
                      </div>
                      <span className="font-bold text-secondary whitespace-nowrap">৳{o.total}</span>
                    </button>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="px-4 py-4 border-t bg-muted/10">
                        {/* Order tracking steps */}
                        <div className="mb-5">
                          <p className="text-sm font-semibold mb-3">অর্ডার ট্র্যাকিং</p>
                          <div className="flex items-center gap-1">
                            {(['pending', 'confirmed', 'processing', 'delivered'] as const).map((step, i) => {
                              const steps = ['pending', 'confirmed', 'processing', 'delivered'];
                              const currentIdx = steps.indexOf(o.status === 'cancelled' ? 'pending' : o.status);
                              const stepIdx = i;
                              const isCompleted = stepIdx <= currentIdx;
                              const isCancelled = o.status === 'cancelled';

                              return (
                                <div key={step} className="flex items-center flex-1">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                                    isCancelled ? 'bg-red-100 text-red-600' :
                                    isCompleted ? 'bg-secondary text-secondary-foreground' :
                                    'bg-muted text-muted-foreground'
                                  }`}>
                                    {isCancelled ? '✕' : stepIdx + 1}
                                  </div>
                                  {i < 3 && (
                                    <div className={`flex-1 h-1 mx-1 rounded ${
                                      !isCancelled && stepIdx < currentIdx ? 'bg-secondary' : 'bg-muted'
                                    }`} />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex text-[10px] text-muted-foreground mt-1">
                            <span className="flex-1 text-center">অপেক্ষমান</span>
                            <span className="flex-1 text-center">নিশ্চিত</span>
                            <span className="flex-1 text-center">প্রক্রিয়াধীন</span>
                            <span className="flex-1 text-center">ডেলিভারি</span>
                          </div>
                          {o.status === 'cancelled' && (
                            <p className="text-sm text-destructive mt-2 font-medium">এই অর্ডারটি বাতিল করা হয়েছে</p>
                          )}
                        </div>

                        {/* Items */}
                        <div className="space-y-2 mb-4">
                          <p className="text-sm font-semibold">আইটেমসমূহ</p>
                          {o.items.map((item, i) => (
                            <div key={i} className="flex justify-between text-sm py-1 border-b last:border-0">
                              <div>
                                <span className="font-medium">{item.productName}</span>
                                <span className="text-muted-foreground ml-2">× {item.quantity}</span>
                              </div>
                              <span className="font-semibold">৳{item.unitPrice * item.quantity}</span>
                            </div>
                          ))}
                        </div>

                        {/* Pricing */}
                        <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1">
                          <div className="flex justify-between text-muted-foreground">
                            <span>সাবটোটাল</span><span>৳{o.subtotal ?? o.total}</span>
                          </div>
                          <div className="flex justify-between text-muted-foreground">
                            <span>ডেলিভারি</span><span>৳{o.shippingCost ?? 0}</span>
                          </div>
                          {(o.discount ?? 0) > 0 && (
                            <div className="flex justify-between text-green-600">
                              <span>ছাড়</span><span>- ৳{o.discount}</span>
                            </div>
                          )}
                          <div className="flex justify-between font-bold text-base pt-1 border-t">
                            <span>মোট</span><span className="text-secondary">৳{o.total}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default CustomerProfile;
