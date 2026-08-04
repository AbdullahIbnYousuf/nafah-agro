import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Props {
  open: boolean;
  projectedGrossProfit?: unknown;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function ProfitWarningDialog({ open, projectedGrossProfit, onClose, onConfirm }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) setError('');
  }, [open]);

  async function submit() {
    setSubmitting(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'কাজটি সম্পন্ন করা যায়নি।');
    } finally {
      setSubmitting(false);
    }
  }

  const amount = typeof projectedGrossProfit === 'string' || typeof projectedGrossProfit === 'number'
    ? `৳${projectedGrossProfit}`
    : 'ঋণাত্মক';

  return <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !submitting) onClose(); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>ক্ষতির সতর্কতা</DialogTitle>
        <DialogDescription>এই বিক্রয়ের আনুমানিক মোট লাভ {amount}।</DialogDescription>
      </DialogHeader>
      <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>বিক্রয়টি অলাভজনক</AlertTitle><AlertDescription>এগিয়ে গেলে ক্ষতির সতর্কতা এবং আপনার সিদ্ধান্ত অডিট রেকর্ডে সংরক্ষিত হবে।</AlertDescription></Alert>
      {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      <DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={submitting}>বন্ধ করুন</Button><Button type="button" variant="destructive" onClick={() => void submit()} disabled={submitting}>{submitting ? 'সংরক্ষণ হচ্ছে…' : 'ক্ষতি মেনে চালিয়ে যান'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
