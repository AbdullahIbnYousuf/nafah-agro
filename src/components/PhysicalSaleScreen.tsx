import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Clock3, HandCoins, Plus, RotateCw, Search, ShoppingCart, Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { FormattedDateInput } from '@/components/ui/formatted-date-input';
import { Label } from '@/components/ui/label';
import { FilterField, FilterFields, FilterForm, FilterPanel, FilterResetButton } from '@/components/ui/filter-panel';
import ProfitWarningDialog from '@/components/ProfitWarningDialog';
import PriceIncreaseDialog from '@/components/PriceIncreaseDialog';
import PhysicalSaleReturnDialog from '@/components/PhysicalSaleReturnDialog';
import { PaymentChannelSelect } from '@/components/PaymentChannelSelect';
import { paymentChannelLabel } from '@/lib/paymentChannels';
import { PaymentChannelCorrectionDialog } from '@/components/PaymentChannelCorrectionDialog';
import { ApiError, correctCreditCustomerPaymentChannel, correctLegacyCreditPaymentChannel, correctPhysicalReturnChannel, correctPhysicalSalePaymentChannel, createPhysicalSale, getPhysicalSales, getVariantOptions, returnPhysicalSale, suggestCreditCustomers } from '@/lib/api';
import type { AmountUnit, CreditCustomerSuggestion, PaymentChannel, PhysicalSale, VariantOption } from '@/lib/types';
import { getErrorMessage } from '@/lib/utils';
import { productPackLabel } from '@/lib/productOptions';
import { amountUnitsForKind, defaultAmountUnit, formatQuantity, productKindLabel, rateLabel, sellingPriceForQuantity, toBaseQuantity } from '@/lib/quantity';
import { formatAppDate, formatAppDateTime } from '@/lib/date';

interface SaleLine {
  option: VariantOption;
  amount: string;
  amountUnit: AmountUnit;
}

interface PhysicalSaleHistoryFilters {
  product: string;
  query: string;
  dateFrom: string;
  dateTo: string;
}

const PHYSICAL_SALE_HISTORY_FILTERS_KEY = 'nafah_physical_sale_history_filters_v1';

function readPhysicalSaleHistoryFilters(): PhysicalSaleHistoryFilters {
  const fallback = { product: '', query: '', dateFrom: '', dateTo: '' };
  try {
    const value = JSON.parse(window.sessionStorage.getItem(PHYSICAL_SALE_HISTORY_FILTERS_KEY) ?? '{}') as Record<string, unknown>;
    const date = (candidate: unknown) => typeof candidate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : '';
    return {
      product: typeof value.product === 'string' ? value.product : '',
      query: typeof value.query === 'string' ? value.query : '',
      dateFrom: date(value.dateFrom),
      dateTo: date(value.dateTo),
    };
  } catch {
    return fallback;
  }
}

function savePhysicalSaleHistoryFilters(filters: PhysicalSaleHistoryFilters | null) {
  try {
    if (filters) window.sessionStorage.setItem(PHYSICAL_SALE_HISTORY_FILTERS_KEY, JSON.stringify(filters));
    else window.sessionStorage.removeItem(PHYSICAL_SALE_HISTORY_FILTERS_KEY);
  } catch {
    // The filters still work when browser storage is unavailable.
  }
}

