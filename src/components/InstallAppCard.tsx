import { useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePwa } from '@/contexts/PwaContext';

const DISMISSED_KEY = 'nafah_pwa_install_card_dismissed';

export default function InstallAppCard() {
  const { canInstall, install } = usePwa();
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISSED_KEY) === 'true');
  const [installing, setInstalling] = useState(false);

  if (!canInstall || dismissed) return null;

  const dismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  };

  const startInstall = async () => {
    setInstalling(true);
    try {
      await install();
    } finally {
      setInstalling(false);
    }
  };

  return (
    <section className="container mx-auto px-4 pt-6" aria-label="নাফাহ এগ্রো অ্যাপ ইনস্টল করুন">
      <div className="relative flex flex-col gap-4 rounded-xl border border-secondary/40 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <button
          type="button"
          aria-label="ইনস্টল বার্তা বন্ধ করুন"
          onClick={dismiss}
          className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
        >
          <X size={18} />
        </button>
        <div className="pr-9">
          <h2 className="font-bold">নাফাহ এগ্রো অ্যাপ হিসেবে ব্যবহার করুন</h2>
          <p className="mt-1 text-sm text-muted-foreground">দ্রুত খুলতে ফোন বা কম্পিউটারে অ্যাপটি ইনস্টল করুন।</p>
        </div>
        <Button className="min-h-11 shrink-0" onClick={() => void startInstall()} disabled={installing}>
          <Download size={17} className="mr-2" />{installing ? 'ইনস্টল হচ্ছে…' : 'অ্যাপ ইনস্টল করুন'}
        </Button>
      </div>
    </section>
  );
}
