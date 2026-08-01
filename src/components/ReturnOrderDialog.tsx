import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ApiError } from '@/lib/api';
import type { UnifiedOrder } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';

export type ReturnCondition = 'SELLABLE' | 'DAMAGED';

interface ReturnOrderDialogProps {
  order: UnifiedOrder | null;
  onClose: () => void;
  onConfirm: (condition: ReturnCondition, reason: string) => Promise<void>;
}

function apiErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    const issues = error.details.issues;
    if (Array.isArray(issues)) {
      const messages = issues.flatMap(issue => {
        if (!issue || typeof issue !== 'object' || !('message' in issue)) return [];
        return typeof issue.message === 'string' ? [issue.message] : [];
      });
      if (messages.length > 0) return messages.join(' ');
    }
  }
  return error instanceof Error ? error.message : 'ফেরত সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।';
}

export default function ReturnOrderDialog({ order, onClose, onConfirm }: ReturnOrderDialogProps) {
  const [condition, setCondition] = useState<ReturnCondition>('SELLABLE');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setCondition('SELLABLE');
    setReason('');
    setError('');
    setSubmitting(false);
  }, [order?.id]);

  function close() {
    if (!submitting) onClose();
  }

  async function submit() {
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 3) {
      setError('ফেরতের কারণ লিখুন—অন্তত ৩ অক্ষর প্রয়োজন।');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await onConfirm(condition, normalizedReason);
      onClose();
    } catch (submitError) {
      setError(apiErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return <Dialog open={order !== null} onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>পুরো অর্ডার ফেরত</DialogTitle>
        <DialogDescription>
          অর্ডার: <strong className="text-foreground">{order?.orderNumber}</strong>। আংশিক ফেরত সমর্থিত নয়।
        </DialogDescription>
      </DialogHeader>

      <section aria-label="ফেরত পণ্য" className="rounded-lg border p-4">
        <h3 className="font-semibold mb-2">ফেরত পণ্যসমূহ</h3>
        <div className="space-y-2">
          {order?.items.map(item => <div key={item.id} className="flex justify-between gap-4 text-sm">
            <span>{item.productName} — {item.variantName}</span>
            <span className="font-medium whitespace-nowrap">× {item.quantity}</span>
          </div>)}
        </div>
      </section>

      <fieldset>
        <legend className="font-semibold mb-3">ফেরতের অবস্থা</legend>
        <RadioGroup value={condition} onValueChange={value => setCondition(value as ReturnCondition)} className="grid sm:grid-cols-2 gap-3">
          <Label htmlFor="return-sellable" className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer ${condition === 'SELLABLE' ? 'border-secondary bg-secondary/10' : ''}`}>
            <RadioGroupItem id="return-sellable" value="SELLABLE" className="mt-1" />
            <span><strong>SELLABLE</strong><span className="block text-sm font-normal text-muted-foreground">সব ফেরত স্টক পুনরুদ্ধার হবে</span></span>
          </Label>
          <Label htmlFor="return-damaged" className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer ${condition === 'DAMAGED' ? 'border-destructive bg-destructive/5' : ''}`}>
            <RadioGroupItem id="return-damaged" value="DAMAGED" className="mt-1" />
            <span><strong>DAMAGED</strong><span className="block text-sm font-normal text-muted-foreground">কোনো স্টক পুনরুদ্ধার হবে না</span></span>
          </Label>
        </RadioGroup>
      </fieldset>

      <Alert variant={condition === 'DAMAGED' ? 'destructive' : 'default'}>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>স্টকের উপর প্রভাব</AlertTitle>
        <AlertDescription>
          {condition === 'SELLABLE'
            ? 'নিশ্চিত করলে মূল FIFO বরাদ্দের পরিমাণ ও ক্রয়মূল্য অনুযায়ী সব পণ্য বিক্রয়যোগ্য স্টকে ফিরবে।'
            : 'নিশ্চিত করলে অর্ডার ফেরত হিসেবে গণ্য হবে, কিন্তু ক্ষতিগ্রস্ত পণ্যের কোনো পরিমাণ বিক্রয়যোগ্য স্টকে ফিরবে না।'}
        </AlertDescription>
      </Alert>

      <div>
        <Label htmlFor="return-reason">ফেরতের কারণ *</Label>
        <Textarea
          id="return-reason"
          value={reason}
          onChange={event => { setReason(event.target.value); if (error) setError(''); }}
          placeholder="পুরো অর্ডার ফেরতের কারণ লিখুন"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'return-error' : undefined}
          className="mt-2"
        />
        {error && <p id="return-error" role="alert" className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={close} disabled={submitting}>বাতিল / বন্ধ করুন</Button>
        <Button type="button" onClick={() => void submit()} disabled={submitting}>
          {submitting ? 'ফেরত নিশ্চিত হচ্ছে…' : 'ফেরত নিশ্চিত করুন'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
