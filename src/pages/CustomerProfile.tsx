import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  KeyRound, Loader2, LogOut, Package, Pencil, Settings,
  ShieldCheck, Trash2, User, UserPlus, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import InstallAppCard from '@/components/InstallAppCard';
import DeliveryAddressCard from '@/components/DeliveryAddressCard';
import PushNotificationCard from '@/components/PushNotificationCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import {
  ApiError, customerPromotionCandidate, deleteUnusedOwner, demoteOwnerToCustomer,
  getOwners, inviteOwner, promoteCustomerToOwner, setOwnerActive,
} from '@/lib/api';
import { formatNumber, getErrorMessage } from '@/lib/utils';
import { formatAppDateTime } from '@/lib/date';
import type { CustomerPromotionCandidate, OwnerAccount } from '@/lib/types';

export default function CustomerProfile() {
  const {
    user, isOwner, updateProfile, changePassword, setInitialPassword, logout,
    needsPasswordSetup,
  } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(user?.name ?? '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);

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
    setPasswordError('');
    if (newPassword.length < 8) {
      const message = 'নতুন পাসওয়ার্ড কমপক্ষে 8 অক্ষরের হতে হবে';
      if (needsPasswordSetup) setPasswordError(message);
      else toast.error(message);
      return;
    }
    if (newPassword !== confirmPassword) {
      const message = 'নতুন পাসওয়ার্ড দুইটি মিলছে না';
      if (needsPasswordSetup) setPasswordError(message);
      else toast.error(message);
      return;
    }
    setSavingPassword(true);
    try {
      if (needsPasswordSetup) await setInitialPassword(newPassword);
      else await changePassword(currentPassword, newPassword);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setPasswordDialogOpen(false);
      toast.success('পাসওয়ার্ড পরিবর্তন হয়েছে');
      if (needsPasswordSetup) navigate('/admin/dashboard', { replace: true });
    } catch (error) {
      const message = getErrorMessage(error, 'পাসওয়ার্ড পরিবর্তন করা যায়নি');
      if (needsPasswordSetup) setPasswordError(message);
      else toast.error(message);
    } finally {
      setSavingPassword(false);
    }
  }

  async function leaveSetup() {
    setLoggingOut(true);
    setPasswordError('');
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (error) {
      setPasswordError(getErrorMessage(error, 'লগআউট করা যায়নি'));
      setLoggingOut(false);
    }
  }

  if (needsPasswordSetup) {
    return <div className="min-h-screen flex flex-col bg-background"><Navbar /><main className="flex-1 flex items-center justify-center px-4 py-10">
      <section className="w-full max-w-xl rounded-2xl border border-amber-500/40 bg-card p-6 shadow-xl sm:p-8" aria-labelledby="owner-setup-title">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/15 text-amber-700"><ShieldCheck size={34} /></div>
          <Badge className="mb-3 bg-amber-500 text-amber-950 hover:bg-amber-500">সেটআপ বাকি</Badge>
          <p className="text-sm font-medium text-muted-foreground">স্বাগতম, {user?.name}</p>
          <h1 id="owner-setup-title" className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">অ্যাকাউন্ট চালু করতে পাসওয়ার্ড সেট করুন</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">অ্যাডমিন প্যানেল ব্যবহার করার আগে নিজের একটি পাসওয়ার্ড সেট করতে হবে। এটি একবারই করতে হবে।</p>
          {user?.email && <p className="mt-2 break-all text-sm font-medium text-foreground">{user.email}</p>}
        </div>

        <form className="space-y-4" onSubmit={savePassword}>
          <div><Label htmlFor="setup-new-password">নতুন পাসওয়ার্ড</Label><Input id="setup-new-password" className="mt-1" type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} minLength={8} required /></div>
          <div><Label htmlFor="setup-confirm-password">নতুন পাসওয়ার্ড আবার লিখুন</Label><Input id="setup-confirm-password" className="mt-1" type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} minLength={8} required /></div>
          <p className="text-xs text-muted-foreground">কমপক্ষে 8 অক্ষরের পাসওয়ার্ড দিন।</p>
          {passwordError && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{passwordError}</p>}
          <Button type="submit" className="min-h-11 w-full" disabled={savingPassword || loggingOut}><KeyRound size={17} className="mr-2" />{savingPassword ? 'পাসওয়ার্ড সেট হচ্ছে…' : 'পাসওয়ার্ড সেট করে অ্যাডমিন প্যানেলে যান'}</Button>
          <Button type="button" variant="ghost" className="min-h-11 w-full text-muted-foreground" onClick={() => void leaveSetup()} disabled={savingPassword || loggingOut}><LogOut size={17} className="mr-2" />{loggingOut ? 'লগআউট হচ্ছে…' : 'লগআউট'}</Button>
        </form>
      </section>
    </main><Footer /></div>;
  }

  return <div className="min-h-screen flex flex-col"><Navbar /><main className="flex-1 container mx-auto px-4 py-8 space-y-8">
    <section className="bg-card rounded-2xl border p-6 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center"><User size={32} /></div>
      <div className="flex-1"><div className="flex items-center gap-2 flex-wrap"><h1 className="text-2xl font-bold">{user?.name}</h1><Badge>{isOwner ? 'ওনার' : 'কাস্টমার'}</Badge><Badge variant="outline">অ্যাকটিভ</Badge></div><p className="text-muted-foreground">{user?.email ?? 'ইমেইল নেই'} · {user?.phoneNumber ?? 'ফোন নেই'}</p></div>
      {isOwner && <Button asChild><Link to="/admin"><Settings size={17} className="mr-2" />অ্যাডমিন প্যানেল</Link></Button>}
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

    <Dialog open={profileDialogOpen} onOpenChange={open => { if (!savingProfile) setProfileDialogOpen(open); }}><DialogContent><DialogHeader><DialogTitle>ব্যক্তিগত তথ্য সম্পাদনা</DialogTitle><DialogDescription>নাম ও ফোন নম্বর পরিবর্তন করুন। নিরাপত্তার জন্য ইমেইল এখান থেকে পরিবর্তন করা যায় না।</DialogDescription></DialogHeader><form id="profile-edit-form" className="space-y-4" onSubmit={saveProfile}><div><Label htmlFor="profile-name">পুরো নাম</Label><Input id="profile-name" className="mt-1" value={fullName} onChange={event => setFullName(event.target.value)} required /></div><div><Label htmlFor="profile-phone">ফোন নম্বর</Label><Input id="profile-phone" className="mt-1" type="tel" value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)} required /></div></form><DialogFooter><Button type="button" variant="outline" onClick={() => setProfileDialogOpen(false)} disabled={savingProfile}>বাতিল</Button><Button type="submit" form="profile-edit-form" disabled={savingProfile}>{savingProfile ? 'সেভ হচ্ছে…' : 'পরিবর্তন সেভ করুন'}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={passwordDialogOpen} onOpenChange={open => { if (!savingPassword) { setPasswordDialogOpen(open); if (!open) { setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); } } }}><DialogContent><DialogHeader><DialogTitle>{needsPasswordSetup ? 'নিজের পাসওয়ার্ড সেট করুন' : 'পাসওয়ার্ড পরিবর্তন'}</DialogTitle><DialogDescription>{needsPasswordSetup ? 'অ্যাকাউন্ট ব্যবহার শুরু করতে কমপক্ষে 8 অক্ষরের একটি পাসওয়ার্ড দিন।' : 'পরিবর্তন কনফার্ম করতে বর্তমান পাসওয়ার্ড এবং নতুন পাসওয়ার্ড দিন।'}</DialogDescription></DialogHeader><form id="password-change-form" className="space-y-4" onSubmit={savePassword}>{!needsPasswordSetup && <div><Label htmlFor="current-password">বর্তমান পাসওয়ার্ড</Label><Input id="current-password" className="mt-1" type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required /></div>}<div><Label htmlFor="new-password">নতুন পাসওয়ার্ড</Label><Input id="new-password" className="mt-1" type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} minLength={8} required /></div><div><Label htmlFor="confirm-password">নতুন পাসওয়ার্ড আবার লিখুন</Label><Input id="confirm-password" className="mt-1" type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} minLength={8} required /></div></form><DialogFooter><Button type="button" variant="outline" onClick={() => setPasswordDialogOpen(false)} disabled={savingPassword}>বাতিল</Button><Button type="submit" form="password-change-form" disabled={savingPassword}>{savingPassword ? 'পরিবর্তন হচ্ছে…' : needsPasswordSetup ? 'পাসওয়ার্ড সেট করুন' : 'পরিবর্তন সেভ করুন'}</Button></DialogFooter></DialogContent></Dialog>

    <InstallAppCard />
    {isOwner && <PushNotificationCard />}
    <DeliveryAddressCard />
    <section className="rounded-2xl border bg-card p-6 flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-bold">আমার অর্ডার</h2><p className="text-sm text-muted-foreground mt-1">আপনার ওয়েবসাইট অর্ডার ও বর্তমান স্ট্যাটাস দেখুন।</p></div><Button asChild variant="outline"><Link to="/orders"><Package size={17} className="mr-2" />আমার অর্ডার দেখুন</Link></Button></section>
    {isOwner && <OwnerManagement currentOwnerId={user!.id} />}
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
  const [promotionTarget, setPromotionTarget] = useState<CustomerPromotionCandidate | null>(null);
  const [promotionReason, setPromotionReason] = useState('');
  const [promoting, setPromoting] = useState(false);
  const [promotionError, setPromotionError] = useState('');
  const [demotionTarget, setDemotionTarget] = useState<OwnerAccount | null>(null);
  const [demotionReason, setDemotionReason] = useState('');
  const [demoting, setDemoting] = useState(false);
  const [demotionError, setDemotionError] = useState('');
  const [statusTarget, setStatusTarget] = useState<OwnerAccount | null>(null);
  const [statusReason, setStatusReason] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OwnerAccount | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  function demotionBlockedMessage(owner: OwnerAccount) {
    if (!owner.promotedFromCustomer || !owner.demotionBlockedReason) return null;
    if (owner.demotionBlockedReason === 'SELF') return 'নিজের অ্যাকাউন্ট নিজে কাস্টমার করা যাবে না।';
    if (owner.demotionBlockedReason === 'INACTIVE') return 'কাস্টমার করতে আগে অ্যাকাউন্টটি অ্যাকটিভ করুন।';
    if (owner.demotionBlockedReason === 'LAST_ACTIVE_OWNER') return 'শেষ অ্যাকটিভ ওনারকে কাস্টমার করা যাবে না।';
    return 'পরিচালনার কাজ করেছেন, তাই এখন আর কাস্টমার করা যাবে না।';
  }

  function ownerDeleteBlockedMessage(owner: OwnerAccount) {
    if (owner.id === currentOwnerId) return 'নিজের লগইন করা অ্যাকাউন্ট নিজে ডিলিট করতে পারবেন না।';
    if (owner.promotedFromCustomer) return 'এই অ্যাকাউন্টটি আগে কাস্টমার ছিল। ডিলিট না করে কাস্টমার করুন।';
    if (!owner.email) return 'এই ওনারের লগইন তথ্য পাওয়া যায়নি। ডেভেলপারের সহায়তা নিন।';
    return 'এই ওনারের ব্যবসা বা অডিট রেকর্ড আছে। তাই অ্যাকাউন্ট ডিলিট করতে পারবেন না। প্রয়োজনে ইনঅ্যাকটিভ করুন।';
  }

  const load = useCallback(() => {
    setLoading(true);
    void getOwners().then(result => { setOwners(result.owners); setInvitationsConfigured(result.invitationsConfigured); }).catch(error => toast.error(getErrorMessage(error, 'ওনার তালিকা লোড হয়নি'))).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  async function submitInvite(event: FormEvent) {
    event.preventDefault();
    setInviteError('');
    if (!invitationsConfigured) {
      const message = 'ওনার আমন্ত্রণ এখনো চালু করা হয়নি। সেটআপ সম্পন্ন করতে ডেভেলপারের সাথে যোগাযোগ করুন।';
      setInviteError(message);
      toast.error(message);
      return;
    }
    setInviting(true);
    try {
      await inviteOwner({ fullName: fullName.trim(), phoneNumber: phoneNumber.trim(), email: email.trim() });
      setFullName(''); setPhoneNumber(''); setEmail(''); load();
      toast.success('নতুন ওনারকে আমন্ত্রণ পাঠানো হয়েছে');
    } catch (error) {
      const candidate = error instanceof ApiError ? customerPromotionCandidate(error) : null;
      if (candidate) {
        setPromotionTarget(candidate);
        setPromotionReason('');
        setPromotionError('');
        return;
      }
      const message = error instanceof ApiError && error.code === 'OWNER_INVITATIONS_NOT_CONFIGURED'
        ? 'ওনার আমন্ত্রণ এখনো চালু করা হয়নি। সেটআপ সম্পন্ন করতে ডেভেলপারের সাথে যোগাযোগ করুন।'
        : error instanceof ApiError && error.code === 'OWNER_EMAIL_EXISTS'
          ? 'এই ইমেইলে আগে থেকেই একটি ওনার অ্যাকাউন্ট আছে।'
          : error instanceof ApiError && error.code === 'AUTH_IDENTITY_PROFILE_MISSING'
            ? 'এই ইমেইলের লগইন আছে, কিন্তু প্রোফাইল পাওয়া যায়নি। সহায়তার জন্য ডেভেলপারের সাথে যোগাযোগ করুন।'
        : getErrorMessage(error, 'ওনার আমন্ত্রণ পাঠানো যায়নি');
      setInviteError(message);
      toast.error(message);
    } finally { setInviting(false); }
  }

  async function confirmPromotion() {
    if (!promotionTarget || promotionReason.trim().length < 3) return;
    setPromoting(true);
    setPromotionError('');
    try {
      await promoteCustomerToOwner({
        customerProfileId: promotionTarget.customerProfileId,
        reason: promotionReason.trim(),
      });
      setPromotionTarget(null);
      setPromotionReason('');
      setFullName(''); setPhoneNumber(''); setEmail('');
      load();
      toast.success('কাস্টমারকে ওনার করা হয়েছে। তিনি সাইট রিফ্রেশ করে বা আগের পাসওয়ার্ড দিয়ে লগইন করতে পারবেন।');
    } catch (error) {
      setPromotionError(getErrorMessage(error, 'কাস্টমারকে ওনার করা যায়নি'));
    } finally {
      setPromoting(false);
    }
  }

  async function confirmDemotion() {
    if (!demotionTarget || demotionReason.trim().length < 3) return;
    setDemoting(true);
    setDemotionError('');
    try {
      await demoteOwnerToCustomer(demotionTarget.id, { reason: demotionReason.trim() });
      setDemotionTarget(null);
      setDemotionReason('');
      load();
      toast.success('অ্যাকাউন্টটি আবার কাস্টমার করা হয়েছে। আগের লগইন ও অর্ডার ঠিক থাকবে।');
    } catch (error) {
      setDemotionError(getErrorMessage(error, 'ওনারকে কাস্টমার করা যায়নি'));
    } finally {
      setDemoting(false);
    }
  }

  async function confirmStatus() {
    if (!statusTarget || statusReason.trim().length < 3) return;
    setSavingStatus(true);
    try {
      await setOwnerActive(statusTarget.id, { isActive: !statusTarget.isActive, reason: statusReason.trim() });
      setStatusTarget(null); setStatusReason(''); load();
      toast.success(statusTarget.isActive ? 'ওনার ইনঅ্যাকটিভ হয়েছে' : 'ওনার অ্যাকটিভ হয়েছে');
    } catch (error) {
      toast.error(getErrorMessage(error, 'ওনারের স্ট্যাটাস আপডেট করা যায়নি'));
    } finally { setSavingStatus(false); }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteUnusedOwner(deleteTarget.id);
      setDeleteTarget(null);
      load();
      toast.success('ব্যবহার হয়নি এমন ওনার অ্যাকাউন্ট ডিলিট করা হয়েছে');
    } catch (error) {
      setDeleteError(getErrorMessage(error, 'ওনার আমন্ত্রণ ডিলিট করা যায়নি'));
    } finally {
      setDeleting(false);
    }
  }

  return <section className="bg-card rounded-2xl border p-6">
    <div className="flex items-center gap-2 mb-6"><Users size={22} /><h2 className="text-xl font-bold">ওনার অ্যাকাউন্ট</h2></div>
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.7fr)] gap-6">
      <div className="space-y-3">
        {loading ? <div className="py-10 flex justify-center"><Loader2 className="animate-spin mr-2" />লোড হচ্ছে…</div> : owners.map(owner => <article key={owner.id} className={`border rounded-xl p-4 ${owner.isActive ? '' : 'opacity-60'}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <strong>{owner.fullName}</strong>
                {owner.id === currentOwnerId && <Badge variant="outline">আপনি</Badge>}
                <Badge variant={owner.isActive ? 'default' : 'secondary'}>{owner.isActive ? 'অ্যাকটিভ' : 'ইনঅ্যাকটিভ'}</Badge>
                {owner.promotedFromCustomer && <Badge variant="outline">কাস্টমার থেকে ওনার</Badge>}
              </div>
              <div className="text-sm text-muted-foreground mt-1">{owner.email ?? 'ইমেইল পাওয়া যায়নি'} · {owner.phoneNumber ?? 'ফোন নেই'}</div>
              <div className="text-xs text-muted-foreground mt-1">{owner.lastSignInAt ? `শেষ লগইন: ${formatAppDateTime(owner.lastSignInAt)}` : owner.invitedAt ? 'আমন্ত্রণ গ্রহণের অপেক্ষায়' : 'সরাসরি তৈরি করা'}</div>
              {demotionBlockedMessage(owner) && <p className="mt-1 text-xs text-muted-foreground">{demotionBlockedMessage(owner)}</p>}
            </div>
            {owner.id !== currentOwnerId && <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => { setStatusTarget(owner); setStatusReason(''); }}>{owner.isActive ? 'ইনঅ্যাকটিভ করুন' : 'অ্যাকটিভ করুন'}</Button>
              {owner.promotedFromCustomer && <Button size="sm" variant="outline" aria-disabled={!owner.canDemote} onClick={() => { if (!owner.canDemote) { toast.error(demotionBlockedMessage(owner) ?? 'এই ওনারকে এখন কাস্টমার করা যাবে না।'); return; } setDemotionTarget(owner); setDemotionReason(''); setDemotionError(''); }}>কাস্টমার করুন</Button>}
              <Button size="sm" variant={owner.canDelete ? 'destructive' : 'outline'} aria-disabled={!owner.canDelete} onClick={() => { if (!owner.canDelete) { toast.error(ownerDeleteBlockedMessage(owner)); return; } setDeleteError(''); setDeleteTarget(owner); }}><Trash2 size={15} className="mr-1" />অ্যাকাউন্ট ডিলিট করুন</Button>
            </div>}
          </div>
        </article>)}
      </div>
      <form className="border rounded-xl p-4 space-y-4 h-fit" onSubmit={submitInvite}><div className="flex items-center gap-2"><UserPlus size={19} /><h3 className="font-semibold">নতুন ওনার আমন্ত্রণ</h3></div><p className="text-xs text-muted-foreground">আমন্ত্রণ গ্রহণ করে নতুন ওনার নিজের পাসওয়ার্ড সেট করবেন।</p>{!loading && !invitationsConfigured && <p className="text-sm rounded-md border border-amber-500/40 bg-amber-500/10 p-3">ওনার আমন্ত্রণ এখনো চালু করা হয়নি। সেটআপ সম্পন্ন করতে ডেভেলপারের সাথে যোগাযোগ করুন।</p>}{inviteError && <p role="alert" className="text-sm rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive">{inviteError}</p>}<div><Label htmlFor="owner-name">পুরো নাম</Label><Input id="owner-name" className="mt-1" value={fullName} onChange={event => setFullName(event.target.value)} required disabled={!invitationsConfigured} /></div><div><Label htmlFor="owner-phone">ফোন নম্বর</Label><Input id="owner-phone" className="mt-1" type="tel" value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)} required disabled={!invitationsConfigured} /></div><div><Label htmlFor="owner-email">ইমেইল</Label><Input id="owner-email" className="mt-1" type="email" value={email} onChange={event => setEmail(event.target.value)} required disabled={!invitationsConfigured} /></div><Button type="submit" className="w-full aria-disabled:border aria-disabled:border-amber-600 aria-disabled:bg-amber-50 aria-disabled:text-amber-950 aria-disabled:hover:bg-amber-100" disabled={inviting} aria-disabled={!invitationsConfigured}>{inviting ? 'আমন্ত্রণ যাচ্ছে…' : 'আমন্ত্রণ পাঠান'}</Button></form>
    </div>

    <Dialog open={Boolean(statusTarget)} onOpenChange={open => { if (!open && !savingStatus) setStatusTarget(null); }}><DialogContent><DialogHeader><DialogTitle>{statusTarget?.isActive ? 'ওনার ইনঅ্যাকটিভ করুন' : 'ওনার অ্যাকটিভ করুন'}</DialogTitle><DialogDescription>{statusTarget?.fullName}-এর অ্যাকাউন্টের স্ট্যাটাস আপডেটের কারণ লিখুন। নিজের অ্যাকাউন্ট বা শেষ অ্যাকটিভ ওনার ইনঅ্যাকটিভ করা যায় না।</DialogDescription></DialogHeader><div><Label htmlFor="owner-status-reason">কারণ</Label><Input id="owner-status-reason" className="mt-1" value={statusReason} onChange={event => setStatusReason(event.target.value)} placeholder="কমপক্ষে 3 অক্ষর" /></div><DialogFooter><Button variant="outline" onClick={() => setStatusTarget(null)} disabled={savingStatus}>বাতিল</Button><Button onClick={() => void confirmStatus()} disabled={savingStatus || statusReason.trim().length < 3}>{savingStatus ? 'সেভ হচ্ছে…' : 'কনফার্ম করুন'}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(deleteTarget)} onOpenChange={open => { if (!open && !deleting) { setDeleteTarget(null); setDeleteError(''); } }}><DialogContent><DialogHeader><DialogTitle>ব্যবহার হয়নি এমন ওনার অ্যাকাউন্ট ডিলিট করুন</DialogTitle><DialogDescription>{deleteTarget?.fullName} ({deleteTarget?.email})-এর লগইন ও ওনার প্রোফাইল পুরোপুরি ডিলিট হবে। ব্যবসা বা অডিটের আগের কোনো রেকর্ড থাকলে অ্যাকাউন্ট ডিলিট হবে না, শুধু ইনঅ্যাকটিভ করা যাবে।</DialogDescription></DialogHeader>{deleteError && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{deleteError}</p>}<DialogFooter><Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteError(''); }} disabled={deleting}>বাতিল</Button><Button variant="destructive" onClick={() => void confirmDelete()} disabled={deleting}>{deleting ? 'ডিলিট হচ্ছে…' : 'ডিলিট করুন'}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(promotionTarget)} onOpenChange={open => { if (!open && !promoting) { setPromotionTarget(null); setPromotionReason(''); setPromotionError(''); } }}><DialogContent><DialogHeader><DialogTitle>এই কাস্টমারকে ওনার করবেন?</DialogTitle><DialogDescription>নতুন অ্যাকাউন্ট তৈরি হবে না। বর্তমান পাসওয়ার্ড, কাস্টমার অর্ডার এবং প্রোফাইল ঠিক থাকবে।</DialogDescription></DialogHeader>{promotionTarget && <div className="rounded-lg border bg-muted/20 p-4 text-sm"><p className="font-semibold">{promotionTarget.fullName}</p><p className="mt-1 break-all text-muted-foreground">{promotionTarget.email}</p><p className="text-muted-foreground">{promotionTarget.phoneNumber ?? 'ফোন নম্বর নেই'}</p>{!promotionTarget.isActive && <p className="mt-2 text-amber-700">অ্যাকাউন্টটি বর্তমানে ইনঅ্যাকটিভ। ওনার করার পরও ইনঅ্যাকটিভ থাকবে।</p>}</div>}<div><Label htmlFor="owner-promotion-reason">ওনার করার কারণ</Label><Input id="owner-promotion-reason" className="mt-1" value={promotionReason} onChange={event => setPromotionReason(event.target.value)} placeholder="কমপক্ষে 3 অক্ষর" /></div>{promotionError && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{promotionError}</p>}<DialogFooter><Button variant="outline" onClick={() => { setPromotionTarget(null); setPromotionReason(''); setPromotionError(''); }} disabled={promoting}>বাতিল</Button><Button onClick={() => void confirmPromotion()} disabled={promoting || promotionReason.trim().length < 3}>{promoting ? 'ওনার করা হচ্ছে…' : 'ওনার করুন'}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(demotionTarget)} onOpenChange={open => { if (!open && !demoting) { setDemotionTarget(null); setDemotionReason(''); setDemotionError(''); } }}><DialogContent><DialogHeader><DialogTitle>আবার কাস্টমার করবেন?</DialogTitle><DialogDescription>{demotionTarget?.fullName}-এর একই অ্যাকাউন্ট, পাসওয়ার্ড এবং আগের কাস্টমার অর্ডার থাকবে। শুধু অ্যাডমিন প্যানেলের পারমিশন চলে যাবে।</DialogDescription></DialogHeader><div><Label htmlFor="owner-demotion-reason">কাস্টমার করার কারণ</Label><Input id="owner-demotion-reason" className="mt-1" value={demotionReason} onChange={event => setDemotionReason(event.target.value)} placeholder="কমপক্ষে 3 অক্ষর" /></div>{demotionError && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{demotionError}</p>}<DialogFooter><Button variant="outline" onClick={() => { setDemotionTarget(null); setDemotionReason(''); setDemotionError(''); }} disabled={demoting}>বাতিল</Button><Button onClick={() => void confirmDemotion()} disabled={demoting || demotionReason.trim().length < 3}>{demoting ? 'আপডেট হচ্ছে…' : 'কাস্টমার করুন'}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
