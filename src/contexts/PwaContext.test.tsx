import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaProvider, usePwa } from './PwaContext';

function Probe() {
  const pwa = usePwa();
  return (
    <div>
      <span>{pwa.canInstall ? 'install-ready' : 'install-hidden'}</span>
      <span>{pwa.isInstalled ? 'installed' : 'not-installed'}</span>
      <span>{pwa.isOffline ? 'offline' : 'online'}</span>
      <button type="button" onClick={() => void pwa.install()}>install</button>
    </div>
  );
}

function installEvent(outcome: 'accepted' | 'dismissed') {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = new Event('beforeinstallprompt', { cancelable: true });
  Object.assign(event, {
    prompt,
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
  });
  return { event, prompt };
}

describe('PWA installation state', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
  });

  it('captures Chrome installation, invokes the native prompt, and never invents availability', async () => {
    render(<PwaProvider><Probe /></PwaProvider>);
    expect(screen.getByText('install-hidden')).toBeInTheDocument();

    const { event, prompt } = installEvent('dismissed');
    act(() => window.dispatchEvent(event));
    expect(screen.getByText('install-ready')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'install' }));
    await waitFor(() => expect(prompt).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByText('install-hidden')).toBeInTheDocument());
    expect(screen.getByText('not-installed')).toBeInTheDocument();
  });

  it('hides installation after appinstalled and tracks connection changes', () => {
    render(<PwaProvider><Probe /></PwaProvider>);
    const { event } = installEvent('accepted');
    act(() => window.dispatchEvent(event));
    expect(screen.getByText('install-ready')).toBeInTheDocument();

    act(() => window.dispatchEvent(new Event('appinstalled')));
    expect(screen.getByText('install-hidden')).toBeInTheDocument();
    expect(screen.getByText('installed')).toBeInTheDocument();

    act(() => window.dispatchEvent(new Event('offline')));
    expect(screen.getByText('offline')).toBeInTheDocument();
    act(() => window.dispatchEvent(new Event('online')));
    expect(screen.getByText('online')).toBeInTheDocument();
  });

  it('starts installed and never offers installation in standalone mode', () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    render(<PwaProvider><Probe /></PwaProvider>);
    const { event } = installEvent('accepted');
    act(() => window.dispatchEvent(event));
    expect(screen.getByText('installed')).toBeInTheDocument();
    expect(screen.getByText('install-hidden')).toBeInTheDocument();
  });
});
