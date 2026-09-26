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
    return `R$ ${Number(value || 0).toFixed(2)}`;
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

// PWA: registra o service worker (só em HTTPS — produção e previews da Vercel)
if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker não registrado:', err));
    });
}
