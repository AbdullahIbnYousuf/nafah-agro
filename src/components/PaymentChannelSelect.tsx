import type { PaymentChannel } from '@/lib/types';
import { paymentChannels } from '@/lib/paymentChannels';

export function PaymentChannelSelect({ value, onChange, disabled = false, label = 'টাকা নেওয়ার মাধ্যম' }: {
  value: PaymentChannel;
  onChange: (value: PaymentChannel) => void;
  disabled?: boolean;
  label?: string;
}) {
  return <label className="block text-sm">
    <span className="mb-1 block font-medium">{label}</span>
    <select aria-label={label} className="h-11 w-full rounded-md border bg-background px-3 md:h-10" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as PaymentChannel)}>
      {paymentChannels.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
    </select>
  </label>;
}
