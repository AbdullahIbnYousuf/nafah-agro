import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Product, Category, Order, Moderator } from '@/lib/types';
import {
  getProducts, getCategories, deleteProduct,
  createCategory, updateCategory, deleteCategory,
  getOrders, updateOrderStatus, updateOrderPayment, updateOrderDelivery,
  getModerators, registerModerator, resetModeratorPassword,
  toggleModeratorActive, deleteModerator,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import AddProductForm from '@/components/AddProductForm';
import {
  Package, Tag, ClipboardList, BarChart3, Plus, Edit, Trash2,
  ArrowLeft, AlertTriangle, Search, Menu, X, Loader2, Check,
  ChevronDown, ChevronRight, Users, KeyRound, CreditCard, Truck,
  ShieldCheck, ShieldOff, Bell,
} from 'lucide-react';
import { toast } from 'sonner';

type Tab = 'dashboard' | 'products' | 'categories' | 'orders' | 'moderators';

const paymentMethodLabels: Record<string, string> = { cod: 'COD', mobilebank: 'মোবাইল ব্যাংকিং', sslcommerz: 'SSLCommerz' };
const statusLabels: Record<Order['status'], string> = { pending: 'অপেক্ষমান', confirmed: 'নিশ্চিত', processing: 'প্রক্রিয়াধীন', delivered: 'ডেলিভারি সম্পন্ন', cancelled: 'বাতিল' };
const statusColors: Record<Order['status'], string> = { pending: 'bg-yellow-100 text-yellow-800', confirmed: 'bg-blue-100 text-blue-800', processing: 'bg-purple-100 text-purple-800', delivered: 'bg-green-100 text-green-800', cancelled: 'bg-red-100 text-red-800' };
const paymentStatusLabels: Record<string, string> = { unpaid: 'বাকি', paid: 'পেইড', refunded: 'রিফান্ড' };

function slugify(text: string) {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u0980-\u09FF-]/g, '').replace(/--+/g, '-').replace(/^-+|-+$/g, '');
}

function prettyOrderId(id: string) { return `#ORD-${id.slice(-6).toUpperCase()}`; }

const Admin = () => {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [resetRequestCount, setResetRequestCount] = useState(0);

  // Fetch reset request count for badge
  useEffect(() => {
    getModerators().then(mods => setResetRequestCount(mods.filter(m => m.passwordResetRequested).length)).catch(() => {});
  }, []);

  const sidebarLinks: { tab: Tab; icon: typeof BarChart3; label: string; badge?: number }[] = [
    { tab: 'dashboard', icon: BarChart3, label: 'ড্যাশবোর্ড' },
    { tab: 'products', icon: Package, label: 'পণ্যসমূহ' },
    { tab: 'categories', icon: Tag, label: 'ক্যাটাগরি' },
    { tab: 'orders', icon: ClipboardList, label: 'অর্ডার' },
    { tab: 'moderators', icon: Users, label: 'মডারেটর', badge: resetRequestCount },
  ];

  return (
    <div className="min-h-screen flex bg-background">
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-primary text-primary-foreground transform transition-transform md:relative md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 border-b border-secondary/30 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold text-accent">খামারবাড়ি অ্যাডমিন</Link>
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
              {(l.badge ?? 0) > 0 && <span className="ml-auto bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">{l.badge}</span>}
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
        </header>
        <div className="p-4 md:p-6">
          {tab === 'dashboard' && <DashboardTab />}
          {tab === 'products' && <ProductsTab />}
          {tab === 'categories' && <CategoriesTab />}
          {tab === 'orders' && <OrdersTab />}
          {tab === 'moderators' && <ModeratorsTab onResetCountChange={setResetRequestCount} />}
        </div>
      </main>
    </div>
  );
};

// ─── Dashboard ──────────

