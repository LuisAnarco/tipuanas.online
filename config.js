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
