import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, BarChart3, Boxes, ClipboardList, Edit, ExternalLink, EyeOff, HandCoins, ImageIcon, Loader2, Package, Plus, Settings2, Store, Tag, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Portal as TooltipPortal } from '@radix-ui/react-tooltip';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  createCategory,
  deleteUnusedCategory,
  deleteUnusedProduct,
  getAdminCategories,
  getAdminProduct,
  getAdminProducts,
  getCreditSummary,
  setCategoryActive,
  setCategoryVisibleInShop,
  setProductActive,
  setProductVisibleInShop,
  updateCategory,
} from '@/lib/api';
import type { Category, Product } from '@/lib/types';
import { productKindLabel, rateLabel } from '@/lib/quantity';

const AnalyticsDashboard = lazy(() => import('@/components/AnalyticsDashboard'));
const AddProductForm = lazy(() => import('@/components/AddProductForm'));
const VariantManager = lazy(() => import('@/components/VariantManager'));
const InventoryManager = lazy(() => import('@/components/InventoryManager'));
const PhysicalSaleScreen = lazy(() => import('@/components/PhysicalSaleScreen'));
const UnifiedOrderManager = lazy(() => import('@/components/UnifiedOrderManager'));
const CreditSalesManager = lazy(() => import('@/components/CreditSalesManager'));

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w\u0980-\u09FF-]/g, '');
}

