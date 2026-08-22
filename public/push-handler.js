/* global self */

const DEFAULT_NOTIFICATION = {
  title: 'নাফাহ এগ্রো',
  body: 'নতুন তথ্য দেখতে অ্যাপটি খুলুন।',
  url: '/admin/dashboard',
};

self.addEventListener('push', event => {
  let payload = DEFAULT_NOTIFICATION;
  try {
    const received = event.data?.json();
    if (received && typeof received === 'object') {
      payload = {
        title: typeof received.title === 'string' ? received.title : DEFAULT_NOTIFICATION.title,
        body: typeof received.body === 'string' ? received.body : DEFAULT_NOTIFICATION.body,
        url: typeof received.url === 'string' && received.url.startsWith('/')
          ? received.url
          : DEFAULT_NOTIFICATION.url,
        tag: typeof received.tag === 'string' ? received.tag : undefined,
      };
    }
  } catch {
    payload = DEFAULT_NOTIFICATION;
  }

  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: payload.tag,
    data: { url: payload.url },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetPath = typeof event.notification.data?.url === 'string'
    ? event.notification.data.url
    : '/admin/dashboard';
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    const matchingClient = clients.find(client => client.url.startsWith(self.location.origin));
    if (matchingClient) {
      return matchingClient.navigate(targetUrl).then(client => client?.focus());
    }
    return self.clients.openWindow(targetUrl);
  }));
});
