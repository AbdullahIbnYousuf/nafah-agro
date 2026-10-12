import { useEffect, useState, type FormEvent } from 'react';
import { MapPin } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getDeliveryRates } from '@/lib/api';
import type { DeliveryRate } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export default function DeliveryAddressCard() {
  const { user, updateProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState('');
  const [rateId, setRateId] = useState('');
  const [rates, setRates] = useState<DeliveryRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function loadRates() {
    setLoading(true); setError('');
    try { setRates((await getDeliveryRates()).filter(rate => rate.isActive)); }
    catch { setError('ডেলিভারি এলাকা লোড করা যায়নি। রিট্রাই করুন।'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    if (!open) return;
    setAddress(user?.deliveryAddress ?? ''); setRateId(user?.preferredDeliveryRateId ?? '');
    void loadRates();
  }, [open, user?.deliveryAddress, user?.preferredDeliveryRateId]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (address.trim() && address.trim().length < 5) { setError('সম্পূর্ণ ঠিকানা দিন।'); return; }
    if (!user) return;
    setSaving(true); setError('');
    try {
      await updateProfile(user.name, user.phoneNumber, { deliveryAddress: address.trim() || null, preferredDeliveryRateId: rates.some(rate => rate.id === rateId) ? rateId : null });
      setOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ঠিকানা সেভ করা যায়নি।'); }
    finally { setSaving(false); }
  }
  return <section className="rounded-2xl border bg-card p-6">
    <div className="flex flex-wrap justify-between gap-3"><h2 className="flex items-center gap-2 text-xl font-bold"><MapPin size={21} />ডেলিভারি ঠিকানা</h2><Button variant="outline" size="sm" onClick={() => setOpen(true)}>{user?.deliveryAddress ? 'ঠিকানা আপডেট করুন' : 'ঠিকানা অ্যাড করুন'}</Button></div>
    <p className="mt-3 whitespace-pre-wrap text-sm">{user?.deliveryAddress ?? 'ঠিকানা সেভ করলে অর্ডারের সময় আবার লিখতে হবে না।'}</p>
    <Dialog open={open} onOpenChange={value => { if (!saving) setOpen(value); }}><DialogContent><DialogHeader><DialogTitle>ডেলিভারি ঠিকানা</DialogTitle><DialogDescription>এই ঠিকানা পরের অর্ডারে দেখাবে। অর্ডারের সময় চাইলে আপডেট করতে পারবেন।</DialogDescription></DialogHeader>
      <form onSubmit={save} className="space-y-4"><div><Label htmlFor="saved-address">সম্পূর্ণ ঠিকানা</Label><textarea id="saved-address" className="mt-1 min-h-24 w-full rounded-md border bg-background p-3" value={address} onChange={event => setAddress(event.target.value)} maxLength={1000} /></div>
      <div><Label htmlFor="saved-area">ডেলিভারি এলাকা</Label><select id="saved-area" className="mt-1 h-11 w-full rounded-md border bg-background px-3" value={rateId} onChange={event => setRateId(event.target.value)} disabled={loading}><option value="">অর্ডারের সময় সিলেক্ট করুন</option>{rates.map(rate => <option key={rate.id} value={rate.id}>{rate.name}</option>)}</select></div>
      {loading && <p role="status">লোড হচ্ছে…</p>}{error && <div role="alert" className="text-sm text-destructive">{error}<Button type="button" variant="ghost" size="sm" onClick={() => void loadRates()}>রিট্রাই করুন</Button></div>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>বাতিল</Button><Button disabled={saving || loading} type="submit">{saving ? 'সেভ হচ্ছে…' : 'সেভ করুন'}</Button></div></form>
    </DialogContent></Dialog>
  </section>;
}
