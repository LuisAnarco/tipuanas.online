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
    initCoupons(store.id);
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

// ---------------------------------------------------------------- Cupons
let couponsStoreId = null;

function initCoupons(storeId) {
    couponsStoreId = storeId;
    document.getElementById('coupons-section').classList.remove('hidden');
    const form = document.getElementById('coupon-form');
    if (!form.dataset.bound) {
        form.dataset.bound = '1';
        form.addEventListener('submit', criarCupom);
        document.getElementById('coupons-list').addEventListener('click', event => {
            const btn = event.target.closest('[data-toggle-coupon]');
            if (btn) alternarCupom(btn.dataset.toggleCoupon, btn.dataset.active === 'true');
            const pub = event.target.closest('[data-toggle-public]');
            if (pub) alternarCupomPublico(pub.dataset.togglePublic, pub.dataset.public === 'true');
        });
    }
    loadCoupons();
}

async function loadCoupons() {
    const { data, error } = await sb.from('coupons').select('*').eq('store_id', couponsStoreId).order('created_at', { ascending: false });
    const list = document.getElementById('coupons-list');
    if (error) {
        console.error('Erro ao buscar cupons:', error);
        list.innerHTML = '<p class="text-red-600">Não foi possível carregar os cupons.</p>';
        return;
    }
    if (!data || data.length === 0) {
        list.innerHTML = '<p class="text-gray-400">Nenhum cupom criado ainda.</p>';
        return;
    }
    list.innerHTML = data.map(c => `
        <div class="flex flex-wrap justify-between items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 ${c.is_active ? '' : 'opacity-50'}">
            <div>
                <span class="font-mono font-bold text-gray-900">${escapeHtml(c.code)}</span>
                <span class="text-gray-600"> • ${c.discount_type === 'percentage' ? `${Number(c.discount_value)}% de desconto` : `${formatBRL(c.discount_value)} de desconto`}</span>
                ${Number(c.min_order_value) > 0 ? `<span class="text-gray-400"> • mínimo ${formatBRL(c.min_order_value)}</span>` : ''}
                ${c.is_public ? '<span class="text-emerald-700 font-bold"> • 📣 na vitrine</span>' : ''}
            </div>
            <div class="flex gap-1.5">
            <button data-toggle-public="${escapeHtml(c.id)}" data-public="${Boolean(c.is_public)}" class="border border-gray-300 rounded px-2 py-0.5 hover:bg-gray-50">${c.is_public ? 'Tirar da vitrine' : 'Mostrar na vitrine'}</button>
            <button data-toggle-coupon="${escapeHtml(c.id)}" data-active="${c.is_active}" class="border border-gray-300 rounded px-2 py-0.5 hover:bg-gray-50">${c.is_active ? 'Desativar' : 'Ativar'}</button>
            </div>
        </div>
    `).join('');
}

