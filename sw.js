/**
 * Service worker do Tipuanas.online (PWA).
 * - Arquivos do próprio site: rede primeiro; sem conexão, usa a última cópia.
 * - Supabase (dados, login) e CDNs: sempre direto da rede, nunca em cache —
 *   pedidos e status precisam estar sempre atualizados.
 * - Push: mostra o aviso de pedido novo do lojista e abre o painel ao tocar.
 * Troque CACHE_VERSION para forçar a limpeza do cache antigo.
 */
const CACHE_VERSION = 'tipuanas-v2';
const PRECACHE = [
    './', 'index.html', 'loja.html', 'pedidos.html', '10_checkout_whatsapp_flow.html',
    '11_order_tracking_realtime.html', 'config.js', '09_multistore_cart.js',
    '07_client_pwa_manifest.json', 'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;

    event.respondWith(
        fetch(request)
            .then(response => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
                }
                return response;
            })
            .catch(() => caches.match(request, { ignoreSearch: request.mode === 'navigate' })
                .then(cached => cached || caches.match('index.html')))
    );
});

self.addEventListener('push', event => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data && event.data.text() }; }
    event.waitUntil(self.registration.showNotification(data.title || '🛎️ Novo pedido', {
        body: data.body || 'Abra o painel para ver.',
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: data.tag,
        renotify: true,
        requireInteraction: true,
        data: { url: data.url || '04_merchant_portal.html' }
    }));
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const target = new URL(event.notification.data && event.notification.data.url || '04_merchant_portal.html', self.location.origin).href;
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
            const open = list.find(c => c.url.split('?')[0] === target.split('?')[0]);
            return open ? open.focus() : self.clients.openWindow(target);
        })
    );
});
