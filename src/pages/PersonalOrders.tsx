import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Loader2, RefreshCw, ShoppingBag } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError, getMyOrder, getMyOrders } from '@/lib/api';
import { formatAppDateTime } from '@/lib/date';
import { formatQuantity } from '@/lib/quantity';
import { productPackLabel } from '@/lib/productOptions';
import type { OrderStatus, PersonalOrder, PersonalOrdersPage } from '@/lib/types';

const statusHelp: Record<OrderStatus, string> = {
  PENDING: 'আপনার অর্ডার পেয়েছি। কনফার্ম করতে আপনার সঙ্গে যোগাযোগ করা হবে।',
  CONFIRMED: 'অর্ডার কনফার্ম হয়েছে।', PROCESSING: 'অর্ডার ডেলিভারির জন্য প্রস্তুত করা হচ্ছে।',
  DELIVERED: 'অর্ডার ডেলিভারড হয়েছে।', COMPLETED: 'অর্ডার সম্পন্ন হয়েছে।', CANCELLED: 'অর্ডারটি বাতিল হয়েছে।',
  RETURNED_SELLABLE: 'অর্ডারটি রিটার্ন হয়েছে।', RETURNED_DAMAGED: 'অর্ডারটি রিটার্ন হয়েছে।',
};

export default function PersonalOrders() {
  const { user } = useAuth();
  return <PersonalOrdersWorkspace key={user?.id ?? 'guest'} />;
}
function PersonalOrdersWorkspace() {
  const { user } = useAuth();
  const profileId = user?.id;
  const { orderId } = useParams();
  const [search, setSearch] = useSearchParams();
  const page = Math.max(1, Number(search.get('page')) || 1);
  const [list, setList] = useState<PersonalOrdersPage | null>(null);
  const [detail, setDetail] = useState<PersonalOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const controller = useRef<AbortController>();
  const load = useCallback(async () => {
    if (!profileId) return;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setLoading(true); setError('');
    try {
      if (orderId) {
        const result = await getMyOrder(orderId, request.signal);
        if (!request.signal.aborted) setDetail(result);
      } else {
        const result = await getMyOrders(page, request.signal);
        if (!request.signal.aborted) setList(result);
      }
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof ApiError && cause.status === 404 ? 'অর্ডারটি পাওয়া যায়নি।' : 'অর্ডার লোড করা যায়নি। ইন্টারনেট কানেকশন দেখে রিট্রাই করুন।');
    } finally { if (!request.signal.aborted) setLoading(false); }
  }, [orderId, page, profileId]);
  useEffect(() => {
    setList(null); setDetail(null); void load();
    const focus = () => void load(); window.addEventListener('focus', focus);
    return () => { controller.current?.abort(); window.removeEventListener('focus', focus); };
  }, [load]);
  return <div className="flex min-h-screen flex-col"><Navbar /><main className="container mx-auto flex-1 max-w-4xl px-4 py-8">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">{orderId ? 'অর্ডারের বিস্তারিত' : 'আমার অর্ডার'}</h1><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw size={16} className={loading ? 'mr-2 animate-spin' : 'mr-2'} />রিফ্রেশ</Button></div>
    {orderId && <Button asChild variant="ghost" className="mb-4"><Link to="/orders"><ArrowLeft size={16} className="mr-2" />আমার অর্ডার</Link></Button>}
    {loading ? <div role="status" className="flex justify-center gap-2 py-20"><Loader2 className="animate-spin" />লোড হচ্ছে…</div> : error ? <div role="alert" className="rounded-xl border bg-card p-6"><p>{error}</p><Button className="mt-3" onClick={() => void load()}>রিট্রাই করুন</Button></div> : orderId && detail ? <OrderDetail order={detail} /> : list && <>
      {list.data.length === 0 ? <div className="rounded-xl border bg-card p-10 text-center"><ShoppingBag className="mx-auto mb-4" size={40} /><p>এখনও কোনো অ্যাকাউন্ট-সংযুক্ত ওয়েবসাইট অর্ডার নেই।</p><Button asChild className="mt-4"><Link to="/shop">দোকানে যান</Link></Button></div> : <div className="space-y-3">{list.data.map(order => <Link key={order.id} to={`/orders/${order.id}`} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-secondary"><div className="min-w-0"><p className="break-all font-bold">{order.orderNumber}</p><p className="mt-1 text-xs text-muted-foreground">{formatAppDateTime(order.placedAt)}</p><Badge variant="outline" className="mt-2">{order.status}</Badge></div><div className="shrink-0 text-right"><p className="font-bold">৳{order.grandTotal.toFixed(2)}</p><p className="mt-2 flex items-center gap-1 text-xs">বিস্তারিত দেখুন<ArrowRight size={14} /></p></div></Link>)}</div>}
      {list.totalPages > 1 && <div className="mt-6 flex items-center justify-between gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setSearch({ page: String(page - 1) })}>আগের পেজ</Button><span className="text-sm">{page} / {list.totalPages}</span><Button variant="outline" disabled={page >= list.totalPages} onClick={() => setSearch({ page: String(page + 1) })}>পরের পেজ</Button></div>}
    </>}
  </main><Footer /></div>;
}
function OrderDetail({ order }: { order: PersonalOrder }) {
  return <section className="rounded-2xl border bg-card p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="break-all text-xl font-bold">{order.orderNumber}</h2><Badge>{order.status}</Badge></div>
    <p className="mt-2 text-sm text-muted-foreground">{formatAppDateTime(order.placedAt)}</p><p className="my-4 rounded-lg bg-muted/40 p-3 text-sm">{statusHelp[order.status]}</p>
    <div className="space-y-3">{order.items.map(item => <div key={item.id} className="flex justify-between gap-4 border-b pb-3 text-sm"><div><p className="font-medium">{productPackLabel(item.productName, item.variantName)}</p><p className="text-muted-foreground">{formatQuantity(item.quantity, item.quantityUnit, undefined, item.unitLabel)} × ৳{item.unitSellingPrice.toFixed(2)}</p></div><strong>৳{item.netLineRevenue.toFixed(2)}</strong></div>)}</div>
    <dl className="ml-auto mt-4 max-w-sm space-y-2 text-sm"><div className="flex justify-between"><dt>পণ্যের দাম</dt><dd>৳{order.subtotal.toFixed(2)}</dd></div>{order.discountTotal > 0 && <div className="flex justify-between"><dt>ডিসকাউন্ট</dt><dd>৳{order.discountTotal.toFixed(2)}</dd></div>}{order.priceIncreaseTotal > 0 && <div className="flex justify-between"><dt>অতিরিক্ত দাম</dt><dd>৳{order.priceIncreaseTotal.toFixed(2)}</dd></div>}<div className="flex justify-between"><dt>ডেলিভারি চার্জ</dt><dd>৳{order.deliveryCharge.toFixed(2)}</dd></div><div className="flex justify-between border-t pt-2 font-bold"><dt>মোট দাম</dt><dd>৳{order.grandTotal.toFixed(2)}</dd></div></dl>
    <div className="mt-6 border-t pt-4 text-sm"><h3 className="mb-2 font-bold">ডেলিভারি তথ্য</h3><p>{order.customerName}</p><p>{order.customerPhone}</p><p className="whitespace-pre-wrap">{order.customerAddress}</p><p>{order.deliveryArea}</p><p className="mt-2">পেমেন্ট: ক্যাশ অন ডেলিভারি</p></div>
  </section>;
}
