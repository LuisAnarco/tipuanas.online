/**
 * ==============================================================================
 * PROJETO: TIPUANAS.ONLINE
 * ARQUIVO: 17_gerenciar_orcamentos.js
 * DESCRIÇÃO: Painel do lojista para lojas listing_type = 'orcamento'
 *            (prestadores de serviço que precisam avaliar antes de precificar,
 *            ex: mecânica, chapeação). Fluxo: solicitado -> visita_agendada ->
 *            proposta_enviada -> aceito/rejeitado -> pago -> em_andamento -> concluido.
 * ==============================================================================
 */

const SUPABASE_URL = 'https://fdhnzdjxbztyomzhunxw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkaG56ZGp4Ynp0eW9temh1bnh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3MzU4MTQsImV4cCI6MjEwNDMxMTgxNH0.5HC_ZMgtXdQWbMrhw0jzMWcmYee902crA6rbl3F42aI';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STATUS_LABELS = {
    solicitado: 'Novo Pedido',
    visita_agendada: 'Visita Agendada',
    proposta_enviada: 'Aguardando Cliente',
    aceito: 'Proposta Aceita',
    rejeitado: 'Rejeitado',
    pago: 'Pago',
    em_andamento: 'Em Andamento',
    concluido: 'Concluído',
    cancelado: 'Cancelado'
};

const STORE_ID_KEY = 'tipuanas_store_id';
// Mesma taxa fixa usada no resto da plataforma (05_merchant_order_management.js, 14_admin_analytics_dashboard.html)
const PLATFORM_COMMISSION_RATE = 0.08;
let currentStore = null;
let requestsChannel = null;

document.addEventListener('DOMContentLoaded', () => {
    initPanel();
});

async function initPanel() {
    const urlParams = new URLSearchParams(window.location.search);
    const storeId = urlParams.get('store') || localStorage.getItem(STORE_ID_KEY);

    if (!storeId) {
        document.getElementById('no-store-section').classList.remove('hidden');
        return;
    }

    const { data: store, error } = await sb.from('stores').select('*').eq('id', storeId).single();

    if (error || !store) {
        console.error('Loja não encontrada:', error);
        document.getElementById('no-store-section').classList.remove('hidden');
        return;
    }

    // Se por algum motivo uma loja tipo "catálogo" cair aqui, manda pro painel certo
    if (store.listing_type !== 'orcamento') {
        window.location.href = `04_merchant_portal.html?store=${store.id}`;
        return;
    }

    currentStore = store;
    localStorage.setItem(STORE_ID_KEY, store.id);

    if (urlParams.get('store') !== store.id) {
        window.history.replaceState({}, '', `${window.location.pathname}?store=${store.id}`);
    }

    document.getElementById('store-title').textContent = store.name;
    document.getElementById('repasse-section').classList.remove('hidden');
    document.getElementById('requests-section').classList.remove('hidden');
    updatePauseUI(store.is_paused);

    fetchRequests();
    subscribeToRequests();
}

async function togglePause() {
    if (!currentStore) return;
    const newPausedState = !currentStore.is_paused;

    const { error } = await sb.from('stores').update({ is_paused: newPausedState }).eq('id', currentStore.id);
    if (error) {
        alert('Não foi possível atualizar o status da loja.');
        console.error(error);
        return;
    }

    currentStore.is_paused = newPausedState;
    updatePauseUI(newPausedState);
}

function updatePauseUI(isPaused) {
    const statusEl = document.getElementById('store-status');
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    const btn = document.getElementById('toggle-pause-btn');

    statusEl.classList.remove('hidden');
    statusEl.classList.add('flex');

    if (isPaused) {
        dot.classList.remove('bg-emerald-500');
        dot.classList.add('bg-amber-500');
        text.textContent = 'Loja Pausada';
        btn.textContent = 'Reabrir Loja';
        btn.classList.remove('bg-amber-500', 'hover:bg-amber-600');
        btn.classList.add('bg-emerald-600', 'hover:bg-emerald-700');
    } else {
        dot.classList.remove('bg-amber-500');
        dot.classList.add('bg-emerald-500');
        text.textContent = 'Loja Aberta';
        btn.textContent = 'Pausar';
        btn.classList.remove('bg-emerald-600', 'hover:bg-emerald-700');
        btn.classList.add('bg-amber-500', 'hover:bg-amber-600');
    }
}

