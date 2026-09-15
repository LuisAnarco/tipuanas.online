/**
 * ==============================================================================
 * PROJETO: AV. DAS TIPUANAS LOCAL
 * ARQUIVO: 05_merchant_order_management.js
 * DESCRIÇÃO: Identificação da loja (bootstrap + URL/localStorage) e gestão de
 *            pedidos em tempo real via Supabase, filtrada pela loja logada.
 * ==============================================================================
 */

// Configuração Oficial do Supabase
const SUPABASE_URL = 'https://uiroqxinszrhvyzuiqfu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpcm9xeGluc3pyaHZ5enVpcWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3MzEyNDYsImV4cCI6MjEwNDMwNzI0Nn0.suJIxTU26t8U7S6IRiNChZtfLyQzftOVF0sZe1c7x2k';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STORE_ID_KEY = 'tipuanas_store_id';
let currentStore = null;
let ordersChannel = null;

document.addEventListener('DOMContentLoaded', () => {
    initMerchantPanel();
});

/**
 * Descobre qual loja está acessando o painel: primeiro pela URL (?store=),
 * depois pelo que foi salvo no navegador. Se não achar nenhuma, mostra o
 * formulário de cadastro rápido.
 */
async function initMerchantPanel() {
    const urlParams = new URLSearchParams(window.location.search);
    let storeId = urlParams.get('store') || localStorage.getItem(STORE_ID_KEY);

    if (!storeId) {
        showBootstrap();
        return;
    }

    const { data: store, error } = await sb.from('stores').select('*').eq('id', storeId).single();

    if (error || !store) {
        console.error('Loja não encontrada:', error);
        localStorage.removeItem(STORE_ID_KEY);
        showBootstrap();
        return;
    }

    currentStore = store;
    localStorage.setItem(STORE_ID_KEY, store.id);

    // Garante que a URL sempre reflita a loja atual (facilita salvar/compartilhar o link)
    if (urlParams.get('store') !== store.id) {
        const newUrl = `${window.location.pathname}?store=${store.id}`;
        window.history.replaceState({}, '', newUrl);
    }

    showMerchantPanel(store);
    fetchOrders();
    subscribeToNewOrders();
}

function showBootstrap() {
    document.getElementById('bootstrap-section').classList.remove('hidden');
}

function showMerchantPanel(store) {
    document.getElementById('bootstrap-section').classList.add('hidden');
    document.getElementById('store-title').textContent = store.name;
    document.getElementById('merchant-nav').classList.remove('hidden');
    document.getElementById('merchant-nav').classList.add('flex');
    document.getElementById('nav-cardapio').href = `15_gerenciar_cardapio.html?store=${store.id}`;
    document.getElementById('quick-actions').classList.remove('hidden');
    document.getElementById('quick-actions').classList.add('grid');
    document.getElementById('orders-section').classList.remove('hidden');
    updatePauseUI(store.is_paused);
}

/**
 * Cria a loja a partir do formulário de cadastro rápido (bootstrap)
 */
