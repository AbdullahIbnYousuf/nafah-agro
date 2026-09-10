import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePwa } from '@/contexts/PwaContext';

export default function InstallAppCard() {
  const { canInstall, install } = usePwa();
  const [installing, setInstalling] = useState(false);

  if (!canInstall) return null;

  const startInstall = async () => {
    setInstalling(true);
    try {
      await install();
    } finally {
      setInstalling(false);
    }
  };

  return (
    <section className="rounded-2xl border bg-card p-6" aria-labelledby="install-app-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Download size={20} />
          </div>
          <div>
            <h2 id="install-app-title" className="text-xl font-bold">অ্যাপ ইনস্টল</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              দ্রুত খুলতে এই ফোন বা কম্পিউটারে নাফাহ এগ্রো অ্যাপটি ইনস্টল করুন।
            </p>
          </div>
        </div>
        <Button className="min-h-11 shrink-0 sm:self-start" onClick={() => void startInstall()} disabled={installing}>
          <Download size={17} className="mr-2" />{installing ? 'ইনস্টল হচ্ছে…' : 'অ্যাপ ইনস্টল করুন'}
        </Button>
      </div>
    </section>
  );
}
