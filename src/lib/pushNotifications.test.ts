import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushAvailability,
  testPushNotification,
} from './pushNotifications';

const api = vi.hoisted(() => ({
  getConfig: vi.fn(),
  register: vi.fn(),
  remove: vi.fn(),
  sendTest: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  getPushConfig: api.getConfig,
  registerPushSubscription: api.register,
  removePushSubscription: api.remove,
  sendTestPush: api.sendTest,
}));

function browser(subscription: PushSubscription | null, permission: NotificationPermission = 'default') {
  const pushManager = {
    getSubscription: vi.fn(async () => subscription),
    subscribe: vi.fn(async () => subscription),
  };
  const ready = Promise.resolve({ pushManager });
  const requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready } });
  Object.defineProperty(window, 'PushManager', { configurable: true, value: class PushManager {} });
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: { permission, requestPermission },
  });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({ matches: false })),
  });
  return { pushManager, requestPermission };
}

describe('browser push helpers', () => {
  const subscription = {
    endpoint: 'https://push.example/device',
    toJSON: () => ({
      endpoint: 'https://push.example/device',
      keys: { p256dh: 'p256dh-key-value', auth: 'auth-key-value' },
    }),
    unsubscribe: vi.fn(async () => true),
  } as unknown as PushSubscription;

  beforeEach(() => {
    vi.clearAllMocks();
    api.getConfig.mockResolvedValue({ publicKey: 'AQID' });
    api.register.mockResolvedValue({ enabled: true });
    api.remove.mockResolvedValue({ enabled: false });
    api.sendTest.mockResolvedValue({ sent: 1, failed: 0, expired: 0, skipped: 0 });
  });

  it('requests permission only during enable and registers the browser subscription', async () => {
    const { requestPermission } = browser(subscription);
    expect(await getPushAvailability()).toBe('enabled');
    expect(requestPermission).not.toHaveBeenCalled();

    await enablePushNotifications();
    expect(requestPermission).toHaveBeenCalledOnce();
    expect(api.register).toHaveBeenCalledWith({
      endpoint: subscription.endpoint,
      keys: { p256dh: 'p256dh-key-value', auth: 'auth-key-value' },
    });
  });

  it('reports denied permission without attempting a subscription', async () => {
    const { pushManager } = browser(null, 'denied');
    expect(await getPushAvailability()).toBe('denied');
    await expect(enablePushNotifications()).rejects.toThrow('পারমিশন');
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('removes the server record before unsubscribing locally and can send a test', async () => {
    browser(subscription, 'granted');
    await testPushNotification();
    const result = await disablePushNotifications();

    expect(api.sendTest).toHaveBeenCalledWith(subscription.endpoint);
    expect(api.remove).toHaveBeenCalledWith(subscription.endpoint);
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
    expect(result.backendSynced).toBe(true);
  });
});
