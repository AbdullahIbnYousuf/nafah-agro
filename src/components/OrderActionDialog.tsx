import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ApiError } from '@/lib/api';
import type { UnifiedOrder } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export type OrderAction = 'CONFIRM' | 'PROCESS' | 'DELIVER' | 'CANCEL' | 'FAILED_DELIVERY';

interface Props {
  order: UnifiedOrder | null;
  action: OrderAction | null;
  onClose: () => void;
  onConfirm: (reason: string | undefined, confirmUnprofitable: boolean) => Promise<void>;
}

const copy: Record<OrderAction, { title: string; description: string; button: string; warning?: string }> = {
  CONFIRM: {
    title: 'অর্ডার নিশ্চিত করুন',
    description: 'FIFO অনুযায়ী স্টক সংরক্ষণ হবে। পর্যাপ্ত স্টক না থাকলে কাজটি সম্পন্ন হবে না।',
    button: 'নিশ্চিত ও স্টক সংরক্ষণ করুন',
  },
  PROCESS: {
    title: 'প্রসেসিং শুরু করুন',
    description: 'অর্ডারটি প্যাকিং বা ডেলিভারির প্রস্তুতি পর্যায়ে যাবে।',
    button: 'প্রসেসিং শুরু করুন',
  },
  DELIVER: {
    title: 'ডেলিভারি সম্পন্ন করুন',
    description: 'সংরক্ষিত স্টক ব্যবহৃত হবে এবং বিক্রয়, আয় ও মোট লাভ স্বীকৃত হবে।',
    button: 'ডেলিভারড হিসেবে নিশ্চিত করুন',
    warning: 'এই আর্থিক স্বীকৃতির কাজটি নিশ্চিত করার আগে অর্ডার সত্যিই পৌঁছেছে কি না যাচাই করুন।',
  },
  CANCEL: {
    title: 'অর্ডার বাতিল করুন',
    description: 'অর্ডারটি আর চালু থাকবে না এবং সংরক্ষিত স্টক থাকলে তা ছেড়ে দেওয়া হবে।',
    button: 'অর্ডার বাতিল নিশ্চিত করুন',
    warning: 'এটি একটি গুরুত্বপূর্ণ পরিবর্তন। বাতিলের কারণ অডিট লগে সংরক্ষিত হবে।',
  },
  FAILED_DELIVERY: {
    title: 'ডেলিভারি ব্যর্থ হিসেবে চিহ্নিত করুন',
    description: 'অর্ডার বাতিল হবে এবং সংরক্ষিত স্টক ছেড়ে দেওয়া হবে।',
    button: 'ব্যর্থ ডেলিভারি নিশ্চিত করুন',
    warning: 'ব্যর্থতার কারণ অডিট লগে সংরক্ষিত হবে এবং কোনো আয় বা লাভ গণনা হবে না।',
  },
};

function messageFor(error: unknown) {
  if (error instanceof ApiError && Array.isArray(error.details.issues)) {
    const issues = error.details.issues.flatMap((issue) =>
      issue && typeof issue === 'object' && 'message' in issue && typeof issue.message === 'string'
        ? [issue.message]
        : [],
    );
    if (issues.length > 0) return issues.join(' ');
  }
  return error instanceof Error ? error.message : 'অর্ডার আপডেট করা যায়নি।';
}

export default function OrderActionDialog({ order, action, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmUnprofitable, setConfirmUnprofitable] = useState(false);
  const config = action ? copy[action] : null;
  const reasonRequired = action === 'CANCEL' || action === 'FAILED_DELIVERY';

  useEffect(() => {
    setReason('');
    setError('');
    setSubmitting(false);
    setConfirmUnprofitable(false);
  }, [order?.id, action]);

  function close() {
    if (!submitting) onClose();
  }

  async function submit() {
    const normalizedReason = reason.trim();
    if (reasonRequired && normalizedReason.length < 3) {
      setError('কারণ লিখুন—অন্তত ৩ অক্ষর প্রয়োজন।');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(reasonRequired ? normalizedReason : undefined, confirmUnprofitable);
      onClose();
    } catch (submitError) {
      if (
        action === 'CONFIRM'
        && submitError instanceof ApiError
        && submitError.code === 'UNPROFITABLE_ORDER_CONFIRMATION_REQUIRED'
      ) {
        setConfirmUnprofitable(true);
      }
      setError(messageFor(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return <Dialog open={Boolean(order && action)} onOpenChange={(open) => { if (!open) close(); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{config?.title}</DialogTitle>
        <DialogDescription>অর্ডার: <strong className="text-foreground">{order?.orderNumber}</strong>। {config?.description}</DialogDescription>
      </DialogHeader>
      {(config?.warning || confirmUnprofitable) && <Alert variant={action === 'CANCEL' || action === 'FAILED_DELIVERY' || confirmUnprofitable ? 'destructive' : 'default'}>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>{confirmUnprofitable ? 'ক্ষতির সতর্কতা' : 'নিশ্চিত করুন'}</AlertTitle>
        <AlertDescription>{confirmUnprofitable ? `${error} তারপরও অর্ডারটি নিশ্চিত করতে আবার বোতাম চাপুন।` : config?.warning}</AlertDescription>
      </Alert>}
      {reasonRequired && <div>
        <Label htmlFor="order-action-reason">কারণ *</Label>
        <Textarea id="order-action-reason" className="mt-2" value={reason} onChange={(event) => { setReason(event.target.value); setError(''); }} aria-invalid={Boolean(error)} aria-describedby={error ? 'order-action-error' : undefined} />
      </div>}
      {error && !confirmUnprofitable && <p id="order-action-error" role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close} disabled={submitting}>বন্ধ করুন</Button>
        <Button type="button" variant={action === 'CANCEL' || action === 'FAILED_DELIVERY' ? 'destructive' : 'default'} onClick={() => void submit()} disabled={submitting}>
          {submitting ? 'সংরক্ষণ হচ্ছে…' : confirmUnprofitable ? 'ক্ষতি মেনে নিশ্চিত করুন' : config?.button}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
