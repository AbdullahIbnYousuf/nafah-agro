import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PushNotificationCard from './PushNotificationCard';

const mocks = vi.hoisted(() => ({
  getState: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
  test: vi.fn(),
}));

vi.mock('@/lib/pushNotifications', () => ({
  getPushAvailability: mocks.getState,
  enablePushNotifications: mocks.enable,
  disablePushNotifications: mocks.disable,
  testPushNotification: mocks.test,
}));

describe('OWNER device notification controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getState.mockResolvedValue('disabled');
    mocks.enable.mockResolvedValue({ endpoint: 'https://push.example/device' });
    mocks.disable.mockResolvedValue({ backendSynced: true });
    mocks.test.mockResolvedValue({ sent: 1 });
  });

  it('enables notifications only after the owner clicks the action', async () => {
    render(<PushNotificationCard />);
    expect(await screen.findByRole('button', { name: 'নোটিফিকেশন চালু করুন' })).toBeInTheDocument();
    expect(mocks.enable).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'নোটিফিকেশন চালু করুন' }));
    await waitFor(() => expect(mocks.enable).toHaveBeenCalledOnce());
    expect(await screen.findByRole('button', { name: 'টেস্ট নোটিফিকেশন' })).toBeInTheDocument();
  });

  it('tests and disables an enabled device independently', async () => {
    mocks.getState.mockResolvedValue('enabled');
    render(<PushNotificationCard />);

    fireEvent.click(await screen.findByRole('button', { name: 'টেস্ট নোটিফিকেশন' }));
    await waitFor(() => expect(mocks.test).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'এই ডিভাইসে বন্ধ করুন' }));
    await waitFor(() => expect(mocks.disable).toHaveBeenCalledOnce());
    expect(await screen.findByRole('button', { name: 'নোটিফিকেশন চালু করুন' })).toBeInTheDocument();
  });

  it('explains denied and iPhone installation states without showing a fake action', async () => {
    mocks.getState.mockResolvedValue('ios-install-required');
    const { unmount } = render(<PushNotificationCard />);
    expect(await screen.findByText(/Add to Home Screen/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'নোটিফিকেশন চালু করুন' })).not.toBeInTheDocument();
    unmount();

    mocks.getState.mockResolvedValue('denied');
    render(<PushNotificationCard />);
    expect(await screen.findByText(/ব্রাউজার সেটিংসে/)).toBeInTheDocument();
  });
});
