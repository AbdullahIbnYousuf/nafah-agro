import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BarChart3, Boxes, ClipboardList, Edit, Loader2, Package, Plus, Settings2, Store, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  createCategory,
  getAdminCategories,
  getAdminProducts,
  setCategoryActive,
  setProductActive,
  updateCategory,
} from '@/lib/api';
import type { Category, Product } from '@/lib/types';

const AnalyticsDashboard = lazy(() => import('@/components/AnalyticsDashboard'));
const AddProductForm = lazy(() => import('@/components/AddProductForm'));
const VariantManager = lazy(() => import('@/components/VariantManager'));
const InventoryManager = lazy(() => import('@/components/InventoryManager'));
const PhysicalSaleScreen = lazy(() => import('@/components/PhysicalSaleScreen'));
const UnifiedOrderManager = lazy(() => import('@/components/UnifiedOrderManager'));

type Tab = 'dashboard' | 'products' | 'categories' | 'inventory' | 'physical-sales' | 'orders';

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w\u0980-\u09FF-]/g, '');
}

export default function Admin() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const links = [
    { tab: 'dashboard' as const, label: 'ড্যাশবোর্ড', mobileLabel: 'ড্যাশবোর্ড', icon: BarChart3 },
    { tab: 'products' as const, label: 'পণ্য', mobileLabel: 'পণ্য', icon: Package },
    { tab: 'categories' as const, label: 'ক্যাটাগরি', mobileLabel: 'ক্যাটাগরি', icon: Tag },
    { tab: 'inventory' as const, label: 'ক্রয় ও ইনভেন্টরি', mobileLabel: 'ইনভেন্টরি', icon: Boxes },
    { tab: 'physical-sales' as const, label: 'ফিজিক্যাল বিক্রয়', mobileLabel: 'বিক্রয়', icon: Store },
    { tab: 'orders' as const, label: 'অর্ডার', mobileLabel: 'অর্ডার', icon: ClipboardList },
  ];

  return (
    <div className="min-h-screen md:flex bg-background">
      <aside className="hidden w-64 shrink-0 bg-primary p-4 text-primary-foreground md:block">
        <Link to="/" className="mb-6 flex min-h-11 items-center text-xl font-bold text-accent">নাফাহ এগ্রো পরিচালনা</Link>
        <nav aria-label="পরিচালনা বিভাগ" className="space-y-1">
          {links.map(({ tab: itemTab, label, icon: Icon }) => (
            <button key={itemTab} type="button" onClick={() => setTab(itemTab)}
              aria-current={tab === itemTab ? 'page' : undefined}
              className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-4 py-3 text-sm ${tab === itemTab ? 'bg-secondary text-secondary-foreground' : 'hover:bg-secondary/20'}`}>
              <Icon size={18} />{label}
            </button>
          ))}
        </nav>
        <Button asChild variant="ghost" className="mt-8 text-primary-foreground/80">
          <Link to="/"><ArrowLeft size={16} className="mr-2" />সাইটে ফিরুন</Link>
        </Button>
      </aside>
      <header className="sticky top-0 z-40 flex min-h-14 items-center justify-between gap-3 border-b bg-primary px-4 text-primary-foreground md:hidden">
        <Link to="/" className="flex min-h-11 items-center font-bold text-accent">নাফাহ এগ্রো পরিচালনা</Link>
        <Link to="/" className="flex min-h-11 items-center gap-1.5 text-sm text-primary-foreground/80"><ArrowLeft size={16} />সাইটে ফিরুন</Link>
      </header>
      <main className="min-w-0 flex-1 p-4 pb-24 md:p-8">
        {tab === 'dashboard' && <Suspense fallback={<Loading />}><AnalyticsDashboard /></Suspense>}
        {tab === 'products' && <Suspense fallback={<Loading />}><Products /></Suspense>}
        {tab === 'categories' && <Categories />}
        {tab === 'inventory' && <Suspense fallback={<Loading />}><InventoryManager /></Suspense>}
        {tab === 'physical-sales' && <Suspense fallback={<Loading />}><PhysicalSaleScreen /></Suspense>}
        {tab === 'orders' && <Suspense fallback={<Loading />}><UnifiedOrderManager /></Suspense>}
      </main>
      <nav aria-label="মোবাইল পরিচালনা বিভাগ" className="fixed inset-x-0 bottom-0 z-30 border-t border-primary-foreground/15 bg-primary px-1 pb-[env(safe-area-inset-bottom)] text-primary-foreground shadow-[0_-6px_20px_rgba(0,0,0,0.12)] md:hidden">
        <div className="grid grid-cols-6">
          {links.map(({ tab: itemTab, label, mobileLabel, icon: Icon }) => (
            <button key={itemTab} type="button" aria-label={label} aria-current={tab === itemTab ? 'page' : undefined} onClick={() => setTab(itemTab)}
              className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[10px] transition-colors ${tab === itemTab ? 'bg-secondary text-secondary-foreground' : 'text-primary-foreground/75 hover:bg-primary-foreground/10 hover:text-primary-foreground'}`}>
              <Icon size={19} /><span className="w-full truncate text-center">{mobileLabel}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
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
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">পণ্য</h1><Button onClick={() => setShowForm(true)}><Plus size={16} className="mr-2" />নতুন পণ্য</Button></div>
    {(showForm || editing) && <AddProductForm categories={categories.filter((category) => category.isActive !== false)} editProduct={editing} onClose={close} onCreated={() => { close(); load(); }} />}
    {managing && <VariantManager product={managing} onClose={() => setManaging(undefined)} onUpdated={(updated) => { setManaging(updated); setProducts((current) => current.map((item) => item.id === updated.id ? updated : item)); }} />}
    <div className="bg-card border rounded-lg overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted"><tr><th className="text-left p-3">নাম</th><th className="text-left p-3">ডিফল্ট SKU</th><th className="text-right p-3">দাম</th><th className="text-center p-3">ভ্যারিয়েন্ট</th><th className="text-center p-3">অবস্থা</th><th className="p-3" /></tr></thead><tbody>
      {products.map((product) => <tr key={product.id} className={`border-t ${product.isActive === false ? 'opacity-60' : ''}`}><td className="p-3 font-medium">{product.name}</td><td className="p-3">{product.sku ?? 'SKU নেই'}</td><td className="p-3 text-right">৳{product.price}</td><td className="p-3 text-center">{product.variants?.length ?? 0}</td><td className="p-3 text-center">{product.isActive === false ? 'নিষ্ক্রিয়' : 'সক্রিয়'}</td><td className="whitespace-nowrap p-3 text-right"><button type="button" aria-label="ভ্যারিয়েন্ট ও দাম" title="ভ্যারিয়েন্ট ও দাম" onClick={() => setManaging(product)} className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:bg-muted"><Settings2 size={16} /></button><button type="button" aria-label="সম্পাদনা" onClick={() => setEditing(product)} className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:bg-muted"><Edit size={16} /></button><Button type="button" size="sm" variant={product.isActive === false ? 'default' : 'outline'} onClick={() => void setProductActive(product.id, product.isActive === false).then(load).catch(() => toast.error('পণ্যের অবস্থা পরিবর্তন হয়নি'))}>{product.isActive === false ? 'সক্রিয় করুন' : 'নিষ্ক্রিয় করুন'}</Button></td></tr>)}
    </tbody></table></div>
  </div>;
}

function Categories() {
  const [items, setItems] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<Category | null>(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => { void getAdminCategories().then(setItems).catch(() => toast.error('ক্যাটাগরি লোড হয়নি')); }, []);
  useEffect(load, [load]);
  async function add() {
    if (!name.trim()) return;
    await createCategory({ name: name.trim(), slug: slugify(name) });
    setName(''); load();
  }
  function openEdit(item: Category) {
    setEditing(item);
    setEditName(item.name);
    setEditError('');
  }

  async function saveEdit() {
    const normalized = editName.trim();
    if (!editing || !normalized) {
      setEditError('ক্যাটাগরির নাম লিখুন।');
      return;
    }
    setSaving(true);
    setEditError('');
    try {
      await updateCategory(editing.id, { name: normalized, slug: slugify(normalized) });
      setEditing(null);
      load();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'ক্যাটাগরি আপডেট হয়নি');
    } finally {
      setSaving(false);
    }
  }
  return <div><h1 className="text-2xl font-bold mb-6">ক্যাটাগরি</h1><div className="mb-6 grid max-w-lg gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="নতুন ক্যাটাগরি" /><Button onClick={() => void add()}>যোগ করুন</Button></div><div className="space-y-2 max-w-2xl">
    {items.map((item) => <div key={item.id} className={`flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between ${item.isActive === false ? 'opacity-60' : ''}`}><div className="min-w-0"><strong className="break-words">{item.name}</strong><div className="break-all text-xs text-muted-foreground">/{item.slug} · {item.isActive === false ? 'নিষ্ক্রিয়' : 'সক্রিয়'}</div></div><div className="flex items-center justify-end"><button type="button" className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-muted" aria-label="নাম বদলান" onClick={() => openEdit(item)}><Edit size={16} /></button><Button type="button" size="sm" variant={item.isActive === false ? 'default' : 'outline'} onClick={() => void setCategoryActive(item.id, item.isActive === false).then(load).catch(() => toast.error('ক্যাটাগরির অবস্থা পরিবর্তন হয়নি'))}>{item.isActive === false ? 'সক্রিয় করুন' : 'নিষ্ক্রিয় করুন'}</Button></div></div>)}
  </div><Dialog open={editing !== null} onOpenChange={(open) => { if (!open && !saving) setEditing(null); }}><DialogContent><DialogHeader><DialogTitle>ক্যাটাগরির নাম পরিবর্তন</DialogTitle><DialogDescription>নাম পরিবর্তন করলে URL স্লাগও নতুন নাম অনুযায়ী বদলাবে।</DialogDescription></DialogHeader><div><Label htmlFor="category-edit-name">ক্যাটাগরির নাম</Label><Input id="category-edit-name" className="mt-2" value={editName} onChange={(event) => { setEditName(event.target.value); setEditError(''); }} aria-invalid={Boolean(editError)} aria-describedby={editError ? 'category-edit-error' : undefined} />{editError && <p id="category-edit-error" role="alert" className="mt-2 text-sm text-destructive">{editError}</p>}</div><DialogFooter><Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={saving}>বন্ধ করুন</Button><Button type="button" onClick={() => void saveEdit()} disabled={saving}>{saving ? 'সংরক্ষণ হচ্ছে…' : 'সংরক্ষণ করুন'}</Button></DialogFooter></DialogContent></Dialog></div>;
}

function Loading() {
  return <div className="py-20 flex justify-center text-muted-foreground"><Loader2 className="animate-spin mr-2" />লোড হচ্ছে…</div>;
}
