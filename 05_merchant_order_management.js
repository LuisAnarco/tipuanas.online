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
let currentUser = null;
let currentStore = null;
let ordersChannel = null;
const notifier = typeof MerchantNotificationService === 'function' ? new MerchantNotificationService() : null;

document.addEventListener('DOMContentLoaded', () => {
    initMerchantPanel();
});

/**
 * Exige login e descobre qual loja o lojista gerencia (ver resolveMerchantStore
 * em auth.js). Se a conta ainda não tem loja, mostra o cadastro rápido.
 */
async function initMerchantPanel() {
    currentUser = await requireLogin({
        title: 'Painel do Lojista',
        subtitle: 'Entre com o seu e-mail para ver os pedidos e gerenciar sua loja.'
    });

    const { store, message } = await resolveMerchantStore(currentUser);

    if (!store) {
        showBootstrap(message);
        return;
    }

    // Lojas do tipo "orçamento" não usam cardápio/carrinho — têm painel próprio
    if (store.listing_type === 'orcamento') {
        window.location.href = `17_gerenciar_orcamentos.html?store=${store.id}`;
        return;
    }

    currentStore = store;
    const urlParams = new URLSearchParams(window.location.search);

    // Garante que a URL sempre reflita a loja atual (facilita salvar/compartilhar o link)
    if (urlParams.get('store') !== store.id) {
        const newUrl = `${window.location.pathname}?store=${store.id}`;
        window.history.replaceState({}, '', newUrl);
    }

    showMerchantPanel(store);
    fetchOrders();
    subscribeToNewOrders();
}

