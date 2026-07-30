import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Product, Category, Order } from '@/lib/types';
import {
  getProducts, getCategories,
  createProduct, updateProduct,
  createCategory, updateCategory,
  getOrders, updateOrderStatus,
  updateOrderPayment, updateOrderDelivery,
} from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import AddProductForm from '@/components/AddProductForm';
import { getErrorMessage } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Package, Tag, ClipboardList, BarChart3, Plus, Edit,
  ArrowLeft, AlertTriangle, Search, Menu, X, Loader2, Check,
  ChevronDown, ChevronRight, CreditCard, Truck,
} from 'lucide-react';
import { toast } from 'sonner';

type Tab = 'dashboard' | 'products' | 'categories' | 'orders';

const statusLabels: Record<Order['status'], string> = {
  pending: 'অপেক্ষমান', confirmed: 'নিশ্চিত', processing: 'প্রক্রিয়াধীন',
  delivered: 'ডেলিভারি সম্পন্ন', cancelled: 'বাতিল',
};
const statusColors: Record<Order['status'], string> = {
  pending: 'bg-yellow-100 text-yellow-800', confirmed: 'bg-blue-100 text-blue-800',
  processing: 'bg-purple-100 text-purple-800', delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};
const paymentLabels: Record<string, string> = { cod: 'COD', mobilebank: 'মোবাইল ব্যাংকিং', sslcommerz: 'SSLCommerz' };
const paymentStatusLabels: Record<string, string> = { unpaid: 'বাকি', paid: 'পেইড', refunded: 'রিফান্ড' };

function slugify(text: string) {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u0980-\u09FF-]/g, '').replace(/--+/g, '-').replace(/^-+|-+$/g, '');
}

function prettyOrderId(id: string) { return `#ORD-${id.slice(-6).toUpperCase()}`; }