async function criarLoja() {
    const name = document.getElementById('bs-name').value.trim();
    const category = document.getElementById('bs-category').value.trim();
    const whatsapp = document.getElementById('bs-whatsapp').value.trim().replace(/\D/g, '');
    const address = document.getElementById('bs-address').value.trim();
    const fee = parseFloat(document.getElementById('bs-fee').value) || 0;
    const errorEl = document.getElementById('bs-error');
    const submitBtn = document.getElementById('bs-submit');

    if (!name || !category || !whatsapp || !address) {
        errorEl.textContent = 'Preencha nome, categoria, WhatsApp e endereço.';
        errorEl.classList.remove('hidden');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Criando...';

    const slug = name.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') + '-' + Math.floor(Math.random() * 10000);

    const { data, error } = await sb.from('stores').insert([{
        name,
        slug,
        category,
        whatsapp_number: whatsapp,
        address_line: address,
        delivery_fee: fee,
        is_active: true,
        is_paused: false
    }]).select();

    if (error || !data || !data[0]) {
        console.error('Erro ao criar loja:', error);
        errorEl.textContent = 'Não foi possível criar a loja. Tente novamente em instantes.';
        errorEl.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Criar minha loja';
        return;
    }

    const store = data[0];
    localStorage.setItem(STORE_ID_KEY, store.id);

    const newUrl = `${window.location.pathname}?store=${store.id}`;
    window.history.replaceState({}, '', newUrl);

    const linkSection = document.getElementById('link-section');
    document.getElementById('store-link').textContent = window.location.href;
    linkSection.classList.remove('hidden');

    currentStore = store;
    showMerchantPanel(store);
    fetchOrders();
    subscribeToNewOrders();
}

/**
 * Alterna a loja entre aberta e pausada (para de aparecer na vitrine do cliente)
 */
async function togglePause() {
    if (!currentStore) return;
    const newPausedState = !currentStore.is_paused;

    const { error } = await sb
        .from('stores')
        .update({ is_paused: newPausedState })
        .eq('id', currentStore.id);

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

/**
 * Busca pedidos da loja atual no Supabase
 */
async function fetchOrders() {
    if (!currentStore) return;

    const { data: orders, error } = await sb
        .from('orders')
        .select('*')
        .eq('store_id', currentStore.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Erro ao buscar pedidos:', error);
        return;
    }

    renderOrders(orders);
    updateMetrics(orders);
}

/**
 * Renderiza a lista de pedidos no HTML
 */
function renderOrders(orders) {
    const listContainer = document.getElementById('orders-list');
    if (!orders || orders.length === 0) {
        listContainer.innerHTML = `<p class="text-sm text-gray-400 text-center py-8">Aguardando novos pedidos...</p>`;
        return;
    }

    listContainer.innerHTML = orders.map(order => `
        <div class="border border-gray-200 rounded-lg p-4 bg-gray-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <div class="flex items-center gap-2">
                    <span class="font-bold text-gray-900">#${order.id.slice(0, 8)}</span>
                    <span class="text-xs text-gray-500">• ${order.client_name}</span>
                    <span class="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded">${order.status}</span>
                </div>
                <p class="text-xs text-gray-600 mt-1">📍 ${order.client_address}</p>
                <p class="text-xs text-gray-500 mt-0.5">💳 ${order.payment_method} | PIN: <strong class="text-emerald-600">${order.delivery_pin}</strong></p>
            </div>
            <div class="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                <span class="font-bold text-gray-900 text-sm">R$ ${Number(order.total).toFixed(2)}</span>
                <select onchange="updateOrderStatus('${order.id}', this.value)" class="text-xs border border-gray-300 rounded p-1.5 bg-white">
                    <option value="PENDING" ${order.status === 'PENDING' ? 'selected' : ''}>Pendente</option>
                    <option value="ACCEPTED" ${order.status === 'ACCEPTED' ? 'selected' : ''}>Aceito</option>
                    <option value="PREPARING" ${order.status === 'PREPARING' ? 'selected' : ''}>Em Preparação (pronto p/ retirada)</option>
                    <option value="IN_TRANSIT" ${order.status === 'IN_TRANSIT' ? 'selected' : ''}>A Caminho</option>
                    <option value="COMPLETED" ${order.status === 'COMPLETED' ? 'selected' : ''}>Concluído</option>
                </select>
            </div>
        </div>
    `).join('');
}

/**
 * Atualiza o status de um pedido no banco de dados
 */
async function updateOrderStatus(orderId, newStatus) {
    const { error } = await sb
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);

    if (error) {
        alert('Erro ao atualizar status do pedido');
    } else {
        fetchOrders();
    }
}

/**
 * Atualiza os indicadores do topo do painel
 */
function updateMetrics(orders) {
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((acc, order) => acc + Number(order.total), 0);
    const pendingCount = orders.filter(o => o.status === 'PENDING').length;

    document.getElementById('total-orders-today').textContent = totalOrders;
    document.getElementById('total-revenue-today').textContent = `R$ ${totalRevenue.toFixed(2)}`;
    document.getElementById('pending-badge').textContent = `${pendingCount} Pendentes`;
}

/**
 * Escuta novos pedidos e mudanças, filtrando só os da loja atual
 */
function subscribeToNewOrders() {
    if (ordersChannel) {
        sb.removeChannel(ordersChannel);
    }

    ordersChannel = sb
        .channel(`public:orders:store:${currentStore.id}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `store_id=eq.${currentStore.id}`
        }, payload => {
            fetchOrders();
        })
        .subscribe();
}
