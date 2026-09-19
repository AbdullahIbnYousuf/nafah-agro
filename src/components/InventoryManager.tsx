import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, Boxes, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleDollarSign, History, Loader2, PackagePlus, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormattedDateInput } from '@/components/ui/formatted-date-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { FilterField, FilterFields, FilterPanel, FilterRefreshButton, FilterResetButton, filterSelectClassName } from '@/components/ui/filter-panel';
import { adjustStock, createPurchase, getAdminCategories, getInventoryItemBatches, getInventoryItems, getInventoryRecords, getInventorySummary, updateVariant } from '@/lib/api';
import type { AmountUnit, Category, InventoryBatchesPage, InventoryItem, InventoryRecord, InventoryRecordsPage, InventoryStockStatus, InventorySummary, ProductKind } from '@/lib/types';
import { formatAppDate, formatAppDateTime } from '@/lib/date';
import { productPackLabel } from '@/lib/productOptions';
import { amountUnitsForKind, defaultAmountUnit, formatQuantity, majorQuantity, productKindLabel, rateLabel, toBaseQuantity } from '@/lib/quantity';
import { UI_TERMS } from '@/lib/uiTerms';
import { getErrorMessage } from '@/lib/utils';

type WorkspaceView = 'STOCK' | 'RECORDS';
type StockStatusFilter = 'ALL' | InventoryStockStatus;
type StockSort = 'URGENCY' | 'NAME' | 'STOCK_ASC' | 'LAST_ADDED';
type RecordType = 'ALL' | 'PURCHASE' | 'ADJUSTMENT';
interface PurchaseRow { productVariantId: string; amount: string; amountUnit: AmountUnit; unitBuyingCost: string }
interface WorkspacePreferences { view: WorkspaceView; categoryId: string; status: StockStatusFilter; sort: StockSort; recordType: RecordType }

const PREFERENCES_KEY = 'nafah_inventory_workspace_v1';
const pageSize = 25;
const money = new Intl.NumberFormat('bn-BD', { maximumFractionDigits: 2 });
const number = new Intl.NumberFormat('bn-BD');
const todayDhaka = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function readPreferences(): WorkspacePreferences {
  const fallback: WorkspacePreferences = { view: 'STOCK', categoryId: '', status: 'ALL', sort: 'URGENCY', recordType: 'ALL' };
  try {
    const value = JSON.parse(window.localStorage.getItem(PREFERENCES_KEY) ?? '{}') as Partial<WorkspacePreferences>;
    return {
      view: value.view === 'RECORDS' ? 'RECORDS' : 'STOCK',
      categoryId: typeof value.categoryId === 'string' ? value.categoryId : '',
      status: ['ALL', 'IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'INACTIVE'].includes(value.status ?? '') ? value.status! : 'ALL',
      sort: ['URGENCY', 'NAME', 'STOCK_ASC', 'LAST_ADDED'].includes(value.sort ?? '') ? value.sort! : 'URGENCY',
      recordType: ['ALL', 'PURCHASE', 'ADJUSTMENT'].includes(value.recordType ?? '') ? value.recordType! : 'ALL',
    };
  } catch { return fallback; }
}

function savePreferences(value: WorkspacePreferences) {
  try { window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(value)); } catch { /* Browser storage may be unavailable. */ }
}

function itemName(item: Pick<InventoryItem, 'productName' | 'variantName' | 'productKind'>) {
  return item.productKind === 'PACKAGED' ? productPackLabel(item.productName, item.variantName) : item.productName;
}

function statusPresentation(status: InventoryStockStatus) {
  if (status === 'OUT_OF_STOCK') return { label: 'স্টক নেই', className: 'bg-destructive/10 text-destructive' };
  if (status === 'LOW_STOCK') return { label: 'কম স্টক', className: 'bg-amber-100 text-amber-900' };
  if (status === 'INACTIVE') return { label: 'ইনঅ্যাকটিভ', className: 'bg-slate-200 text-slate-800' };
  return { label: 'স্টক আছে', className: 'bg-emerald-100 text-emerald-800' };
}

