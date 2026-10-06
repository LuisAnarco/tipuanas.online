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
 * Ícones da marca (traço, 24x24) no lugar de emoji. `icon('busca', 'w-5 h-5')`.
 * Decorativos (aria-hidden): o texto ao lado ou o aria-label do botão diz o que é.
 */
const ICONS = {
    busca: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    inicio: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
    pedidos: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    mural: '<path d="M4 20v-6a2 2 0 0 1 2-2h2"/><path d="M8 20V9l4-5 4 5v11"/><path d="M16 20v-6a2 2 0 0 1 2-2h2v8"/>',
    verificada: '<path d="M12 3 5 6v5c0 4.5 3 8.2 7 10 4-1.8 7-5.5 7-10V6l-7-3z"/><path d="m9 12 2 2 4-4"/>',
    entrega: '<circle cx="6" cy="17" r="2.5"/><circle cx="18" cy="17" r="2.5"/><path d="M8.5 17h7M4 13h6l2-5h3l3 6.5"/><path d="M14 8h2"/>',
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    local: '<path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    cupom: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    conversa: '<path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.1-4.6A8 8 0 1 1 21 12z"/>',
    compartilhar: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    loja: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a4 4 0 0 1 8 0v2"/>',
    baixar: '<path d="M12 3v12m-5-5 5 5 5-5"/><path d="M5 21h14"/>',
    voltar: '<path d="m15 6-6 6 6 6"/>',
    seguir: '<path d="m9 6 6 6-6 6"/>',
    fechar: '<path d="M18 6 6 18M6 6l12 12"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    menos: '<path d="M5 12h14"/>',
    todas: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
    comida: '<path d="M4 10a8 5 0 0 1 16 0z"/><path d="M3.5 13.5h17"/><path d="M5 17h14v1a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/>',
    mercado: '<circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/><path d="M3 4h2l2.5 11h11l2-8H6.5"/>',
    farmacia: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
    pet: '<circle cx="7" cy="9" r="1.8"/><circle cx="12" cy="6.5" r="1.8"/><circle cx="17" cy="9" r="1.8"/><path d="M8 17a4 4 0 0 1 8 0c0 2-2 3-4 3s-4-1-4-3z"/>',
    carro: '<path d="M4 16v-4l2-5h12l2 5v4z"/><circle cx="7.5" cy="16.5" r="1.5"/><circle cx="16.5" cy="16.5" r="1.5"/>',
    servico: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5z"/>',
    cafe: '<path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 9h2a2 2 0 0 1 0 4h-2"/><path d="M8 3v2M12 3v2"/>',
    bebida: '<path d="M6 4h12l-1.5 16h-9z"/><path d="M6.5 9h11"/>',
    beleza: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.1 8.1 20 20M8.1 15.9 20 4"/>',
    horti: '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19 13 11"/>',
    confirmado: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    cancelado: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
    lixeira: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    preparo: '<path d="M4 11h16v3a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6z"/><path d="M2 11h20"/><path d="M9 7c0-1.5 1-2 1-3.5M14 7c0-1.5 1-2 1-3.5"/>'
};

function icon(name, cls = 'w-5 h-5') {
    return `<svg class="${cls} shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.loja}</svg>`;
}

/** Troca os <span data-icon="nome" class="..."> do HTML estático pelo SVG */
function fillIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach(el => { el.outerHTML = icon(el.dataset.icon, el.className); });
}
document.addEventListener('DOMContentLoaded', () => fillIcons());

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

// ============================================================== PIX COPIA-E-COLA
// BR Code estático (padrão EMV do Banco Central) com a chave da loja e o valor exato do pedido.
// Gerado no navegador: o dinheiro vai direto para a conta da loja, sem intermediário.

function pixCrc16(text) {
    let crc = 0xFFFF;
    for (const byte of new TextEncoder().encode(text)) {
        crc ^= byte << 8;
        for (let i = 0; i < 8; i++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Texto em maiúsculas sem acento, só letras/números/espaço (exigência do padrão para nome e cidade) */
function pixText(value, max) {
    return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function pixPayload({ key, name, city, amount, txid }) {
    const f = (id, value) => id + String(value.length).padStart(2, '0') + value;
    const account = f('00', 'br.gov.bcb.pix') + f('01', String(key).trim());
    const ref = String(txid || '***').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
    const body = f('00', '01') + f('26', account) + f('52', '0000') + f('53', '986')
        + (amount > 0 ? f('54', Number(amount).toFixed(2)) : '')
        + f('58', 'BR') + f('59', pixText(name, 25) || 'LOJA') + f('60', pixText(city, 15) || 'BRASIL')
        + f('62', f('05', ref)) + '6304';
    return body + pixCrc16(body);
}

// PWA: registra o service worker (só em HTTPS — produção e previews da Vercel)
if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker não registrado:', err));
    });
}
