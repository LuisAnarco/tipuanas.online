/**
 * ==============================================================================
 * PROJETO: TIPUANAS.ONLINE
 * ARQUIVO: 05_merchant_order_management.js
 * DESCRIÇÃO: Identificação da loja (bootstrap + URL/localStorage) e gestão de
 *            pedidos em tempo real via Supabase, filtrada pela loja logada.
 *            Usa o banco avançado "avenidadastipuanas.online" (multi-loja,
 *            estoque, corridas expressas) — ver comentários de mapeamento
 *            de status abaixo.
 * ==============================================================================
 */

// Configuração Oficial do Supabase (projeto real: avenidadastipuanas.online)
const SUPABASE_URL = 'https://fdhnzdjxbztyomzhunxw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkaG56ZGp4Ynp0eW9temh1bnh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3MzU4MTQsImV4cCI6MjEwNDMxMTgxNH0.5HC_ZMgtXdQWbMrhw0jzMWcmYee902crA6rbl3F42aI';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Mapa de status do pedido (enum order_status do banco) -> rótulo em português
const STATUS_LABELS = {
    novo: 'Pendente',
    em_preparacao: 'Em Preparação',
    pronto: 'Pronto p/ Retirada',
    em_rota: 'A Caminho',
    entregue: 'Concluído',
    cancelado: 'Cancelado'
};

// Categorias sugeridas por tipo de negócio, pra guiar o cadastro sem travar a lista.
const CATEGORY_OPTIONS = {
    catalogo: ['Alimentação', 'Brinquedos', 'Ferramentas', 'Variedades', 'Outro (comércio)'],
    orcamento: ['Serviços Gerais', 'Transporte e Logística (Táxi/Frete)', 'Imóveis (Venda/Aluguel)', 'Outro (serviço)']
};

const STORE_ID_KEY = 'tipuanas_store_id';
// Mesma taxa usada no painel admin (14_admin_analytics_dashboard.html). Ainda não há
// coluna de comissão personalizada por loja no banco — é fixa em 8% pra todo mundo
// (taxa fixada pro lojista; a plataforma arca com as taxas de pagamento do próprio bolso).
const PLATFORM_COMMISSION_RATE = 0.08;
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

    // Lojas do tipo "orçamento" não usam cardápio/carrinho — têm painel próprio
    if (store.listing_type === 'orcamento') {
        localStorage.setItem(STORE_ID_KEY, store.id);
        window.location.href = `17_gerenciar_orcamentos.html?store=${store.id}`;
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
    atualizarCategorias();
}

/**
 * Repopula o <select> de categoria de acordo com o tipo de negócio escolhido
 * (comércio = catalogo, serviços = orcamento). Preserva a seleção quando possível.
 */
function atualizarCategorias() {
    const listingTypeInput = document.querySelector('input[name="bs-listing-type"]:checked');
    const listingType = listingTypeInput ? listingTypeInput.value : 'catalogo';
    const select = document.getElementById('bs-category');
    const previous = select.value;
    const options = CATEGORY_OPTIONS[listingType] || CATEGORY_OPTIONS.catalogo;

    select.innerHTML = options.map(opt => `<option value="${opt}">${opt}</option>`).join('');
    if (options.includes(previous)) select.value = previous;

    // Taxa de entrega só faz sentido pra comércio com carrinho; serviços cobram/combinam à parte
    document.getElementById('bs-fee-wrap').classList.toggle('hidden', listingType === 'orcamento');

    alternarCategoriaOutro();
}

function alternarCategoriaOutro() {
    const select = document.getElementById('bs-category');
    const isOutro = select.value.startsWith('Outro');
    document.getElementById('bs-category-other-wrap').classList.toggle('hidden', !isOutro);
}

function showMerchantPanel(store) {
    document.getElementById('bootstrap-section').classList.add('hidden');
    document.getElementById('store-title').textContent = store.name;
    document.getElementById('merchant-nav').classList.remove('hidden');
    document.getElementById('merchant-nav').classList.add('flex');
    document.getElementById('nav-cardapio').href = `15_gerenciar_cardapio.html?store=${store.id}`;
    document.getElementById('quick-actions').classList.remove('hidden');
    document.getElementById('quick-actions').classList.add('grid');
    document.getElementById('repasse-section').classList.remove('hidden');
    document.getElementById('orders-section').classList.remove('hidden');
    updatePauseUI(store.is_paused);
}

/**
 * Cria a loja a partir do formulário de cadastro rápido (bootstrap)
 */
