import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getVariantOption, getVariantOptions } from '@/lib/api';
import type { VariantOption, VariantOptionContext } from '@/lib/types';
import { productPackLabel } from '@/lib/productOptions';
import { formatQuantity } from '@/lib/quantity';
import { cn, getErrorMessage } from '@/lib/utils';

function variantOptionLabel(option: VariantOption) {
  return option.productKind === 'PACKAGED'
    ? productPackLabel(option.productName, option.variantName)
    : option.productName;
}

interface VariantOptionComboboxProps {
  context: VariantOptionContext;
  selected?: VariantOption | null;
  selectedId?: string;
  onSelect: (option: VariantOption) => void;
  disabledReason?: (option: VariantOption) => string | undefined;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
}

export default function VariantOptionCombobox({
  context,
  selected,
  selectedId,
  onSelect,
  disabledReason,
  placeholder = 'পণ্যের নাম বা প্যাক/সাইজ লিখুন',
  ariaLabel,
  className,
}: VariantOptionComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<VariantOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const onSelectRef = useRef(onSelect);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    if (!selectedId || selected?.productVariantId === selectedId) return;
    const controller = new AbortController();
    void getVariantOption(selectedId, context, controller.signal)
      .then((option) => onSelectRef.current(option))
      .catch((value) => {
        if (value && typeof value === 'object' && 'code' in value && value.code === 'REQUEST_CANCELLED') return;
        setError(getErrorMessage(value, 'সিলেক্ট করা পণ্যটি লোড হয়নি।'));
      });
    return () => controller.abort();
  }, [context, selected?.productVariantId, selectedId]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      void getVariantOptions({ context, q: query, limit: 10 }, controller.signal)
        .then(setOptions)
        .catch((value) => {
          if (value && typeof value === 'object' && 'code' in value && value.code === 'REQUEST_CANCELLED') return;
          setOptions([]);
          setError(getErrorMessage(value, 'পণ্যের তালিকা লোড হয়নি।'));
        })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [context, open, query, retryKey]);

  const selectedLabel = useMemo(() => selected ? variantOptionLabel(selected) : '', [selected]);

  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(''); }}>
    <PopoverTrigger asChild>
      <Button
        type="button"
        variant="outline"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        className={cn('h-auto min-h-11 w-full justify-between gap-3 px-3 py-2 text-left font-normal', className)}
      >
        <span className="min-w-0 flex-1">
          {selected
            ? <><span className="block truncate font-medium text-foreground">{selectedLabel}</span><span className="block text-xs text-muted-foreground">স্টক {formatQuantity(selected.availableStock, selected.quantityUnit, selected.productKind)}</span></>
            : <span className="text-muted-foreground">{placeholder}</span>}
        </span>
        <ChevronsUpDown className="shrink-0 text-muted-foreground" size={16} />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
      <Command shouldFilter={false} label={`${ariaLabel} সার্চ`}>
        <CommandInput value={query} onValueChange={setQuery} placeholder={placeholder} aria-label={`${ariaLabel} সার্চ`} />
        <CommandList>
          {loading && <div role="status" className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" />পণ্য লোড হচ্ছে...</div>}
          {!loading && error && <div className="space-y-2 px-3 py-4 text-center"><p role="alert" className="text-sm text-destructive">{error}</p><Button type="button" size="sm" variant="outline" onClick={() => setRetryKey((value) => value + 1)}><RotateCw size={14} />রিট্রাই করুন</Button></div>}
          {!loading && !error && options.length === 0 && <CommandEmpty>এমন কোনো পণ্য পাওয়া যায়নি।</CommandEmpty>}
          {!loading && !error && options.length > 0 && <CommandGroup>
            {options.map((option) => {
              const reason = disabledReason?.(option);
              const isSelected = selected?.productVariantId === option.productVariantId;
              return <CommandItem
                key={option.productVariantId}
                value={option.productVariantId}
                disabled={Boolean(reason)}
                onSelect={() => {
                  onSelect(option);
                  setOpen(false);
                  setQuery('');
                }}
                className={cn('min-h-14 gap-2', reason && 'cursor-not-allowed opacity-60 data-[disabled=true]:pointer-events-auto')}
              >
                <Check size={15} className={cn('shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
                <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{variantOptionLabel(option)}</strong><span className={cn('block text-xs', reason ? 'text-destructive' : 'text-muted-foreground')}>{reason ?? `স্টক ${formatQuantity(option.availableStock, option.quantityUnit, option.productKind)}`}</span></span>
              </CommandItem>;
            })}
          </CommandGroup>}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}
