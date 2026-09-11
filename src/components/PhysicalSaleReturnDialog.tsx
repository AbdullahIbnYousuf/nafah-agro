import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ApiError } from '@/lib/api';
import type { AmountUnit, PhysicalSale, PhysicalSaleItem, QuantityUnit } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { productPackLabel } from '@/lib/productOptions';
import { formatQuantity, toBaseQuantity } from '@/lib/quantity';

type ReturnCondition = 'SELLABLE' | 'DAMAGED';

interface ReturnLine {
  selected: boolean;
  amount: string;
  amountUnit: AmountUnit;
}

interface PhysicalSaleReturnDialogProps {
  sale: PhysicalSale | null;
  onClose: () => void;
  onConfirm: (input: {
    condition: ReturnCondition;
    reason?: string;
    items: Array<{ salesOrderItemId: string; amount: string; amountUnit: AmountUnit }>;
  }) => Promise<void>;
}

function unitsFor(unit: QuantityUnit | undefined): AmountUnit[] {
  if (unit === 'GRAM') return ['KG', 'G'];
  if (unit === 'MILLILITER') return ['LITER', 'ML'];
  return ['PIECE'];
}

function defaultUnit(unit: QuantityUnit | undefined): AmountUnit {
  if (unit === 'GRAM') return 'KG';
  if (unit === 'MILLILITER') return 'LITER';
  return 'PIECE';
}

function amountFromBase(quantity: number, unit: AmountUnit) {
  return String(unit === 'KG' || unit === 'LITER' ? quantity / 1_000 : quantity);
}

function unitLabel(unit: AmountUnit) {
  if (unit === 'KG') return 'কেজি';
  if (unit === 'G') return 'গ্রাম';
  if (unit === 'LITER') return 'লিটার';
  if (unit === 'ML') return 'মিলি';
  return 'ইউনিট';
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    const issues = error.details.issues;
    if (Array.isArray(issues)) {
      const messages = issues.flatMap((issue) => issue && typeof issue === 'object' && 'message' in issue && typeof issue.message === 'string' ? [issue.message] : []);
      if (messages.length > 0) return messages.join(' ');
    }
  }
  return error instanceof Error ? error.message : 'ফেরত সম্পন্ন হয়নি। আবার চেষ্টা করুন।';
}

function alreadyRefunded(sale: PhysicalSale, itemId: string) {
  return sale.returns.flatMap((value) => value.items)
    .filter((item) => item.salesOrderItemId === itemId)
    .reduce((total, item) => total + item.refundAmount, 0);
}

function estimatedRefund(sale: PhysicalSale, item: PhysicalSaleItem, baseQuantity: number) {
  const previous = alreadyRefunded(sale, item.id);
  if (baseQuantity === item.returnableQuantity) return Math.max(0, item.netLineRevenue - previous);
  return Math.round((item.netLineRevenue * baseQuantity / item.quantity) * 100) / 100;
}

