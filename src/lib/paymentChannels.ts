import type { PaymentChannel } from '@/lib/types';

export const paymentChannels: Array<{ value: PaymentChannel; label: string }> = [
  { value: 'CASH', label: 'ক্যাশ' },
  { value: 'BKASH', label: 'বিকাশ' },
  { value: 'NAGAD', label: 'নগদ (অ্যাপ)' },
  { value: 'ROCKET', label: 'রকেট' },
  { value: 'BANK', label: 'ব্যাংক' },
];

export function paymentChannelLabel(channel: PaymentChannel | null | undefined) {
  return paymentChannels.find((item) => item.value === (channel ?? 'CASH'))?.label ?? 'ক্যাশ';
}
