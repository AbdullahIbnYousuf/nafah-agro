import type { FormEventHandler, ReactNode } from 'react';
import { RefreshCw, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export const filterSelectClassName = 'h-11 w-full rounded-md border border-input bg-background px-3 text-sm md:h-10';

export function FilterPanel({
  children,
  actions,
  className,
  title = 'ফিল্টার',
}: {
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <section aria-label={title} className={cn('rounded-xl border bg-card p-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <SlidersHorizontal size={17} />
          {title}
        </h2>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function FilterFields({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-3 sm:grid-cols-2', className)}>{children}</div>;
}

export function FilterField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function FilterResetButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  if (!active) return null;
  return (
    <Button type="button" variant="outline" className="border-amber-500 bg-amber-50 text-amber-950 hover:bg-amber-100" onClick={onClick}>
      <RotateCcw size={15} />
      ফিল্টার রিসেট
    </Button>
  );
}

export function FilterRefreshButton({ onClick, loading = false }: { onClick: () => void; loading?: boolean }) {
  return (
    <Button type="button" variant="outline" onClick={onClick} disabled={loading}>
      <RefreshCw size={15} className={loading ? 'animate-spin' : undefined} />
      রিফ্রেশ
    </Button>
  );
}

export function FilterForm({
  children,
  id,
  className,
  onSubmit,
}: {
  children: ReactNode;
  id?: string;
  className?: string;
  onSubmit?: FormEventHandler<HTMLFormElement>;
}) {
  return <form id={id} className={className} onSubmit={onSubmit}>{children}</form>;
}
