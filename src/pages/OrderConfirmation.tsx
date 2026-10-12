import { Link } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { readReceipt } from '@/lib/checkoutStorage';
import { BUSINESS_PHONES } from '@/lib/contact';

export default function OrderConfirmation() {
  const { user, loading, session, sessionError } = useAuth();
  const scope = user?.id ?? 'guest';
  const receipt = !loading && !sessionError && !(session && !user) ? readReceipt(scope) : null;
  return <div className="flex min-h-screen flex-col"><Navbar /><main className="flex flex-1 items-center justify-center px-4 py-10"><section className="w-full max-w-xl rounded-2xl border bg-card p-6 text-center sm:p-8">
    {loading ? <p role="status">লোড হচ্ছে…</p> : receipt ? <><CheckCircle size={56} className="mx-auto mb-5 text-secondary" /><h1 className="text-2xl font-bold">ধন্যবাদ! আপনার অর্ডার পেয়েছি।</h1><p className="mt-3 text-muted-foreground">অর্ডার কনফার্ম করতে যত দ্রুত সম্ভব আপনার সঙ্গে যোগাযোগ করা হবে।</p><p className="mt-5 break-all font-bold">অর্ডার নম্বর: {receipt.orderNumber}</p><p className="mt-2 text-lg font-bold">মোট দাম: ৳{receipt.grandTotal.toFixed(2)}</p>{user && <Button asChild className="mt-5 w-full"><Link to={`/orders/${receipt.id}`}>অর্ডারের স্ট্যাটাস দেখুন</Link></Button>}<p className="mt-5 text-sm">যোগাযোগের সময় অর্ডার নম্বরটি বলুন।</p><div className="mt-2 flex flex-wrap justify-center gap-3">{BUSINESS_PHONES.map(phone => <a key={phone} href={`tel:${phone}`} className="text-sm underline">{phone}</a>)}</div></> : <><h1 className="text-xl font-bold">অর্ডারের রিসিট পাওয়া যায়নি</h1><p className="mt-2 text-sm text-muted-foreground">লগইন করা থাকলে আমার অর্ডার পেজে দেখুন।</p>{user && <Button asChild className="mt-4"><Link to="/orders">আমার অর্ডার</Link></Button>}</>}
    <Button asChild variant="outline" className="mt-5 w-full"><Link to="/shop">আরও কেনাকাটা করুন</Link></Button>
  </section></main><Footer /></div>;
}