async function criarCupom(event) {
    event.preventDefault();
    const form = event.target;
    const errorEl = document.getElementById('coupon-error');
    const data = Object.fromEntries(new FormData(form).entries());
    const code = String(data.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const value = Number(data.discount_value);
    const min = Number(data.min_order_value || 0);

    const fail = msg => { errorEl.textContent = msg; errorEl.classList.remove('hidden'); };
    if (code.length < 3 || code.length > 20) return fail('O código precisa ter de 3 a 20 letras ou números, sem espaços.');
    if (!(value > 0) || (data.discount_type === 'percentage' && value > 100)) return fail('Valor de desconto inválido (porcentagem até 100).');
    errorEl.classList.add('hidden');

    const { error } = await sb.from('coupons').insert([{
        store_id: couponsStoreId, code, discount_type: data.discount_type, discount_value: value, min_order_value: min, is_active: true,
        is_public: data.is_public === 'on'
    }]);
    if (error) {
        console.error('Erro ao criar cupom:', error);
        return fail(error.code === '23505' ? 'Esse código já existe na plataforma. Escolha outro.' : 'Não foi possível criar o cupom.');
    }
    form.reset();
    loadCoupons();
}

async function alternarCupom(couponId, isActive) {
    const { error } = await sb.from('coupons').update({ is_active: !isActive }).eq('id', couponId);
    if (error) {
        alert('Não foi possível atualizar o cupom.');
        console.error(error);
        return;
    }
    loadCoupons();
}

async function alternarCupomPublico(couponId, isPublic) {
    const { error } = await sb.from('coupons').update({ is_public: !isPublic }).eq('id', couponId);
    if (error) {
        alert('Não foi possível atualizar o cupom.');
        console.error(error);
        return;
    }
    loadCoupons();
}

// ---------------------------------------------------------------- Extrato do mês
let extratoOrders = [];

function monthKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
    const [y, m] = key.split('-').map(Number);
    const label = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function initExtrato() {
    const select = document.getElementById('extrato-month');
    if (select.dataset.bound) return;
    select.dataset.bound = '1';
    const now = new Date();
    const keys = [];
    for (let i = 0; i < 12; i++) keys.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
    select.innerHTML = keys.map(k => `<option value="${k}">${monthLabel(k)}</option>`).join('');
    select.addEventListener('change', () => updateRepasse(extratoOrders));
    document.getElementById('extrato-csv').addEventListener('click', exportExtratoCsv);
}

/** Números do mês escolhido: entregues, cancelados, taxas, descontos, comissão e líquido */
function extratoResumo(orders, key) {
    const inMonth = orders.filter(o => monthKey(o.created_at) === key);
    const delivered = inMonth.filter(o => o.status === 'entregue');
    const sum = (list, field) => list.reduce((acc, o) => acc + Number(o[field] || 0), 0);
    const gross = sum(delivered, 'total_amount');
    const commission = Math.round(gross * PLATFORM_COMMISSION_RATE * 100) / 100;
    const products = {};
    delivered.forEach(o => (o.order_items || []).forEach(it => {
        const name = it.products ? it.products.name : 'Item';
        products[name] = (products[name] || 0) + Number(it.quantity || 0);
    }));
    return {
        inMonth, delivered,
        cancelled: inMonth.filter(o => o.status === 'cancelado').length,
        gross, commission, net: gross - commission,
        fees: sum(delivered, 'delivery_fee'),
        discounts: sum(delivered, 'discount_amount'),
        top: Object.entries(products).sort((a, b) => b[1] - a[1]).slice(0, 3)
    };
}

function updateRepasse(orders) {
    extratoOrders = orders || [];
    initExtrato();
    const r = extratoResumo(extratoOrders, document.getElementById('extrato-month').value);

    document.getElementById('repasse-orders-count').textContent = r.delivered.length;
    document.getElementById('extrato-cancelled').textContent = `${r.cancelled} cancelado${r.cancelled === 1 ? '' : 's'}`;
    document.getElementById('repasse-gross').textContent = formatBRL(r.gross);
    document.getElementById('extrato-ticket').textContent = `ticket médio ${formatBRL(r.delivered.length ? r.gross / r.delivered.length : 0)}`;
    document.getElementById('repasse-commission').textContent = formatBRL(r.commission);
    document.getElementById('extrato-fees').textContent = formatBRL(r.fees);
    document.getElementById('extrato-discounts').textContent = formatBRL(r.discounts);
    document.getElementById('repasse-net').textContent = formatBRL(r.net);
    document.getElementById('extrato-top').innerHTML = r.top.length
        ? `🏆 Mais vendidos: ${r.top.map(([name, qty]) => `${escapeHtml(name)} (${qty})`).join(' · ')}`
        : '';
}

/** Planilha do mês (abre no Excel/Google Planilhas): um pedido por linha */
function exportExtratoCsv() {
    const key = document.getElementById('extrato-month').value;
    const r = extratoResumo(extratoOrders, key);
    const cell = v => {
        const text = String(v == null ? '' : v);
        // Evita que a planilha interprete texto do cliente como fórmula
        const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
        return `"${safe.replace(/"/g, '""')}"`;
    };
    const money = v => Number(v || 0).toFixed(2).replace('.', ',');
    const rows = [['Data', 'Pedido', 'Status', 'Cliente', 'Itens', 'Desconto', 'Taxa de entrega', 'Total', 'Comissão 8%']];
    r.inMonth.forEach(o => {
        const items = (o.order_items || []).map(it => `${it.quantity}x ${it.products ? it.products.name : 'Item'}`).join('; ');
        rows.push([
            new Date(o.created_at).toLocaleString('pt-BR'), o.id.slice(0, 8), o.status,
            (o.delivery_address || {}).client_name || '', items,
            money(o.discount_amount), money(o.delivery_fee), money(o.total_amount),
            o.status === 'entregue' ? money(Number(o.total_amount) * PLATFORM_COMMISSION_RATE) : '0,00'
        ]);
    });
    rows.push([]);
    rows.push(['Resumo', '', '', '', `${r.delivered.length} entregues`, money(r.discounts), money(r.fees), money(r.gross), money(r.commission)]);
    rows.push(['Líquido a receber', '', '', '', '', '', '', money(r.net), '']);

    const csv = '\ufeff' + rows.map(row => row.map(cell).join(';')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `extrato-${(currentStore && currentStore.slug) || 'loja'}-${key}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
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
