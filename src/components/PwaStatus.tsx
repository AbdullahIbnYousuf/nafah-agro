import { RefreshCw, WifiOff, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';
import { usePwa } from '@/contexts/PwaContext';

export function OfflineNotice() {
  const { isOffline } = usePwa();
  if (!isOffline) return null;

  return (
    <div className="fixed inset-x-3 top-3 z-[100] mx-auto flex max-w-xl items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-50 p-3 text-amber-950 shadow-lg" role="status">
      <WifiOff size={18} className="mt-0.5 shrink-0" />
      <p className="text-sm"><strong>ইন্টারনেট কানেকশন নেই।</strong> লাইভ পণ্য, স্টক, অর্ডার ও বিক্রির কাজ করতে ইন্টারনেট লাগবে।</p>
    </div>
  );
}

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[100] mx-auto max-w-md rounded-xl border bg-card p-4 shadow-xl" role="alert">
      <button
        type="button"
        aria-label="আপডেট বার্তা বন্ধ করুন"
        onClick={() => setNeedRefresh(false)}
        className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
      >
        <X size={18} />
      </button>
      <div className="pr-10">
        <h2 className="font-bold">নতুন আপডেট প্রস্তুত</h2>
        <p className="mt-1 text-sm text-muted-foreground">চলমান কাজ শেষ করে নতুন সংস্করণটি চালু করুন।</p>
      </div>
      <Button className="mt-4 min-h-11 w-full" onClick={() => void updateServiceWorker(true)}>
        <RefreshCw size={16} className="mr-2" />এখন আপডেট করুন
      </Button>
    </div>
  );
}