export default function Admin() {
  const location = useLocation();
  const [creditReminder, setCreditReminder] = useState<{ overdueCount: number; dueTodayCount: number } | null>(null);
  const [reminderHidden, setReminderHidden] = useState(() => sessionStorage.getItem('nafah_credit_reminder_hidden') === '1');
  const links = [
    { path: '/admin/dashboard', label: 'ড্যাশবোর্ড', mobileLabel: 'ড্যাশবোর্ড', icon: BarChart3 },
    { path: '/admin/products', label: 'পণ্য', mobileLabel: 'পণ্য', icon: Package },
    { path: '/admin/categories', label: 'ক্যাটাগরি', mobileLabel: 'ক্যাটাগরি', icon: Tag },
    { path: '/admin/inventory', label: 'ক্রয় ও ইনভেন্টরি', mobileLabel: 'ইনভেন্টরি', icon: Boxes },
    { path: '/admin/physical-sales', label: 'দোকানের বিক্রি', mobileLabel: 'বিক্রি', icon: Store },
    { path: '/admin/orders', label: 'অর্ডার', mobileLabel: 'অর্ডার', icon: ClipboardList },
  ];

  useEffect(() => {
    getCreditSummary()
      .then(({ overdueCount, dueTodayCount }) => setCreditReminder({ overdueCount, dueTodayCount }))
      .catch(() => setCreditReminder(null));
  }, [location.pathname]);

  return (
    <div className="min-h-screen md:flex bg-background">
      <aside className="hidden w-64 shrink-0 bg-primary p-4 text-primary-foreground md:block">
        <Link to="/" className="mb-6 flex min-h-11 items-center text-xl font-bold text-accent">নাফাহ এগ্রো পরিচালনা</Link>
        <nav aria-label="পরিচালনা বিভাগ" className="space-y-1">
          {links.map(({ path, label, icon: Icon }) => (
            <NavLink key={path} to={path}
              className={({ isActive }) => `flex min-h-11 w-full items-center gap-3 rounded-lg px-4 py-3 text-sm ${isActive ? 'bg-secondary text-secondary-foreground' : 'hover:bg-secondary/20'}`}>
              <Icon size={18} />{label}
            </NavLink>
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
        {!reminderHidden && creditReminder && creditReminder.overdueCount + creditReminder.dueTodayCount > 0 && <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950"><HandCoins size={19} /><div className="min-w-0 flex-1"><strong>বাকি যোগাযোগ বাকি আছে</strong><p className="text-sm">সময় পার হয়েছে {creditReminder.overdueCount}টি, আজ যোগাযোগ {creditReminder.dueTodayCount}টি</p></div><Button asChild size="sm"><Link to="/admin/dues">বাকি হিসাব দেখুন</Link></Button><Button type="button" size="icon" variant="ghost" aria-label="এইবার বন্ধ রাখুন" onClick={() => { sessionStorage.setItem('nafah_credit_reminder_hidden', '1'); setReminderHidden(true); }}><X size={17} /></Button></div>}
        <Outlet />
      </main>
      <nav aria-label="মোবাইল পরিচালনা বিভাগ" className="fixed inset-x-0 bottom-0 z-30 border-t border-primary-foreground/15 bg-primary px-1 pb-[env(safe-area-inset-bottom)] text-primary-foreground shadow-[0_-6px_20px_rgba(0,0,0,0.12)] md:hidden">
        <div className="grid grid-cols-6">
          {links.map(({ path, label, mobileLabel, icon: Icon }) => (
            <NavLink key={path} to={path} aria-label={label}
              className={({ isActive }) => `flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[10px] transition-colors ${isActive ? 'bg-secondary text-secondary-foreground' : 'text-primary-foreground/75 hover:bg-primary-foreground/10 hover:text-primary-foreground'}`}>
              <Icon size={19} /><span className="w-full truncate text-center">{mobileLabel}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

interface ProductsOutletContext {
  categories: Category[];
  reloadProducts: () => void;
}

function getProductShopVisibility(product: Product, categories: Category[]) {
  const isPackaged = (product.kind ?? 'PACKAGED') === 'PACKAGED';
  const category = categories.find((item) => item.id === product.categoryId);

  if (!isPackaged) {
    return { visible: false, reason: '', guidance: '' };
  }
  if (!category || category.isActive === false) {
    return {
      visible: false,
      reason: 'ক্যাটাগরি ইনঅ্যাকটিভ',
      guidance: 'পণ্যটির ক্যাটাগরি ইনঅ্যাকটিভ। ক্যাটাগরি পেজ থেকে ক্যাটাগরিটি অ্যাকটিভ করলে পণ্যটির নিজের আগের সেটিং আবার কাজ করবে।',
    };
  }
  if (product.isActive === false) {
    return {
      visible: false,
      reason: 'পণ্য ইনঅ্যাকটিভ',
      guidance: 'পণ্যটি ইনঅ্যাকটিভ। অ্যাকটিভ করলে এর আগের শো বা হাইড সেটিং আবার কাজ করবে।',
    };
  }
  if (category.isVisibleInShop === false) return {
    visible: false,
    reason: 'ক্যাটাগরি হাইড',
    guidance: 'পণ্যটির ক্যাটাগরি হাইড করা আছে। ক্যাটাগরি পেজ থেকে শো করলে পণ্যটির নিজের আগের শো বা হাইড সেটিং আবার কাজ করবে।',
  };
  if (product.isVisibleInShop === false) return {
    visible: false,
    reason: 'পণ্য হাইড',
    guidance: 'পণ্যটি অনলাইন শপে হাইড করা আছে। শো সুইচ চালু করলে গ্রাহকের দোকানে আবার দেখা যাবে।',
  };
  return { visible: true, reason: '', guidance: '' };
}

export function AdminDashboard() {
  return <Suspense fallback={<Loading />}><AnalyticsDashboard /></Suspense>;
}

export function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Product>();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [statusTarget, setStatusTarget] = useState<{
    product: Product;
    setting: 'ACTIVE' | 'VISIBLE';
    nextValue: boolean;
  }>();
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState('');
  const navigate = useNavigate();
  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getAdminProducts({ limit: 100 }), getAdminCategories()])
      .then(([page, items]) => { setProducts(page.data); setCategories(items); })
      .catch(() => toast.error('পণ্য লোড করা যায়নি'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteUnusedProduct(deleteTarget.id);
      setDeleteTarget(undefined);
      load();
      toast.success('অব্যবহৃত পণ্য স্থায়ীভাবে মুছে ফেলা হয়েছে');
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'পণ্য মুছে ফেলা যায়নি');
    } finally {
      setDeleting(false);
    }
  }
  async function confirmStatusChange() {
    if (!statusTarget) return;
    setStatusSaving(true);
    setStatusError('');
    try {
      const updated = statusTarget.setting === 'ACTIVE'
        ? await setProductActive(statusTarget.product.id, statusTarget.nextValue)
        : await setProductVisibleInShop(statusTarget.product.id, statusTarget.nextValue);
      setProducts((current) => current.map((item) => item.id === updated.id ? updated : item));
      toast.success(statusTarget.setting === 'ACTIVE'
        ? `পণ্য ${statusTarget.nextValue ? 'অ্যাকটিভ' : 'ইনঅ্যাকটিভ'} করা হয়েছে`
        : `পণ্য ${statusTarget.nextValue ? 'শো' : 'হাইড'} করা হয়েছে`);
      setStatusTarget(undefined);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'পণ্যের অবস্থা পরিবর্তন হয়নি');
    } finally {
      setStatusSaving(false);
    }
  }
  function openStatusChange(product: Product, setting: 'ACTIVE' | 'VISIBLE', nextValue: boolean, category?: Category) {
    if (category?.isActive === false) {
      toast.error('প্রথমে ক্যাটাগরিটি অ্যাকটিভ করুন');
      return;
    }
    if (setting === 'VISIBLE' && product.isActive === false) {
      toast.error('প্রথমে পণ্যটি অ্যাকটিভ করুন');
      return;
    }
    if (setting === 'VISIBLE' && category?.isVisibleInShop === false) {
      toast.error('প্রথমে ক্যাটাগরিটি শো করুন');
      return;
    }
    setStatusError('');
    setStatusTarget({ product, setting, nextValue });
  }
  if (loading) return <Loading />;
  return <div>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">পণ্য</h1><Button onClick={() => navigate('/admin/products/new')}><Plus size={16} className="mr-2" />নতুন পণ্য</Button></div>
    <Outlet context={{ categories, reloadProducts: load } satisfies ProductsOutletContext} />
    <div className="bg-card border rounded-lg overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted"><tr><th className="text-left p-3">নাম</th><th className="text-right p-3">দাম</th><th className="text-center p-3">প্যাক/সাইজ</th><th className="text-center p-3">অ্যাকটিভ</th><th className="text-center p-3">অনলাইন শপ</th><th className="p-3" /></tr></thead><tbody>
      {[...products].sort((left, right) => {
        const leftCategory = categories.find((item) => item.id === left.categoryId);
        const rightCategory = categories.find((item) => item.id === right.categoryId);
        const leftActive = left.isActive !== false && leftCategory?.isActive !== false;
        const rightActive = right.isActive !== false && rightCategory?.isActive !== false;
        const activeOrder = Number(rightActive) - Number(leftActive);
        if (activeOrder !== 0) return activeOrder;
        const leftVisible = leftActive && left.isVisibleInShop !== false && leftCategory?.isVisibleInShop !== false;
        const rightVisible = rightActive && right.isVisibleInShop !== false && rightCategory?.isVisibleInShop !== false;
        return Number(rightVisible) - Number(leftVisible);
      }).map((product) => {
        const category = categories.find((item) => item.id === product.categoryId);
        const categoryActive = category?.isActive !== false;
        const categoryVisible = categoryActive && category?.isVisibleInShop !== false;
        const effectiveActive = categoryActive && product.isActive !== false;
        const effectiveVisible = effectiveActive && categoryVisible && product.isVisibleInShop !== false;
        const changingActive = statusSaving && statusTarget?.product.id === product.id && statusTarget.setting === 'ACTIVE';
        const changingVisible = statusSaving && statusTarget?.product.id === product.id && statusTarget.setting === 'VISIBLE';
        const shopVisibility = getProductShopVisibility(product, categories);
        const isPackaged = (product.kind ?? 'PACKAGED') === 'PACKAGED';
        const inactiveContentClass = effectiveActive ? '' : 'opacity-60';
        return <tr key={product.id} className="border-t">
          <td className={`p-3 ${inactiveContentClass}`}><div className="flex min-w-52 items-center gap-3"><ProductThumbnail key={product.images[0] ?? 'no-image'} product={product} /><div className="min-w-0"><div className="break-words font-medium">{product.name}</div><span className="mt-1 inline-block rounded bg-muted px-2 py-0.5 text-xs">{productKindLabel(product.kind)}</span>{isPackaged && (shopVisibility.visible ? <Link to={`/products/${encodeURIComponent(product.slug)}`} target="_blank" rel="noopener noreferrer" className="ml-2 mt-1 inline-flex min-h-8 items-center gap-1 text-xs text-secondary hover:underline">গ্রাহক পেজ <ExternalLink size={13} aria-hidden="true" /></Link> : <Tooltip><TooltipTrigger asChild><button type="button" className="ml-2 mt-1 inline-flex min-h-8 cursor-help items-center gap-1 rounded text-xs font-medium text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><EyeOff size={13} aria-hidden="true" />গ্রাহক পেজ লুকানো</button></TooltipTrigger><TooltipPortal><TooltipContent className="max-w-[min(22rem,calc(100vw-2rem))] p-3 leading-relaxed">{shopVisibility.guidance}</TooltipContent></TooltipPortal></Tooltip>)}</div></div></td>
          <td className={`p-3 text-right ${inactiveContentClass}`}>৳{product.price}<div className="text-xs text-muted-foreground">{rateLabel(product.kind)}</div></td>
          <td className={`p-3 text-center ${inactiveContentClass}`}>{isPackaged ? product.variants?.length ?? 0 : 'প্রযোজ্য নয়'}</td>
          <td className="p-3"><div className="flex min-w-36 items-center justify-center gap-2"><Switch className="data-[state=unchecked]:border-amber-700 data-[state=unchecked]:bg-amber-500 disabled:opacity-100" checked={effectiveActive} disabled={changingActive} onCheckedChange={(checked) => openStatusChange(product, 'ACTIVE', checked, category)} aria-label={`${product.name} অ্যাকটিভ`} /><span className={`text-sm font-medium ${effectiveActive ? 'text-green-800' : 'text-amber-900'}`}>{effectiveActive ? 'অ্যাকটিভ' : 'ইনঅ্যাকটিভ'}</span>{changingActive && <Loader2 size={15} className="animate-spin" aria-label="পরিবর্তন হচ্ছে" />}</div></td>
          <td className="p-3">{isPackaged ? <div className="flex min-w-28 items-center justify-center gap-2"><Switch className="data-[state=unchecked]:border-amber-700 data-[state=unchecked]:bg-amber-500 disabled:opacity-100" checked={effectiveVisible} disabled={changingVisible} onCheckedChange={(checked) => openStatusChange(product, 'VISIBLE', checked, category)} aria-label={`${product.name} অনলাইন শপ`} /><span className={`text-sm font-medium ${effectiveVisible ? 'text-green-800' : 'text-amber-900'}`}>{effectiveVisible ? 'শো' : 'হাইড'}</span>{changingVisible && <Loader2 size={15} className="animate-spin" aria-label="পরিবর্তন হচ্ছে" />}</div> : <span className="block text-center text-muted-foreground">প্রযোজ্য নয়</span>}</td>
          <td className={`whitespace-nowrap p-3 text-right ${inactiveContentClass}`}><button type="button" aria-label={isPackaged ? 'প্যাক/সাইজ ও দাম' : 'দাম ও স্টক সীমা'} title={isPackaged ? 'প্যাক/সাইজ ও দাম' : 'দাম ও স্টক সীমা'} onClick={() => navigate(`/admin/products/${product.id}/variants`)} className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:bg-muted"><Settings2 size={16} /></button><button type="button" aria-label="পণ্য সম্পাদনা" onClick={() => navigate(`/admin/products/${product.id}/edit`)} className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:bg-muted"><Edit size={16} /></button><Button type="button" size="sm" variant={product.canDelete ? 'destructive' : 'outline'} aria-disabled={!product.canDelete} className="ml-2" onClick={() => { if (!product.canDelete) { toast.error('এই পণ্যের স্টক, দাম পরিবর্তন, বিক্রি, অর্ডার বা সমন্বয়ের রেকর্ড আছে। তাই এটি মুছতে পারবেন না। প্রয়োজনে পণ্যটি ইনঅ্যাকটিভ করুন।'); return; } setDeleteError(''); setDeleteTarget(product); }}><Trash2 size={15} className="mr-1" />মুছুন</Button></td>
        </tr>;
      })}
    </tbody></table></div>
    <Dialog open={Boolean(statusTarget)} onOpenChange={(open) => { if (!open && !statusSaving) { setStatusTarget(undefined); setStatusError(''); } }}><DialogContent><DialogHeader><DialogTitle>{statusTarget && `${statusTarget.product.name} ${statusTarget.nextValue ? (statusTarget.setting === 'ACTIVE' ? 'অ্যাকটিভ' : 'শো') : (statusTarget.setting === 'ACTIVE' ? 'ইনঅ্যাকটিভ' : 'হাইড')} করুন`}</DialogTitle><DialogDescription>{statusTarget && (statusTarget.setting === 'ACTIVE'
      ? statusTarget.nextValue
        ? 'পণ্যটি নতুন ক্রয়, ইনভেন্টরি ও বিক্রিতে ব্যবহার করা যাবে। পণ্যটির আগের শো বা হাইড সেটিং বদলাবে না।'
        : 'পণ্যটি নতুন ক্রয়, স্টক সমন্বয় ও বিক্রিতে ব্যবহার করা যাবে না এবং অনলাইন শপেও দেখা যাবে না। আগের তথ্য মুছে যাবে না।'
      : statusTarget.nextValue
        ? 'পণ্যটি অনলাইন শপে দেখা যাবে। এটি ক্রয়, ইনভেন্টরি বা দোকানের বিক্রির নিয়ম বদলাবে না।'
        : 'পণ্যটি শুধু অনলাইন শপ থেকে হাইড হবে। ক্রয়, ইনভেন্টরি ও দোকানের বিক্রিতে ব্যবহার করা যাবে।')}</DialogDescription></DialogHeader>{statusError && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{statusError}</p>}<DialogFooter><Button variant="outline" onClick={() => { setStatusTarget(undefined); setStatusError(''); }} disabled={statusSaving}>বাতিল</Button><Button onClick={() => void confirmStatusChange()} disabled={statusSaving}>{statusSaving && <Loader2 size={15} className="mr-2 animate-spin" />}{statusSaving ? 'পরিবর্তন হচ্ছে' : statusTarget?.nextValue ? (statusTarget.setting === 'ACTIVE' ? 'অ্যাকটিভ করুন' : 'শো করুন') : (statusTarget?.setting === 'ACTIVE' ? 'ইনঅ্যাকটিভ করুন' : 'হাইড করুন')}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deleting) { setDeleteTarget(undefined); setDeleteError(''); } }}><DialogContent><DialogHeader><DialogTitle>অব্যবহৃত পণ্য মুছুন</DialogTitle><DialogDescription>{deleteTarget?.name} এবং এর প্যাক/সাইজ ও প্রাথমিক মূল্য রেকর্ড স্থায়ীভাবে মুছে যাবে। স্টক, ইনভেন্টরি, অর্ডার বা মূল্য পরিবর্তনের ইতিহাস থাকলে মুছবে না। Cloudinary-তে থাকা ছবি স্বয়ংক্রিয়ভাবে মুছবে না।</DialogDescription></DialogHeader>{deleteError && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{deleteError}</p>}<DialogFooter><Button variant="outline" onClick={() => { setDeleteTarget(undefined); setDeleteError(''); }} disabled={deleting}>বাতিল</Button><Button variant="destructive" onClick={() => void confirmDelete()} disabled={deleting}>{deleting ? 'মুছে ফেলা হচ্ছে…' : 'স্থায়ীভাবে মুছুন'}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function ProductThumbnail({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false);
  const image = product.images[0];
  return <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
    {image && !failed
      ? <img src={image} alt={`${product.name} পণ্যের ছবি`} className="h-full w-full object-cover" loading="lazy" onError={() => setFailed(true)} />
      : <ImageIcon size={20} className="text-muted-foreground" aria-label="পণ্যের ছবি নেই" />}
  </div>;
}

function ProductRouteError() {
  const navigate = useNavigate();
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-xl"><h2 className="text-xl font-bold">পণ্য পাওয়া যায়নি</h2><p className="mt-2 text-sm text-muted-foreground">পণ্যটি মুছে ফেলা হয়েছে অথবা URL সঠিক নয়।</p><Button className="mt-5" onClick={() => navigate('/admin/products', { replace: true })}>পণ্য তালিকায় ফিরুন</Button></div></div>;
}

export function AdminProductCreate() {
  const navigate = useNavigate();
  const { categories, reloadProducts } = useOutletContext<ProductsOutletContext>();
  const close = () => navigate('/admin/products');
  return <Suspense fallback={<Loading />}><AddProductForm categories={categories.filter((category) => category.isActive !== false)} onClose={close} onCreated={() => { reloadProducts(); close(); }} /></Suspense>;
}

function useAdminProductRoute() {
  const { productId } = useParams<{ productId: string }>();
  const [product, setProduct] = useState<Product>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    if (!productId) {
      setFailed(true);
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    setFailed(false);
    getAdminProduct(productId)
      .then((result) => { if (active) setProduct(result); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [productId]);
  return { product, setProduct, loading, failed };
}

export function AdminProductEdit() {
  const navigate = useNavigate();
  const { categories, reloadProducts } = useOutletContext<ProductsOutletContext>();
  const { product, loading, failed } = useAdminProductRoute();
  if (loading) return <Loading />;
  if (failed || !product) return <ProductRouteError />;
  const close = () => navigate('/admin/products');
  return <Suspense fallback={<Loading />}><AddProductForm categories={categories.filter((category) => category.isActive !== false)} editProduct={product} onClose={close} onCreated={() => { reloadProducts(); close(); }} /></Suspense>;
}

export function AdminProductVariants() {
  const navigate = useNavigate();
  const { reloadProducts } = useOutletContext<ProductsOutletContext>();
  const { product, setProduct, loading, failed } = useAdminProductRoute();
  if (loading) return <Loading />;
  if (failed || !product) return <ProductRouteError />;
  return <Suspense fallback={<Loading />}><VariantManager product={product} onClose={() => navigate('/admin/products')} onUpdated={(updated) => { setProduct(updated); reloadProducts(); }} /></Suspense>;
}

export function AdminCategories() {
  const [items, setItems] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<Category | null>(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [statusTarget, setStatusTarget] = useState<{
    category: Category;
    setting: 'ACTIVE' | 'VISIBLE';
    nextValue: boolean;
  } | null>(null);
  const [statusProducts, setStatusProducts] = useState<Product[]>([]);
  const [statusProductTotal, setStatusProductTotal] = useState(0);
  const [statusImpactLoading, setStatusImpactLoading] = useState(false);
  const [statusImpactFailed, setStatusImpactFailed] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState('');
  const statusRequestId = useRef(0);
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
  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteUnusedCategory(deleteTarget.id);
      setDeleteTarget(null);
      load();
      toast.success('খালি ক্যাটাগরি স্থায়ীভাবে মুছে ফেলা হয়েছে');
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'ক্যাটাগরি মুছে ফেলা যায়নি');
    } finally {
      setDeleting(false);
    }
  }
  function openStatusChange(category: Category, setting: 'ACTIVE' | 'VISIBLE', nextValue: boolean) {
    if (setting === 'VISIBLE' && category.isActive === false) {
      toast.error('প্রথমে ক্যাটাগরিটি অ্যাকটিভ করুন');
      return;
    }
    const requestId = ++statusRequestId.current;
    setStatusTarget({ category, setting, nextValue });
    setStatusProducts([]);
    setStatusProductTotal(0);
    setStatusError('');
    setStatusImpactLoading(true);
    setStatusImpactFailed(false);
    void getAdminProducts({ category: category.slug, limit: 100 })
      .then((page) => {
        if (requestId !== statusRequestId.current) return;
        setStatusProducts(page.data);
        setStatusProductTotal(page.total);
      })
      .catch((error) => {
        if (requestId !== statusRequestId.current) return;
        setStatusImpactFailed(true);
        setStatusError(error instanceof Error ? error.message : 'এই ক্যাটাগরির পণ্য লোড হয়নি');
      })
      .finally(() => { if (requestId === statusRequestId.current) setStatusImpactLoading(false); });
  }
  async function confirmStatusChange() {
    if (!statusTarget) return;
    setStatusSaving(true);
    setStatusError('');
    try {
      const updated = statusTarget.setting === 'ACTIVE'
        ? await setCategoryActive(statusTarget.category.id, statusTarget.nextValue)
        : await setCategoryVisibleInShop(statusTarget.category.id, statusTarget.nextValue);
      setItems((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
      toast.success(statusTarget.setting === 'ACTIVE'
        ? `ক্যাটাগরি ${statusTarget.nextValue ? 'অ্যাকটিভ' : 'ইনঅ্যাকটিভ'} করা হয়েছে`
        : `ক্যাটাগরি ${statusTarget.nextValue ? 'শো' : 'হাইড'} করা হয়েছে`);
      statusRequestId.current += 1;
      setStatusTarget(null);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'ক্যাটাগরির অবস্থা পরিবর্তন হয়নি');
    } finally {
      setStatusSaving(false);
    }
  }
  const activeImpactCount = statusProducts.filter((product) => product.isActive !== false).length;
  const visibleImpactCount = statusProducts.filter((product) =>
    (product.kind ?? 'PACKAGED') === 'PACKAGED' && product.isActive !== false && product.isVisibleInShop !== false).length;
  return <div><h1 className="text-2xl font-bold mb-6">ক্যাটাগরি</h1><div className="mb-6 grid max-w-lg gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="নতুন ক্যাটাগরি" /><Button onClick={() => void add()}>যোগ করুন</Button></div><div className="space-y-2 max-w-3xl">
    {[...items].sort((left, right) =>
      Number(right.isActive !== false) - Number(left.isActive !== false)
      || Number(right.isVisibleInShop !== false) - Number(left.isVisibleInShop !== false)).map((item) => {
      const changingStatus = statusTarget?.category.id === item.id && (statusImpactLoading || statusSaving);
      const effectiveVisible = item.isActive !== false && item.isVisibleInShop !== false;
      const changingActive = changingStatus && statusTarget?.setting === 'ACTIVE';
      const changingVisible = changingStatus && statusTarget?.setting === 'VISIBLE';
      const inactiveContentClass = item.isActive === false ? 'opacity-60' : '';
      return <div key={item.id} className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"><div className={`min-w-0 ${inactiveContentClass}`}><strong className="break-words">{item.name}</strong><div className="break-all text-xs text-muted-foreground">/{item.slug}</div>{effectiveVisible ? <Link to={`/shop?category=${encodeURIComponent(item.slug)}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-8 items-center gap-1 text-xs text-secondary hover:underline">এই ক্যাটাগরির পণ্য দেখুন <ExternalLink size={13} aria-hidden="true" /></Link> : <span className="mt-1 inline-flex min-h-8 items-center text-xs font-medium text-amber-900">গ্রাহকের দোকানে লুকানো</span>}</div><div className="flex flex-wrap items-center justify-end gap-4"><div className="flex items-center gap-2"><Switch className="data-[state=unchecked]:border-amber-700 data-[state=unchecked]:bg-amber-500 disabled:opacity-100" checked={item.isActive !== false} disabled={changingStatus} onCheckedChange={(checked) => openStatusChange(item, 'ACTIVE', checked)} aria-label={`${item.name} অ্যাকটিভ`} /><span className={`text-sm font-medium ${item.isActive !== false ? 'text-green-800' : 'text-amber-900'}`}>{item.isActive !== false ? 'অ্যাকটিভ' : 'ইনঅ্যাকটিভ'}</span>{changingActive && <Loader2 size={15} className="animate-spin" aria-label="পরিবর্তন হচ্ছে" />}</div><div className="flex items-center gap-2"><Switch className="data-[state=unchecked]:border-amber-700 data-[state=unchecked]:bg-amber-500 disabled:opacity-100" checked={effectiveVisible} disabled={changingStatus} onCheckedChange={(checked) => openStatusChange(item, 'VISIBLE', checked)} aria-label={`${item.name} অনলাইন শপ`} /><span className={`text-sm font-medium ${effectiveVisible ? 'text-green-800' : 'text-amber-900'}`}>{effectiveVisible ? 'শো' : 'হাইড'}</span>{changingVisible && <Loader2 size={15} className="animate-spin" aria-label="পরিবর্তন হচ্ছে" />}</div><div className={inactiveContentClass}><button type="button" className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-muted" aria-label="নাম বদলান" onClick={() => openEdit(item)}><Edit size={16} /></button></div><div className={inactiveContentClass}><Button type="button" size="sm" variant={item.canDelete ? 'destructive' : 'outline'} aria-disabled={!item.canDelete} onClick={() => { if (!item.canDelete) { toast.error('এই ক্যাটাগরিতে পণ্য আছে। মুছতে হলে আগে পণ্যগুলো অন্য ক্যাটাগরিতে নিন অথবা অব্যবহৃত পণ্য মুছুন। চাইলে ক্যাটাগরিটি ইনঅ্যাকটিভ করতে পারেন।'); return; } setDeleteError(''); setDeleteTarget(item); }}><Trash2 size={15} className="mr-1" />মুছুন</Button></div></div></div>;
    })}
  </div><Dialog open={statusTarget !== null} onOpenChange={(open) => { if (!open && !statusSaving) { statusRequestId.current += 1; setStatusTarget(null); setStatusError(''); } }}><DialogContent><DialogHeader><DialogTitle>{statusTarget && `${statusTarget.category.name} ${statusTarget.nextValue ? (statusTarget.setting === 'ACTIVE' ? 'অ্যাকটিভ' : 'শো') : (statusTarget.setting === 'ACTIVE' ? 'ইনঅ্যাকটিভ' : 'হাইড')} করুন`}</DialogTitle><DialogDescription>{statusTarget && (statusTarget.setting === 'ACTIVE'
    ? statusTarget.nextValue
      ? 'ক্যাটাগরিটি অ্যাকটিভ হবে। প্রতিটি পণ্যের নিজের আগের অ্যাকটিভ এবং শো বা হাইড সেটিং আবার কাজ করবে।'
      : 'এই ক্যাটাগরির সব পণ্য নতুন ক্রয়, স্টক সমন্বয় ও বিক্রিতে বন্ধ হবে এবং অনলাইন শপ থেকেও হাইড হবে। পণ্যের নিজের সেটিং ও আগের তথ্য মুছে যাবে না।'
    : statusTarget.nextValue
      ? 'ক্যাটাগরিটি অনলাইন শপে শো হবে। আলাদাভাবে হাইড করা পণ্য হাইডই থাকবে।'
      : 'এই ক্যাটাগরি ও এর সব পণ্য শুধু অনলাইন শপ থেকে হাইড হবে। ক্রয়, ইনভেন্টরি ও দোকানের বিক্রিতে কোনো পরিবর্তন হবে না।')}</DialogDescription></DialogHeader>{statusImpactLoading ? <div className="flex items-center gap-2 rounded-md border p-3 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" />এই ক্যাটাগরির পণ্য দেখা হচ্ছে</div> : !statusImpactFailed && <div className="rounded-md border bg-muted/30 p-3"><p className="text-sm font-medium">মোট পণ্য: {statusProductTotal} · অ্যাকটিভ: {activeImpactCount} · শো: {visibleImpactCount}</p>{statusProducts.length > 0 ? <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm text-muted-foreground">{statusProducts.slice(0, 10).map((product) => <li key={product.id} className="flex justify-between gap-3"><span className="break-words">{product.name}</span><span className="shrink-0">{product.isActive === false ? 'ইনঅ্যাকটিভ' : product.isVisibleInShop === false ? 'হাইড' : 'অ্যাকটিভ, শো'}</span></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">এই ক্যাটাগরিতে কোনো পণ্য নেই।</p>}{statusProductTotal > 10 && <p className="mt-2 text-xs text-muted-foreground">আরও {statusProductTotal - 10}টি পণ্য আছে।</p>}</div>}{statusError && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{statusError}</p>}<DialogFooter><Button variant="outline" onClick={() => { statusRequestId.current += 1; setStatusTarget(null); setStatusError(''); }} disabled={statusSaving}>বাতিল</Button><Button onClick={() => void confirmStatusChange()} disabled={statusImpactLoading || statusImpactFailed || statusSaving}>{statusSaving && <Loader2 size={15} className="mr-2 animate-spin" />}{statusSaving ? 'পরিবর্তন হচ্ছে' : statusTarget?.nextValue ? (statusTarget.setting === 'ACTIVE' ? 'অ্যাকটিভ করুন' : 'শো করুন') : (statusTarget?.setting === 'ACTIVE' ? 'ইনঅ্যাকটিভ করুন' : 'হাইড করুন')}</Button></DialogFooter></DialogContent></Dialog><Dialog open={editing !== null} onOpenChange={(open) => { if (!open && !saving) setEditing(null); }}><DialogContent><DialogHeader><DialogTitle>ক্যাটাগরির নাম পরিবর্তন</DialogTitle><DialogDescription>নাম পরিবর্তন করলে URL স্লাগও নতুন নাম অনুযায়ী বদলাবে।</DialogDescription></DialogHeader><div><Label htmlFor="category-edit-name">ক্যাটাগরির নাম</Label><Input id="category-edit-name" className="mt-2" value={editName} onChange={(event) => { setEditName(event.target.value); setEditError(''); }} aria-invalid={Boolean(editError)} aria-describedby={editError ? 'category-edit-error' : undefined} />{editError && <p id="category-edit-error" role="alert" className="mt-2 text-sm text-destructive">{editError}</p>}</div><DialogFooter><Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={saving}>বন্ধ করুন</Button><Button type="button" onClick={() => void saveEdit()} disabled={saving}>{saving ? 'সংরক্ষণ হচ্ছে…' : 'সংরক্ষণ করুন'}</Button></DialogFooter></DialogContent></Dialog><Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open && !deleting) { setDeleteTarget(null); setDeleteError(''); } }}><DialogContent><DialogHeader><DialogTitle>খালি ক্যাটাগরি মুছুন</DialogTitle><DialogDescription>{deleteTarget?.name} স্থায়ীভাবে মুছে যাবে। কোনো পণ্য থাকলে ক্যাটাগরি মুছবে না, শুধু ইনঅ্যাকটিভ করা যাবে।</DialogDescription></DialogHeader>{deleteError && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{deleteError}</p>}<DialogFooter><Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteError(''); }} disabled={deleting}>বাতিল</Button><Button variant="destructive" onClick={() => void confirmDelete()} disabled={deleting}>{deleting ? 'মুছে ফেলা হচ্ছে…' : 'স্থায়ীভাবে মুছুন'}</Button></DialogFooter></DialogContent></Dialog></div>;
}

export function AdminInventory() {
  return <Suspense fallback={<Loading />}><InventoryManager /></Suspense>;
}

export function AdminPhysicalSales() {
  return <Suspense fallback={<Loading />}><PhysicalSaleScreen /></Suspense>;
}

export function AdminDues() {
  return <Suspense fallback={<Loading />}><CreditSalesManager /></Suspense>;
}

export function AdminOrders() {
  return <Suspense fallback={<Loading />}><UnifiedOrderManager /></Suspense>;
}

export function AdminNotFound() {
  return <div className="flex min-h-[60vh] items-center justify-center"><div className="text-center"><h1 className="text-3xl font-bold">পৃষ্ঠা পাওয়া যায়নি</h1><p className="mt-2 text-muted-foreground">এই পরিচালনা পাতাটি নেই।</p><Button asChild className="mt-5"><Link to="/admin/dashboard">ড্যাশবোর্ডে ফিরুন</Link></Button></div></div>;
}

function Loading() {
  return <div className="py-20 flex justify-center text-muted-foreground"><Loader2 className="animate-spin mr-2" />লোড হচ্ছে…</div>;
}
