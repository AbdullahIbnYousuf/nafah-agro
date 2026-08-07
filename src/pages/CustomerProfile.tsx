import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronDown, ChevronRight, KeyRound, Loader2, Package, Pencil, Settings,
  ShoppingBag, User, UserPlus, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError, getMyOrders, getOwners, inviteOwner, setOwnerActive } from '@/lib/api';
import { formatBanglaNumber, getErrorMessage } from '@/lib/utils';
import type { OrderStatus, OwnerAccount, UnifiedOrder } from '@/lib/types';

const statusLabels: Record<OrderStatus, string> = {
  PENDING: 'অপেক্ষমান', CONFIRMED: 'নিশ্চিত', PROCESSING: 'প্রক্রিয়াধীন',
  DELIVERED: 'ডেলিভারি সম্পন্ন', COMPLETED: 'সম্পন্ন', CANCELLED: 'বাতিল',
  RETURNED_SELLABLE: 'ফেরত (বিক্রয়যোগ্য)', RETURNED_DAMAGED: 'ফেরত (ক্ষতিগ্রস্ত)',
};

export default function CustomerProfile() {
  const { user, isOwner, updateProfile, changePassword, setInitialPassword, needsPasswordSetup } = useAuth();
  const [fullName, setFullName] = useState(user?.name ?? '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);

  useEffect(() => {
    setFullName(user?.name ?? '');
    setPhoneNumber(user?.phoneNumber ?? '');
  }, [user?.name, user?.phoneNumber]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!fullName.trim() || phoneNumber.trim().length < 7) {
      toast.error('সঠিক নাম ও ফোন নম্বর দিন');
      return;
    }
    setSavingProfile(true);
    try {
      await updateProfile(fullName.trim(), phoneNumber.trim());
      setProfileDialogOpen(false);
      toast.success('প্রোফাইল আপডেট হয়েছে');
    } catch (error) {
      toast.error(getErrorMessage(error, 'প্রোফাইল আপডেট করা যায়নি'));
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword.length < 8) {
      toast.error('নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('নতুন পাসওয়ার্ড দুইটি মিলছে না');
      return;
    }
    setSavingPassword(true);
    try {
      if (needsPasswordSetup) await setInitialPassword(newPassword);
      else await changePassword(currentPassword, newPassword);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setPasswordDialogOpen(false);
      toast.success('পাসওয়ার্ড পরিবর্তন হয়েছে');
    } catch (error) {
      toast.error(getErrorMessage(error, 'পাসওয়ার্ড পরিবর্তন করা যায়নি'));
    } finally {
      setSavingPassword(false);
    }
  }

  return <div className="min-h-screen flex flex-col"><Navbar /><main className="flex-1 container mx-auto px-4 py-8 space-y-8">
    <section className="bg-card rounded-2xl border p-6 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center"><User size={32} /></div>
      <div className="flex-1"><div className="flex items-center gap-2 flex-wrap"><h1 className="text-2xl font-bold">{user?.name}</h1><Badge>{isOwner ? 'ওনার' : 'কাস্টমার'}</Badge><Badge variant="outline">সক্রিয়</Badge></div><p className="text-muted-foreground">{user?.email ?? 'ইমেইল নেই'} · {user?.phoneNumber ?? 'ফোন নেই'}</p></div>
      {isOwner && <Button asChild><Link to="/admin"><Settings size={17} className="mr-2" />পরিচালনা প্যানেল</Link></Button>}
    </section>

    <div>
      <section className="bg-card rounded-2xl border p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><User size={21} /><h2 className="text-xl font-bold">ব্যক্তিগত তথ্য</h2></div><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant={needsPasswordSetup ? 'default' : 'ghost'} className={needsPasswordSetup ? '' : 'text-muted-foreground'} onClick={() => setPasswordDialogOpen(true)}><KeyRound size={15} className="mr-2" />{needsPasswordSetup ? 'পাসওয়ার্ড সেট করুন' : 'পাসওয়ার্ড পরিবর্তন'}</Button><Button type="button" size="sm" variant="outline" onClick={() => { setFullName(user?.name ?? ''); setPhoneNumber(user?.phoneNumber ?? ''); setProfileDialogOpen(true); }}><Pencil size={15} className="mr-2" />সম্পাদনা</Button></div></div>
        <dl className="space-y-4 text-sm">
          <div><dt className="text-muted-foreground">পুরো নাম</dt><dd className="mt-1 font-medium">{user?.name ?? 'তথ্য নেই'}</dd></div>
          <div><dt className="text-muted-foreground">ফোন নম্বর</dt><dd className="mt-1 font-medium">{user?.phoneNumber ?? 'ফোন নেই'}</dd></div>
          <div><dt className="text-muted-foreground">ইমেইল</dt><dd className="mt-1 font-medium break-all">{user?.email ?? 'ইমেইল নেই'}</dd></div>
        </dl>
      </section>
    </div>

    <Dialog open={profileDialogOpen} onOpenChange={open => { if (!savingProfile) setProfileDialogOpen(open); }}><DialogContent><DialogHeader><DialogTitle>ব্যক্তিগত তথ্য সম্পাদনা</DialogTitle><DialogDescription>নাম ও ফোন নম্বর পরিবর্তন করুন। নিরাপত্তার জন্য ইমেইল এখান থেকে পরিবর্তন করা যায় না।</DialogDescription></DialogHeader><form id="profile-edit-form" className="space-y-4" onSubmit={saveProfile}><div><Label htmlFor="profile-name">পুরো নাম</Label><Input id="profile-name" className="mt-1" value={fullName} onChange={event => setFullName(event.target.value)} required /></div><div><Label htmlFor="profile-phone">ফোন নম্বর</Label><Input id="profile-phone" className="mt-1" type="tel" value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)} required /></div></form><DialogFooter><Button type="button" variant="outline" onClick={() => setProfileDialogOpen(false)} disabled={savingProfile}>বাতিল</Button><Button type="submit" form="profile-edit-form" disabled={savingProfile}>{savingProfile ? 'সংরক্ষণ হচ্ছে…' : 'পরিবর্তন সংরক্ষণ করুন'}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={passwordDialogOpen} onOpenChange={open => { if (!savingPassword) { setPasswordDialogOpen(open); if (!open) { setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); } } }}><DialogContent><DialogHeader><DialogTitle>{needsPasswordSetup ? 'নিজের পাসওয়ার্ড সেট করুন' : 'পাসওয়ার্ড পরিবর্তন'}</DialogTitle><DialogDescription>{needsPasswordSetup ? 'অ্যাকাউন্ট ব্যবহার শুরু করতে কমপক্ষে ৮ অক্ষরের একটি পাসওয়ার্ড দিন।' : 'পরিবর্তন নিশ্চিত করতে বর্তমান পাসওয়ার্ড এবং নতুন পাসওয়ার্ড দিন।'}</DialogDescription></DialogHeader><form id="password-change-form" className="space-y-4" onSubmit={savePassword}>{!needsPasswordSetup && <div><Label htmlFor="current-password">বর্তমান পাসওয়ার্ড</Label><Input id="current-password" className="mt-1" type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required /></div>}<div><Label htmlFor="new-password">নতুন পাসওয়ার্ড</Label><Input id="new-password" className="mt-1" type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} minLength={8} required /></div><div><Label htmlFor="confirm-password">নতুন পাসওয়ার্ড নিশ্চিত করুন</Label><Input id="confirm-password" className="mt-1" type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} minLength={8} required /></div></form><DialogFooter><Button type="button" variant="outline" onClick={() => setPasswordDialogOpen(false)} disabled={savingPassword}>বাতিল</Button><Button type="submit" form="password-change-form" disabled={savingPassword}>{savingPassword ? 'পরিবর্তন হচ্ছে…' : needsPasswordSetup ? 'পাসওয়ার্ড সেট করুন' : 'পরিবর্তন সংরক্ষণ করুন'}</Button></DialogFooter></DialogContent></Dialog>

    {isOwner ? <OwnerManagement currentOwnerId={user!.id} /> : <CustomerOrders />}
  </main><Footer /></div>;
}

