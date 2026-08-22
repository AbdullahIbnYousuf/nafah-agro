import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushAvailability,
  testPushNotification,
  type PushAvailability,
} from '@/lib/pushNotifications';
import { getErrorMessage } from '@/lib/utils';

const descriptions: Record<PushAvailability, string> = {
  unsupported: 'এই ব্রাউজার বা ডিভাইসে ওয়েব নোটিফিকেশন ব্যবহার করা যায় না।',
  'ios-install-required': 'iPhone বা iPad-এ নোটিফিকেশন পেতে আগে Share মেনু থেকে Add to Home Screen করুন।',
  denied: 'ব্রাউজার সেটিংসে নাফাহ এগ্রোর নোটিফিকেশন অনুমতি বন্ধ আছে। অনুমতি চালু করে আবার চেষ্টা করুন।',
  disabled: 'নতুন ওয়েবসাইট অর্ডার এবং যোগাযোগের সময় হওয়া বাকি সম্পর্কে এই ডিভাইসে নোটিফিকেশন নিন।',
  enabled: 'এই ডিভাইসে নতুন ওয়েবসাইট অর্ডার এবং সময় হওয়া বাকির নোটিফিকেশন চালু আছে।',
};

export default function PushNotificationCard() {
  const [state, setState] = useState<PushAvailability | null>(null);
  const [working, setWorking] = useState<'enable' | 'disable' | 'test' | null>(null);

  useEffect(() => {
    let active = true;
    void getPushAvailability().then(result => {
      if (active) setState(result);
    }).catch(() => {
      if (active) setState('unsupported');
    });
    return () => { active = false; };
  }, []);

  async function enable() {
    setWorking('enable');
    try {
      await enablePushNotifications();
      setState('enabled');
      toast.success('এই ডিভাইসে নোটিফিকেশন চালু হয়েছে');
    } catch (error) {
      setState(await getPushAvailability().catch((): PushAvailability => 'unsupported'));
      toast.error(getErrorMessage(error, 'নোটিফিকেশন চালু করা যায়নি'));
    } finally { setWorking(null); }
  }

  async function disable() {
    setWorking('disable');
    try {
      const result = await disablePushNotifications();
      setState('disabled');
      toast.success(result.backendSynced
        ? 'এই ডিভাইসে নোটিফিকেশন বন্ধ হয়েছে'
        : 'এই ডিভাইসে বন্ধ হয়েছে। সার্ভারের তথ্য পরে পরিষ্কার হবে।');
    } catch (error) {
      toast.error(getErrorMessage(error, 'নোটিফিকেশন বন্ধ করা যায়নি'));
    } finally { setWorking(null); }
  }

  async function test() {
    setWorking('test');
    try {
      await testPushNotification();
      toast.success('টেস্ট নোটিফিকেশন পাঠানো হয়েছে');
    } catch (error) {
      toast.error(getErrorMessage(error, 'টেস্ট নোটিফিকেশন পাঠানো যায়নি'));
    } finally { setWorking(null); }
  }

  return <section className="rounded-2xl border bg-card p-6" aria-labelledby="push-notification-title">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          {state === 'enabled' ? <Bell size={20} /> : <BellOff size={20} />}
        </div>
        <div>
          <h2 id="push-notification-title" className="text-xl font-bold">ডিভাইস নোটিফিকেশন</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {state ? descriptions[state] : 'নোটিফিকেশনের অবস্থা দেখা হচ্ছে...'}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">প্রতিটি ব্রাউজার বা ফোনে আলাদাভাবে চালু করতে হবে।</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
        {state === 'disabled' && <Button onClick={() => void enable()} disabled={working !== null}>
          {working === 'enable' ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Bell size={16} className="mr-2" />}
          নোটিফিকেশন চালু করুন
        </Button>}
        {state === 'enabled' && <>
          <Button variant="outline" onClick={() => void test()} disabled={working !== null}>
            {working === 'test' ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Send size={16} className="mr-2" />}
            টেস্ট নোটিফিকেশন
          </Button>
          <Button variant="ghost" className="text-muted-foreground" onClick={() => void disable()} disabled={working !== null}>
            {working === 'disable' ? <Loader2 size={16} className="mr-2 animate-spin" /> : <BellOff size={16} className="mr-2" />}
            এই ডিভাইসে বন্ধ করুন
          </Button>
        </>}
      </div>
    </div>
  </section>;
}