async function fetchRequests() {
    if (!currentStore) return;

    const { data: requests, error } = await sb
        .from('service_requests')
        .select('*')
        .eq('store_id', currentStore.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Erro ao buscar solicitações:', error);
        return;
    }

    renderRequests(requests || []);
    updateRepasse(requests || []);

    const pendingCount = (requests || []).filter(r => r.status === 'solicitado').length;
    document.getElementById('pending-badge').textContent = `${pendingCount} Novas`;
}

function renderRequests(requests) {
    const listContainer = document.getElementById('requests-list');
    if (requests.length === 0) {
        listContainer.innerHTML = `<p class="text-sm text-gray-400 text-center py-8">Aguardando novas solicitações...</p>`;
        return;
    }

    listContainer.innerHTML = requests.map(req => `
        <div class="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <span class="font-bold text-gray-900">${req.client_name}</span>
                    <span class="text-xs text-gray-500">• ${formatWhatsapp(req.client_whatsapp)}</span>
                </div>
                <span class="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded">${STATUS_LABELS[req.status] || req.status}</span>
            </div>
            <p class="text-xs text-gray-700">📝 ${req.necessity_description}</p>
            <a href="https://wa.me/55${req.client_whatsapp}" target="_blank" class="inline-block text-[11px] text-emerald-600 hover:underline">Chamar no WhatsApp →</a>

            ${renderActionArea(req)}
        </div>
    `).join('');
}

function renderActionArea(req) {
    if (req.status === 'solicitado') {
        return `
            <div class="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                <p class="text-xs font-bold text-gray-600">Agendar visita técnica</p>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input id="visit-dt-${req.id}" type="datetime-local" class="text-xs p-2 rounded border border-gray-300">
                    <select id="visit-mode-${req.id}" class="text-xs p-2 rounded border border-gray-300">
                        <option value="prestador_vai_ate_cliente">Eu vou até o cliente</option>
                        <option value="cliente_leva_ao_prestador">Cliente vem até mim</option>
                    </select>
                </div>
                <button onclick="agendarVisita('${req.id}')" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-lg">
                    Agendar Visita
                </button>
            </div>
        `;
    }

    if (req.status === 'visita_agendada') {
        const modeLabel = req.visit_mode === 'cliente_leva_ao_prestador' ? 'Cliente vem até você' : 'Você vai até o cliente';
        return `
            <div class="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                <p class="text-xs text-gray-600">📅 Visita: <strong>${new Date(req.visit_scheduled_for).toLocaleString('pt-BR')}</strong> — ${modeLabel}</p>
                <p class="text-xs font-bold text-gray-600">Enviar proposta</p>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <input id="proposal-amount-${req.id}" type="number" min="0" step="0.01" placeholder="Valor (R$)" class="text-xs p-2 rounded border border-gray-300 md:col-span-1">
                    <input id="proposal-desc-${req.id}" type="text" placeholder="O que será feito, prazo etc." class="text-xs p-2 rounded border border-gray-300 md:col-span-2">
                </div>
                <button onclick="enviarProposta('${req.id}')" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-lg">
                    Enviar Proposta
                </button>
            </div>
        `;
    }

    if (req.status === 'proposta_enviada') {
        return `<p class="text-xs text-amber-600">💰 Proposta de R$ ${Number(req.proposal_amount).toFixed(2)} enviada. Aguardando resposta do cliente.</p>`;
    }

    if (req.status === 'aceito') {
        return `
            <div class="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                <p class="text-xs text-gray-600">✅ Cliente aceitou a proposta de R$ ${Number(req.proposal_amount).toFixed(2)}. Combine o pagamento e confirme abaixo.</p>
                <button onclick="confirmarPagamento('${req.id}', ${req.proposal_amount})" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-lg">
                    Confirmar Pagamento Recebido
                </button>
            </div>
        `;
    }

    if (req.status === 'rejeitado') {
        return `<p class="text-xs text-red-600">❌ O cliente rejeitou esta proposta.</p>`;
    }

    if (req.status === 'pago' || req.status === 'em_andamento') {
        return `
            <div class="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                <p class="text-xs text-gray-600">💳 Pago em ${new Date(req.paid_at).toLocaleString('pt-BR')}. Comissão da plataforma: R$ ${Number(req.platform_commission).toFixed(2)}.</p>
                <div class="flex gap-2">
                    <input id="update-note-${req.id}" type="text" placeholder="Ex: Peça encomendada, chega em 2 dias" class="flex-1 text-xs p-2 rounded border border-gray-300">
                    <button onclick="adicionarEtapa('${req.id}')" class="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-bold px-3 py-2 rounded-lg">
                        Adicionar Etapa
                    </button>
                </div>
                ${req.status === 'pago'
                    ? `<button onclick="atualizarStatus('${req.id}', 'em_andamento')" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-lg">Iniciar Serviço</button>`
                    : `<button onclick="atualizarStatus('${req.id}', 'concluido')" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-lg">Concluir Serviço</button>`
                }
            </div>
        `;
    }

    if (req.status === 'concluido') {
        return `<p class="text-xs text-emerald-600">🎉 Serviço concluído.</p>`;
    }

    return '';
}

function formatWhatsapp(number) {
    return number || '—';
}

async function agendarVisita(requestId) {
    const dt = document.getElementById(`visit-dt-${requestId}`).value;
    const mode = document.getElementById(`visit-mode-${requestId}`).value;

    if (!dt) {
        alert('Escolha a data e hora da visita.');
        return;
    }

    const { error } = await sb.from('service_requests').update({
        status: 'visita_agendada',
        visit_scheduled_for: new Date(dt).toISOString(),
        visit_mode: mode
    }).eq('id', requestId);

    if (error) {
        alert('Não foi possível agendar a visita.');
        console.error(error);
    } else {
        fetchRequests();
    }
}

async function enviarProposta(requestId) {
    const amount = parseFloat(document.getElementById(`proposal-amount-${requestId}`).value);
    const description = document.getElementById(`proposal-desc-${requestId}`).value.trim();

    if (!amount || amount <= 0) {
        alert('Informe um valor válido para a proposta.');
        return;
    }

    const { data, error } = await sb.from('service_requests').update({
        status: 'proposta_enviada',
        proposal_amount: amount,
        proposal_description: description,
        proposal_sent_at: new Date().toISOString()
    }).eq('id', requestId).select();

    if (error || !data || !data[0]) {
        alert('Não foi possível enviar a proposta.');
        console.error(error);
        return;
    }

    const req = data[0];
    const msg = encodeURIComponent(`Olá, ${req.client_name}! Sua proposta de orçamento em Tipuanas.online já está disponível: R$ ${Number(req.proposal_amount).toFixed(2)}.\n\nVeja os detalhes e responda aqui: ${window.location.origin}${window.location.pathname.replace('17_gerenciar_orcamentos.html', '19_acompanhar_orcamento.html')}?id=${req.id}`);
    window.open(`https://wa.me/55${req.client_whatsapp}?text=${msg}`, '_blank');

    fetchRequests();
}

