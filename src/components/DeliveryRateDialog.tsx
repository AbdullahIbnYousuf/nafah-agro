import { useEffect, useState } from 'react';
import type { DeliveryRate } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  rate: DeliveryRate | null;
  onClose: () => void;
  onConfirm: (charge: number | null) => Promise<void>;
}

export default function DeliveryRateDialog({ rate, onClose, onConfirm }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(rate?.charge?.toString() ?? '');
    setError('');
  }, [rate?.id, rate?.charge]);

  async function submit() {
    const charge = value.trim() === '' ? null : Number(value);
    if (charge !== null && (!Number.isFinite(charge) || charge < 0)) {
      setError('শূন্য বা তার বেশি সঠিক ডেলিভারি চার্জ দিন।');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onConfirm(charge);
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'চার্জ আপডেট হয়নি।');
    } finally {
      setSaving(false);
    }
  }

  return <Dialog open={rate !== null} onOpenChange={(open) => { if (!open && !saving) onClose(); }}><DialogContent><DialogHeader><DialogTitle>ডেলিভারি চার্জ পরিবর্তন</DialogTitle><DialogDescription>{rate?.name} এলাকার চার্জ নির্ধারণ করুন। ফাঁকা রাখলে অনির্ধারিত থাকবে এবং checkout এই এলাকা গ্রহণ করবে না।</DialogDescription></DialogHeader><div><Label htmlFor="delivery-rate-charge">চার্জ (৳)</Label><Input id="delivery-rate-charge" className="mt-2" type="number" min="0" step="0.01" value={value} onChange={(event) => { setValue(event.target.value); setError(''); }} aria-invalid={Boolean(error)} aria-describedby={error ? 'delivery-rate-error' : undefined} />{error && <p id="delivery-rate-error" role="alert" className="mt-2 text-sm text-destructive">{error}</p>}</div><DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={saving}>বন্ধ করুন</Button><Button type="button" onClick={() => void submit()} disabled={saving}>{saving ? 'সংরক্ষণ হচ্ছে…' : 'চার্জ সংরক্ষণ করুন'}</Button></DialogFooter></DialogContent></Dialog>;
}
