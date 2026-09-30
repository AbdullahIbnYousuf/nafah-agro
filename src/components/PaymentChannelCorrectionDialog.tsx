import { useEffect, useState } from 'react';
import type { PaymentChannel } from '@/lib/types';
import { getErrorMessage } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PaymentChannelSelect } from '@/components/PaymentChannelSelect';
import { paymentChannelLabel } from '@/lib/paymentChannels';

export function PaymentChannelCorrectionDialog({ open, current, title, onClose, onSave }: {
  open: boolean;
  current: PaymentChannel | null | undefined;
  title: string;
  onClose: () => void;
  onSave: (value: PaymentChannel) => Promise<void>;
}) {
  const [value, setValue] = useState<PaymentChannel>(current ?? 'CASH');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setValue(current ?? 'CASH');
      setError('');
    }
  }, [open, current]);

  async function save() {
    setSaving(true);
    setError('');
    try {
      await onSave(value);
      onClose();
    } catch (failure) {
      setError(getErrorMessage(failure, 'পেমেন্টের মাধ্যম আপডেট হয়নি'));
    } finally {
      setSaving(false);
    }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>আগে সেভ ছিল {paymentChannelLabel(current)}। শুধু পেমেন্টের মাধ্যম বদলাবে, টাকার হিসাব বদলাবে না।</DialogDescription>
      </DialogHeader>
      <PaymentChannelSelect value={value} onChange={setValue} disabled={saving} label="সঠিক পেমেন্টের মাধ্যম" />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={saving} onClick={onClose}>বাতিল</Button>
        <Button type="button" disabled={saving || value === (current ?? 'CASH')} onClick={() => void save()}>{saving ? 'সেভ হচ্ছে...' : 'সেভ করুন'}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
