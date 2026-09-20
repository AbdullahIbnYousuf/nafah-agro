import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineNotice, PwaUpdatePrompt } from './PwaStatus';

const mocks = vi.hoisted(() => ({
  pwa: { isOffline: false },
  setNeedRefresh: vi.fn(),
  updateServiceWorker: vi.fn(),
}));

vi.mock('@/contexts/PwaContext', () => ({ usePwa: () => mocks.pwa }));
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [true, mocks.setNeedRefresh],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: mocks.updateServiceWorker,
  }),
}));

describe('PWA status notices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pwa.isOffline = false;
    mocks.updateServiceWorker.mockResolvedValue(undefined);
  });

  it('shows the safe offline limitation only while disconnected', () => {
    const { rerender } = render(<OfflineNotice />);
    expect(screen.queryByText('ইন্টারনেট কানেকশন নেই।')).not.toBeInTheDocument();
    mocks.pwa.isOffline = true;
    rerender(<OfflineNotice />);
    expect(screen.getByText('ইন্টারনেট কানেকশন নেই।')).toBeInTheDocument();
    expect(screen.getByText(/স্টক, অর্ডার ও বিক্রির কাজ করতে ইন্টারনেট লাগবে/)).toBeInTheDocument();
  });

  it('requires an explicit action before activating a waiting update', () => {
    render(<PwaUpdatePrompt />);
    expect(mocks.updateServiceWorker).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'এখন আপডেট করুন' }));
    expect(mocks.updateServiceWorker).toHaveBeenCalledWith(true);
  });
});