function OwnerManagement({ currentOwnerId }: { currentOwnerId: string }) {
  const [owners, setOwners] = useState<OwnerAccount[]>([]);
  const [invitationsConfigured, setInvitationsConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [statusTarget, setStatusTarget] = useState<OwnerAccount | null>(null);
  const [statusReason, setStatusReason] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    void getOwners().then(result => { setOwners(result.owners); setInvitationsConfigured(result.invitationsConfigured); }).catch(error => toast.error(getErrorMessage(error, 'ওনার তালিকা লোড হয়নি'))).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  async function submitInvite(event: FormEvent) {
    event.preventDefault();
    setInviteError('');
    setInviting(true);
    try {
      await inviteOwner({ fullName: fullName.trim(), phoneNumber: phoneNumber.trim(), email: email.trim() });
      setFullName(''); setPhoneNumber(''); setEmail(''); load();
      toast.success('নতুন ওনারকে আমন্ত্রণ পাঠানো হয়েছে');
    } catch (error) {
      const message = error instanceof ApiError && error.code === 'OWNER_INVITATIONS_NOT_CONFIGURED'
        ? 'ওনার আমন্ত্রণ এখনো চালু করা হয়নি। সেটআপ সম্পন্ন করতে ডেভেলপারের সাথে যোগাযোগ করুন।'
        : getErrorMessage(error, 'ওনার আমন্ত্রণ পাঠানো যায়নি');
      setInviteError(message);
      toast.error(message);
    } finally { setInviting(false); }
  }

  async function confirmStatus() {
    if (!statusTarget || statusReason.trim().length < 3) return;
    setSavingStatus(true);
    try {
      await setOwnerActive(statusTarget.id, { isActive: !statusTarget.isActive, reason: statusReason.trim() });
      setStatusTarget(null); setStatusReason(''); load();
      toast.success(statusTarget.isActive ? 'ওনার নিষ্ক্রিয় হয়েছে' : 'ওনার সক্রিয় হয়েছে');
    } catch (error) {
      toast.error(getErrorMessage(error, 'ওনারের অবস্থা পরিবর্তন করা যায়নি'));
    } finally { setSavingStatus(false); }
  }

  return <section className="bg-card rounded-2xl border p-6">
    <div className="flex items-center gap-2 mb-6"><Users size={22} /><h2 className="text-xl font-bold">ওনার অ্যাকাউন্ট</h2></div>
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.7fr)] gap-6">
      <div className="space-y-3">
        {loading ? <div className="py-10 flex justify-center"><Loader2 className="animate-spin mr-2" />লোড হচ্ছে…</div> : owners.map(owner => <article key={owner.id} className={`border rounded-xl p-4 ${owner.isActive ? '' : 'opacity-60'}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><strong>{owner.fullName}</strong>{owner.id === currentOwnerId && <Badge variant="outline">আপনি</Badge>}<Badge variant={owner.isActive ? 'default' : 'secondary'}>{owner.isActive ? 'সক্রিয়' : 'নিষ্ক্রিয়'}</Badge></div><div className="text-sm text-muted-foreground mt-1">{owner.email ?? 'ইমেইল পাওয়া যায়নি'} · {owner.phoneNumber ?? 'ফোন নেই'}</div><div className="text-xs text-muted-foreground mt-1">{owner.lastSignInAt ? `শেষ লগইন: ${new Date(owner.lastSignInAt).toLocaleString('bn-BD')}` : owner.invitedAt ? 'আমন্ত্রণ গ্রহণের অপেক্ষায়' : 'CLI দিয়ে তৈরি'}</div></div>{owner.id !== currentOwnerId && <Button size="sm" variant="outline" onClick={() => { setStatusTarget(owner); setStatusReason(''); }}>{owner.isActive ? 'নিষ্ক্রিয় করুন' : 'সক্রিয় করুন'}</Button>}</div></article>)}
      </div>
      <form className="border rounded-xl p-4 space-y-4 h-fit" onSubmit={submitInvite}><div className="flex items-center gap-2"><UserPlus size={19} /><h3 className="font-semibold">নতুন ওনার আমন্ত্রণ</h3></div><p className="text-xs text-muted-foreground">আমন্ত্রণ গ্রহণ করে নতুন ওনার নিজের পাসওয়ার্ড সেট করবেন।</p>{!loading && !invitationsConfigured && <p className="text-sm rounded-md border border-amber-500/40 bg-amber-500/10 p-3">ওনার আমন্ত্রণ এখনো চালু করা হয়নি। সেটআপ সম্পন্ন করতে ডেভেলপারের সাথে যোগাযোগ করুন।</p>}{inviteError && <p role="alert" className="text-sm rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive">{inviteError}</p>}<div><Label htmlFor="owner-name">পুরো নাম</Label><Input id="owner-name" className="mt-1" value={fullName} onChange={event => setFullName(event.target.value)} required disabled={!invitationsConfigured} /></div><div><Label htmlFor="owner-phone">ফোন নম্বর</Label><Input id="owner-phone" className="mt-1" type="tel" value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)} required disabled={!invitationsConfigured} /></div><div><Label htmlFor="owner-email">ইমেইল</Label><Input id="owner-email" className="mt-1" type="email" value={email} onChange={event => setEmail(event.target.value)} required disabled={!invitationsConfigured} /></div><Button type="submit" className="w-full" disabled={inviting || !invitationsConfigured}>{inviting ? 'আমন্ত্রণ যাচ্ছে…' : 'আমন্ত্রণ পাঠান'}</Button></form>
    </div>

    <Dialog open={Boolean(statusTarget)} onOpenChange={open => { if (!open && !savingStatus) setStatusTarget(null); }}><DialogContent><DialogHeader><DialogTitle>{statusTarget?.isActive ? 'ওনার নিষ্ক্রিয় করুন' : 'ওনার সক্রিয় করুন'}</DialogTitle><DialogDescription>{statusTarget?.fullName}-এর অ্যাকাউন্টের অবস্থা পরিবর্তনের কারণ লিখুন। নিজের অ্যাকাউন্ট বা শেষ সক্রিয় ওনার নিষ্ক্রিয় করা যায় না।</DialogDescription></DialogHeader><div><Label htmlFor="owner-status-reason">কারণ</Label><Input id="owner-status-reason" className="mt-1" value={statusReason} onChange={event => setStatusReason(event.target.value)} placeholder="কমপক্ষে ৩ অক্ষর" /></div><DialogFooter><Button variant="outline" onClick={() => setStatusTarget(null)} disabled={savingStatus}>বাতিল</Button><Button onClick={() => void confirmStatus()} disabled={savingStatus || statusReason.trim().length < 3}>{savingStatus ? 'সংরক্ষণ হচ্ছে…' : 'নিশ্চিত করুন'}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}

function CustomerOrders() {
  const [orders, setOrders] = useState<UnifiedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  useEffect(() => {
    void getMyOrders().then(setOrders).catch(() => toast.error('অর্ডার লোড করতে ব্যর্থ হয়েছে')).finally(() => setLoading(false));
  }, []);

  return <section className="bg-card rounded-2xl border p-6"><div className="flex items-center gap-2 mb-6"><Package size={22} /><h2 className="text-xl font-bold">আমার ওয়েবসাইট অর্ডার</h2><span className="ml-auto text-sm text-muted-foreground">মোট: {formatBanglaNumber(orders.length)}</span></div>
    {loading ? <div className="py-16 flex justify-center"><Loader2 className="animate-spin mr-2" />লোড হচ্ছে…</div> : orders.length === 0 ? <div className="text-center py-16"><ShoppingBag size={48} className="mx-auto text-muted-foreground/40 mb-4" /><p className="mb-4">কোনো অ্যাকাউন্ট-সংযুক্ত ওয়েবসাইট অর্ডার নেই</p><Button asChild><Link to="/shop">দোকানে যান</Link></Button></div> : <div className="space-y-3">{orders.map(order => {
      const expanded = expandedId === order.id;
      return <article key={order.id} className="border rounded-lg overflow-hidden"><button className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setExpandedId(expanded ? null : order.id)}>{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<div className="flex-1"><strong>{order.orderNumber}</strong><div className="text-xs text-muted-foreground">{new Date(order.placedAt).toLocaleString('bn-BD')} · {statusLabels[order.status]}</div></div><strong>৳{order.grandTotal}</strong></button>
        {expanded && <div className="border-t p-4 bg-muted/10"><div className="space-y-2">{order.items.map(item => <div key={item.id} className="flex justify-between text-sm"><span>{item.productName} · {item.variantName} × {item.quantity}</span><span>৳{item.grossLineRevenue}</span></div>)}</div><div className="border-t mt-3 pt-3 text-sm space-y-1"><div className="flex justify-between"><span>সাবটোটাল</span><span>৳{order.subtotal}</span></div><div className="flex justify-between"><span>ডেলিভারি</span><span>৳{order.deliveryCharge}</span></div><div className="flex justify-between font-bold"><span>মোট</span><span>৳{order.grandTotal}</span></div></div>{order.statusReason && <p className="text-sm text-destructive mt-3">{order.statusReason}</p>}</div>}
      </article>;
    })}</div>}
  </section>;
}