function showBootstrap(message) {
    document.getElementById('bootstrap-section').classList.remove('hidden');
    if (message) {
        const errorEl = document.getElementById('bs-error');
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }
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
    document.getElementById('nav-store-page').href = `loja.html?slug=${encodeURIComponent(store.slug || '')}`;
    document.getElementById('nav-qr').href = `13_printable_table_qr.html?slug=${encodeURIComponent(store.slug || '')}`;
    document.getElementById('quick-actions').classList.remove('hidden');
    document.getElementById('quick-actions').classList.add('grid');
    document.getElementById('repasse-section').classList.remove('hidden');
    document.getElementById('orders-section').classList.remove('hidden');
    updatePauseUI(store.is_paused);
    loadReviews(store.id);
    renderStoreSettings(document.getElementById('store-settings'), store, {
        onSaved: saved => {
            document.getElementById('store-title').textContent = saved.name;
            // Virou loja de serviços: o painel certo é o de orçamentos
            if (saved.listing_type === 'orcamento') {
                window.location.href = `17_gerenciar_orcamentos.html?store=${saved.id}`;
            }
        }
    });
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
        owner_id: currentUser.id,
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
        const clientWhatsapp = toWhatsappNumber(addr.client_phone);
        const createdAt = new Date(order.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const isNew = order.status === 'novo';

        return `
        <div class="border ${isNew ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-gray-50'} rounded-lg p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                    <span class="font-bold text-gray-900">#${order.id.slice(0, 8)}</span>
                    <span class="text-xs text-gray-500">• ${escapeHtml(addr.client_name || 'Cliente')}</span>
                    <span class="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded">${STATUS_LABELS[order.status] || escapeHtml(order.status)}</span>
                    <span class="text-[10px] text-gray-400">${createdAt}</span>
                </div>
                ${itemsList ? `<p class="text-xs text-gray-700 mt-1">🛒 ${escapeHtml(itemsList)}</p>` : ''}
                <p class="text-xs text-gray-600 mt-1">📍 ${order.is_takeout ? 'Retirada no local' : escapeHtml(addr.address || 'Endereço não informado')}</p>
                ${addr.notes ? `<p class="text-xs text-gray-600 mt-0.5">📝 ${escapeHtml(addr.notes)}</p>` : ''}
                <p class="text-xs text-gray-500 mt-0.5">💳 ${escapeHtml(addr.payment_method || '—')} | PIN: <strong class="text-emerald-600">${escapeHtml(order.delivery_pin || '----')}</strong></p>
                ${clientWhatsapp ? `<a href="https://wa.me/${clientWhatsapp}" target="_blank" rel="noopener" class="inline-block text-[11px] text-emerald-700 hover:underline mt-1">💬 Falar com o cliente (${escapeHtml(addr.client_phone)})</a>` : ''}
            </div>
            <div class="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end shrink-0">
                <span class="font-bold text-gray-900 text-sm">${formatBRL(order.total_amount)}</span>
                <select onchange="updateOrderStatus('${order.id}', this.value)" class="text-xs border border-gray-300 rounded p-1.5 bg-white">
                    <option value="novo" ${order.status === 'novo' ? 'selected' : ''}>Pendente</option>
                    <option value="em_preparacao" ${order.status === 'em_preparacao' ? 'selected' : ''}>Em Preparação</option>
                    <option value="pronto" ${order.status === 'pronto' ? 'selected' : ''}>${order.is_takeout ? 'Pronto p/ Cliente Retirar' : 'Pronto p/ Retirada (entregador)'}</option>
                    ${order.is_takeout ? '' : `<option value="em_rota" ${order.status === 'em_rota' ? 'selected' : ''}>A Caminho</option>`}
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
    if (newStatus === 'cancelado' && !confirm('Cancelar este pedido? Avise o cliente pelo WhatsApp.')) {
        fetchOrders();
        return;
    }

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
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    // "Hoje" = pedidos criados desde a meia-noite, sem contar cancelados
    const todayOrders = orders.filter(o => new Date(o.created_at) >= startOfToday && o.status !== 'cancelado');
    const totalOrders = todayOrders.length;
    const totalRevenue = todayOrders.reduce((acc, order) => acc + Number(order.total_amount), 0);
    const pendingCount = orders.filter(o => o.status === 'novo').length;

    document.getElementById('total-orders-today').textContent = totalOrders;
    document.getElementById('total-revenue-today').textContent = formatBRL(totalRevenue);
    document.getElementById('pending-badge').textContent = `${pendingCount} Pendentes`;

    updateRepasse(orders);
}

/**
 * Calcula e exibe o repasse da loja: faturamento dos pedidos já concluídos,
 * menos a comissão da plataforma. Pedidos pendentes/cancelados não entram na conta
 * ainda (só quando o pedido realmente é entregue é que a comissão é devida).
 */
/**
 * Nota média e últimos comentários deixados pelos clientes após a entrega
 */
async function loadReviews(storeId) {
    const { data: reviews, error } = await sb
        .from('reviews')
        .select('rating, comment, created_at')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Erro ao buscar avaliações:', error);
        return;
    }

    const section = document.getElementById('reviews-section');
    section.classList.remove('hidden');

    if (!reviews || reviews.length === 0) {
        document.getElementById('reviews-average').textContent = '';
        document.getElementById('reviews-list').innerHTML = '<p class="text-gray-400">Nenhuma avaliação ainda. Elas aparecem aqui quando o cliente avalia um pedido entregue.</p>';
        return;
    }

    const avg = reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length;
    document.getElementById('reviews-average').textContent = `★ ${avg.toFixed(1).replace('.', ',')} (${reviews.length})`;
    document.getElementById('reviews-list').innerHTML = reviews.slice(0, 5).map(r => `
        <div class="border-b border-gray-100 last:border-none pb-2">
            <span class="text-amber-500">${'★'.repeat(r.rating)}<span class="text-gray-300">${'★'.repeat(5 - r.rating)}</span></span>
            <span class="text-[10px] text-gray-400 ml-1">${new Date(r.created_at).toLocaleDateString('pt-BR')}</span>
            ${r.comment ? `<p class="mt-0.5">${escapeHtml(r.comment)}</p>` : ''}
        </div>
    `).join('');
}

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
 * Botão "Ativar alertas": som + notificação do navegador a cada pedido novo.
 * Precisa de clique porque o navegador bloqueia áudio/permissão automáticos.
 */
async function ativarAlertas() {
    if (!notifier) return;
    await notifier.enable();
    notifier.playNotificationSound();
    const btn = document.getElementById('alerts-btn');
    btn.textContent = notifier.hasPermission ? '🔔 Alertas ativos' : '🔔 Som ativo';
    btn.disabled = true;
    btn.classList.add('opacity-70');
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
            if (payload.eventType === 'INSERT' && notifier) notifier.notifyNewOrder(payload.new);
            fetchOrders();
        })
        .subscribe();
}