export default function PhysicalSaleReturnDialog({ sale, onClose, onConfirm }: PhysicalSaleReturnDialogProps) {
  const [condition, setCondition] = useState<ReturnCondition>('SELLABLE');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<Record<string, ReturnLine>>({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setCondition('SELLABLE');
    setReason('');
    setError('');
    setSubmitting(false);
    setLines(Object.fromEntries((sale?.items ?? []).map((item) => {
      const amountUnit = defaultUnit(item.quantityUnit);
      return [item.id, { selected: false, amount: amountFromBase(item.returnableQuantity, amountUnit), amountUnit }];
    })));
  }, [sale]);

  const selected = useMemo(() => (sale?.items ?? []).flatMap((item) => {
    const line = lines[item.id];
    if (!line?.selected) return [];
    const baseQuantity = toBaseQuantity(line.amount, line.amountUnit);
    return [{ item, line, baseQuantity }];
  }), [lines, sale]);
  const refundPreview = selected.reduce((total, value) => total + (
    value.baseQuantity && value.baseQuantity <= value.item.returnableQuantity
      ? estimatedRefund(sale!, value.item, value.baseQuantity)
      : 0
  ), 0);

  function close() {
    if (!submitting) onClose();
  }

  async function submit() {
    if (!sale) return;
    if (selected.length === 0) {
      setError('ফেরত নেওয়ার জন্য অন্তত একটি পণ্য বেছে নিন।');
      return;
    }
    if (selected.some(({ item, line, baseQuantity }) => (
      baseQuantity === null
      || baseQuantity > item.returnableQuantity
      || !unitsFor(item.quantityUnit).includes(line.amountUnit)
    ))) {
      setError('প্রতিটি পণ্যের ফেরত পরিমাণ সঠিকভাবে লিখুন।');
      return;
    }
    const normalizedReason = reason.trim();
    setSubmitting(true);
    setError('');
    try {
      await onConfirm({
        condition,
        reason: normalizedReason || undefined,
        items: selected.map(({ item, line }) => ({
          salesOrderItemId: item.id,
          amount: line.amount,
          amountUnit: line.amountUnit,
        })),
      });
      onClose();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return <Dialog open={sale !== null} onOpenChange={(open) => { if (!open) close(); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>দোকানের পণ্য ফেরত</DialogTitle>
        <DialogDescription>বিক্রয়: <strong className="text-foreground">{sale?.orderNumber}</strong></DialogDescription>
      </DialogHeader>

      <section className="space-y-2" aria-label="ফেরত পণ্য বাছাই">
        {(sale?.items ?? []).map((item) => {
          const line = lines[item.id];
          const disabled = item.returnableQuantity <= 0;
          if (!line) return null;
          return <div key={item.id} className={`rounded-lg border p-3 ${line.selected ? 'border-secondary bg-secondary/5' : ''} ${disabled ? 'opacity-60' : ''}`}>
            <div className="flex items-start gap-3">
              <Checkbox
                id={`return-item-${item.id}`}
                checked={line.selected}
                disabled={disabled || submitting}
                onCheckedChange={(checked) => {
                  setError('');
                  setLines((current) => ({ ...current, [item.id]: { ...current[item.id], selected: checked === true } }));
                }}
              />
              <Label htmlFor={`return-item-${item.id}`} className="min-w-0 flex-1 cursor-pointer">
                <span className="block font-medium">{productPackLabel(item.productName, item.variantName)}</span>
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                  বিক্রি হয়েছিল {formatQuantity(item.quantity, item.quantityUnit)} · ফেরত নেওয়া যাবে {formatQuantity(item.returnableQuantity, item.quantityUnit)}
                </span>
              </Label>
            </div>
            {line.selected && <div className="mt-3 grid grid-cols-[minmax(0,1fr)_100px] gap-2 pl-7">
              <Input
                aria-label={`${item.productName} ফেরত পরিমাণ`}
                type="number"
                min="0"
                step={line.amountUnit === 'KG' || line.amountUnit === 'LITER' ? '0.001' : '1'}
                value={line.amount}
                disabled={submitting}
                onChange={(event) => {
                  setError('');
                  setLines((current) => ({ ...current, [item.id]: { ...current[item.id], amount: event.target.value } }));
                }}
              />
              <select
                aria-label={`${item.productName} ফেরত একক`}
                className="h-11 rounded-md border bg-background px-2 md:h-10"
                value={line.amountUnit}
                disabled={submitting}
                onChange={(event) => {
                  const nextUnit = event.target.value as AmountUnit;
                  const base = toBaseQuantity(line.amount, line.amountUnit) ?? item.returnableQuantity;
                  setLines((current) => ({ ...current, [item.id]: { ...current[item.id], amountUnit: nextUnit, amount: amountFromBase(base, nextUnit) } }));
                }}
              >
                {unitsFor(item.quantityUnit).map((unit) => <option key={unit} value={unit}>{unitLabel(unit)}</option>)}
              </select>
            </div>}
          </div>;
        })}
      </section>

      <fieldset>
        <legend className="mb-3 font-semibold">পণ্যের অবস্থা</legend>
        <RadioGroup value={condition} onValueChange={(value) => setCondition(value as ReturnCondition)} className="grid gap-3 sm:grid-cols-2">
          <Label htmlFor="physical-return-sellable" className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${condition === 'SELLABLE' ? 'border-secondary bg-secondary/10' : ''}`}>
            <RadioGroupItem id="physical-return-sellable" value="SELLABLE" className="mt-1" />
            <span><strong>SELLABLE</strong><span className="block text-sm font-normal text-muted-foreground">পণ্য আবার বিক্রির স্টকে যোগ হবে</span></span>
          </Label>
          <Label htmlFor="physical-return-damaged" className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${condition === 'DAMAGED' ? 'border-destructive bg-destructive/5' : ''}`}>
            <RadioGroupItem id="physical-return-damaged" value="DAMAGED" className="mt-1" />
            <span><strong>DAMAGED</strong><span className="block text-sm font-normal text-muted-foreground">পণ্য স্টকে যোগ হবে না</span></span>
          </Label>
        </RadioGroup>
      </fieldset>

      <Alert variant={condition === 'DAMAGED' ? 'destructive' : 'default'}>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>ফেরতের প্রভাব</AlertTitle>
        <AlertDescription>
          {condition === 'SELLABLE'
            ? 'ফেরত পণ্য আগের ক্রয়মূল্যসহ স্টকে যোগ হবে।'
            : 'ফেরত পণ্য স্টকে যোগ হবে না।'}
          {' '}আনুমানিক ফেরত টাকা: <strong>৳{refundPreview.toFixed(2)}</strong>
        </AlertDescription>
      </Alert>

      <div>
        <Label htmlFor="physical-return-reason">ফেরতের কারণ (ঐচ্ছিক)</Label>
        <Textarea
          id="physical-return-reason"
          className="mt-2"
          value={reason}
          disabled={submitting}
          onChange={(event) => { setReason(event.target.value); setError(''); }}
          placeholder="প্রয়োজন হলে কারণ লিখুন"
          aria-invalid={Boolean(error)}
        />
        {error && <p role="alert" className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={close} disabled={submitting}>বন্ধ করুন</Button>
        <Button type="button" onClick={() => void submit()} disabled={submitting || selected.length === 0}>
          {submitting ? 'ফেরত নিশ্চিত হচ্ছে…' : 'ফেরত নিশ্চিত করুন'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
