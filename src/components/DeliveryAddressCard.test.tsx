import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DeliveryAddressCard from './DeliveryAddressCard';
const mocks = vi.hoisted(() => ({ update: vi.fn(), rates: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'A', name: 'Alif', phoneNumber: null, deliveryAddress: 'Saved address', preferredDeliveryRateId: 'rate' }, updateProfile: mocks.update }) }));
vi.mock('@/lib/api', () => ({ getDeliveryRates: mocks.rates }));
describe('one saved delivery address', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.rates.mockResolvedValue([{ id: 'rate', name: 'Dhaka', isActive: true }]); mocks.update.mockResolvedValue(undefined); });
  it('opens with saved fields and saves an address even when the profile phone is absent', async () => {
    render(<DeliveryAddressCard />); fireEvent.click(screen.getByText('ঠিকানা আপডেট করুন'));
    const field = await screen.findByLabelText('সম্পূর্ণ ঠিকানা');
    expect(field).toHaveValue('Saved address');
    await waitFor(() => expect(screen.getByLabelText('ডেলিভারি এলাকা')).not.toBeDisabled());
    fireEvent.change(field, { target: { value: 'New address' } });
    fireEvent.click(screen.getByRole('button', { name: 'সেভ করুন' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith('Alif', null, { deliveryAddress: 'New address', preferredDeliveryRateId: 'rate' }));
  });
  it('closing performs no write', async () => {
    render(<DeliveryAddressCard />); fireEvent.click(screen.getByText('ঠিকানা আপডেট করুন'));
    fireEvent.click(await screen.findByRole('button', { name: 'বাতিল' })); expect(mocks.update).not.toHaveBeenCalled();
  });
  it('keeps edits and API errors inside the dialog', async () => {
    mocks.update.mockRejectedValue(new Error('save failed')); render(<DeliveryAddressCard />);
    fireEvent.click(screen.getByText('ঠিকানা আপডেট করুন'));
    await waitFor(() => expect(screen.getByLabelText('ডেলিভারি এলাকা')).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText('সম্পূর্ণ ঠিকানা'), { target: { value: 'New address' } });
    fireEvent.click(screen.getByRole('button', { name: 'সেভ করুন' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('save failed'); expect(screen.getByLabelText('সম্পূর্ণ ঠিকানা')).toHaveValue('New address');
  });
});