const ModeratorPanel = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const sidebarLinks: { tab: Tab; icon: typeof BarChart3; label: string }[] = [
    { tab: 'dashboard', icon: BarChart3, label: 'ড্যাশবোর্ড' },
    { tab: 'products', icon: Package, label: 'পণ্যসমূহ' },
    { tab: 'categories', icon: Tag, label: 'ক্যাটাগরি' },
    { tab: 'orders', icon: ClipboardList, label: 'অর্ডার' },
  ];

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-primary text-primary-foreground transform transition-transform md:relative md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 border-b border-secondary/30 flex items-center justify-between">
          <div>
            <Link to="/" className="text-xl font-bold text-accent">মডারেটর প্যানেল</Link>
            <div className="text-xs text-primary-foreground/60 mt-0.5">{user?.name}</div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden"><X size={20} /></button>
        </div>
        <nav className="p-2 space-y-1">
          {sidebarLinks.map(l => (
            <button
              key={l.tab}
              onClick={() => { setTab(l.tab); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                tab === l.tab ? 'bg-secondary text-secondary-foreground' : 'hover:bg-secondary/20'
              }`}
            >
              <l.icon size={18} /> {l.label}
            </button>
          ))}
        </nav>
        <div className="absolute bottom-4 left-4 right-4">
          <Button asChild variant="ghost" className="w-full text-primary-foreground/70 hover:text-primary-foreground">
            <Link to="/"><ArrowLeft size={16} className="mr-1" /> সাইটে ফিরুন</Link>
          </Button>
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 bg-foreground/20 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />}

      <main className="flex-1 min-w-0">
        <header className="bg-card border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
          <button onClick={() => setSidebarOpen(true)} className="md:hidden"><Menu size={22} /></button>
          <h1 className="text-lg font-bold">{sidebarLinks.find(l => l.tab === tab)?.label}</h1>
          <Badge variant="outline" className="ml-auto text-yellow-600 border-yellow-300">মডারেটর</Badge>
        </header>

        <div className="p-4 md:p-6">
          {tab === 'dashboard' && <ModDashboard />}
          {tab === 'products' && <ModProducts />}
          {tab === 'categories' && <ModCategories />}
          {tab === 'orders' && <ModOrders />}
        </div>
      </main>
    </div>
  );
};

// ─── Dashboard ──────────

function ModDashboard() {
  const [counts, setCounts] = useState({ products: 0, categories: 0, orders: 0, pending: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getProducts({ limit: 1000 }), getCategories(), getOrders()])
      .then(([page, cats, ords]) => {
        setCounts({ products: page.total, categories: cats.length, orders: ords.length, pending: ords.filter(o => o.status === 'pending').length });
      })
      .catch(() => toast.error('ড্যাশবোর্ড লোড করতে ব্যর্থ'))
      .finally(() => setLoading(false));
  }, []);

  const stats = [
    { label: 'মোট পণ্য', value: counts.products, icon: Package },
    { label: 'মোট ক্যাটাগরি', value: counts.categories, icon: Tag },
    { label: 'মোট অর্ডার', value: counts.orders, icon: ClipboardList },
    { label: 'অপেক্ষমান', value: counts.pending, icon: AlertTriangle },
  ];

  if (loading) return <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground"><Loader2 size={20} className="animate-spin" /> লোড হচ্ছে...</div>;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((s, i) => (
        <div key={i} className="bg-card rounded-lg p-5 card-shadow">
          <s.icon size={20} className="text-secondary mb-2" />
          <div className="text-2xl font-bold">{s.value}</div>
          <div className="text-sm text-muted-foreground">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Products (moderators can add/edit but NOT delete) ──────────

function ModProducts() {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);

  useEffect(() => {
    Promise.all([getProducts({ limit: 1000 }), getCategories()])
      .then(([page, cats]) => { setProducts(page.data); setCategories(cats); })
      .catch(() => toast.error('পণ্য লোড করতে ব্যর্থ'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      {(showAddForm || editProduct) && (
        <AddProductForm
          categories={categories}
          editProduct={editProduct ?? undefined}
          onClose={() => { setShowAddForm(false); setEditProduct(null); }}
          onCreated={product => {
            if (editProduct) {
              setProducts(prev => prev.map(p => p.id === product.id ? product : p));
            } else {
              setProducts(prev => [product, ...prev]);
            }
            setShowAddForm(false);
            setEditProduct(null);
          }}
        />
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <Input placeholder="পণ্য খুঁজুন..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-card" />
        </div>
        <Button onClick={() => setShowAddForm(true)} className="bg-secondary text-secondary-foreground hover:bg-secondary/90">
          <Plus size={16} className="mr-1" /> নতুন পণ্য
        </Button>
      </div>

      <div className="bg-card rounded-lg card-shadow overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground"><Loader2 size={20} className="animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">{search ? 'কোনো পণ্য পাওয়া যায়নি' : 'এখনো কোনো পণ্য নেই'}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="text-left p-3 font-semibold">পণ্যের নাম</th>
                <th className="text-left p-3 font-semibold">দাম</th>
                <th className="text-left p-3 font-semibold">স্টক</th>
                <th className="text-left p-3 font-semibold">ক্যাটাগরি</th>
                <th className="text-right p-3 font-semibold">সম্পাদনা</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3 font-semibold">৳{p.price}</td>
                  <td className="p-3">{p.stock <= 5 ? <Badge variant="destructive">{p.stock}</Badge> : p.stock}</td>
                  <td className="p-3">{categories.find(c => c.id === p.categoryId)?.name || '-'}</td>
                  <td className="p-3 text-right">
                    <button onClick={() => setEditProduct(p)} className="text-secondary hover:text-secondary/80"><Edit size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Categories (moderators can add/edit but NOT delete) ──────────

function ModCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', slugTouched: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => toast.error('ক্যাটাগরি লোড করতে ব্যর্থ')).finally(() => setLoading(false));
  }, []);

  function openAdd() { setEditTarget(null); setForm({ name: '', slug: '', slugTouched: false }); setShowForm(true); }
  function openEdit(cat: Category) { setEditTarget(cat); setForm({ name: cat.name, slug: cat.slug, slugTouched: true }); setShowForm(true); }
  function closeForm() { setShowForm(false); setEditTarget(null); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.slug.trim()) return toast.error('নাম ও স্লাগ দিন');
    setSaving(true);
    try {
      if (editTarget) {
        const updated = await updateCategory(editTarget.id, { name: form.name.trim(), slug: form.slug.trim() });
        setCategories(prev => prev.map(c => c.id === updated.id ? updated : c));
        toast.success('আপডেট হয়েছে');
      } else {
        const created = await createCategory({ name: form.name.trim(), slug: form.slug.trim() });
        setCategories(prev => [...prev, created]);
        toast.success('যোগ করা হয়েছে');
      }
      closeForm();
    } catch (error: unknown) { toast.error(getErrorMessage(error, 'ব্যর্থ')); } finally { setSaving(false); }
  }

  return (
    <div>
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-end bg-foreground/30 backdrop-blur-sm">
          <div className="h-full w-full max-w-md bg-background shadow-2xl flex flex-col animate-fade-in">
            <div className="flex items-center justify-between px-6 py-4 bg-primary text-primary-foreground">
              <h2 className="text-lg font-bold">{editTarget ? 'সম্পাদনা' : 'নতুন ক্যাটাগরি'}</h2>
              <button onClick={closeForm}><X size={20} /></button>
            </div>
            <form id="mod-cat-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div>
                <Label>নাম *</Label>
                <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value, slug: p.slugTouched ? p.slug : slugify(e.target.value) }))} className="mt-1 bg-card" autoFocus />
              </div>
              <div>
                <Label>স্লাগ *</Label>
                <Input value={form.slug} onChange={e => setForm(p => ({ ...p, slug: e.target.value, slugTouched: true }))} className="mt-1 bg-card font-mono text-sm" />
              </div>
            </form>
            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-card">
              <Button variant="ghost" onClick={closeForm} disabled={saving}>বাতিল</Button>
              <Button type="submit" form="mod-cat-form" disabled={saving} className="bg-secondary text-secondary-foreground hover:bg-secondary/90 min-w-[120px]">
                {saving ? '...' : <><Check size={15} className="mr-1" />{editTarget ? 'আপডেট' : 'সংরক্ষণ'}</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end mb-4">
        <Button onClick={openAdd} className="bg-secondary text-secondary-foreground hover:bg-secondary/90"><Plus size={16} className="mr-1" /> নতুন ক্যাটাগরি</Button>
      </div>

      <div className="bg-card rounded-lg card-shadow overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground"><Loader2 size={20} className="animate-spin" /></div>
        ) : categories.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">কোনো ক্যাটাগরি নেই</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr><th className="text-left p-3 font-semibold">নাম</th><th className="text-left p-3 font-semibold">স্লাগ</th><th className="text-right p-3 font-semibold">সম্পাদনা</th></tr>
            </thead>
            <tbody>
              {categories.map(c => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3 text-muted-foreground font-mono text-xs">{c.slug}</td>
                  <td className="p-3 text-right">
                    <button onClick={() => openEdit(c)} className="text-secondary hover:text-secondary/80"><Edit size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Orders (moderators can update status, payment, delivery) ──────────

function ModOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    getOrders().then(setOrders).catch(() => toast.error('অর্ডার লোড করতে ব্যর্থ')).finally(() => setLoading(false));
  }, []);

  async function handleStatusChange(id: string, status: Order['status']) {
    setUpdatingId(id);
    try {
      const updated = await updateOrderStatus(id, status);
      setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
      toast.success('স্ট্যাটাস আপডেট হয়েছে');
    } catch { toast.error('ব্যর্থ'); } finally { setUpdatingId(null); }
  }

  async function handlePaymentUpdate(id: string, paymentStatus: string, paymentReference: string) {
    try {
      const updated = await updateOrderPayment(id, { paymentStatus, paymentReference });
      setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
      toast.success('পেমেন্ট আপডেট হয়েছে');
    } catch { toast.error('ব্যর্থ'); }
  }

  async function handleDeliveryUpdate(id: string, deliveryTeam: string, deliveryRider: string, deliveryNotes: string) {
    try {
      const updated = await updateOrderDelivery(id, { deliveryTeam, deliveryRider, deliveryNotes });
      setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
      toast.success('ডেলিভারি তথ্য আপডেট হয়েছে');
    } catch { toast.error('ব্যর্থ'); }
  }

  return (
    <div className="bg-card rounded-lg card-shadow overflow-x-auto">
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground"><Loader2 size={20} className="animate-spin" /></div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">কোনো অর্ডার নেই</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="text-left p-3 font-semibold w-6"></th>
              <th className="text-left p-3 font-semibold">অর্ডার</th>
              <th className="text-left p-3 font-semibold">গ্রাহক</th>
              <th className="text-left p-3 font-semibold">মোট</th>
              <th className="text-left p-3 font-semibold">পেমেন্ট</th>
              <th className="text-left p-3 font-semibold">স্ট্যাটাস</th>
              <th className="text-left p-3 font-semibold">তারিখ</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(o => {
              const isExpanded = expandedId === o.id;
              const date = new Date(o.createdAt);
              return (
                <React.Fragment key={o.id}>
                  <tr className="border-b hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : o.id)}>
                    <td className="p-3 text-muted-foreground">{isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td>
                    <td className="p-3">
                      <div className="font-semibold text-primary">{prettyOrderId(o.id)}</div>
                    </td>
                    <td className="p-3">
                      <div>{o.customerName}</div>
                      <div className="text-xs text-muted-foreground">{o.customerPhone}</div>
                    </td>
                    <td className="p-3 font-semibold">৳{o.total}</td>
                    <td className="p-3">
                      <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${
                        o.paymentStatus === 'paid' ? 'bg-green-100 text-green-800' :
                        o.paymentStatus === 'refunded' ? 'bg-orange-100 text-orange-800' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {paymentStatusLabels[o.paymentStatus ?? 'unpaid']}
                      </span>
                    </td>
                    <td className="p-3" onClick={e => e.stopPropagation()}>
                      <select
                        value={o.status}
                        disabled={updatingId === o.id}
                        onChange={e => handleStatusChange(o.id, e.target.value as Order['status'])}
                        className={`text-xs font-medium rounded-full px-2 py-1 border-0 cursor-pointer focus:outline-none ${statusColors[o.status]}`}
                      >
                        {(Object.keys(statusLabels) as Order['status'][]).map(s => <option key={s} value={s}>{statusLabels[s]}</option>)}
                      </select>
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">{date.toLocaleDateString('bn-BD')}</td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-b bg-muted/20">
                      <td colSpan={7} className="px-6 py-4">
                        <OrderDetails order={o} onPaymentUpdate={handlePaymentUpdate} onDeliveryUpdate={handleDeliveryUpdate} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function OrderDetails({ order: o, onPaymentUpdate, onDeliveryUpdate }: {
  order: Order;
  onPaymentUpdate: (id: string, ps: string, pr: string) => Promise<void>;
  onDeliveryUpdate: (id: string, dt: string, dr: string, dn: string) => Promise<void>;
}) {
  const [paymentStatus, setPaymentStatus] = useState(o.paymentStatus ?? 'unpaid');
  const [paymentRef, setPaymentRef] = useState(o.paymentReference ?? '');
  const [deliveryTeam, setDeliveryTeam] = useState(o.deliveryTeam ?? '');
  const [deliveryRider, setDeliveryRider] = useState(o.deliveryRider ?? '');
  const [deliveryNotes, setDeliveryNotes] = useState(o.deliveryNotes ?? '');

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Items */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">আইটেমসমূহ</p>
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-muted-foreground border-b"><th className="text-left pb-2">পণ্য</th><th className="text-right pb-2">পরিমাণ</th><th className="text-right pb-2">মোট</th></tr></thead>
          <tbody>
            {o.items.map((item, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-2 font-medium">{item.productName}</td>
                <td className="py-2 text-right">{item.quantity}</td>
                <td className="py-2 text-right font-semibold">৳{item.unitPrice * item.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 text-sm text-muted-foreground">
          <div>ঠিকানা: {o.customerAddress}</div>
          <div>পেমেন্ট: {paymentLabels[o.paymentMethod ?? 'cod']}</div>
        </div>
      </div>

      {/* Payment & Delivery */}
      <div className="space-y-4">
        <div className="bg-card rounded-lg border p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1"><CreditCard size={14} /> পেমেন্ট ট্র্যাকিং</p>
          <div className="space-y-2">
            <div>
              <Label className="text-xs">পেমেন্ট স্ট্যাটাস</Label>
              <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value as 'unpaid' | 'paid' | 'refunded')} className="w-full mt-1 text-sm rounded-md border px-2 py-1.5 bg-background">
                <option value="unpaid">বাকি</option>
                <option value="paid">পেইড</option>
                <option value="refunded">রিফান্ড</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">রেফারেন্স (TXN ID)</Label>
              <Input value={paymentRef} onChange={e => setPaymentRef(e.target.value)} placeholder="bKash/Nagad TXN ID" className="mt-1 text-sm bg-background" />
            </div>
            <Button size="sm" onClick={() => onPaymentUpdate(o.id, paymentStatus, paymentRef)} className="bg-secondary text-secondary-foreground hover:bg-secondary/90 w-full">
              পেমেন্ট আপডেট
            </Button>
          </div>
        </div>

        <div className="bg-card rounded-lg border p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1"><Truck size={14} /> ডেলিভারি অ্যাসাইনমেন্ট</p>
          <div className="space-y-2">
            <div>
              <Label className="text-xs">ডেলিভারি টিম</Label>
              <Input value={deliveryTeam} onChange={e => setDeliveryTeam(e.target.value)} placeholder="যেমন: Pathao, Steadfast" className="mt-1 text-sm bg-background" />
            </div>
            <div>
              <Label className="text-xs">রাইডার নাম</Label>
              <Input value={deliveryRider} onChange={e => setDeliveryRider(e.target.value)} placeholder="রাইডারের নাম" className="mt-1 text-sm bg-background" />
            </div>
            <div>
              <Label className="text-xs">নোটস</Label>
              <Input value={deliveryNotes} onChange={e => setDeliveryNotes(e.target.value)} placeholder="অতিরিক্ত তথ্য" className="mt-1 text-sm bg-background" />
            </div>
            <Button size="sm" onClick={() => onDeliveryUpdate(o.id, deliveryTeam, deliveryRider, deliveryNotes)} className="bg-secondary text-secondary-foreground hover:bg-secondary/90 w-full">
              ডেলিভারি আপডেট
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ModeratorPanel;
