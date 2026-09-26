/**
 * Service worker do Tipuanas.online (PWA).
 * - Arquivos do próprio site: rede primeiro; sem conexão, usa a última cópia.
 * - Supabase (dados, login) e CDNs: sempre direto da rede, nunca em cache —
 *   pedidos e status precisam estar sempre atualizados.
 * Troque CACHE_VERSION para forçar a limpeza do cache antigo.
 */
const CACHE_VERSION = 'tipuanas-v1';
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
