import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Props {
  open: boolean;
  increase: number;
  subject?: 'বিক্রি' | 'অর্ডার';
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function PriceIncreaseDialog({ open, increase, subject = 'বিক্রি', onClose, onConfirm }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (open) setError(''); }, [open]);

  async function confirm() {
    setSaving(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'বিক্রি সেভ হয়নি।');
    } finally {
      setSaving(false);
    }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>বাড়তি দাম কনফার্ম করুন</DialogTitle>
        <DialogDescription>পণ্যের বর্তমান দামের চেয়ে ৳{increase.toFixed(2)} বেশি নেওয়া হচ্ছে। ক্যাটালগের দাম বদলাবে না; এই {subject === 'অর্ডার' ? 'অর্ডারের' : 'বিক্রির'} দামই শুধু রেকর্ড হবে।</DialogDescription>
      </DialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={onClose}>বন্ধ করুন</Button><Button type="button" disabled={saving} onClick={() => void confirm()}>{saving ? 'কনফার্ম হচ্ছে…' : 'এই দামেই কনফার্ম করুন'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
