import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, createPhysicalSale, getAdminProducts, getPhysicalSales } from '@/lib/api';
import type { PhysicalSale, Product, ProductVariant } from '@/lib/types';
import { getErrorMessage } from '@/lib/utils';

interface SaleLine {
  product: Product;
  variant: ProductVariant;
  quantity: number;
}

export default function PhysicalSaleScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [recentSales, setRecentSales] = useState<PhysicalSale[]>([]);
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [query, setQuery] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [discount, setDiscount] = useState('0');
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState<PhysicalSale | null>(null);

  const load = useCallback(() => {
    Promise.all([getAdminProducts({ limit: 100 }), getPhysicalSales(20)])
      .then(([page, sales]) => { setProducts(page.data); setRecentSales(sales); })
      .catch((error) => toast.error(getErrorMessage(error, 'বিক্রয় স্ক্রিন লোড হয়নি')));
  }, []);
  useEffect(load, [load]);

  const variants = useMemo(() => products.flatMap((product) =>
    product.isActive === false ? [] : (product.variants ?? []).filter((variant) => variant.isActive).map((variant) => ({ product, variant }))), [products]);
  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return variants.slice(0, 12);
    return variants.filter(({ product, variant }) =>
      `${product.name} ${variant.name} ${variant.sku}`.toLowerCase().includes(normalized)).slice(0, 20);
  }, [query, variants]);
  const subtotal = lines.reduce((sum, line) => sum + line.variant.sellingPrice * line.quantity, 0);
  const discountNumber = Number(discount) || 0;
  const total = subtotal - discountNumber;

  function addLine(product: Product, variant: ProductVariant) {
    setLines((current) => {
      const existing = current.find((line) => line.variant.id === variant.id);
      if (existing) return current.map((line) => line.variant.id === variant.id ? { ...line, quantity: Math.min(line.quantity + 1, variant.availableStock) } : line);
      if (variant.availableStock <= 0) { toast.error('এই ভ্যারিয়েন্ট স্টকে নেই'); return current; }
      return [...current, { product, variant, quantity: 1 }];
    });
  }

  async function saveSale(confirmUnprofitable = false) {
    if (lines.length === 0) { toast.error('কমপক্ষে একটি পণ্য যোগ করুন'); return; }
    if (discountNumber < 0 || discountNumber > subtotal) { toast.error('ডিসকাউন্ট সাবটোটালের বেশি হতে পারবে না'); return; }
    setSaving(true);
    try {
      const result = await createPhysicalSale({
        items: lines.map((line) => ({ productVariantId: line.variant.id, quantity: line.quantity })),
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        discountTotal: discountNumber,
        confirmUnprofitable,
      });
      setCompleted(result);
      setLines([]); setCustomerName(''); setCustomerPhone(''); setDiscount('0');
      toast.success(`বিক্রয় ${result.orderNumber} সম্পন্ন হয়েছে`);
      load();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'UNPROFITABLE_SALE_CONFIRMATION_REQUIRED') {
        const projected = error.details?.projectedGrossProfit;
        const proceed = window.confirm(`সতর্কতা: এই বিক্রয়ে আনুমানিক মোট লাভ ৳${projected ?? 'ঋণাত্মক'} হবে। তারপরও বিক্রয় সম্পন্ন করবেন?`);
        if (proceed) {
          setSaving(false);
          await saveSale(true);
          return;
        }
      } else {
        toast.error(getErrorMessage(error, 'বিক্রয় সম্পন্ন হয়নি'));
      }
    } finally {
      setSaving(false);
    }
  }

  return <div className="space-y-8">
    <div><h1 className="text-2xl font-bold">দ্রুত ফিজিক্যাল-শপ বিক্রয়</h1><p className="text-sm text-muted-foreground">CASH · PAID · তাৎক্ষণিক FIFO স্টক কর্তন</p></div>
    <div className="grid xl:grid-cols-[1.1fr_1fr] gap-6">
      <section className="bg-card border rounded-lg p-5 space-y-4">
        <div className="relative"><Search className="absolute left-3 top-3 text-muted-foreground" size={17} /><Input className="pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="পণ্য, ভ্যারিয়েন্ট বা SKU খুঁজুন" /></div>
        <div className="grid sm:grid-cols-2 gap-2 max-h-[430px] overflow-y-auto">{matches.map(({ product, variant }) => <button key={variant.id} type="button" onClick={() => addLine(product, variant)} disabled={variant.availableStock <= 0} className="text-left border rounded-lg p-3 hover:border-secondary disabled:opacity-50"><div className="font-medium">{product.name}</div><div className="text-xs text-muted-foreground">{variant.name} · {variant.sku}</div><div className="flex justify-between mt-2"><span>৳{variant.sellingPrice}</span><span>স্টক {variant.availableStock}</span></div></button>)}</div>
      </section>

      <section className="bg-card border rounded-lg p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><ShoppingCart size={18} />বিক্রয় তালিকা</h2>
        <div className="space-y-2">{lines.map((line) => <div key={line.variant.id} className="border rounded p-3 grid grid-cols-[1fr_90px_auto] items-center gap-3"><div><strong>{line.product.name}</strong><div className="text-xs text-muted-foreground">{line.variant.name} · ৳{line.variant.sellingPrice}</div></div><Input type="number" min="1" max={line.variant.availableStock} value={line.quantity} onChange={(event) => setLines((current) => current.map((item) => item.variant.id === line.variant.id ? { ...item, quantity: Math.max(1, Math.min(Number(event.target.value) || 1, item.variant.availableStock)) } : item))} /><Button type="button" variant="ghost" aria-label="বাদ দিন" onClick={() => setLines((current) => current.filter((item) => item.variant.id !== line.variant.id))}><Trash2 size={16} /></Button></div>)}{lines.length === 0 && <p className="text-center text-muted-foreground py-8">বাম পাশ থেকে পণ্য যোগ করুন</p>}</div>
        <div className="grid sm:grid-cols-2 gap-3"><Field label="ক্রেতার নাম (ঐচ্ছিক)"><Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></Field><Field label="ফোন (ঐচ্ছিক)"><Input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} /></Field></div>
        <Field label="ডিসকাউন্ট (৳)"><Input type="number" min="0" max={subtotal} step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} /></Field>
        {discountNumber > subtotal && <p className="text-sm text-destructive">ডিসকাউন্ট সাবটোটালের বেশি হতে পারবে না।</p>}
        <div className="border-t pt-3 space-y-1 text-sm"><div className="flex justify-between"><span>সাবটোটাল</span><strong>৳{subtotal.toFixed(2)}</strong></div><div className="flex justify-between"><span>ডিসকাউন্ট</span><span>-৳{discountNumber.toFixed(2)}</span></div><div className="flex justify-between text-lg"><span>মোট</span><strong>৳{total.toFixed(2)}</strong></div></div>
        <Button className="w-full" disabled={saving || lines.length === 0} onClick={() => void saveSale()}><Plus size={16} className="mr-2" />{saving ? 'সম্পন্ন হচ্ছে…' : 'CASH বিক্রয় সম্পন্ন করুন'}</Button>
      </section>
    </div>

    {completed && <section className={`border rounded-lg p-5 ${completed.grossProfit < 0 ? 'border-destructive bg-destructive/5' : 'border-green-500 bg-green-50'}`}><h2 className="font-semibold">সর্বশেষ বিক্রয়: {completed.orderNumber}</h2><div className="grid sm:grid-cols-4 gap-3 mt-3 text-sm"><Metric label="বিক্রয়" value={`৳${completed.grandTotal.toFixed(2)}`} /><Metric label="ক্রয়মূল্য" value={`৳${completed.totalBuyingCost.toFixed(2)}`} /><Metric label="মোট লাভ" value={`৳${completed.grossProfit.toFixed(2)}`} /><Metric label="মার্জিন" value={completed.grossProfitMargin === null ? '—' : `${completed.grossProfitMargin.toFixed(2)}%`} /></div></section>}

    <section><h2 className="font-semibold text-lg mb-3">সাম্প্রতিক ফিজিক্যাল বিক্রয়</h2><div className="border rounded-lg overflow-x-auto bg-card"><table className="w-full text-sm"><thead className="bg-muted"><tr><th className="text-left p-3">নম্বর / সময়</th><th className="text-right p-3">বিক্রয়</th><th className="text-right p-3">ক্রয়মূল্য</th><th className="text-right p-3">মোট লাভ</th><th className="text-right p-3">মার্জিন</th></tr></thead><tbody>{recentSales.map((sale) => <tr key={sale.id} className="border-t"><td className="p-3"><strong>{sale.orderNumber}</strong><div className="text-xs text-muted-foreground">{new Date(sale.completedAt).toLocaleString('bn-BD')}</div></td><td className="p-3 text-right">৳{sale.grandTotal.toFixed(2)}</td><td className="p-3 text-right">৳{sale.totalBuyingCost.toFixed(2)}</td><td className={`p-3 text-right font-medium ${sale.grossProfit < 0 ? 'text-destructive' : ''}`}>৳{sale.grossProfit.toFixed(2)}</td><td className="p-3 text-right">{sale.grossProfitMargin === null ? '—' : `${sale.grossProfitMargin.toFixed(2)}%`}</td></tr>)}</tbody></table></div></section>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="text-xs">{label}</Label><div className="mt-1">{children}</div></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><div className="text-muted-foreground">{label}</div><div className="font-bold text-lg">{value}</div></div>;
}
