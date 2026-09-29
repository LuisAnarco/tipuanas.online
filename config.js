/**
 * ==============================================================================
 * PROJETO: TIPUANAS.ONLINE
 * ARQUIVO: config.js
 * DESCRIÇÃO: Configuração compartilhada por todas as telas — cliente Supabase
 *            e utilitários pequenos (escape de HTML, moeda, telefone).
 *            Carregar logo depois do supabase-js e antes do script da página.
 * ==============================================================================
 */

// Projeto real: avenidadastipuanas.online. A chave "anon" é pública por design;
// o que protege os dados são as políticas de RLS no Supabase.
const SUPABASE_URL = 'https://fdhnzdjxbztyomzhunxw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkaG56ZGp4Ynp0eW9temh1bnh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3MzU4MTQsImV4cCI6MjEwNDMxMTgxNH0.5HC_ZMgtXdQWbMrhw0jzMWcmYee902crA6rbl3F42aI';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Taxa fixa cobrada do lojista sobre pedidos entregues (a plataforma arca com as
// taxas de pagamento). Usada no painel do lojista, orçamentos e admin.
const PLATFORM_COMMISSION_RATE = 0.08;

// Contato da plataforma (privacidade, exclusão de dados, suporte). Trocar pelo número oficial.
const PLATFORM_CONTACT_WHATSAPP = '47999706651';

// Chave pública VAPID do push (a privada fica só no cofre do Supabase)
const VAPID_PUBLIC_KEY = 'BHms9KxbQqVS1ctLRBMQQNNorjHE203JtAKQaDBWTOfSvlrFss4thUoacv-O9KybxYnrJ2f0_y0kWubJfYi95S0';

/**
 * Escapa texto vindo do banco antes de montar HTML com template string.
 * Qualquer campo digitado por usuário (nome de loja, produto, post do mural...)
 * precisa passar por aqui, senão vira brecha de XSS.
 */
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function formatBRL(value) {
    return `R$ ${Number(value || 0).toFixed(2).replace(".", ",")}`;
}

/**
 * Reduz a imagem no navegador (JPEG, lado maior até maxSide) e envia para o
 * Storage na pasta da loja (product-images/<store_id>/...). Devolve a URL pública.
 * O banco só aceita o envio de quem é dono da loja (ou admin).
 */
async function uploadImage(storeId, file, maxSide = 900) {
    if (!file) return null;
    if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.');

    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));

    const path = `${storeId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await sb.storage.from('product-images').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    return sb.storage.from('product-images').getPublicUrl(path).data.publicUrl;
}

/** Só dígitos, com DDI 55 na frente (formato que o wa.me espera). */
function toWhatsappNumber(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    if (!digits) return '';
    return digits.startsWith('55') && digits.length > 11 ? digits : `55${digits}`;
}

/**
 * Horário de funcionamento (stores.opening_hours) — mesma regra da função
 * store_is_open do banco: {"0": "HH:MM-HH:MM", ...} (0 = domingo), no fuso de
 * Brasília; sem horário configurado = sempre aberta; faixa pode virar a noite.
 * Retorna { open, label } — label explica quando abre, se estiver fechada.
 */
const WEEKDAYS_PT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function storeOpenStatus(hours, now = new Date()) {
    if (!hours || Object.keys(hours).length === 0) return { open: true, label: '' };

    // "Agora" no fuso de Brasília, independente do fuso do aparelho
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(now).map(p => [p.type, p.value]));
    const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
    const minutes = Number(parts.hour) * 60 + Number(parts.minute);

    const range = day => {
        const v = hours[String(day)];
        const m = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(v || '');
        if (!m) return null;
        return { start: +m[1] * 60 + +m[2], end: +m[3] * 60 + +m[4], text: v.split('-')[0] };
    };

    const today = range(dow);
    if (today) {
        if (today.start <= today.end ? (minutes >= today.start && minutes < today.end) : minutes >= today.start) {
            return { open: true, label: '' };
        }
    }
    const prev = range((dow + 6) % 7);
    if (prev && prev.start > prev.end && minutes < prev.end) return { open: true, label: '' };

    // Próxima abertura (hoje mais tarde ou nos próximos dias)
    if (today && today.start > minutes && today.start !== today.end) return { open: false, label: `abre hoje às ${today.text}` };
    for (let i = 1; i <= 7; i++) {
        const r = range((dow + i) % 7);
        if (r && r.start !== r.end) {
            return { open: false, label: `abre ${i === 1 ? 'amanhã' : WEEKDAYS_PT[(dow + i) % 7]} às ${r.text}` };
        }
    }
    return { open: false, label: 'sem horário de abertura' };
}

// ============================================================== ENTREGA POR DISTÂNCIA
// Mesma conta do banco (delivery_quote): linha reta entre loja e cliente, taxa base cobre
// os primeiros km, depois R$ por km, arredondando para cima de R$ 0,50 em R$ 0,50.

function distanceKm(lat1, lng1, lat2, lng2) {
    const rad = x => x * Math.PI / 180;
    const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
    return Math.round(6371 * 2 * Math.asin(Math.sqrt(a)) * 10) / 10;
}

/**
 * Regra de entrega da loja: quem entrega decide (stores.delivery_type).
 * 'plataforma' → regra do admin (tabela platform_delivery); 'propria' → colunas da loja.
 * Devolve { base, incl, perKm, radius } — perKm null = taxa fixa. Espelha delivery_quote do banco.
 */
function deliveryRules(store, platform) {
    if (store.delivery_type === 'plataforma' && platform) {
        if (store.lat === null || store.lat === undefined) return { base: Number(platform.base_fee), incl: 0, perKm: null, radius: null };
        return { base: Number(platform.base_fee), incl: Number(platform.km_included), perKm: Number(platform.fee_per_km), radius: Number(platform.radius_km) };
    }
    const byKm = store.delivery_fee_per_km !== null && store.delivery_fee_per_km !== undefined && store.lat !== null && store.lat !== undefined;
    return {
        base: Number(store.delivery_fee || 0),
        incl: Number(store.delivery_km_included || 0),
        perKm: byKm ? Number(store.delivery_fee_per_km) : null,
        radius: store.delivery_radius_km === null || store.delivery_radius_km === undefined ? null : Number(store.delivery_radius_km)
    };
}

function feeForDistance(rules, km) {
    if (rules.perKm === null) return rules.base;
    return Math.ceil((rules.base + rules.perKm * Math.max(0, km - rules.incl)) * 2) / 2;
}

/** Texto curto da taxa para cartões da vitrine */
function deliveryFeeLabel(store, platform) {
    const rules = deliveryRules(store, platform);
    if (rules.perKm !== null) {
        const min = feeForDistance(rules, 0);
        return `${min > 0 ? `Entrega a partir de ${formatBRL(min)}` : 'Entrega grátis perto'} · até ${String(rules.radius).replace('.', ',')} km`;
    }
    return rules.base > 0 ? `Entrega ${formatBRL(rules.base)}` : 'Entrega grátis';
}

/** Localização do aparelho (pede permissão). Resolve { lat, lng } ou null. */
function getDevicePosition() {
    return new Promise(resolve => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
            pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
        );
    });
}

/**
 * Procura um endereço no OpenStreetMap (Nominatim, gratuito). `near` ({lat,lng}) restringe a
 * busca a ~20 km dali, para "Av. das Tipuanas, 150" achar a rua certa. Resolve {lat,lng} ou null.
 */
async function geocodeAddress(query, near) {
    const params = new URLSearchParams({ format: 'json', limit: '1', countrycodes: 'br', q: query });
    if (near) {
        const d = 0.2;
        params.set('viewbox', [near.lng - d, near.lat + d, near.lng + d, near.lat - d].join(','));
        params.set('bounded', '1');
    }
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { 'Accept-Language': 'pt-BR' } });
        const data = await res.json();
        return data && data[0] ? { lat: Number(data[0].lat), lng: Number(data[0].lon) } : null;
    } catch (e) {
        console.warn('Busca de endereço indisponível:', e);
        return null;
    }
}

// PWA: registra o service worker (só em HTTPS — produção e previews da Vercel)
if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker não registrado:', err));
    });
}
