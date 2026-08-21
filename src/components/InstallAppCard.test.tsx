import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InstallAppCard from './InstallAppCard';

const mocks = vi.hoisted(() => ({
  pwa: { canInstall: true, isInstalled: false, isOffline: false, install: vi.fn() },
}));

vi.mock('@/contexts/PwaContext', () => ({ usePwa: () => mocks.pwa }));

describe('homepage PWA installation card', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.pwa.canInstall = true;
    mocks.pwa.install.mockReset();
    mocks.pwa.install.mockResolvedValue('accepted');
  });

  it('shows only when installable and invokes the shared Chrome prompt', async () => {
    const { rerender } = render(<InstallAppCard />);
    fireEvent.click(screen.getByRole('button', { name: 'অ্যাপ ইনস্টল করুন' }));
    await waitFor(() => expect(mocks.pwa.install).toHaveBeenCalledOnce());

    mocks.pwa.canInstall = false;
    rerender(<InstallAppCard />);
    expect(screen.queryByRole('button', { name: 'অ্যাপ ইনস্টল করুন' })).not.toBeInTheDocument();
  });

  it('keeps an explicitly dismissed homepage card hidden for the browser session', () => {
    const first = render(<InstallAppCard />);
    fireEvent.click(screen.getByRole('button', { name: 'ইনস্টল বার্তা বন্ধ করুন' }));
    expect(screen.queryByRole('button', { name: 'অ্যাপ ইনস্টল করুন' })).not.toBeInTheDocument();
    expect(mocks.pwa.install).not.toHaveBeenCalled();

    first.unmount();
    render(<InstallAppCard />);
    expect(screen.queryByRole('button', { name: 'অ্যাপ ইনস্টল করুন' })).not.toBeInTheDocument();
  });
});