export default function InventoryManager() {
  const navigate = useNavigate();
  const location = useLocation();
  const drawer = location.pathname.endsWith('/purchase') ? 'PURCHASE' : location.pathname.endsWith('/adjustment') ? 'ADJUSTMENT' : null;
  const [preferences, setPreferences] = useState(readPreferences);
  const [summary, setSummary] = useState<InventorySummary>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [options, setOptions] = useState<InventoryItem[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [queryDraft, setQueryDraft] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [expandedId, setExpandedId] = useState<string>();
  const [batchPages, setBatchPages] = useState<Record<string, InventoryBatchesPage>>({});
  const [batchLoading, setBatchLoading] = useState<Record<string, boolean>>({});
  const [batchErrors, setBatchErrors] = useState<Record<string, string>>({});
  const [showDepleted, setShowDepleted] = useState<Record<string, boolean>>({});
  const [records, setRecords] = useState<InventoryRecordsPage>();
  const [recordsPage, setRecordsPage] = useState(1);
  const [recordQueryDraft, setRecordQueryDraft] = useState('');
  const [recordQuery, setRecordQuery] = useState('');
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [limitTarget, setLimitTarget] = useState<InventoryItem>();
  const [limitValue, setLimitValue] = useState('');
  const [limitError, setLimitError] = useState('');
  const [limitSaving, setLimitSaving] = useState(false);

  const updatePreferences = useCallback((patch: Partial<WorkspacePreferences>) => {
    setPreferences((current) => { const next = { ...current, ...patch }; savePreferences(next); return next; });
  }, []);

  const loadHeader = useCallback(async () => {
    try {
      const [nextSummary, nextCategories, firstOptionPage] = await Promise.all([getInventorySummary(), getAdminCategories(), getInventoryItems({ limit: 200, sort: 'NAME' })]);
      const remainingOptionPages = firstOptionPage.totalPages > 1
        ? await Promise.all(Array.from({ length: firstOptionPage.totalPages - 1 }, (_, index) => getInventoryItems({ limit: 200, sort: 'NAME', page: index + 2 })))
        : [];
      setSummary(nextSummary);
      setCategories(nextCategories);
      setOptions([firstOptionPage, ...remainingOptionPages].flatMap((optionPage) => optionPage.data));
    } catch (error) { toast.error(getErrorMessage(error, 'ইনভেন্টরির তথ্য লোড হয়নি')); }
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const result = await getInventoryItems({ query: query || undefined, categoryId: preferences.categoryId || undefined, status: preferences.status, sort: preferences.sort, page, limit: pageSize });
      setItems(result.data); setTotalPages(result.totalPages);
    } catch (error) { setLoadError(getErrorMessage(error, 'বর্তমান স্টক লোড হয়নি')); } finally { setLoading(false); }
  }, [page, preferences.categoryId, preferences.sort, preferences.status, query]);

  const loadRecords = useCallback(async () => {
    if (preferences.view !== 'RECORDS') return;
    setRecordsLoading(true);
    try { setRecords(await getInventoryRecords({ query: recordQuery || undefined, type: preferences.recordType, page: recordsPage, limit: pageSize })); }
    catch (error) { toast.error(getErrorMessage(error, 'আগের রেকর্ড লোড হয়নি')); }
    finally { setRecordsLoading(false); }
  }, [preferences.recordType, preferences.view, recordQuery, recordsPage]);

  useEffect(() => { void loadHeader(); }, [loadHeader]);
  useEffect(() => { void loadItems(); }, [loadItems]);
  useEffect(() => { void loadRecords(); }, [loadRecords]);
  useEffect(() => { const timer = window.setTimeout(() => { setPage(1); setQuery(queryDraft.trim()); }, 300); return () => window.clearTimeout(timer); }, [queryDraft]);
  useEffect(() => { const timer = window.setTimeout(() => { setRecordsPage(1); setRecordQuery(recordQueryDraft.trim()); }, 300); return () => window.clearTimeout(timer); }, [recordQueryDraft]);

  async function refreshAll() {
    const expandedItem = items.find((item) => item.productVariantId === expandedId);
    await Promise.all([
      loadHeader(),
      loadItems(),
      loadRecords(),
      expandedItem ? loadBatches(expandedItem, Boolean(showDepleted[expandedItem.productVariantId]), batchPages[expandedItem.productVariantId]?.page ?? 1) : Promise.resolve(),
    ]);
  }
  async function loadBatches(item: InventoryItem, includeDepleted = false, batchPage = 1) {
    setBatchLoading((current) => ({ ...current, [item.productVariantId]: true })); setBatchErrors((current) => ({ ...current, [item.productVariantId]: '' }));
    try {
      const result = await getInventoryItemBatches(item.productVariantId, { includeDepleted, page: batchPage, limit: 25 });
      setBatchPages((current) => ({ ...current, [item.productVariantId]: result })); setShowDepleted((current) => ({ ...current, [item.productVariantId]: includeDepleted }));
    } catch (error) { setBatchErrors((current) => ({ ...current, [item.productVariantId]: getErrorMessage(error, 'এই পণ্যের স্টক লোড হয়নি') })); }
    finally { setBatchLoading((current) => ({ ...current, [item.productVariantId]: false })); }
  }
  function toggleItem(item: InventoryItem) {
    if (expandedId === item.productVariantId) { setExpandedId(undefined); return; }
    setExpandedId(item.productVariantId); if (!batchPages[item.productVariantId]) void loadBatches(item);
  }
  function openDrawer(type: 'purchase' | 'adjustment', item?: InventoryItem) {
    navigate(`/admin/inventory/${type}${item ? `?variant=${encodeURIComponent(item.productVariantId)}` : ''}`);
  }
  const closeDrawer = () => navigate('/admin/inventory');

  const stockFiltersActive = queryDraft.trim().length > 0 || preferences.categoryId !== '' || preferences.status !== 'ALL' || preferences.sort !== 'URGENCY';
  const recordFiltersActive = recordQueryDraft.trim().length > 0 || preferences.recordType !== 'ALL';

  function resetStockFilters() {
    setQueryDraft(''); setQuery(''); setPage(1);
    updatePreferences({ categoryId: '', status: 'ALL', sort: 'URGENCY' });
  }

  function resetRecordFilters() {
    setRecordQueryDraft(''); setRecordQuery(''); setRecordsPage(1);
    updatePreferences({ recordType: 'ALL' });
  }

  function openLimitEditor(item: InventoryItem) {
    setLimitTarget(item);
    setLimitValue(String(majorQuantity(item.lowStockThreshold, item.quantityUnit)));
    setLimitError('');
  }

  async function saveLowStockLimit() {
    if (!limitTarget) return;
    const numeric = Number(limitValue);
    const scale = limitTarget.quantityUnit === 'PIECE' ? 1 : 1_000;
    const baseValue = numeric * scale;
    if (!Number.isFinite(numeric) || numeric < 0 || !Number.isInteger(baseValue) || baseValue > 2_000_000_000) {
      setLimitError(limitTarget.quantityUnit === 'PIECE'
        ? 'শূন্য বা তার বেশি পূর্ণ ইউনিট দিন।'
        : 'শূন্য বা তার বেশি পরিমাণ দিন। দশমিকের পর সর্বোচ্চ ৩ ঘর ব্যবহার করুন।');
      return;
    }
    setLimitSaving(true); setLimitError('');
    try {
      await updateVariant(limitTarget.productVariantId, { lowStockThreshold: baseValue });
      toast.success('কম স্টকের লিমিট আপডেট হয়েছে');
      setLimitTarget(undefined);
      await refreshAll();
    } catch (error) {
      setLimitError(getErrorMessage(error, 'কম স্টকের লিমিট আপডেট হয়নি'));
    } finally { setLimitSaving(false); }
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold">ক্রয় ও ইনভেন্টরি</h1><p className="text-sm text-muted-foreground">বর্তমান স্টক দেখুন, নতুন স্টক অ্যাড করুন এবং আগের রেকর্ড খুঁজুন।</p></div><div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2"><div><Button className="w-full" onClick={() => openDrawer('purchase')}><Plus size={16} />{UI_TERMS.stock.add}</Button><p className="mt-1 max-w-60 text-xs text-muted-foreground">নতুন করে পণ্য কিনলে এটি ব্যবহার করুন।</p></div><div><Button className="w-full" variant="outline" onClick={() => openDrawer('adjustment')}><Boxes size={16} />{UI_TERMS.stock.update}</Button><p className="mt-1 max-w-60 text-xs text-muted-foreground">ভুল হলে, নষ্ট হলে বা হাতে স্টক মিলাতে এটি ব্যবহার করুন।</p></div></div></div>
    <section aria-label="ইনভেন্টরি সারাংশ" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard label="মোট স্টক আইটেম" value={summary ? number.format(summary.totalStockItems) : '...'} detail="প্রতিটি পণ্য ও প্যাক/সাইজ আলাদা করে গোনা হয়েছে।" icon={Boxes} active={preferences.status === 'ALL'} onClick={() => { updatePreferences({ status: 'ALL', view: 'STOCK' }); setPage(1); }} />
      <SummaryCard label="কম স্টক" value={summary ? number.format(summary.lowStockItems) : '...'} detail="কম স্টকের লিমিটে পৌঁছানো অ্যাকটিভ আইটেম।" icon={AlertTriangle} active={preferences.status === 'LOW_STOCK'} onClick={() => { updatePreferences({ status: 'LOW_STOCK', view: 'STOCK' }); setPage(1); }} />
      <SummaryCard label="স্টক নেই" value={summary ? number.format(summary.outOfStockItems) : '...'} detail="বিক্রির জন্য কোনো স্টক নেই এমন অ্যাকটিভ আইটেম।" icon={PackagePlus} active={preferences.status === 'OUT_OF_STOCK'} onClick={() => { updatePreferences({ status: 'OUT_OF_STOCK', view: 'STOCK' }); setPage(1); }} />
      <SummaryCard label="স্টকের মূল্য" value={summary ? `৳${money.format(summary.inventoryValue)}` : '...'} detail="বিক্রির জন্য থাকা ও অর্ডারের জন্য রাখা স্টকের ক্রয়মূল্য।" icon={CircleDollarSign} />
    </section>
    <div className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/40 p-1.5 sm:inline-grid sm:min-w-[360px]" role="tablist" aria-label="ইনভেন্টরি ভিউ"><ViewButton active={preferences.view === 'STOCK'} onClick={() => updatePreferences({ view: 'STOCK' })}><Boxes size={17} />বর্তমান স্টক</ViewButton><ViewButton active={preferences.view === 'RECORDS'} onClick={() => updatePreferences({ view: 'RECORDS' })}><History size={17} />আগের রেকর্ড</ViewButton></div>
    {preferences.view === 'STOCK' ? <>
      <FilterPanel actions={<><FilterResetButton active={stockFiltersActive} onClick={resetStockFilters} /><FilterRefreshButton onClick={() => void refreshAll()} loading={loading} /></>}>
        <FilterFields className="xl:grid-cols-[minmax(220px,1fr)_220px_190px_190px]">
          <FilterField label="পণ্য"><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 text-muted-foreground" size={17} /><Input aria-label="পণ্য খুঁজুন" className="pl-9" value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} placeholder="পণ্যের নাম লিখে খুঁজুন" /></div></FilterField>
          <FilterField label="ক্যাটাগরি"><select aria-label="ক্যাটাগরি" className={filterSelectClassName} value={preferences.categoryId} onChange={(event) => { updatePreferences({ categoryId: event.target.value }); setPage(1); }}><option value="">সব ক্যাটাগরি</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></FilterField>
          <FilterField label="স্ট্যাটাস"><select aria-label="স্টকের অবস্থা" className={filterSelectClassName} value={preferences.status} onChange={(event) => { updatePreferences({ status: event.target.value as StockStatusFilter }); setPage(1); }}><option value="ALL">সব স্ট্যাটাস</option><option value="IN_STOCK">স্টক আছে</option><option value="LOW_STOCK">কম স্টক</option><option value="OUT_OF_STOCK">স্টক নেই</option><option value="INACTIVE">ইনঅ্যাকটিভ</option></select></FilterField>
          <FilterField label="সাজানোর নিয়ম"><select aria-label="সাজানোর নিয়ম" className={filterSelectClassName} value={preferences.sort} onChange={(event) => { updatePreferences({ sort: event.target.value as StockSort }); setPage(1); }}><option value="URGENCY">গুরুত্ব অনুযায়ী</option><option value="NAME">নাম অনুযায়ী</option><option value="STOCK_ASC">কম পরিমাণ আগে</option><option value="LAST_ADDED">সর্বশেষ স্টক আগে</option></select></FilterField>
        </FilterFields>
      </FilterPanel>
      {loadError ? <ErrorState message={loadError} onRetry={() => void loadItems()} /> : loading ? <LoadingRows /> : items.length === 0 ? <EmptyState filtered={stockFiltersActive} onReset={resetStockFilters} /> : <div className="overflow-hidden rounded-xl border bg-card"><div className="hidden grid-cols-[minmax(220px,1.8fr)_1fr_1fr_1fr_1fr_44px] gap-3 bg-muted px-4 py-3 text-xs font-semibold text-muted-foreground md:grid"><span>পণ্য / প্যাক/সাইজ</span><span>বর্তমান স্টক</span><span>{UI_TERMS.stock.lowLimit}</span><span>স্ট্যাটাস</span><span>শেষ স্টক অ্যাড</span><span /></div><div className="divide-y">{items.map((item) => <InventoryItemRow key={item.productVariantId} item={item} expanded={expandedId === item.productVariantId} batches={batchPages[item.productVariantId]} loading={batchLoading[item.productVariantId]} error={batchErrors[item.productVariantId]} showingDepleted={showDepleted[item.productVariantId]} onToggle={() => toggleItem(item)} onShowDepleted={() => void loadBatches(item, true)} onHideDepleted={() => void loadBatches(item, false)} onBatchPageChange={(batchPage) => void loadBatches(item, Boolean(showDepleted[item.productVariantId]), batchPage)} onPurchase={() => openDrawer('purchase', item)} onAdjustment={() => openDrawer('adjustment', item)} onEditLimit={() => openLimitEditor(item)} />)}</div></div>}
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </> : <>
      <FilterPanel actions={<><FilterResetButton active={recordFiltersActive} onClick={resetRecordFilters} /><FilterRefreshButton onClick={() => void loadRecords()} loading={recordsLoading} /></>}>
        <FilterFields className="sm:grid-cols-[minmax(220px,1fr)_220px]">
          <FilterField label="পণ্য"><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 text-muted-foreground" size={17} /><Input aria-label="আগের রেকর্ড খুঁজুন" className="pl-9" value={recordQueryDraft} onChange={(event) => setRecordQueryDraft(event.target.value)} placeholder="পণ্যের নাম লিখে খুঁজুন" /></div></FilterField>
          <FilterField label="রেকর্ডের ধরন"><select aria-label="রেকর্ডের ধরন" className={filterSelectClassName} value={preferences.recordType} onChange={(event) => { updatePreferences({ recordType: event.target.value as RecordType }); setRecordsPage(1); }}><option value="ALL">সব রেকর্ড</option><option value="PURCHASE">স্টক অ্যাড</option><option value="ADJUSTMENT">স্টক আপডেট</option></select></FilterField>
        </FilterFields>
      </FilterPanel>
      {recordsLoading ? <LoadingRows /> : !records?.data.length ? <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground">কোনো আগের রেকর্ড পাওয়া যায়নি।</div> : <div className="space-y-3">{records.data.map((record) => <InventoryRecordCard key={`${record.type}-${record.id}`} record={record} />)}</div>}<Pagination page={recordsPage} totalPages={records?.totalPages ?? 0} onChange={setRecordsPage} />
    </>}
    <Sheet open={drawer !== null} onOpenChange={(open) => { if (!open) closeDrawer(); }}><SheetContent className="w-full overflow-y-auto pb-28 sm:max-w-2xl md:pb-6">{drawer === 'PURCHASE' && <PurchaseDrawer options={options} initialVariantId={new URLSearchParams(location.search).get('variant') ?? ''} onSaved={async () => { closeDrawer(); await refreshAll(); }} />}{drawer === 'ADJUSTMENT' && <AdjustmentDrawer options={options} initialVariantId={new URLSearchParams(location.search).get('variant') ?? ''} onSaved={async () => { closeDrawer(); await refreshAll(); }} />}</SheetContent></Sheet>
    <Dialog open={Boolean(limitTarget)} onOpenChange={(open) => { if (!open && !limitSaving) { setLimitTarget(undefined); setLimitError(''); } }}><DialogContent><DialogHeader><DialogTitle>কম স্টকের লিমিট আপডেট করুন</DialogTitle><DialogDescription>{limitTarget ? `${itemName(limitTarget)} পণ্যে কত স্টক থাকলে “কম স্টক” দেখাবে তা লিখুন।` : ''}</DialogDescription></DialogHeader>{limitTarget && <Field label={`${UI_TERMS.stock.lowLimit} (${limitTarget.productKind === 'EGG' ? 'টি ডিম' : limitTarget.quantityUnit === 'PIECE' ? 'ইউনিট' : limitTarget.quantityUnit === 'GRAM' ? 'কেজি' : 'লিটার'})`}><Input autoFocus aria-label={UI_TERMS.stock.lowLimit} type="number" min="0" step={limitTarget.quantityUnit === 'PIECE' ? '1' : '0.001'} value={limitValue} onChange={(event) => { setLimitValue(event.target.value); setLimitError(''); }} /></Field>}{limitError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{limitError}</p>}<DialogFooter><Button variant="outline" disabled={limitSaving} onClick={() => { setLimitTarget(undefined); setLimitError(''); }}>বন্ধ করুন</Button><Button disabled={limitSaving} onClick={() => void saveLowStockLimit()}>{limitSaving && <Loader2 size={15} className="animate-spin" />}{limitSaving ? UI_TERMS.saving : UI_TERMS.save}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function SummaryCard({ label, value, detail, icon: Icon, active = false, onClick }: { label: string; value: string; detail: string; icon: typeof Boxes; active?: boolean; onClick?: () => void }) {
  const content = <><div className="flex items-start justify-between gap-3"><div><div className="text-sm text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-bold">{value}</div></div><Icon size={23} className="text-secondary" /></div><p className="mt-2 text-xs text-muted-foreground">{detail}</p></>;
  return onClick ? <button type="button" onClick={onClick} className={`rounded-xl border bg-card p-4 text-left transition hover:border-secondary hover:shadow-sm ${active ? 'ring-2 ring-secondary/40' : ''}`}>{content}</button> : <div className="rounded-xl border bg-card p-4">{content}</div>;
}
function ViewButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) { return <button type="button" role="tab" aria-selected={active} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 font-semibold transition ${active ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-transparent bg-background text-muted-foreground hover:border-border hover:text-foreground'}`} onClick={onClick}>{children}</button>; }

function InventoryItemRow({ item, expanded, batches, loading, error, showingDepleted, onToggle, onShowDepleted, onHideDepleted, onBatchPageChange, onPurchase, onAdjustment, onEditLimit }: { item: InventoryItem; expanded: boolean; batches?: InventoryBatchesPage; loading?: boolean; error?: string; showingDepleted?: boolean; onToggle: () => void; onShowDepleted: () => void; onHideDepleted: () => void; onBatchPageChange: (page: number) => void; onPurchase: () => void; onAdjustment: () => void; onEditLimit: () => void }) {
  const status = statusPresentation(item.status);
  return <div className={expanded ? 'bg-muted/20' : ''}>
    <div className="relative grid w-full gap-2 p-4 pr-12 text-left hover:bg-muted/30 md:grid-cols-[minmax(220px,1.8fr)_1fr_1fr_1fr_1fr_44px] md:items-center md:gap-3 md:pr-4">
      <button type="button" aria-expanded={expanded} onClick={onToggle} className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><strong className="break-words">{itemName(item)}</strong><span className="mt-1 block text-xs text-muted-foreground">{item.categoryName} · {productKindLabel(item.productKind)}</span></button>
      <span><span className="mr-2 text-xs text-muted-foreground md:hidden">বর্তমান:</span><strong>{formatQuantity(item.availableStock, item.quantityUnit, item.productKind)}</strong>{item.reservedStock > 0 && <span className="block text-xs text-muted-foreground">রিজার্ভ {formatQuantity(item.reservedStock, item.quantityUnit, item.productKind)}</span>}</span>
      <span className="flex items-center gap-1"><span className="mr-1 text-xs text-muted-foreground md:hidden">কম স্টকের লিমিট:</span>{formatQuantity(item.lowStockThreshold, item.quantityUnit, item.productKind)}<button type="button" aria-label={`${UI_TERMS.stock.lowLimit} আপডেট করুন: ${itemName(item)}`} title={`${UI_TERMS.stock.lowLimit} আপডেট করুন`} onClick={onEditLimit} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-secondary hover:bg-secondary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Pencil size={15} /></button></span>
      <span><span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span></span>
      <span><span className="mr-2 text-xs text-muted-foreground md:hidden">শেষ স্টক:</span>{item.lastStockAddedAt ? formatAppDate(item.lastStockAddedAt) : 'এখনো অ্যাড হয়নি'}</span>
      <button type="button" aria-expanded={expanded} aria-label={`${itemName(item)} এর স্টকের বিস্তারিত ${expanded ? 'বন্ধ করুন' : 'দেখুন'}`} onClick={onToggle} className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:static md:justify-self-end">{expanded ? <ChevronUp size={19} /> : <ChevronDown size={19} />}</button>
    </div>
    {expanded && <div className="mx-2 mb-2 rounded-lg bg-background/80 p-4 shadow-sm md:ml-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div><strong>এই পণ্যের স্টক</strong><p className="mt-1 text-sm font-medium">আগে অ্যাড করা স্টকগুলো</p><p className="text-xs text-muted-foreground">আগে অ্যাড করা স্টক আগে ধরা হয়।</p></div>
        <div className="flex gap-2"><Button size="sm" variant="outline" disabled={!item.isOperational} onClick={onPurchase}>{UI_TERMS.stock.addMore}</Button><Button size="sm" variant="outline" disabled={!item.isOperational} onClick={onAdjustment}>{UI_TERMS.stock.updateAction}</Button></div>
      </div>
      {!item.isOperational && <p className="mb-3 rounded-md bg-amber-50 p-2 text-xs text-amber-900">স্টক অ্যাড বা আপডেট করার আগে পণ্য, প্যাক/সাইজ ও ক্যাটাগরি অ্যাকটিভ করুন।</p>}
      {loading ? <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" />স্টক লোড হচ্ছে</div> : error ? <p role="alert" className="text-sm text-destructive">{error}</p> : <>
        <div className="space-y-2">{batches?.data.map((batch) => <div key={batch.id} className="grid gap-1 rounded-lg border bg-background p-3 text-sm sm:grid-cols-[1fr_1fr_1fr_1fr_1fr_1.4fr] sm:gap-3">
          <span>{batch.source === 'PURCHASE' ? 'স্টক অ্যাড' : batch.source === 'ADJUSTMENT' ? 'স্টক আপডেট' : 'বিক্রয়যোগ্য ফেরত'}<span className="block text-xs text-muted-foreground">{formatAppDate(batch.purchaseDate)}</span></span>
          <span><span className="text-xs text-muted-foreground">অ্যাড হয়েছিল</span><strong className="block">{formatQuantity(batch.purchasedQuantity, batch.quantityUnit, batch.productKind)}</strong></span>
          <span><span className="text-xs text-muted-foreground">বিক্রির জন্য</span><strong className="block">{formatQuantity(batch.availableQuantity, batch.quantityUnit, batch.productKind)}</strong></span>
          <span><span className="text-xs text-muted-foreground">অর্ডারের জন্য রাখা</span><strong className="block">{formatQuantity(batch.reservedQuantity, batch.quantityUnit, batch.productKind)}</strong></span>
          <span><span className="text-xs text-muted-foreground">ক্রয়মূল্য</span><strong className="block">৳{money.format(batch.unitBuyingCost)} {rateLabel(batch.productKind)}</strong></span>
          <span><span className="text-xs text-muted-foreground">কারণ/নোট</span><span className="block">{batch.adjustmentReason ?? batch.note ?? 'নোট নেই'}</span></span>
        </div>)}</div>
        {!batches?.data.length && <div className="py-5 text-center text-sm text-muted-foreground"><p>এখনও কোনো স্টক অ্যাড করা হয়নি</p><p className="mt-1 text-xs">নতুন স্টক অ্যাড করলে এখানে দেখা যাবে</p></div>}
        {showingDepleted ? <Button className="mt-3" size="sm" variant="ghost" onClick={onHideDepleted}>বর্তমান স্টক দেখুন</Button> : batches?.hasDepleted && <Button className="mt-3" size="sm" variant="ghost" onClick={onShowDepleted}><History size={15} />আগের স্টক দেখুন</Button>}
        <Pagination page={batches?.page ?? 1} totalPages={batches?.totalPages ?? 0} onChange={onBatchPageChange} />
      </>}
    </div>}
  </div>;
}

function InventoryRecordCard({ record }: { record: InventoryRecord }) {
  return <article className="rounded-xl border bg-card p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold">{record.type === 'PURCHASE' ? 'স্টক অ্যাড' : 'স্টক আপডেট'}</span><span className="text-sm text-muted-foreground">{formatAppDate(record.effectiveDate)} · {record.createdBy.fullName}</span></div><div className="text-xs text-muted-foreground">রেকর্ড হয়েছে: {formatAppDateTime(record.occurredAt)}</div></div><div className="mt-2 space-y-1.5">{record.items.map((item) => <div key={item.productVariantId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/30 px-3 py-2"><div><strong>{item.productKind === 'PACKAGED' ? productPackLabel(item.productName, item.variantName) : item.productName}</strong><div className="text-xs text-muted-foreground">{productKindLabel(item.productKind)}</div></div><div className="text-right"><strong className={item.direction === 'DECREASE' ? 'text-destructive' : 'text-secondary'}>{item.direction === 'DECREASE' ? '-' : '+'}{formatQuantity(item.quantity, item.quantityUnit, item.productKind)}</strong>{item.unitBuyingCost !== null && <div className="text-xs text-muted-foreground">৳{money.format(item.unitBuyingCost)} {rateLabel(item.productKind)}</div>}</div></div>)}</div><div className="mt-2 text-sm"><span className="text-muted-foreground">কারণ/নোট: </span>{record.note ?? 'নোট নেই'}</div></article>;
}

function PurchaseDrawer({ options, initialVariantId, onSaved }: { options: InventoryItem[]; initialVariantId: string; onSaved: () => Promise<void> }) {
  const initial = options.find((item) => item.productVariantId === initialVariantId && item.isOperational);
  const [purchaseDate, setPurchaseDate] = useState(todayDhaka); const [note, setNote] = useState('');
  const [rows, setRows] = useState<PurchaseRow[]>([{ productVariantId: initial?.productVariantId ?? '', amount: '', amountUnit: defaultAmountUnit(initial?.productKind), unitBuyingCost: '' }]); const [saving, setSaving] = useState(false);
  const optionById = useMemo(() => new Map(options.map((item) => [item.productVariantId, item])), [options]); const operationalOptions = options.filter((item) => item.isOperational);
  useEffect(() => {
    const loadedInitial = options.find((item) => item.productVariantId === initialVariantId && item.isOperational);
    if (!loadedInitial) return;
    setRows((current) => current.length === 1 && !current[0].productVariantId
      ? [{ ...current[0], productVariantId: loadedInitial.productVariantId, amountUnit: defaultAmountUnit(loadedInitial.productKind) }]
      : current);
  }, [initialVariantId, options]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); const items = rows.map((row) => ({ productVariantId: row.productVariantId, amount: row.amount, amountUnit: row.amountUnit, unitBuyingCost: Number(row.unitBuyingCost) }));
    if (items.some((item) => !item.productVariantId || toBaseQuantity(item.amount, item.amountUnit) === null || !Number.isFinite(item.unitBuyingCost) || item.unitBuyingCost <= 0)) { toast.error('প্রতিটি পণ্য, ধনাত্মক পরিমাণ ও ক্রয়মূল্য দিন'); return; }
    if (new Set(items.map((item) => item.productVariantId)).size !== items.length) { toast.error('একই প্যাক/সাইজ একবারের বেশি অ্যাড করবেন না'); return; }
    setSaving(true); try { const result = await createPurchase({ purchaseDate, note: note.trim() || undefined, items }); toast.success(`${result.batches.length}টি পণ্যে স্টক অ্যাড হয়েছে`); await onSaved(); } catch (error) { toast.error(getErrorMessage(error, 'স্টক অ্যাড হয়নি')); } finally { setSaving(false); }
  }
  return <><SheetHeader><SheetTitle>{UI_TERMS.stock.add}</SheetTitle><SheetDescription>একসঙ্গে এক বা একাধিক পণ্যে স্টক অ্যাড করা যাবে। আগে অ্যাড করা স্টক আগে ধরা হয়।</SheetDescription></SheetHeader><form onSubmit={submit} className="mt-6 space-y-4"><div className="grid gap-3 sm:grid-cols-2"><Field label="স্টক অ্যাড করার তারিখ"><FormattedDateInput aria-label="স্টক অ্যাড করার তারিখ" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} required /></Field><Field label="নোট (ঐচ্ছিক)"><Input value={note} onChange={(event) => setNote(event.target.value)} /></Field></div><div className="space-y-3">{rows.map((row, index) => <div key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2"><Field label="পণ্য / প্যাক/সাইজ"><select aria-label={`স্টক অ্যাডের পণ্য / প্যাক/সাইজ ${index + 1}`} className="h-11 w-full rounded-md border bg-background px-3" value={row.productVariantId} onChange={(event) => { const item = optionById.get(event.target.value); setRows((current) => current.map((value, rowIndex) => rowIndex === index ? { ...value, productVariantId: event.target.value, amount: '', amountUnit: defaultAmountUnit(item?.productKind) } : value)); }}><option value="">নির্বাচন করুন</option>{operationalOptions.map((item) => <option key={item.productVariantId} value={item.productVariantId}>{itemName(item)} · স্টক {formatQuantity(item.availableStock, item.quantityUnit)}</option>)}</select></Field><Field label="পরিমাণ"><AmountInput kind={optionById.get(row.productVariantId)?.productKind} amount={row.amount} unit={row.amountUnit} onAmountChange={(amount) => setRows((current) => current.map((value, rowIndex) => rowIndex === index ? { ...value, amount } : value))} onUnitChange={(amountUnit) => setRows((current) => current.map((value, rowIndex) => rowIndex === index ? { ...value, amountUnit, amount: '' } : value))} /></Field><Field label={`ক্রয়মূল্য (৳, ${rateLabel(optionById.get(row.productVariantId)?.productKind)})`}><Input type="number" min="0.01" step="0.01" value={row.unitBuyingCost} onChange={(event) => setRows((current) => current.map((value, rowIndex) => rowIndex === index ? { ...value, unitBuyingCost: event.target.value } : value))} /></Field>{rows.length > 1 && <div className="flex items-end justify-end"><Button type="button" variant="ghost" onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={16} />বাদ দিন</Button></div>}</div>)}</div><div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:justify-between"><Button type="button" variant="outline" onClick={() => setRows((current) => [...current, { productVariantId: '', amount: '', amountUnit: 'PIECE', unitBuyingCost: '' }])}><Plus size={15} />আরেকটি পণ্য অ্যাড করুন</Button><Button type="submit" disabled={saving}>{saving && <Loader2 size={15} className="animate-spin" />}{saving ? UI_TERMS.saving : 'স্টক অ্যাড করুন'}</Button></div></form></>;
}

function AdjustmentDrawer({ options, initialVariantId, onSaved }: { options: InventoryItem[]; initialVariantId: string; onSaved: () => Promise<void> }) {
  const initial = options.find((item) => item.productVariantId === initialVariantId && item.isOperational); const [variantId, setVariantId] = useState(initial?.productVariantId ?? ''); const [direction, setDirection] = useState<'INCREASE' | 'DECREASE'>('DECREASE'); const [amount, setAmount] = useState(''); const [amountUnit, setAmountUnit] = useState<AmountUnit>(defaultAmountUnit(initial?.productKind)); const [cost, setCost] = useState(''); const [date, setDate] = useState(todayDhaka); const [reason, setReason] = useState(''); const [confirming, setConfirming] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const operationalOptions = options.filter((item) => item.isOperational); const selected = options.find((item) => item.productVariantId === variantId); const baseQuantity = toBaseQuantity(amount, amountUnit); const expectedStock = selected && baseQuantity !== null ? selected.availableStock + (direction === 'INCREASE' ? baseQuantity : -baseQuantity) : null;
  useEffect(() => {
    if (variantId) return;
    const loadedInitial = options.find((item) => item.productVariantId === initialVariantId && item.isOperational);
    if (loadedInitial) {
      setVariantId(loadedInitial.productVariantId);
      setAmountUnit(defaultAmountUnit(loadedInitial.productKind));
    }
  }, [initialVariantId, options, variantId]);
  function review(event: React.FormEvent) { event.preventDefault(); setError(''); if (!selected || baseQuantity === null || reason.trim().length < 3) { toast.error('পণ্য, ধনাত্মক পরিমাণ ও কারণ দিন'); return; } if (direction === 'DECREASE' && baseQuantity > selected.availableStock) { toast.error('বর্তমান স্টকের চেয়ে বেশি কমানো যাবে না'); return; } if (direction === 'INCREASE' && (!Number.isFinite(Number(cost)) || Number(cost) <= 0)) { toast.error('স্টক বাড়াতে ধনাত্মক ক্রয়মূল্য দিন'); return; } setConfirming(true); }
  async function confirm() { if (!selected || baseQuantity === null) return; setSaving(true); setError(''); try { await adjustStock(direction === 'INCREASE' ? { direction, productVariantId: variantId, amount, amountUnit, unitBuyingCost: Number(cost), purchaseDate: date, reason: reason.trim() } : { direction, productVariantId: variantId, amount, amountUnit, reason: reason.trim() }); toast.success('স্টক আপডেট হয়েছে'); setConfirming(false); await onSaved(); } catch (value) { setError(getErrorMessage(value, 'স্টক আপডেট হয়নি')); } finally { setSaving(false); } }
  return <><SheetHeader><SheetTitle>{UI_TERMS.stock.update}</SheetTitle><SheetDescription>ভুল গণনা, ক্ষতি বা হাতে থাকা স্টকের সঙ্গে হিসাব না মিললে স্টক বাড়ান বা কমান।</SheetDescription></SheetHeader><form onSubmit={review} className="mt-6 space-y-4"><Field label="পণ্য / প্যাক/সাইজ"><select aria-label="স্টক আপডেটের পণ্য / প্যাক/সাইজ" className="h-11 w-full rounded-md border bg-background px-3" value={variantId} onChange={(event) => { const item = options.find((value) => value.productVariantId === event.target.value); setVariantId(event.target.value); setAmountUnit(defaultAmountUnit(item?.productKind)); setAmount(''); }}><option value="">নির্বাচন করুন</option>{operationalOptions.map((item) => <option key={item.productVariantId} value={item.productVariantId}>{itemName(item)} · স্টক {formatQuantity(item.availableStock, item.quantityUnit)}</option>)}</select></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="ধরন"><select className="h-11 w-full rounded-md border bg-background px-3" value={direction} onChange={(event) => setDirection(event.target.value as 'INCREASE' | 'DECREASE')}><option value="DECREASE">স্টক কমান</option><option value="INCREASE">স্টক বাড়ান</option></select></Field><Field label="পরিমাণ"><AmountInput kind={selected?.productKind} amount={amount} unit={amountUnit} onAmountChange={setAmount} onUnitChange={(unit) => { setAmountUnit(unit); setAmount(''); }} /></Field>{direction === 'INCREASE' && <Field label={`ক্রয়মূল্য (৳, ${rateLabel(selected?.productKind)})`}><Input type="number" min="0.01" step="0.01" value={cost} onChange={(event) => setCost(event.target.value)} /></Field>}{direction === 'INCREASE' && <Field label="স্টক অ্যাড করার তারিখ"><FormattedDateInput aria-label="স্টক অ্যাড করার তারিখ" value={date} onChange={(event) => setDate(event.target.value)} /></Field>}</div><Field label="স্টক আপডেটের কারণ *"><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="যেমন: ক্ষতিগ্রস্ত ২ ইউনিট" /></Field><div className="flex justify-end border-t pt-4"><Button type="submit">{UI_TERMS.stock.review}</Button></div></form><Dialog open={confirming} onOpenChange={(open) => { if (!open && !saving) { setConfirming(false); setError(''); } }}><DialogContent><DialogHeader><DialogTitle>স্টক আপডেট কনফার্ম করুন</DialogTitle><DialogDescription>{direction === 'INCREASE' ? 'কনফার্ম করলে এই পরিমাণ ও ক্রয়মূল্য দিয়ে নতুন স্টক অ্যাড হবে।' : 'কনফার্ম করলে আগে অ্যাড করা স্টক থেকে পরিমাণ কমবে। কারণটি আগের রেকর্ডে থাকবে।'}</DialogDescription></DialogHeader>{selected && <div className="space-y-2 rounded-lg border bg-muted/30 p-4 text-sm"><div className="flex justify-between gap-3"><span>পণ্য</span><strong>{itemName(selected)}</strong></div><div className="flex justify-between gap-3"><span>পরিবর্তন</span><strong>{direction === 'INCREASE' ? 'স্টক বাড়বে' : 'স্টক কমবে'} {baseQuantity === null ? '' : formatQuantity(baseQuantity, selected.quantityUnit)}</strong></div><div className="flex justify-between gap-3"><span>বর্তমান স্টক</span><strong>{formatQuantity(selected.availableStock, selected.quantityUnit)}</strong></div><div className="flex justify-between gap-3"><span>আপডেটের পর</span><strong>{expectedStock === null ? '' : formatQuantity(expectedStock, selected.quantityUnit)}</strong></div>{direction === 'INCREASE' && <><div className="flex justify-between gap-3"><span>ক্রয়মূল্য</span><strong>৳{money.format(Number(cost))} {rateLabel(selected.productKind)}</strong></div><div className="flex justify-between gap-3"><span>তারিখ</span><strong>{formatAppDate(date)}</strong></div></>}<div className="border-t pt-2"><span className="text-muted-foreground">কারণ: </span>{reason.trim()}</div></div>}{error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}<DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => { setConfirming(false); setError(''); }}>ফিরে যান</Button><Button type="button" disabled={saving} onClick={() => void confirm()}>{saving && <Loader2 size={15} className="animate-spin" />}{saving ? UI_TERMS.confirming : UI_TERMS.confirm}</Button></DialogFooter></DialogContent></Dialog></>;
}

function AmountInput({ kind, amount, unit, onAmountChange, onUnitChange }: { kind?: ProductKind; amount: string; unit: AmountUnit; onAmountChange: (value: string) => void; onUnitChange: (value: AmountUnit) => void }) { const units = amountUnitsForKind(kind); return <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2"><Input type="number" min="0" step={unit === 'KG' || unit === 'LITER' ? '0.001' : '1'} value={amount} onChange={(event) => onAmountChange(event.target.value)} /><select className="h-11 rounded-md border bg-background px-2" value={unit} onChange={(event) => onUnitChange(event.target.value as AmountUnit)}>{units.map((item) => <option key={item} value={item}>{item === 'PIECE' ? (kind === 'EGG' ? 'টি ডিম' : 'ইউনিট') : item === 'KG' ? 'কেজি' : item === 'G' ? 'গ্রাম' : item === 'LITER' ? 'লিটার' : 'মিলি'}</option>)}</select></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><Label className="text-xs">{label}</Label><div className="mt-1">{children}</div></div>; }
function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) { if (totalPages <= 1) return null; return <div className="flex items-center justify-center gap-3"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={16} />আগের</Button><span className="text-sm">{number.format(page)} / {number.format(totalPages)}</span><Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>পরের<ChevronRight size={16} /></Button></div>; }
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center"><AlertTriangle className="mx-auto text-destructive" /><p className="mt-2 text-sm text-destructive">{message}</p><Button className="mt-4" variant="outline" onClick={onRetry}>আবার চেষ্টা করুন</Button></div>; }
function EmptyState({ filtered, onReset }: { filtered: boolean; onReset: () => void }) { return <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground"><Boxes className="mx-auto mb-2" /><p>{filtered ? 'এই ফিল্টারে কোনো পণ্য পাওয়া যায়নি।' : 'এখনও কোনো স্টক অ্যাড করা হয়নি।'}</p><p className="mt-1 text-xs">{filtered ? 'সব পণ্য দেখতে ফিল্টার রিসেট করুন।' : 'নতুন স্টক অ্যাড করলে এখানে দেখা যাবে।'}</p>{filtered && <div className="mt-4 flex justify-center"><FilterResetButton active onClick={onReset} /></div>}</div>; }
function LoadingRows() { return <div className="space-y-2" role="status" aria-label="ইনভেন্টরি লোড হচ্ছে">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div>; }
