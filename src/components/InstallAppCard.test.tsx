import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InstallAppCard from './InstallAppCard';

const mocks = vi.hoisted(() => ({
  pwa: { canInstall: true, isInstalled: false, isOffline: false, install: vi.fn() },
}));

vi.mock('@/contexts/PwaContext', () => ({ usePwa: () => mocks.pwa }));

describe('profile PWA installation card', () => {
  beforeEach(() => {
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

  it('renders as a separate profile settings card', () => {
    render(<InstallAppCard />);
    expect(screen.getByRole('heading', { name: 'অ্যাপ ইনস্টল' })).toBeInTheDocument();
    expect(screen.getByText(/এই ফোন বা কম্পিউটারে/)).toBeInTheDocument();
  });
});
