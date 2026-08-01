import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BarChart3, ClipboardList, Edit, Loader2, Package, Plus, Settings2, Tag } from 'lucide-react';
import { toast } from 'sonner';
import AddProductForm from '@/components/AddProductForm';
import VariantManager from '@/components/VariantManager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createCategory,
  getAdminCategories,
  getAdminProducts,
  getCategories,
  getOrders,
  getProducts,
  setCategoryActive,
  setProductActive,
  updateCategory,
  updateOrderStatus,
} from '@/lib/api';
import type { Category, Order, Product } from '@/lib/types';

type Tab = 'dashboard' | 'products' | 'categories' | 'orders';

const statusLabels: Record<Order['status'], string> = {
  pending: 'অপেক্ষমান', confirmed: 'নিশ্চিত', processing: 'প্রক্রিয়াধীন',
  delivered: 'ডেলিভারি সম্পন্ন', cancelled: 'বাতিল',
};

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w\u0980-\u09FF-]/g, '');
}

export default function Admin() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const links = [
    { tab: 'dashboard' as const, label: 'ড্যাশবোর্ড', icon: BarChart3 },
    { tab: 'products' as const, label: 'পণ্য', icon: Package },
    { tab: 'categories' as const, label: 'ক্যাটাগরি', icon: Tag },
    { tab: 'orders' as const, label: 'লেগ্যাসি অর্ডার', icon: ClipboardList },
  ];

  return (
    <div className="min-h-screen md:flex bg-background">
      <aside className="w-full md:w-64 bg-primary text-primary-foreground p-4">
        <Link to="/" className="block text-xl font-bold text-accent mb-6">নাফাহ এগ্রো অ্যাডমিন</Link>
        <nav className="space-y-1">
          {links.map(({ tab: itemTab, label, icon: Icon }) => (
            <button key={itemTab} type="button" onClick={() => setTab(itemTab)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm ${tab === itemTab ? 'bg-secondary text-secondary-foreground' : 'hover:bg-secondary/20'}`}>
              <Icon size={18} />{label}
            </button>
          ))}
        </nav>
        <Button asChild variant="ghost" className="mt-8 text-primary-foreground/80">
          <Link to="/"><ArrowLeft size={16} className="mr-2" />সাইটে ফিরুন</Link>
        </Button>
      </aside>
      <main className="flex-1 p-4 md:p-8 min-w-0">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'products' && <Products />}
        {tab === 'categories' && <Categories />}
        {tab === 'orders' && <Orders />}
      </main>
    </div>
  );
}

function Dashboard() {
  const [summary, setSummary] = useState<{ products: number; categories: number } | null>(null);
  useEffect(() => {
    Promise.all([getProducts({ limit: 1 }), getCategories()])
      .then(([products, categories]) => setSummary({ products: products.total, categories: categories.length }))
      .catch(() => toast.error('ড্যাশবোর্ড লোড করা যায়নি'));
  }, []);
  if (!summary) return <Loading />;
  return <div>
    <h1 className="text-2xl font-bold mb-6">ড্যাশবোর্ড</h1>
    <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
      <Stat label="PostgreSQL পণ্য" value={summary.products} icon={Package} />
      <Stat label="PostgreSQL ক্যাটাগরি" value={summary.categories} icon={Tag} />
    </div>
    <p className="mt-6 text-sm text-muted-foreground">অর্ডার এখনো অস্থায়ী MongoDB রুট ব্যবহার করে।</p>
  </div>;
}

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Package }) {
  return <div className="bg-card rounded-lg border p-5"><Icon className="text-secondary mb-2" /><div className="text-3xl font-bold">{value}</div><div className="text-muted-foreground">{label}</div></div>;
}

function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | undefined>();
  const [managing, setManaging] = useState<Product | undefined>();
  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getAdminProducts({ limit: 100 }), getAdminCategories()])
      .then(([page, items]) => { setProducts(page.data); setCategories(items); })
      .catch(() => toast.error('পণ্য লোড করা যায়নি'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  const close = () => { setShowForm(false); setEditing(undefined); };
  if (loading) return <Loading />;
  return <div>
    <div className="flex justify-between items-center mb-6"><h1 className="text-2xl font-bold">পণ্য</h1><Button onClick={() => setShowForm(true)}><Plus size={16} className="mr-2" />নতুন পণ্য</Button></div>
    {(showForm || editing) && <AddProductForm categories={categories.filter((category) => category.isActive !== false)} editProduct={editing} onClose={close} onCreated={() => { close(); load(); }} />}
    {managing && <VariantManager product={managing} onClose={() => setManaging(undefined)} onUpdated={(updated) => { setManaging(updated); setProducts((current) => current.map((item) => item.id === updated.id ? updated : item)); }} />}
    <div className="bg-card border rounded-lg overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted"><tr><th className="text-left p-3">নাম</th><th className="text-left p-3">ডিফল্ট SKU</th><th className="text-right p-3">দাম</th><th className="text-center p-3">ভ্যারিয়েন্ট</th><th className="text-center p-3">অবস্থা</th><th className="p-3" /></tr></thead><tbody>
      {products.map((product) => <tr key={product.id} className={`border-t ${product.isActive === false ? 'opacity-60' : ''}`}><td className="p-3 font-medium">{product.name}</td><td className="p-3">{product.sku ?? '—'}</td><td className="p-3 text-right">৳{product.price}</td><td className="p-3 text-center">{product.variants?.length ?? 0}</td><td className="p-3 text-center">{product.isActive === false ? 'নিষ্ক্রিয়' : 'সক্রিয়'}</td><td className="p-3 text-right whitespace-nowrap"><button type="button" aria-label="ভ্যারিয়েন্ট ও দাম" title="ভ্যারিয়েন্ট ও দাম" onClick={() => setManaging(product)} className="p-2"><Settings2 size={16} /></button><button type="button" aria-label="সম্পাদনা" onClick={() => setEditing(product)} className="p-2"><Edit size={16} /></button><Button type="button" size="sm" variant={product.isActive === false ? 'default' : 'outline'} onClick={() => void setProductActive(product.id, product.isActive === false).then(load).catch(() => toast.error('পণ্যের অবস্থা পরিবর্তন হয়নি'))}>{product.isActive === false ? 'সক্রিয় করুন' : 'নিষ্ক্রিয় করুন'}</Button></td></tr>)}
    </tbody></table></div>
  </div>;
}

function Categories() {
  const [items, setItems] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const load = useCallback(() => { void getAdminCategories().then(setItems).catch(() => toast.error('ক্যাটাগরি লোড হয়নি')); }, []);
  useEffect(load, [load]);
  async function add() {
    if (!name.trim()) return;
    await createCategory({ name: name.trim(), slug: slugify(name) });
    setName(''); load();
  }
  return <div><h1 className="text-2xl font-bold mb-6">ক্যাটাগরি</h1><div className="flex gap-2 max-w-lg mb-6"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="নতুন ক্যাটাগরি" /><Button onClick={() => void add()}>যোগ করুন</Button></div><div className="space-y-2 max-w-2xl">
    {items.map((item) => <div key={item.id} className={`bg-card border rounded-lg p-3 flex items-center justify-between ${item.isActive === false ? 'opacity-60' : ''}`}><div><strong>{item.name}</strong><div className="text-xs text-muted-foreground">/{item.slug} · {item.isActive === false ? 'নিষ্ক্রিয়' : 'সক্রিয়'}</div></div><div><button type="button" className="p-2" aria-label="নাম বদলান" onClick={() => { const next = prompt('ক্যাটাগরির নাম', item.name); if (next) void updateCategory(item.id, { name: next, slug: slugify(next) }).then(load).catch(() => toast.error('ক্যাটাগরি আপডেট হয়নি')); }}><Edit size={16} /></button><Button type="button" size="sm" variant={item.isActive === false ? 'default' : 'outline'} onClick={() => void setCategoryActive(item.id, item.isActive === false).then(load).catch(() => toast.error('ক্যাটাগরির অবস্থা পরিবর্তন হয়নি'))}>{item.isActive === false ? 'সক্রিয় করুন' : 'নিষ্ক্রিয় করুন'}</Button></div></div>)}
  </div></div>;
}

function Orders() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const load = useCallback(() => { void getOrders().then(setOrders).catch(() => toast.error('লেগ্যাসি অর্ডার লোড হয়নি')); }, []);
  useEffect(load, [load]);
  if (!orders) return <Loading />;
  return <div><h1 className="text-2xl font-bold mb-2">লেগ্যাসি অর্ডার</h1><p className="text-sm text-muted-foreground mb-6">এই স্ক্রিনটি অস্থায়ীভাবে MongoDB ব্যবহার করছে।</p><div className="space-y-3">{orders.map((order) => <div key={order.id} className="bg-card border rounded-lg p-4 flex flex-wrap gap-4 items-center justify-between"><div><strong>#{order.id.slice(-6).toUpperCase()}</strong><div>{order.customerName} · {order.customerPhone}</div><div className="text-sm text-muted-foreground">৳{order.total}</div></div><select value={order.status} onChange={(event) => void updateOrderStatus(order.id, event.target.value as Order['status']).then(load)} className="border rounded p-2 bg-background">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>)}</div></div>;
}

function Loading() {
  return <div className="py-20 flex justify-center text-muted-foreground"><Loader2 className="animate-spin mr-2" />লোড হচ্ছে…</div>;
}