function DashboardTab() {
  const [counts, setCounts] = useState({ products: 0, categories: 0, orders: 0, pending: 0, moderators: 0 });
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getProducts({ limit: 1000 }), getCategories(), getOrders(), getModerators()])
      .then(([page, cats, ords, mods]) => {
        setCounts({ products: page.total, categories: cats.length, orders: ords.length, pending: ords.filter(o => o.status === 'pending').length, moderators: mods.length });
        setLowStock(page.data.filter(p => p.stock <= 5));
      })
      .catch(() => toast.error('ড্যাশবোর্ড লোড করতে ব্যর্থ'))
      .finally(() => setLoading(false));
  }, []);

  const stats = [
    { label: 'মোট পণ্য', value: counts.products, icon: Package },
    { label: 'মোট ক্যাটাগরি', value: counts.categories, icon: Tag },
    { label: 'মোট অর্ডার', value: counts.orders, icon: ClipboardList },
    { label: 'অপেক্ষমান', value: counts.pending, icon: AlertTriangle },
    { label: 'মডারেটর', value: counts.moderators, icon: Users },
  ];

  if (loading) return <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground"><Loader2 size={20} className="animate-spin" /> লোড হচ্ছে...</div>;

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {stats.map((s, i) => (
          <div key={i} className="bg-card rounded-lg p-5 card-shadow">
            <s.icon size={20} className="text-secondary mb-2" />
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-sm text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>
      {lowStock.length > 0 && (
        <div className="bg-card rounded-lg p-5 card-shadow">
          <h3 className="font-bold mb-3 flex items-center gap-2"><AlertTriangle size={18} className="text-destructive" /> কম স্টক সতর্কতা</h3>
          <div className="space-y-2">
            {lowStock.map(p => (<div key={p.id} className="flex justify-between py-2 border-b last:border-0"><span>{p.name}</span><Badge variant="destructive">{p.stock}টি</Badge></div>))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Products ──────────

function ProductsTab() {
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

  async function handleDelete(id: string, name: string) {
    if (!confirm(`"${name}" মুছে ফেলবেন?`)) return;
    try { await deleteProduct(id); setProducts(prev => prev.filter(p => p.id !== id)); toast.success('মুছে ফেলা হয়েছে'); } catch { toast.error('ব্যর্থ'); }
  }

  return (
    <div>
      {(showAddForm || editProduct) && (
        <AddProductForm categories={categories} editProduct={editProduct ?? undefined} onClose={() => { setShowAddForm(false); setEditProduct(null); }}
          onCreated={product => { if (editProduct) setProducts(prev => prev.map(p => p.id === product.id ? product : p)); else setProducts(prev => [product, ...prev]); setShowAddForm(false); setEditProduct(null); }} />
      )}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} /><Input placeholder="পণ্য খুঁজুন..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-card" /></div>
        <Button onClick={() => setShowAddForm(true)} className="bg-secondary text-secondary-foreground hover:bg-secondary/90"><Plus size={16} className="mr-1" /> নতুন পণ্য</Button>
      </div>
      <div className="bg-card rounded-lg card-shadow overflow-x-auto">
        {loading ? <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground"><Loader2 size={20} className="animate-spin" /></div>
        : filtered.length === 0 ? <div className="text-center py-16 text-muted-foreground">{search ? 'পাওয়া যায়নি' : 'কোনো পণ্য নেই'}</div>
        : (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50"><tr><th className="text-left p-3 font-semibold">পণ্যের নাম</th><th className="text-left p-3 font-semibold">দাম</th><th className="text-left p-3 font-semibold">স্টক</th><th className="text-left p-3 font-semibold">ক্যাটাগরি</th><th className="text-right p-3 font-semibold">অ্যাকশন</th></tr></thead>
            <tbody>{filtered.map(p => (<tr key={p.id} className="border-b last:border-0 hover:bg-muted/30"><td className="p-3 font-medium"><div>{p.name}</div><div className="text-xs text-muted-foreground font-mono">{p.slug}</div></td><td className="p-3 font-semibold">৳{p.price}</td><td className="p-3">{p.stock <= 5 ? <Badge variant="destructive">{p.stock}</Badge> : p.stock}</td><td className="p-3">{categories.find(c => c.id === p.categoryId)?.name || '-'}</td><td className="p-3 text-right"><button onClick={() => setEditProduct(p)} className="text-secondary hover:text-secondary/80 mr-3"><Edit size={16} /></button><button onClick={() => handleDelete(p.id, p.name)} className="text-destructive hover:text-destructive/80"><Trash2 size={16} /></button></td></tr>))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Categories ──────────

function CategoriesTab() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', slugTouched: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => { getCategories().then(setCategories).catch(() => toast.error('ব্যর্থ')).finally(() => setLoading(false)); }, []);

  function openAdd() { setEditTarget(null); setForm({ name: '', slug: '', slugTouched: false }); setShowForm(true); }
  function openEdit(cat: Category) { setEditTarget(cat); setForm({ name: cat.name, slug: cat.slug, slugTouched: true }); setShowForm(true); }
  function closeForm() { setShowForm(false); setEditTarget(null); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); if (!form.name.trim() || !form.slug.trim()) return toast.error('নাম ও স্লাগ দিন'); setSaving(true);
    try {
      if (editTarget) { const u = await updateCategory(editTarget.id, { name: form.name.trim(), slug: form.slug.trim() }); setCategories(prev => prev.map(c => c.id === u.id ? u : c)); toast.success('আপডেট হয়েছে'); }
      else { const c = await createCategory({ name: form.name.trim(), slug: form.slug.trim() }); setCategories(prev => [...prev, c]); toast.success('যোগ করা হয়েছে'); }
      closeForm();
    } catch (err: any) { toast.error(err.message ?? 'ব্যর্থ'); } finally { setSaving(false); }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`"${name}" মুছে ফেলবেন?`)) return;
    try { await deleteCategory(id); setCategories(prev => prev.filter(c => c.id !== id)); toast.success('মুছে ফেলা হয়েছে'); } catch { toast.error('ব্যর্থ'); }
  }

  return (
    <div>
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-end bg-foreground/30 backdrop-blur-sm">
          <div className="h-full w-full max-w-md bg-background shadow-2xl flex flex-col animate-fade-in">
            <div className="flex items-center justify-between px-6 py-4 bg-primary text-primary-foreground"><h2 className="text-lg font-bold">{editTarget ? 'সম্পাদনা' : 'নতুন ক্যাটাগরি'}</h2><button onClick={closeForm}><X size={20} /></button></div>
            <form id="cat-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div><Label>নাম *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value, slug: p.slugTouched ? p.slug : slugify(e.target.value) }))} className="mt-1 bg-card" autoFocus /></div>
              <div><Label>স্লাগ *</Label><Input value={form.slug} onChange={e => setForm(p => ({ ...p, slug: e.target.value, slugTouched: true }))} className="mt-1 bg-card font-mono text-sm" /></div>
            </form>
            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-card">
              <Button variant="ghost" onClick={closeForm} disabled={saving}>বাতিল</Button>
              <Button type="submit" form="cat-form" disabled={saving} className="bg-secondary text-secondary-foreground hover:bg-secondary/90 min-w-[130px]">{saving ? '...' : <><Check size={15} className="mr-1" />{editTarget ? 'আপডেট' : 'সংরক্ষণ'}</>}</Button>
            </div>
          </div>
        </div>
      )}
      <div className="flex justify-end mb-4"><Button onClick={openAdd} className="bg-secondary text-secondary-foreground hover:bg-secondary/90"><Plus size={16} className="mr-1" /> নতুন ক্যাটাগরি</Button></div>
      <div className="bg-card rounded-lg card-shadow overflow-x-auto">
        {loading ? <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground"><Loader2 size={20} className="animate-spin" /></div>
        : categories.length === 0 ? <div className="text-center py-16 text-muted-foreground">কোনো ক্যাটাগরি নেই</div>
        : (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50"><tr><th className="text-left p-3 font-semibold">নাম</th><th className="text-left p-3 font-semibold">স্লাগ</th><th className="text-right p-3 font-semibold">অ্যাকশন</th></tr></thead>
            <tbody>{categories.map(c => (<tr key={c.id} className="border-b last:border-0 hover:bg-muted/30"><td className="p-3 font-medium">{c.name}</td><td className="p-3 text-muted-foreground font-mono text-xs">{c.slug}</td><td className="p-3 text-right"><button onClick={() => openEdit(c)} className="text-secondary hover:text-secondary/80 mr-3"><Edit size={16} /></button><button onClick={() => handleDelete(c.id, c.name)} className="text-destructive hover:text-destructive/80"><Trash2 size={16} /></button></td></tr>))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Moderators ──────────

function ModeratorsTab({ onResetCountChange }: { onResetCountChange: (n: number) => void }) {
  const [moderators, setModerators] = useState<Moderator[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [resetId, setResetId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  function load() {
    getModerators().then(mods => {
      setModerators(mods);
      onResetCountChange(mods.filter(m => m.passwordResetRequested).length);
    }).catch(() => toast.error('মডারেটর লোড করতে ব্যর্থ')).finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); if (!name.trim() || !email.trim() || !password) return toast.error('সব ফিল্ড পূরণ করুন');
    setCreating(true);
    try {
      const res = await registerModerator(name.trim(), email.trim(), password);
      setModerators(prev => [res.user, ...prev]);
      toast.success('মডারেটর তৈরি হয়েছে');
      setShowCreate(false); setName(''); setEmail(''); setPassword('');
    } catch (err: any) { toast.error(err.message ?? 'ব্যর্থ'); } finally { setCreating(false); }
  }

  async function handleToggle(id: string) {
    try {
      const updated = await toggleModeratorActive(id);
      setModerators(prev => prev.map(m => m.id === updated.id ? updated : m));
      toast.success(updated.isActive ? 'সক্রিয় করা হয়েছে' : 'নিষ্ক্রিয় করা হয়েছে');
    } catch { toast.error('ব্যর্থ'); }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault(); if (!resetId || !newPassword || newPassword.length < 6) return toast.error('কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড দিন');
    setResetting(true);
    try {
      await resetModeratorPassword(resetId, newPassword);
      setModerators(prev => prev.map(m => m.id === resetId ? { ...m, passwordResetRequested: false } : m));
      onResetCountChange(moderators.filter(m => m.passwordResetRequested && m.id !== resetId).length);
      toast.success('পাসওয়ার্ড রিসেট হয়েছে');
      setResetId(null); setNewPassword('');
    } catch (err: any) { toast.error(err.message ?? 'ব্যর্থ'); } finally { setResetting(false); }
  }

  async function handleDeleteMod(id: string, modName: string) {
    if (!confirm(`"${modName}" মডারেটর মুছে ফেলবেন?`)) return;
    try { await deleteModerator(id); setModerators(prev => prev.filter(m => m.id !== id)); toast.success('মুছে ফেলা হয়েছে'); } catch { toast.error('ব্যর্থ'); }
  }

  const resetRequests = moderators.filter(m => m.passwordResetRequested);

  return (
    <div className="space-y-6">
      {/* Reset requests alert */}
      {resetRequests.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h3 className="font-bold text-amber-800 flex items-center gap-2 mb-2"><Bell size={18} /> পাসওয়ার্ড রিসেট রিকুয়েস্ট ({resetRequests.length})</h3>
          {resetRequests.map(m => (
            <div key={m.id} className="flex items-center justify-between py-2 border-t border-amber-200 first:border-0">
              <div>
                <span className="font-medium">{m.name}</span>
                <span className="text-sm text-muted-foreground ml-2">{m.email}</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => { setResetId(m.id); setNewPassword(''); }} className="text-amber-800 border-amber-300">
                <KeyRound size={14} className="mr-1" /> পাসওয়ার্ড রিসেট
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Password reset modal */}
      {resetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm">
          <div className="bg-background rounded-xl shadow-2xl p-6 w-full max-w-sm animate-fade-in">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><KeyRound size={20} /> পাসওয়ার্ড রিসেট</h3>
            <p className="text-sm text-muted-foreground mb-3">{moderators.find(m => m.id === resetId)?.name} — {moderators.find(m => m.id === resetId)?.email}</p>
            <form onSubmit={handleResetPassword} className="space-y-3">
              <div><Label>নতুন পাসওয়ার্ড *</Label><Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="কমপক্ষে ৬ অক্ষর" className="mt-1" autoFocus /></div>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setResetId(null)} className="flex-1">বাতিল</Button>
                <Button type="submit" disabled={resetting} className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/90">{resetting ? '...' : 'রিসেট করুন'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create moderator */}
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(!showCreate)} className="bg-secondary text-secondary-foreground hover:bg-secondary/90"><Plus size={16} className="mr-1" /> নতুন মডারেটর</Button>
      </div>

      {showCreate && (
        <div className="bg-card rounded-lg p-5 card-shadow">
          <h3 className="font-bold mb-4">মডারেটর অ্যাকাউন্ট তৈরি</h3>
          <form onSubmit={handleCreate} className="grid sm:grid-cols-3 gap-3">
            <div><Label>নাম</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="নাম" className="mt-1" /></div>
            <div><Label>ইমেইল</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" className="mt-1" /></div>
            <div><Label>পাসওয়ার্ড</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="পাসওয়ার্ড" className="mt-1" /></div>
            <div className="sm:col-span-3 flex justify-end gap-2 mt-2">
              <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>বাতিল</Button>
              <Button type="submit" disabled={creating} className="bg-secondary text-secondary-foreground hover:bg-secondary/90">{creating ? '...' : 'মডারেটর তৈরি করুন'}</Button>
            </div>
          </form>
        </div>
      )}

      {/* Moderator list */}
      <div className="bg-card rounded-lg card-shadow overflow-x-auto">
        {loading ? <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground"><Loader2 size={20} className="animate-spin" /></div>
        : moderators.length === 0 ? <div className="text-center py-16 text-muted-foreground">কোনো মডারেটর নেই</div>
        : (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="text-left p-3 font-semibold">নাম</th>
                <th className="text-left p-3 font-semibold">ইমেইল</th>
                <th className="text-left p-3 font-semibold">স্ট্যাটাস</th>
                <th className="text-left p-3 font-semibold">তারিখ</th>
                <th className="text-right p-3 font-semibold">অ্যাকশন</th>
              </tr>
            </thead>
            <tbody>
              {moderators.map(m => (
                <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3 font-medium">
                    {m.name}
                    {m.passwordResetRequested && <Badge className="ml-2 bg-amber-100 text-amber-800 text-[10px]">রিসেট রিকুয়েস্ট</Badge>}
                  </td>
                  <td className="p-3 text-muted-foreground">{m.email}</td>
                  <td className="p-3">
                    <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${m.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {m.isActive ? 'সক্রিয়' : 'নিষ্ক্রিয়'}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleDateString('bn-BD')}</td>
                  <td className="p-3 text-right space-x-2">
                    <button onClick={() => handleToggle(m.id)} className={m.isActive ? 'text-amber-600 hover:text-amber-700' : 'text-green-600 hover:text-green-700'} title={m.isActive ? 'নিষ্ক্রিয় করুন' : 'সক্রিয় করুন'}>
                      {m.isActive ? <ShieldOff size={16} /> : <ShieldCheck size={16} />}
                    </button>
                    <button onClick={() => { setResetId(m.id); setNewPassword(''); }} className="text-secondary hover:text-secondary/80" title="পাসওয়ার্ড রিসেট"><KeyRound size={16} /></button>
                    <button onClick={() => handleDeleteMod(m.id, m.name)} className="text-destructive hover:text-destructive/80" title="মুছুন"><Trash2 size={16} /></button>
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

// ─── Orders with payment & delivery tracking ──────────

function OrdersTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => { getOrders().then(setOrders).catch(() => toast.error('অর্ডার লোড করতে ব্যর্থ')).finally(() => setLoading(false)); }, []);

  async function handleStatusChange(id: string, status: Order['status']) {
    setUpdatingId(id); try { const u = await updateOrderStatus(id, status); setOrders(p => p.map(o => o.id === u.id ? u : o)); toast.success('আপডেট হয়েছে'); } catch { toast.error('ব্যর্থ'); } finally { setUpdatingId(null); }
  }

  async function handlePaymentUpdate(id: string, paymentStatus: string, paymentReference: string) {
    try { const u = await updateOrderPayment(id, { paymentStatus, paymentReference }); setOrders(p => p.map(o => o.id === u.id ? u : o)); toast.success('পেমেন্ট আপডেট হয়েছে'); } catch { toast.error('ব্যর্থ'); }
  }

  async function handleDeliveryUpdate(id: string, deliveryTeam: string, deliveryRider: string, deliveryNotes: string) {
    try { const u = await updateOrderDelivery(id, { deliveryTeam, deliveryRider, deliveryNotes }); setOrders(p => p.map(o => o.id === u.id ? u : o)); toast.success('ডেলিভারি আপডেট হয়েছে'); } catch { toast.error('ব্যর্থ'); }
  }

  return (
    <div className="bg-card rounded-lg card-shadow overflow-x-auto">
      {loading ? <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground"><Loader2 size={20} className="animate-spin" /></div>
      : orders.length === 0 ? <div className="text-center py-16 text-muted-foreground">কোনো অর্ডার নেই</div>
      : (
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="text-left p-3 font-semibold w-6"></th>
              <th className="text-left p-3 font-semibold">অর্ডার</th>
              <th className="text-left p-3 font-semibold">গ্রাহক</th>
              <th className="text-left p-3 font-semibold">মোট</th>
              <th className="text-left p-3 font-semibold">অর্ডারকারী</th>
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
                    <td className="p-3"><div className="font-semibold text-primary">{prettyOrderId(o.id)}</div></td>
                    <td className="p-3"><div>{o.customerName}</div><div className="text-xs text-muted-foreground">{o.customerPhone}</div></td>
                    <td className="p-3 font-semibold">৳{o.total}</td>
                    <td className="p-3">{o.placedBy ? <><div className="font-medium text-sm">{o.placedBy.userName}</div><div className="text-xs text-muted-foreground">{o.placedBy.userRole === 'admin' ? 'অ্যাডমিন' : o.placedBy.userRole === 'moderator' ? 'মডারেটর' : 'কাস্টমার'}</div></> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="p-3">
                      <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${o.paymentStatus === 'paid' ? 'bg-green-100 text-green-800' : o.paymentStatus === 'refunded' ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-600'}`}>
                        {paymentStatusLabels[o.paymentStatus ?? 'unpaid']}
                      </span>
                    </td>
                    <td className="p-3" onClick={e => e.stopPropagation()}>
                      <select value={o.status} disabled={updatingId === o.id} onChange={e => handleStatusChange(o.id, e.target.value as Order['status'])} className={`text-xs font-medium rounded-full px-2 py-1 border-0 cursor-pointer focus:outline-none ${statusColors[o.status]}`}>
                        {(Object.keys(statusLabels) as Order['status'][]).map(s => <option key={s} value={s}>{statusLabels[s]}</option>)}
                      </select>
                    </td>
                    <td className="p-3 text-muted-foreground text-xs"><div>{date.toLocaleDateString('bn-BD')}</div><div>{date.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })}</div></td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-b bg-muted/20">
                      <td colSpan={8} className="px-6 py-4">
                        <OrderExpandedDetails order={o} onPaymentUpdate={handlePaymentUpdate} onDeliveryUpdate={handleDeliveryUpdate} />
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

function OrderExpandedDetails({ order: o, onPaymentUpdate, onDeliveryUpdate }: {
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
    <div className="grid md:grid-cols-3 gap-6">
      {/* Items & pricing */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">আইটেমসমূহ</p>
        {o.items.map((item, i) => (
          <div key={i} className="flex justify-between text-sm py-1 border-b last:border-0">
            <span>{item.productName} × {item.quantity}</span>
            <span className="font-semibold">৳{item.unitPrice * item.quantity}</span>
          </div>
        ))}
        <div className="mt-3 bg-muted/40 rounded-lg p-2 text-sm space-y-1">
          <div className="flex justify-between text-muted-foreground"><span>সাবটোটাল</span><span>৳{o.subtotal ?? o.total}</span></div>
          <div className="flex justify-between text-muted-foreground"><span>ডেলিভারি</span><span>৳{o.shippingCost ?? 0}</span></div>
          {(o.discount ?? 0) > 0 && <div className="flex justify-between text-green-600"><span>ছাড়</span><span>-৳{o.discount}</span></div>}
          <div className="flex justify-between font-bold pt-1 border-t"><span>মোট</span><span>৳{o.total}</span></div>
        </div>
        <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
          <div>ঠিকানা: {o.customerAddress}</div>
          <div>পেমেন্ট পদ্ধতি: {paymentMethodLabels[o.paymentMethod ?? 'cod']}</div>
          <div>উৎস: {o.source === 'online' ? 'অনলাইন' : o.source === 'phone' ? 'ফোন' : 'অফলাইন'}</div>
        </div>
      </div>

      {/* Payment tracking */}
      <div className="bg-card rounded-lg border p-3">
        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1"><CreditCard size={14} /> পেমেন্ট ট্র্যাকিং</p>
        <div className="space-y-2">
          <div><Label className="text-xs">পেমেন্ট স্ট্যাটাস</Label><select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value as 'unpaid' | 'paid' | 'refunded')} className="w-full mt-1 text-sm rounded-md border px-2 py-1.5 bg-background"><option value="unpaid">বাকি</option><option value="paid">পেইড</option><option value="refunded">রিফান্ড</option></select></div>
          <div><Label className="text-xs">রেফারেন্স (TXN ID)</Label><Input value={paymentRef} onChange={e => setPaymentRef(e.target.value)} placeholder="bKash/Nagad TXN ID" className="mt-1 text-sm bg-background" /></div>
          <Button size="sm" onClick={() => onPaymentUpdate(o.id, paymentStatus, paymentRef)} className="bg-secondary text-secondary-foreground hover:bg-secondary/90 w-full">আপডেট</Button>
        </div>
      </div>

      {/* Delivery tracking */}
      <div className="bg-card rounded-lg border p-3">
        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1"><Truck size={14} /> ডেলিভারি অ্যাসাইনমেন্ট</p>
        <div className="space-y-2">
          <div><Label className="text-xs">ডেলিভারি টিম</Label><Input value={deliveryTeam} onChange={e => setDeliveryTeam(e.target.value)} placeholder="Pathao, Steadfast..." className="mt-1 text-sm bg-background" /></div>
          <div><Label className="text-xs">রাইডার</Label><Input value={deliveryRider} onChange={e => setDeliveryRider(e.target.value)} placeholder="রাইডারের নাম" className="mt-1 text-sm bg-background" /></div>
          <div><Label className="text-xs">নোটস</Label><Input value={deliveryNotes} onChange={e => setDeliveryNotes(e.target.value)} placeholder="অতিরিক্ত তথ্য" className="mt-1 text-sm bg-background" /></div>
          <Button size="sm" onClick={() => onDeliveryUpdate(o.id, deliveryTeam, deliveryRider, deliveryNotes)} className="bg-secondary text-secondary-foreground hover:bg-secondary/90 w-full">আপডেট</Button>
        </div>
      </div>
    </div>
  );
}

export default Admin;