function dhakaDate(offsetDays = 0) {
  const value = new Date(Date.now() + 6 * 60 * 60 * 1_000);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

function dhakaDateFromTimestamp(value: string) {
  return new Date(new Date(value).getTime() + 6 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

function normalizeCustomerName(value: string) {
  return value.trim().replace(/\s+/gu, ' ').normalize('NFKC').toLocaleLowerCase('bn-BD');
}

export default function PhysicalSaleScreen() {
  const [initialHistoryFilters] = useState(readPhysicalSaleHistoryFilters);
  const [matches, setMatches] = useState<VariantOption[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productSearchError, setProductSearchError] = useState('');
  const [productSearchRetry, setProductSearchRetry] = useState(0);
  const [recentSales, setRecentSales] = useState<PhysicalSale[]>([]);
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [selectionDraft, setSelectionDraft] = useState<SaleLine | null>(null);
  const [selectionError, setSelectionError] = useState('');
  const [query, setQuery] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [selectedCreditCustomer, setSelectedCreditCustomer] = useState<CreditCustomerSuggestion | null>(null);
  const [creditCustomerSuggestions, setCreditCustomerSuggestions] = useState<CreditCustomerSuggestion[]>([]);
  const [loadingCustomerSuggestions, setLoadingCustomerSuggestions] = useState(false);
  const [customerSuggestionError, setCustomerSuggestionError] = useState('');
  const [highlightedCustomerOption, setHighlightedCustomerOption] = useState(-1);
  const [customerSuggestionsDismissed, setCustomerSuggestionsDismissed] = useState(false);
  const [newCreditCustomerConfirmed, setNewCreditCustomerConfirmed] = useState(false);
  const [finalProductTotal, setFinalProductTotal] = useState('');
  const [priceEdited, setPriceEdited] = useState(false);
  const [lateEntry, setLateEntry] = useState(false);
  const [soldOn, setSoldOn] = useState('');
  const [paymentMode, setPaymentMode] = useState<'PAID_NOW' | 'CREDIT'>('PAID_NOW');
  const [paymentChannel, setPaymentChannel] = useState<PaymentChannel>('CASH');
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState<PhysicalSale | null>(null);
  const [projectedLoss, setProjectedLoss] = useState<unknown>(null);
  const [projectedIncrease, setProjectedIncrease] = useState<number | null>(null);
  const [returnSale, setReturnSale] = useState<PhysicalSale | null>(null);
  const [historyProduct, setHistoryProduct] = useState(initialHistoryFilters.product);
  const [historyQuery, setHistoryQuery] = useState(initialHistoryFilters.query);
  const [historyDateFrom, setHistoryDateFrom] = useState(initialHistoryFilters.dateFrom);
  const [historyDateTo, setHistoryDateTo] = useState(initialHistoryFilters.dateTo);
  const [historyFilters, setHistoryFilters] = useState(initialHistoryFilters);
  const [errors, setErrors] = useState<{ items?: string; customerName?: string; customerSelection?: string; phone?: string; followUp?: string; finalTotal?: string; soldOn?: string; submit?: string }>({});
  const productGridRef = useRef<HTMLDivElement>(null);
  const saleRequestRef = useRef<{ fingerprint: string; key: string } | null>(null);

  const load = useCallback(() => {
    getPhysicalSales({
      limit: 50,
      ...(historyFilters.product ? { product: historyFilters.product } : {}),
      ...(historyFilters.query ? { query: historyFilters.query } : {}),
      ...(historyFilters.dateFrom ? { dateFrom: historyFilters.dateFrom } : {}),
      ...(historyFilters.dateTo ? { dateTo: historyFilters.dateTo } : {}),
    })
      .then(setRecentSales)
      .catch((error) => toast.error(getErrorMessage(error, 'বিক্রয় স্ক্রিন লোড হয়নি')))
  }, [historyFilters]);
  useEffect(load, [load]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setLoadingProducts(true);
      setProductSearchError('');
      void getVariantOptions({ context: 'PHYSICAL_SALE', q: query, limit: 10 }, controller.signal)
        .then(setMatches)
        .catch((error) => {
          if (error instanceof ApiError && error.code === 'REQUEST_CANCELLED') return;
          setMatches([]);
          setProductSearchError(getErrorMessage(error, 'পণ্যের তালিকা লোড হয়নি।'));
        })
        .finally(() => { if (!controller.signal.aborted) setLoadingProducts(false); });
    }, 300);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [productSearchRetry, query]);

  useEffect(() => {
    if (paymentMode !== 'CREDIT' || selectedCreditCustomer || newCreditCustomerConfirmed || !customerName.trim()) {
      setCreditCustomerSuggestions([]);
      setLoadingCustomerSuggestions(false);
      setCustomerSuggestionError('');
      return;
    }
    let active = true;
    const timeout = window.setTimeout(() => {
      setLoadingCustomerSuggestions(true);
      setCustomerSuggestionError('');
      void suggestCreditCustomers(customerName.trim())
        .then((values) => { if (active) setCreditCustomerSuggestions(values); })
        .catch(() => { if (active) { setCreditCustomerSuggestions([]); setCustomerSuggestionError('ক্রেতার তালিকা দেখা যায়নি। রিট্রাই করুন।'); } })
        .finally(() => { if (active) setLoadingCustomerSuggestions(false); });
    }, 200);
    return () => { active = false; window.clearTimeout(timeout); };
  }, [customerName, newCreditCustomerConfirmed, paymentMode, selectedCreditCustomer]);

  const hasExactCreditCustomerMatch = useMemo(() => {
    const typedName = normalizeCustomerName(customerName);
    return Boolean(typedName) && creditCustomerSuggestions.some(
      (customer) => normalizeCustomerName(customer.name) === typedName,
    );
  }, [creditCustomerSuggestions, customerName]);
  const canCreateCreditCustomer = Boolean(customerName.trim())
    && !loadingCustomerSuggestions
    && !customerSuggestionError
    && !hasExactCreditCustomerMatch;
  const creditCustomerOptionCount = creditCustomerSuggestions.length + (canCreateCreditCustomer ? 1 : 0);

  function selectCreditCustomer(customer: CreditCustomerSuggestion) {
    setSelectedCreditCustomer(customer);
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone ?? '');
    setNextFollowUpDate(customer.nextFollowUpDate ?? dhakaDate(7));
    setCreditCustomerSuggestions([]);
    setHighlightedCustomerOption(-1);
    setCustomerSuggestionsDismissed(false);
    setErrors((current) => ({ ...current, customerName: undefined, customerSelection: undefined, phone: undefined, followUp: undefined }));
  }

  function confirmNewCreditCustomer() {
    setNewCreditCustomerConfirmed(true);
    setNextFollowUpDate((current) => current || dhakaDate(7));
    setCreditCustomerSuggestions([]);
    setHighlightedCustomerOption(-1);
    setCustomerSuggestionsDismissed(false);
    setErrors((current) => ({ ...current, customerSelection: undefined }));
  }

  function handleCreditCustomerKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setCustomerSuggestionsDismissed(true);
      setHighlightedCustomerOption(-1);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return;
    if (creditCustomerOptionCount === 0) return;
    if (event.key === 'Enter') {
      if (highlightedCustomerOption < 0) return;
      event.preventDefault();
      const customer = creditCustomerSuggestions[highlightedCustomerOption];
      if (customer) selectCreditCustomer(customer);
      else if (canCreateCreditCustomer) confirmNewCreditCustomer();
      return;
    }
    event.preventDefault();
    setCustomerSuggestionsDismissed(false);
    setHighlightedCustomerOption((current) => {
      if (event.key === 'ArrowDown') return current < creditCustomerOptionCount - 1 ? current + 1 : 0;
      return current > 0 ? current - 1 : creditCustomerOptionCount - 1;
    });
  }

  useEffect(() => {
    if (!selectionDraft) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!productGridRef.current?.contains(event.target as Node)) {
        setSelectionDraft(null);
        setSelectionError('');
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [selectionDraft]);

  const subtotal = lines.reduce((sum, line) => {
    const base = toBaseQuantity(line.amount, line.amountUnit) ?? 0;
    const scale = line.option.productKind === 'LOOSE_WEIGHT' || line.option.productKind === 'LOOSE_VOLUME' ? 1_000 : 1;
    const pricing = sellingPriceForQuantity({
      kind: line.option.productKind,
      regularPrice: line.option.sellingPrice,
      bulkPrice: line.option.bulkSellingPrice,
      quantity: base,
    });
    return sum + pricing.unitPrice * base / scale;
  }, 0);
  const displayedFinalTotal = priceEdited ? finalProductTotal : subtotal.toFixed(2);
  const total = Number(displayedFinalTotal);
  const discountNumber = Math.max(0, subtotal - total);
  const increaseNumber = Math.max(0, total - subtotal);

  function toggleProductSelection(option: VariantOption) {
    if (option.availableStock <= 0) {
      toast.error('এই পণ্যের স্টক নেই। আগে ক্রয় ও ইনভেন্টরি থেকে নতুন স্টক অ্যাড করুন।');
      return;
    }
    setSelectionError('');
    setSelectionDraft((current) => {
      if (current?.option.productVariantId === option.productVariantId) return null;
      const existing = lines.find((line) => line.option.productVariantId === option.productVariantId);
      return existing
        ? { ...existing }
        : { option, amount: '1', amountUnit: defaultAmountUnit(option.productKind) };
    });
  }

  function saveProductSelection() {
    if (!selectionDraft) return;
    const quantity = toBaseQuantity(selectionDraft.amount, selectionDraft.amountUnit);
    if (quantity === null) {
      setSelectionError('সঠিক পরিমাণ দিন।');
      return;
    }
    if (quantity > selectionDraft.option.availableStock) {
      setSelectionError(`স্টকে সর্বোচ্চ ${formatQuantity(selectionDraft.option.availableStock, selectionDraft.option.quantityUnit, selectionDraft.option.productKind, selectionDraft.option.unitLabel)} আছে।`);
      return;
    }
    setLines((current) => {
      const existing = current.some((line) => line.option.productVariantId === selectionDraft.option.productVariantId);
      return existing
        ? current.map((line) => line.option.productVariantId === selectionDraft.option.productVariantId ? selectionDraft : line)
        : [...current, selectionDraft];
    });
    setErrors((current) => ({ ...current, items: undefined }));
    setSelectionDraft(null);
    setSelectionError('');
  }

  async function saveSale(confirmUnprofitable = false, confirmPriceIncrease = false) {
    const nextErrors: typeof errors = {};
    if (lines.length === 0) {
      nextErrors.items = 'কমপক্ষে একটি পণ্য অ্যাড করুন।';
      toast.error('বিক্রি সম্পন্ন করতে আগে কমপক্ষে একটি পণ্য অ্যাড করুন।');
    }
    if (lines.some((line) => {
      const base = toBaseQuantity(line.amount, line.amountUnit);
      return base === null || base > line.option.availableStock;
    })) nextErrors.items = 'প্রতিটি পণ্যের সঠিক পরিমাণ দিন এবং বর্তমান স্টকের মধ্যে রাখুন।';
    if (customerPhone.trim() && (customerPhone.trim().length < 7 || customerPhone.trim().length > 30)) nextErrors.phone = 'ফোন নম্বর 7 থেকে 30 অক্ষরের মধ্যে লিখুন।';
    if (paymentMode === 'CREDIT' && !customerName.trim()) nextErrors.customerName = 'বাকি বিক্রির জন্য ক্রেতার নাম দিন।';
    if (paymentMode === 'CREDIT' && !selectedCreditCustomer && !newCreditCustomerConfirmed) nextErrors.customerSelection = 'তালিকা থেকে ক্রেতা সিলেক্ট করুন অথবা নতুন ক্রেতা হিসেবে অ্যাড করুন।';
    if (paymentMode === 'CREDIT' && (!nextFollowUpDate || nextFollowUpDate < dhakaDate())) nextErrors.followUp = 'আজ বা পরের কোনো যোগাযোগের তারিখ দিন।';
    if (!/^\d+(?:\.\d{1,2})?$/.test(displayedFinalTotal) || !Number.isFinite(total)) nextErrors.finalTotal = 'মোট পণ্যের সঠিক দাম দিন (সর্বোচ্চ ২ ঘর দশমিক)।';
    if (lateEntry && (!soldOn || soldOn >= dhakaDate() || soldOn < dhakaDate(-90))) nextErrors.soldOn = 'আগের ৯০ দিনের মধ্যে বিক্রির তারিখ সিলেক্ট করুন।';
    if (lateEntry && !displayedFinalTotal) nextErrors.finalTotal = 'আগের বিক্রির আসল মোট দাম লিখুন।';
    if (Object.keys(nextErrors).length > 0) { setErrors(nextErrors); return; }
    setErrors({});
    setSaving(true);
    try {
      const payload = {
        items: lines.map((line) => ({ productVariantId: line.option.productVariantId, amount: line.amount, amountUnit: line.amountUnit })),
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        creditCustomerId: paymentMode === 'CREDIT' ? selectedCreditCustomer?.id : undefined,
        createCreditCustomer: paymentMode === 'CREDIT' ? newCreditCustomerConfirmed : undefined,
        discountTotal: 0,
        finalProductTotal: priceEdited ? total : undefined,
        soldOn: lateEntry ? soldOn : undefined,
        paymentMode,
        paymentChannel: paymentMode === 'PAID_NOW' ? paymentChannel : undefined,
        nextFollowUpDate: paymentMode === 'CREDIT' ? nextFollowUpDate : undefined,
      };
      const fingerprint = JSON.stringify(payload);
      if (saleRequestRef.current?.fingerprint !== fingerprint) saleRequestRef.current = { fingerprint, key: crypto.randomUUID() };
      const result = await createPhysicalSale({
        ...payload,
        idempotencyKey: saleRequestRef.current.key,
        confirmUnprofitable,
        confirmPriceIncrease,
      });
      setCompleted(result);
      setLines([]); setCustomerName(''); setCustomerPhone(''); setSelectedCreditCustomer(null); setNewCreditCustomerConfirmed(false); setCreditCustomerSuggestions([]); setFinalProductTotal(''); setPriceEdited(false); setLateEntry(false); setSoldOn(''); setPaymentMode('PAID_NOW'); setPaymentChannel('CASH'); setNextFollowUpDate(''); saleRequestRef.current = null;
      setProjectedLoss(null);
      setProjectedIncrease(null);
      toast.success(`বিক্রয় ${result.orderNumber} সম্পন্ন হয়েছে`);
      load();
    } catch (error) {
      if (!confirmPriceIncrease && error instanceof ApiError && error.code === 'PRICE_INCREASE_CONFIRMATION_REQUIRED') {
        setProjectedIncrease(Number(error.details?.priceIncreaseTotal ?? increaseNumber));
      } else if (!confirmUnprofitable && error instanceof ApiError && error.code === 'UNPROFITABLE_SALE_CONFIRMATION_REQUIRED') {
        setProjectedLoss(error.details?.projectedGrossProfit ?? 'ক্ষতি হবে');
      } else if (error instanceof ApiError && error.code === 'DUPLICATE_CREDIT_CUSTOMER_NAME') {
        setErrors({ customerSelection: 'এই নামে একজন ক্রেতা আগে থেকেই আছেন। নাম লিখে তালিকা থেকে তাকে সিলেক্ট করুন।' });
      } else if (confirmUnprofitable || confirmPriceIncrease) {
        throw error;
      } else {
        setErrors({ submit: getErrorMessage(error, 'বিক্রয় সম্পন্ন হয়নি') });
      }
    } finally {
      setSaving(false);
    }
  }

  async function submitReturn(input: Parameters<typeof returnPhysicalSale>[1]) {
    if (!returnSale) return;
    const updated = await returnPhysicalSale(returnSale.id, input);
    setRecentSales((current) => current.map((sale) => sale.id === updated.id ? updated : sale));
    setCompleted((current) => current?.id === updated.id ? updated : current);
    setReturnSale(updated);
    toast.success('প্রোডাক্ট রিটার্ন সম্পন্ন হয়েছে');
  }

  function applyHistoryFilters(event: React.FormEvent) {
    event.preventDefault();
    const next = { product: historyProduct.trim(), query: historyQuery.trim(), dateFrom: historyDateFrom, dateTo: historyDateTo };
    setHistoryFilters(next);
    savePhysicalSaleHistoryFilters(next);
  }

  function clearHistoryFilters() {
    setHistoryProduct('');
    setHistoryQuery('');
    setHistoryDateFrom('');
    setHistoryDateTo('');
    setHistoryFilters({ product: '', query: '', dateFrom: '', dateTo: '' });
    savePhysicalSaleHistoryFilters(null);
  }

  return <div className="space-y-8">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">দোকানের বিক্রি</h1><p className="text-sm text-muted-foreground">এখন পেমেন্ট অথবা বাকি রেখে বিক্রি সম্পন্ন করুন।</p></div><Button asChild className="min-h-12 w-full px-5 text-base font-semibold shadow-md transition-shadow hover:shadow-lg sm:w-auto"><Link to="/admin/dues"><HandCoins size={18} />বাকি হিসাব</Link></Button></div>
    <div className="grid xl:grid-cols-[1.1fr_1fr] gap-6">
      <section className="bg-card border rounded-lg p-5 space-y-4">
        <div className="relative"><Search className="absolute left-3 top-3 text-muted-foreground" size={17} /><Input aria-label="বিক্রির পণ্য সার্চ করুন" className="pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="পণ্য বা প্যাক/সাইজ সার্চ করুন" /></div>
        <div
          ref={productGridRef}
          className="grid sm:grid-cols-2 gap-2 max-h-[430px] overflow-y-auto"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setSelectionDraft(null);
              setSelectionError('');
            }
          }}
        >
          {matches.map((option) => {
            const title = option.productKind === 'PACKAGED' ? productPackLabel(option.productName, option.variantName) : option.productName;
            const isOpen = selectionDraft?.option.productVariantId === option.productVariantId;
            const isInSale = lines.some((line) => line.option.productVariantId === option.productVariantId);
            return <div key={option.productVariantId} className={`self-start overflow-hidden rounded-lg border transition-colors ${isOpen ? 'border-secondary ring-1 ring-secondary/30' : 'hover:border-secondary'} ${option.availableStock <= 0 ? 'opacity-60' : ''}`}>
              <button
                type="button"
                onClick={() => toggleProductSelection(option)}
                aria-disabled={option.availableStock <= 0}
                aria-expanded={isOpen}
                aria-controls={`physical-sale-selection-${option.productVariantId}`}
                aria-label={`${title} পরিমাণ সিলেক্ট করুন`}
                className="w-full p-3 text-left"
              >
                <div className="flex items-start justify-between gap-2"><div className="font-medium">{title}</div><ChevronDown size={17} className={`mt-0.5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} /></div>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{productKindLabel(option.productKind)}</span>{isInSale && <span className="rounded-full bg-secondary/15 px-2 py-0.5 font-medium text-secondary">তালিকায় আছে</span>}</div>
                <div className="flex justify-between gap-2 mt-2"><span>{option.productKind === 'EGG' && option.bulkSellingPrice != null ? `৳${option.sellingPrice} / 15টি+ ৳${option.bulkSellingPrice}` : `৳${option.sellingPrice} ${rateLabel(option.productKind, option.unitLabel)}`}</span><span>{option.availableStock <= 0 ? 'স্টক নেই' : `স্টক ${formatQuantity(option.availableStock, option.quantityUnit, option.productKind, option.unitLabel)}`}</span></div>
              </button>
              {isOpen && selectionDraft && <div id={`physical-sale-selection-${option.productVariantId}`} className="space-y-3 border-t bg-muted/15 p-3">
                <div><Label className="text-xs">পরিমাণ</Label><div className="mt-1"><SaleAmountInput line={selectionDraft} onChange={(patch) => { setSelectionError(''); setSelectionDraft((current) => current ? { ...current, ...patch } : current); }} /></div></div>
                {selectionError && <p role="alert" className="text-sm text-destructive">{selectionError}</p>}
                <Button type="button" className="w-full" onClick={saveProductSelection}><Plus size={16} />{isInSale ? 'পরিমাণ আপডেট করুন' : 'বিক্রির তালিকায় অ্যাড করুন'}</Button>
              </div>}
            </div>;
          })}
          {matches.length === 0 && <div role="status" className="col-span-full rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            {loadingProducts ? 'পণ্য লোড হচ্ছে…' : productSearchError ? <div className="space-y-3"><p role="alert" className="text-destructive">{productSearchError}</p><Button type="button" size="sm" variant="outline" onClick={() => setProductSearchRetry((value) => value + 1)}><RotateCw size={14} />রিট্রাই করুন</Button></div> : query.trim() ? 'এমন কোনো পণ্য পাওয়া যায়নি।' : 'বিক্রির জন্য কোনো পণ্য নেই।'}
          </div>}
        </div>
      </section>

      <section className="bg-card border rounded-lg p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><ShoppingCart size={18} />বিক্রয় তালিকা</h2>
        <div className="rounded-lg border bg-muted/20 p-3 text-sm">
          <label className="flex cursor-pointer items-center gap-2 font-medium"><input type="checkbox" checked={lateEntry} onChange={(event) => { setLateEntry(event.target.checked); setSoldOn(''); setFinalProductTotal(''); setPriceEdited(event.target.checked); setErrors((current) => ({ ...current, soldOn: undefined, finalTotal: undefined })); }} />আগের বিক্রি রেকর্ড করুন</label>
          {lateEntry && <div className="mt-3 space-y-2"><Field label="আসলে যেদিন বিক্রি হয়েছে" error={errors.soldOn}><FormattedDateInput aria-label="আসলে যেদিন বিক্রি হয়েছে" min={dhakaDate(-90)} max={dhakaDate()} value={soldOn} onChange={(event) => { setSoldOn(event.target.value); setErrors((current) => ({ ...current, soldOn: undefined })); }} aria-invalid={Boolean(errors.soldOn)} /></Field><p className="text-xs text-muted-foreground">স্টক ও ড্যাশবোর্ডের হিসাব আজ রেকর্ড করার সময় আপডেট হবে। আগের দিনের স্টক বা হিসাব বদলাবে না।</p></div>}
        </div>
        <div className="space-y-2">{lines.map((line) => { const base = toBaseQuantity(line.amount, line.amountUnit) ?? 0; const pricing = sellingPriceForQuantity({ kind: line.option.productKind, regularPrice: line.option.sellingPrice, bulkPrice: line.option.bulkSellingPrice, quantity: base }); const title = line.option.productKind === 'PACKAGED' ? productPackLabel(line.option.productName, line.option.variantName) : line.option.productName; return <div key={line.option.productVariantId} className="grid items-center gap-3 rounded border p-3 sm:grid-cols-[minmax(0,1fr)_190px_auto]"><div className="min-w-0"><strong className="break-words">{title}</strong><div className="text-xs text-muted-foreground">৳{pricing.unitPrice} {rateLabel(line.option.productKind, line.option.unitLabel)}{line.option.productKind === 'EGG' ? ` · ${pricing.tier === 'EGG_BULK' ? '15টি+ দাম' : 'সাধারণ দাম'}` : ''} · স্টক {formatQuantity(line.option.availableStock, line.option.quantityUnit, line.option.productKind, line.option.unitLabel)}</div></div><SaleAmountInput line={line} onChange={(patch) => { setErrors(current => ({ ...current, items: undefined })); setLines((current) => current.map((item) => item.option.productVariantId === line.option.productVariantId ? { ...item, ...patch } : item)); }} /><Button className="w-full sm:w-auto" type="button" variant="ghost" aria-label="বাদ দিন" onClick={() => setLines((current) => current.filter((item) => item.option.productVariantId !== line.option.productVariantId))}><Trash2 size={16} /> <span className="sm:sr-only">বাদ দিন</span></Button></div>; })}{lines.length === 0 && <p className="text-center text-muted-foreground py-8">বাম পাশ থেকে পণ্য অ্যাড করুন</p>}{errors.items && <p role="alert" className="text-sm text-destructive">{errors.items}</p>}</div>
        <div><Label className="text-xs">পেমেন্ট</Label><div className="mt-1 grid grid-cols-2 gap-2 rounded-lg bg-muted/50 p-1"><Button type="button" variant={paymentMode === 'PAID_NOW' ? 'default' : 'ghost'} onClick={() => { setPaymentMode('PAID_NOW'); setNextFollowUpDate(''); setSelectedCreditCustomer(null); setNewCreditCustomerConfirmed(false); setCreditCustomerSuggestions([]); setErrors((current) => ({ ...current, customerName: undefined, customerSelection: undefined, phone: undefined, followUp: undefined })); }}>এখন পেমেন্ট</Button><Button type="button" variant={paymentMode === 'CREDIT' ? 'default' : 'ghost'} onClick={() => { setPaymentMode('CREDIT'); setNextFollowUpDate((current) => current || dhakaDate(7)); }}>বাকি</Button></div></div>
        {paymentMode === 'PAID_NOW' && <PaymentChannelSelect value={paymentChannel} onChange={setPaymentChannel} />}
        <div className="grid items-start gap-3 sm:grid-cols-2">
          <Field label={`ক্রেতার নাম${paymentMode === 'CREDIT' ? '' : ' (ঐচ্ছিক)'}`} error={errors.customerName ?? errors.customerSelection}>
            <div className="relative">
              <Input
                aria-label="ক্রেতার নাম"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={paymentMode === 'CREDIT' && !selectedCreditCustomer && !newCreditCustomerConfirmed && !customerSuggestionsDismissed && Boolean(customerName.trim())}
                aria-controls="credit-customer-suggestions"
                aria-activedescendant={highlightedCustomerOption >= 0 ? `credit-customer-option-${highlightedCustomerOption}` : undefined}
                autoComplete="off"
                value={customerName}
                onFocus={() => setCustomerSuggestionsDismissed(false)}
                onKeyDown={handleCreditCustomerKeyDown}
                onChange={(event) => {
                setCustomerName(event.target.value);
                setSelectedCreditCustomer(null);
                setNewCreditCustomerConfirmed(false);
                setHighlightedCustomerOption(-1);
                setCustomerSuggestionsDismissed(false);
                setCustomerSuggestionError('');
                setErrors((current) => ({ ...current, customerName: undefined, customerSelection: undefined }));
              }} aria-invalid={Boolean(errors.customerName ?? errors.customerSelection)} />
              {paymentMode === 'CREDIT' && !selectedCreditCustomer && !newCreditCustomerConfirmed && !customerSuggestionsDismissed && customerName.trim() && <div id="credit-customer-suggestions" role="listbox" aria-label="ক্রেতার নামের পরামর্শ" className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg">
                {loadingCustomerSuggestions && <div className="px-3 py-2 text-sm text-muted-foreground">খোঁজা হচ্ছে...</div>}
                {!loadingCustomerSuggestions && customerSuggestionError && <div className="px-3 py-2 text-sm text-destructive">{customerSuggestionError}</div>}
                {!loadingCustomerSuggestions && creditCustomerSuggestions.map((customer, index) => <button id={`credit-customer-option-${index}`} role="option" aria-selected={highlightedCustomerOption === index} key={customer.id} type="button" className={`block w-full px-3 py-2 text-left text-sm hover:bg-muted ${highlightedCustomerOption === index ? 'bg-muted' : ''}`} onMouseEnter={() => setHighlightedCustomerOption(index)} onClick={() => selectCreditCustomer(customer)}>{customer.name}</button>)}
                {canCreateCreditCustomer && <button id={`credit-customer-option-${creditCustomerSuggestions.length}`} role="option" aria-selected={highlightedCustomerOption === creditCustomerSuggestions.length} type="button" className={`block w-full border-t px-3 py-2 text-left text-sm font-medium text-secondary hover:bg-muted ${highlightedCustomerOption === creditCustomerSuggestions.length ? 'bg-muted' : ''}`} onMouseEnter={() => setHighlightedCustomerOption(creditCustomerSuggestions.length)} onClick={confirmNewCreditCustomer}>“{customerName.trim()}” নামে নতুন ক্রেতা অ্যাড করুন</button>}
              </div>}
              {selectedCreditCustomer && <button type="button" className="mt-1 text-xs font-medium text-secondary hover:underline" onClick={() => { setSelectedCreditCustomer(null); setCustomerName(''); setCustomerPhone(''); }}>অন্য ক্রেতা সিলেক্ট করুন</button>}
              {newCreditCustomerConfirmed && <div className="mt-1 text-xs font-medium text-secondary">নতুন ক্রেতা অ্যাড হবে</div>}
            </div>
          </Field>
          <Field label="ফোন (ঐচ্ছিক)" error={errors.phone}><Input aria-label="ক্রেতার ফোন" value={customerPhone} onChange={(event) => { setCustomerPhone(event.target.value); setErrors(current => ({ ...current, phone: undefined })); }} aria-invalid={Boolean(errors.phone)} /></Field>
        </div>
        {paymentMode === 'CREDIT' && selectedCreditCustomer && <div className="grid gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm sm:grid-cols-3">
          <Metric label="আগের বাকি" value={money(selectedCreditCustomer.outstandingAmount)} />
          <Metric label="এই বিক্রির পর" value={money(selectedCreditCustomer.outstandingAmount + Math.max(total, 0))} />
          <Metric label="যোগাযোগের তারিখ" value={formatAppDate(nextFollowUpDate) || 'তারিখ দিন'} />
        </div>}
        {paymentMode === 'CREDIT' && <Field label="পরের যোগাযোগের তারিখ" error={errors.followUp}><FormattedDateInput aria-label="পরের যোগাযোগের তারিখ" min={dhakaDate()} value={nextFollowUpDate} onChange={(event) => { setNextFollowUpDate(event.target.value); setErrors((current) => ({ ...current, followUp: undefined })); }} aria-invalid={Boolean(errors.followUp)} /></Field>}
        <Field label="মোট পণ্যের দাম (৳)" error={errors.finalTotal}><Input aria-label="মোট পণ্যের দাম" type="number" min="0" step="0.01" value={displayedFinalTotal} onChange={(event) => { setFinalProductTotal(event.target.value); setPriceEdited(true); setErrors(current => ({ ...current, finalTotal: undefined })); }} aria-invalid={Boolean(errors.finalTotal)} /></Field>
        <div className="border-t pt-3 space-y-1 text-sm"><div className="flex justify-between"><span>বর্তমান পণ্যের দাম</span><strong>৳{subtotal.toFixed(2)}</strong></div>{Number.isFinite(total) && discountNumber > 0 && <div className="flex justify-between"><span>ছাড়</span><span>-৳{discountNumber.toFixed(2)}</span></div>}{Number.isFinite(total) && increaseNumber > 0 && <div className="flex justify-between"><span>বাড়তি দাম</span><span>+৳{increaseNumber.toFixed(2)}</span></div>}<div className="flex justify-between text-lg"><span>মোট</span><strong>{Number.isFinite(total) ? `৳${total.toFixed(2)}` : 'দাম দিন'}</strong></div></div>
        {errors.submit && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{errors.submit}</p>}
        <Button className="min-h-11 w-full aria-disabled:border aria-disabled:border-amber-600 aria-disabled:bg-amber-50 aria-disabled:text-amber-950 aria-disabled:hover:bg-amber-100" disabled={saving} aria-disabled={lines.length === 0} onClick={() => void saveSale()}><Plus size={16} className="mr-2" />{saving ? 'সম্পন্ন হচ্ছে…' : paymentMode === 'CREDIT' ? 'বাকি বিক্রি সম্পন্ন করুন' : 'বিক্রি সম্পন্ন করুন'}</Button>
      </section>
    </div>

    {completed && <section className={`border rounded-lg p-5 ${completed.grossProfit < 0 ? 'border-destructive bg-destructive/5' : 'border-green-500 bg-green-50'}`}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">সর্বশেষ বিক্রয়: {completed.orderNumber}</h2>{completed.paymentMethod === 'CREDIT' && <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">বাকি {money(completed.outstandingAmount)}</span>}</div>{completed.soldOn !== dhakaDate() && <p className="mt-2 text-sm">বিক্রি হয়েছে: {formatAppDate(completed.soldOn)} · রেকর্ড হয়েছে: {formatAppDateTime(completed.completedAt)}</p>}<div className="grid sm:grid-cols-4 gap-3 mt-3 text-sm"><Metric label="বিক্রয়" value={`৳${completed.grandTotal.toFixed(2)}`} /><Metric label="ক্রয়মূল্য" value={`৳${completed.totalBuyingCost.toFixed(2)}`} /><Metric label="মোট লাভ" value={`৳${completed.grossProfit.toFixed(2)}`} /><Metric label={completed.paymentMethod === 'CREDIT' ? 'পরের যোগাযোগ' : 'মার্জিন'} value={completed.paymentMethod === 'CREDIT' ? formatAppDate(completed.nextFollowUpDate) || 'বাকি শেষ' : completed.grossProfitMargin === null ? 'লাভের হিসাব নেই' : `${completed.grossProfitMargin.toFixed(2)}%`} /></div></section>}

    <section>
      <h2 className="mb-3 text-lg font-semibold">দোকানের সাম্প্রতিক বিক্রি</h2>
      <FilterPanel className="mb-4" title="বিক্রির ফিল্টার" actions={<><Button type="submit" form="physical-sale-history-filters"><Search size={16} />সার্চ করুন</Button><FilterResetButton active={Boolean(historyProduct || historyQuery || historyDateFrom || historyDateTo || historyFilters.product || historyFilters.query || historyFilters.dateFrom || historyFilters.dateTo)} onClick={clearHistoryFilters} /></>}>
        <FilterForm id="physical-sale-history-filters" onSubmit={applyHistoryFilters}>
          <FilterFields className="xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_170px_170px]">
            <FilterField label="পণ্য"><Input aria-label="বিক্রির পণ্য" value={historyProduct} onChange={(event) => setHistoryProduct(event.target.value)} placeholder="পণ্যের নাম লিখুন" /></FilterField>
            <FilterField label="অন্য তথ্য"><Input
              aria-label="ক্রেতা বা বিক্রির তথ্য"
              value={historyQuery}
              onChange={(event) => setHistoryQuery(event.target.value)}
              placeholder="নাম, ফোন, বিক্রয় নম্বর বা মোট দাম"
            /></FilterField>
            <FilterField label="রেকর্ডের তারিখ থেকে"><FormattedDateInput aria-label="রেকর্ডের তারিখ থেকে" value={historyDateFrom} onChange={(event) => setHistoryDateFrom(event.target.value)} /></FilterField>
            <FilterField label="রেকর্ডের তারিখ পর্যন্ত"><FormattedDateInput aria-label="রেকর্ডের তারিখ পর্যন্ত" value={historyDateTo} onChange={(event) => setHistoryDateTo(event.target.value)} /></FilterField>
          </FilterFields>
        </FilterForm>
      </FilterPanel>
      {recentSales.length === 0
        ? <div className="rounded-lg border bg-card px-4 py-10 text-center text-sm text-muted-foreground">এই খোঁজে কোনো বিক্রি পাওয়া যায়নি</div>
        : <div className="space-y-3">{recentSales.map((sale) => <PhysicalSaleHistoryCard key={sale.id} sale={sale} onReturn={() => setReturnSale(sale)} onRefresh={load} onChanged={(updated) => { setRecentSales((current) => current.map((item) => item.id === updated.id ? updated : item)); setCompleted((current) => current?.id === updated.id ? updated : current); }} />)}</div>}
    </section>
    <PriceIncreaseDialog open={projectedIncrease !== null} increase={projectedIncrease ?? 0} onClose={() => setProjectedIncrease(null)} onConfirm={() => saveSale(false, true)} />
    <ProfitWarningDialog open={projectedLoss !== null} projectedGrossProfit={projectedLoss} onClose={() => setProjectedLoss(null)} onConfirm={() => saveSale(true, increaseNumber > 0)} />
    <PhysicalSaleReturnDialog sale={returnSale} onClose={() => setReturnSale(null)} onConfirm={submitReturn} />
  </div>;
}

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return <div><Label className="text-xs">{label}</Label><div className="mt-1">{children}</div>{error && <p role="alert" className="mt-1 text-sm text-destructive">{error}</p>}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><div className="text-muted-foreground">{label}</div><div className="font-bold text-lg">{value}</div></div>;
}

function money(value: number) {
  return `৳${value.toFixed(2)}`;
}

function saleRateLabel(unit: PhysicalSale['items'][number]['quantityUnit'], unitLabel?: string) {
  if (unit === 'GRAM') return 'প্রতি কেজি';
  if (unit === 'MILLILITER') return 'প্রতি লিটার';
  if (unitLabel === 'টি ডিম') return 'প্রতি ডিম';
  return `প্রতি ${unitLabel || 'ইউনিট'}`;
}

function PhysicalSaleHistoryCard({ sale, onReturn, onChanged, onRefresh }: { sale: PhysicalSale; onReturn: () => void; onChanged: (sale: PhysicalSale) => void; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [correction, setCorrection] = useState<{ type: 'SALE' | 'RETURN' | 'PAYMENT'; id?: string; current: PaymentChannel | null | undefined } | null>(null);
  const customer = [sale.customerName, sale.customerPhone].filter(Boolean).join(' · ');
  const firstItem = sale.items[0];
  const remainingItems = sale.items.length - 1;
  const remainingMargin = sale.remainingRevenue === 0 ? null : sale.remainingGrossProfit / sale.remainingRevenue * 100;
  return <Collapsible open={open} onOpenChange={setOpen} className="overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md">
    <CollapsibleTrigger asChild>
      <button
        type="button"
        className="group grid w-full gap-3 p-4 text-left transition-colors hover:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
        aria-label={`${sale.orderNumber} ${open ? 'বিস্তারিত বন্ধ করুন' : 'বিস্তারিত দেখুন'}`}
      >
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <strong className="truncate text-base">{firstItem ? productPackLabel(firstItem.productName, firstItem.variantName) : sale.orderNumber}</strong>
            {remainingItems > 0 && <span className="shrink-0 rounded-full bg-secondary/15 px-2 py-0.5 text-xs font-medium text-secondary">আরও {remainingItems}টি</span>}
            {sale.paymentMethod === 'CREDIT' && <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${sale.outstandingAmount > 0 ? 'bg-amber-100 text-amber-900' : 'bg-green-100 text-green-800'}`}>{sale.outstandingAmount > 0 ? `বাকি ${money(sale.outstandingAmount)}` : 'বাকি শেষ'}</span>}
          </div>
          {firstItem && <div className="mt-0.5 text-sm text-muted-foreground">{formatQuantity(firstItem.quantity, firstItem.quantityUnit, undefined, firstItem.unitLabel)}{remainingItems > 0 ? ' এবং অন্যান্য পণ্য' : ''}</div>}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Clock3 size={13} />{sale.soldOn !== dhakaDateFromTimestamp(sale.completedAt) ? `বিক্রি ${formatAppDate(sale.soldOn)} · রেকর্ড ${formatAppDateTime(sale.completedAt)}` : formatAppDateTime(sale.completedAt)}</span>
            <span className="inline-flex min-w-0 items-center gap-1"><UserRound size={13} /><span className="truncate">{customer || 'ক্রেতার তথ্য নেই'}</span></span>
            <span className="truncate">{sale.orderNumber}</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 sm:block sm:min-w-28 sm:text-right">
          <span className="text-xs text-muted-foreground">{sale.refundedAmount > 0 ? 'বর্তমান বিক্রি' : 'মোট দাম'}</span>
          <strong className="block text-lg text-primary">{money(sale.remainingRevenue)}</strong>
          {sale.refundedAmount > 0 && <span className="block text-xs text-destructive">রিফান্ড {money(sale.refundedAmount)}</span>}
        </div>
        <div className="flex items-center justify-end gap-1 text-xs font-medium text-secondary">
          <span>{open ? 'বন্ধ করুন' : 'বিস্তারিত'}</span>
          <ChevronDown size={18} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
    </CollapsibleTrigger>

    <CollapsibleContent>
      <div className="border-t bg-muted/15 p-4 sm:p-5">
        <div className="divide-y overflow-hidden rounded-lg border bg-background">
          {sale.items.map((item) => <div key={item.id} className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-4">
            <div className="min-w-0">
              <div className="break-words font-medium">{productPackLabel(item.productName, item.variantName)}</div>
              <div className="mt-0.5 text-sm text-muted-foreground">
                {formatQuantity(item.quantity, item.quantityUnit, undefined, item.unitLabel)} × {money(item.unitSellingPrice)} {saleRateLabel(item.quantityUnit, item.unitLabel)}
              </div>
              {item.returnedQuantity > 0 && <div className="mt-1 text-xs text-destructive">রিটার্ন হয়েছে {formatQuantity(item.returnedQuantity, item.quantityUnit, undefined, item.unitLabel)} · বাকি {formatQuantity(item.returnableQuantity, item.quantityUnit, undefined, item.unitLabel)}</div>}
            </div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-sm sm:min-w-64 sm:text-right">
              <span className="text-muted-foreground">পণ্যের দাম</span><strong>{money(item.grossLineRevenue)}</strong>
              {item.allocatedDiscount > 0 && <><span className="text-muted-foreground">ডিসকাউন্ট</span><span>-{money(item.allocatedDiscount)}</span></>}
              {item.allocatedPriceIncrease > 0 && <><span className="text-muted-foreground">বাড়তি দাম</span><span>+{money(item.allocatedPriceIncrease)}</span></>}
              <span className="text-muted-foreground">ক্রয়মূল্য</span><span>{money(item.totalBuyingCost)}</span>
              <span className="text-muted-foreground">লাভ</span><span className={item.grossProfit < 0 ? 'text-destructive' : ''}>{money(item.grossProfit)}</span>
            </div>
          </div>)}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SaleSummaryMetric label="মূল মোট দাম" value={money(sale.grandTotal)} />
          <SaleSummaryMetric label="রিফান্ড" value={`-${money(sale.refundedAmount)}`} negative={sale.refundedAmount > 0} />
          <SaleSummaryMetric label="বর্তমান ক্রয়মূল্য" value={money(sale.remainingBuyingCost)} />
          <SaleSummaryMetric label="বর্তমান লাভ" value={money(sale.remainingGrossProfit)} negative={sale.remainingGrossProfit < 0} />
        </div>
        {sale.paymentMethod === 'CASH' && <div className="mt-3 flex items-center gap-2 text-sm"><span>পেমেন্ট: {paymentChannelLabel(sale.paymentChannel)}</span><Button type="button" size="sm" variant="ghost" onClick={() => setCorrection({ type: 'SALE', current: sale.paymentChannel })}>মাধ্যম আপডেট করুন</Button></div>}
        {sale.paymentMethod === 'CREDIT' && <div className="mt-4 rounded-lg border bg-card p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><strong>বাকি হিসাব</strong><span>{sale.nextFollowUpDate ? `পরের যোগাযোগ: ${sale.nextFollowUpDate}` : 'বাকি শেষ'}</span></div><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3"><Metric label="জমা হয়েছে" value={money(sale.collectedAmount)} /><Metric label="এখনো বাকি" value={money(sale.outstandingAmount)} /><Metric label="পেমেন্ট" value={`${sale.creditPayments.filter((payment) => !payment.voidedAt).length}টি`} /></div></div>}
        {sale.creditPayments.length > 0 && <div className="mt-3 rounded-lg border bg-card p-3 text-sm">
          <strong>পেমেন্টের রেকর্ড</strong>
          {sale.creditPayments.map((payment) => <div key={payment.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
            <span>{formatAppDate(payment.paidOn)} · {money(payment.amount)} · {paymentChannelLabel(payment.paymentChannel)}{payment.voidedAt ? ' · বাতিল' : ''}</span>
            {!payment.voidedAt && <Button type="button" size="sm" variant="ghost" onClick={() => setCorrection({ type: 'PAYMENT', id: payment.id, current: payment.paymentChannel })}>মাধ্যম আপডেট করুন</Button>}
          </div>)}
        </div>}
        {sale.returns.length > 0 && <div className="mt-4 space-y-2">
          <h3 className="text-sm font-semibold">আগের রিটার্ন রেকর্ড</h3>
          {sale.returns.map((value) => <div key={value.id} className="rounded-lg border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong>{value.condition}</strong><span>{formatAppDateTime(value.createdAt)}</span></div>
            <div className="mt-1 text-muted-foreground">{value.items.map((item) => `${productPackLabel(item.productName, item.variantName)} ${formatQuantity(item.quantity, item.quantityUnit, undefined, item.unitLabel)}`).join(', ')}</div>
            <div className="mt-1">রিফান্ড {money(value.refundAmount)}{sale.paymentMethod === 'CREDIT' ? ` · বাকি কমেছে ${money(value.creditOffsetAmount)} · টাকা ফেরত ${money(value.cashRefundAmount)}` : ''} · কারণ: {value.reason}</div>
            {value.cashRefundAmount > 0 && <div className="mt-1 flex items-center gap-2">ফেরতের মাধ্যম: {paymentChannelLabel(value.refundChannel)}<Button type="button" size="sm" variant="ghost" onClick={() => setCorrection({ type: 'RETURN', id: value.id, current: value.refundChannel })}>মাধ্যম আপডেট করুন</Button></div>}
          </div>)}
        </div>}
        <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
          <span>বিক্রি করেছেন: {sale.createdBy.fullName}</span>
          <span>বর্তমান লাভের মার্জিন: {remainingMargin === null ? 'লাভের হিসাব নেই' : `${remainingMargin.toFixed(2)}%`}</span>
        </div>
        <div className="mt-4 flex justify-end"><Button type="button" variant="outline" onClick={onReturn} disabled={!sale.items.some((item) => item.returnableQuantity > 0)}>{sale.items.some((item) => item.returnableQuantity > 0) ? 'প্রোডাক্ট রিটার্ন' : 'সব পণ্য রিটার্ন হয়েছে'}</Button></div>
      </div>
        <PaymentChannelCorrectionDialog
          open={correction !== null}
          current={correction?.current}
          title={correction?.type === 'RETURN' ? 'রিফান্ডের মাধ্যম আপডেট করুন' : 'পেমেন্টের মাধ্যম আপডেট করুন'}
          onClose={() => setCorrection(null)}
          onSave={async (channel) => {
            if (!correction) return;
            if (correction.type === 'PAYMENT' && sale.creditCustomerId) {
              await correctCreditCustomerPaymentChannel(sale.creditCustomerId, correction.id!, channel);
              onRefresh();
            } else {
              const updated = correction.type === 'RETURN'
                ? await correctPhysicalReturnChannel(sale.id, correction.id!, channel)
                : correction.type === 'PAYMENT'
                  ? await correctLegacyCreditPaymentChannel(sale.id, correction.id!, channel)
                  : await correctPhysicalSalePaymentChannel(sale.id, channel);
              onChanged(updated);
            }
            toast.success('পেমেন্টের মাধ্যম আপডেট হয়েছে');
          }}
        />
    </CollapsibleContent>
  </Collapsible>;
}

function SaleSummaryMetric({ label, value, negative = false }: { label: string; value: string; negative?: boolean }) {
  return <div className="rounded-lg border bg-card px-3 py-2">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className={`mt-0.5 font-semibold ${negative ? 'text-destructive' : ''}`}>{value}</div>
  </div>;
}

function SaleAmountInput({ line, onChange }: { line: SaleLine; onChange: (patch: Partial<Pick<SaleLine, 'amount' | 'amountUnit'>>) => void }) {
  const units = amountUnitsForKind(line.option.productKind);
  const title = line.option.productKind === 'PACKAGED' ? productPackLabel(line.option.productName, line.option.variantName) : line.option.productName;
  return <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
    <Input aria-label={`${title} পরিমাণ`} type="number" min="0" step={line.amountUnit === 'KG' || line.amountUnit === 'LITER' ? '0.001' : '1'} value={line.amount} onChange={(event) => onChange({ amount: event.target.value })} />
    {units.length === 1
      ? <div aria-label={`${title} একক`} className="flex h-11 items-center rounded-md border bg-muted/30 px-3 text-sm md:h-10">{line.option.productKind === 'EGG' ? 'টি ডিম' : (line.option.unitLabel ?? 'ইউনিট')}</div>
      : <select aria-label={`${title} একক`} className="h-11 rounded-md border bg-background px-2 md:h-10" value={line.amountUnit} onChange={(event) => onChange({ amountUnit: event.target.value as AmountUnit, amount: '' })}>{units.map((unit) => <option key={unit} value={unit}>{unit === 'KG' ? 'কেজি' : unit === 'G' ? 'গ্রাম' : unit === 'LITER' ? 'লিটার' : 'মিলি'}</option>)}</select>}
  </div>;
}