async function confirmarPagamento(requestId, proposalAmount) {
    const commission = Number(proposalAmount) * PLATFORM_COMMISSION_RATE;

    const { error } = await sb.from('service_requests').update({
        status: 'pago',
        paid_at: new Date().toISOString(),
        platform_commission: commission
    }).eq('id', requestId);

    if (error) {
        alert('Não foi possível confirmar o pagamento.');
        console.error(error);
    } else {
        fetchRequests();
    }
}

async function atualizarStatus(requestId, newStatus) {
    const { error } = await sb.from('service_requests').update({ status: newStatus }).eq('id', requestId);
    if (error) {
        alert('Não foi possível atualizar o status.');
        console.error(error);
    } else {
        fetchRequests();
    }
}

async function adicionarEtapa(requestId) {
    const input = document.getElementById(`update-note-${requestId}`);
    const note = input.value.trim();
    if (!note) return;

    const { error } = await sb.from('service_updates').insert([{ service_request_id: requestId, note }]);
    if (error) {
        alert('Não foi possível registrar a etapa.');
        console.error(error);
    } else {
        input.value = '';
    }
}

/**
 * Calcula e exibe o repasse: faturamento dos orçamentos já pagos, menos a comissão da plataforma.
 */
function updateRepasse(requests) {
    const paid = requests.filter(r => ['pago', 'em_andamento', 'concluido'].includes(r.status));
    const gross = paid.reduce((acc, r) => acc + Number(r.proposal_amount || 0), 0);
    const commission = gross * PLATFORM_COMMISSION_RATE;
    const net = gross - commission;

    document.getElementById('repasse-count').textContent = paid.length;
    document.getElementById('repasse-gross').textContent = `R$ ${gross.toFixed(2)}`;
    document.getElementById('repasse-commission').textContent = `R$ ${commission.toFixed(2)}`;
    document.getElementById('repasse-net').textContent = `R$ ${net.toFixed(2)}`;
}

function subscribeToRequests() {
    if (requestsChannel) {
        sb.removeChannel(requestsChannel);
    }

    requestsChannel = sb
        .channel(`public:service_requests:store:${currentStore.id}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'service_requests',
            filter: `store_id=eq.${currentStore.id}`
        }, () => fetchRequests())
        .subscribe();
}
