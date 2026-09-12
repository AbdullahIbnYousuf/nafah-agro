import * as React from 'react';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateInputValue } from '@/lib/date';

type FormattedDateInputProps = Omit<React.ComponentProps<'input'>, 'type'>;

const FormattedDateInput = React.forwardRef<HTMLInputElement, FormattedDateInputProps>(
  ({ className, value, disabled, placeholder = 'DD/MM/YYYY', onClick, ...props }, forwardedRef) => {
    const inputRef = React.useRef<HTMLInputElement>(null);

    React.useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement);

    function openPicker(event: React.MouseEvent<HTMLInputElement>) {
      onClick?.(event);
      if (disabled || event.defaultPrevented) return;
      try {
        inputRef.current?.showPicker?.();
      } catch {
        // The normal native input click still opens the picker where showPicker is unavailable.
      }
    }

    const displayValue = formatDateInputValue(value);

    return (
      <div className={cn(
        'relative rounded-md ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
        className,
      )}>
        <input
          {...props}
          ref={inputRef}
          type="date"
          value={value}
          disabled={disabled}
          onClick={openPicker}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none flex h-11 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-left text-base md:h-10 md:text-sm',
            disabled && 'opacity-50',
            props['aria-invalid'] && 'border-destructive',
          )}
        >
          <span className={displayValue ? 'text-foreground' : 'text-muted-foreground'}>
            {displayValue || placeholder}
          </span>
          <CalendarDays className="ml-2 shrink-0 text-muted-foreground" size={17} aria-hidden="true" />
        </div>
      </div>
    );
  },
);

FormattedDateInput.displayName = 'FormattedDateInput';

export { FormattedDateInput };