async function criarLoja() {
    const name = document.getElementById('bs-name').value.trim();
    const categorySelect = document.getElementById('bs-category').value.trim();
    const categoryOther = document.getElementById('bs-category-other').value.trim();
    const category = categorySelect.startsWith('Outro') && categoryOther ? categoryOther : categorySelect;
    const whatsapp = document.getElementById('bs-whatsapp').value.trim().replace(/\D/g, '');
    const address = document.getElementById('bs-address').value.trim();
    const fee = parseFloat(document.getElementById('bs-fee').value) || 0;
    const description = document.getElementById('bs-description').value.trim();
    const listingTypeInput = document.querySelector('input[name="bs-listing-type"]:checked');
    const listingType = listingTypeInput ? listingTypeInput.value : 'catalogo';
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
        description: description || null,
        listing_type: listingType,
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

    // Loja tipo "orçamento" tem painel próprio (sem cardápio/pedidos com carrinho)
    if (store.listing_type === 'orcamento') {
        window.location.href = `17_gerenciar_orcamentos.html?store=${store.id}`;
        return;
    }

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
 * Busca pedidos da loja atual no Supabase, já trazendo os itens de cada pedido
 */
async function fetchOrders() {
    if (!currentStore) return;

    const { data: orders, error } = await sb
        .from('orders')
        .select('*, order_items(quantity, unit_price, products(name))')
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

    listContainer.innerHTML = orders.map(order => {
        const addr = order.delivery_address || {};
        const itemsList = (order.order_items || [])
            .map(it => `${it.quantity}x ${it.products ? it.products.name : 'Item'}`)
            .join(', ');

        return `
        <div class="border border-gray-200 rounded-lg p-4 bg-gray-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <div class="flex items-center gap-2">
                    <span class="font-bold text-gray-900">#${order.id.slice(0, 8)}</span>
                    <span class="text-xs text-gray-500">• ${addr.client_name || 'Cliente'}</span>
                    <span class="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded">${STATUS_LABELS[order.status] || order.status}</span>
                </div>
                ${itemsList ? `<p class="text-xs text-gray-700 mt-1">🛒 ${itemsList}</p>` : ''}
                <p class="text-xs text-gray-600 mt-1">📍 ${order.is_takeout ? 'Retirada no local' : (addr.address || 'Endereço não informado')}</p>
                <p class="text-xs text-gray-500 mt-0.5">💳 ${addr.payment_method || '—'} | PIN: <strong class="text-emerald-600">${order.delivery_pin || '----'}</strong></p>
            </div>
            <div class="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                <span class="font-bold text-gray-900 text-sm">R$ ${Number(order.total_amount).toFixed(2)}</span>
                <select onchange="updateOrderStatus('${order.id}', this.value)" class="text-xs border border-gray-300 rounded p-1.5 bg-white">
                    <option value="novo" ${order.status === 'novo' ? 'selected' : ''}>Pendente</option>
                    <option value="em_preparacao" ${order.status === 'em_preparacao' ? 'selected' : ''}>Em Preparação</option>
                    <option value="pronto" ${order.status === 'pronto' ? 'selected' : ''}>Pronto p/ Retirada (entregador)</option>
                    <option value="em_rota" ${order.status === 'em_rota' ? 'selected' : ''}>A Caminho</option>
                    <option value="entregue" ${order.status === 'entregue' ? 'selected' : ''}>Concluído</option>
                    <option value="cancelado" ${order.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
                </select>
            </div>
        </div>
    `;
    }).join('');
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
    const totalRevenue = orders.reduce((acc, order) => acc + Number(order.total_amount), 0);
    const pendingCount = orders.filter(o => o.status === 'novo').length;

    document.getElementById('total-orders-today').textContent = totalOrders;
    document.getElementById('total-revenue-today').textContent = `R$ ${totalRevenue.toFixed(2)}`;
    document.getElementById('pending-badge').textContent = `${pendingCount} Pendentes`;

    updateRepasse(orders);
}

/**
 * Calcula e exibe o repasse da loja: faturamento dos pedidos já concluídos,
 * menos a comissão da plataforma. Pedidos pendentes/cancelados não entram na conta
 * ainda (só quando o pedido realmente é entregue é que a comissão é devida).
 */
function updateRepasse(orders) {
    const completed = orders.filter(o => o.status === 'entregue');
    const gross = completed.reduce((acc, o) => acc + Number(o.total_amount), 0);
    const commission = gross * PLATFORM_COMMISSION_RATE;
    const net = gross - commission;

    document.getElementById('repasse-orders-count').textContent = completed.length;
    document.getElementById('repasse-gross').textContent = `R$ ${gross.toFixed(2)}`;
    document.getElementById('repasse-commission').textContent = `R$ ${commission.toFixed(2)}`;
    document.getElementById('repasse-net').textContent = `R$ ${net.toFixed(2)}`;
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
