import {
  getPushConfig,
  registerPushSubscription,
  removePushSubscription,
  sendTestPush,
} from '@/lib/api';

export type PushAvailability =
  | 'unsupported'
  | 'ios-install-required'
  | 'denied'
  | 'disabled'
  | 'enabled';

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function supportsPushNotifications() {
  return 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

export async function currentPushSubscription() {
  if (!supportsPushNotifications()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function getPushAvailability(): Promise<PushAvailability> {
  if (!supportsPushNotifications()) return 'unsupported';
  if (isIos() && !isStandalone()) return 'ios-install-required';
  if (Notification.permission === 'denied') return 'denied';
  return await currentPushSubscription() ? 'enabled' : 'disabled';
}

function applicationServerKey(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const bytes = window.atob(padded);
  return Uint8Array.from(bytes, character => character.charCodeAt(0));
}

function subscriptionInput(subscription: PushSubscription) {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error('Browser push subscription is incomplete.');
  }
  return {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  };
}

export async function enablePushNotifications() {
  if (!supportsPushNotifications()) throw new Error('এই ব্রাউজারে নোটিফিকেশন চালু করা যায় না।');
  if (isIos() && !isStandalone()) throw new Error('iPhone বা iPad-এ আগে অ্যাপটি Home Screen-এ অ্যাড করুন।');
  const permission = Notification.permission === 'default'
    ? await Notification.requestPermission()
    : Notification.permission;
  if (permission !== 'granted') throw new Error('ব্রাউজারে নোটিফিকেশন পারমিশন দেওয়া হয়নি।');

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey((await getPushConfig()).publicKey),
  });
  try {
    await registerPushSubscription(subscriptionInput(subscription));
  } catch (error) {
    if (!existing) await subscription.unsubscribe().catch(() => false);
    throw error;
  }
  return subscription;
}

export async function disablePushNotifications() {
  const subscription = await currentPushSubscription();
  if (!subscription) return { backendSynced: true };
  let backendSynced = true;
  try {
    await removePushSubscription(subscription.endpoint);
  } catch {
    backendSynced = false;
  }
  await subscription.unsubscribe();
  return { backendSynced };
}

export async function testPushNotification() {
  const subscription = await currentPushSubscription();
  if (!subscription) throw new Error('এই ডিভাইসে আগে নোটিফিকেশন চালু করুন।');
  const result = await sendTestPush(subscription.endpoint);
  if (result.sent !== 1) throw new Error('টেস্ট নোটিফিকেশন পাঠানো যায়নি। রিট্রাই করুন।');
  return result;
}
