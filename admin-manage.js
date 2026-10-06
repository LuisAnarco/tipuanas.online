/**
 * ==============================================================================
 * PROJETO: TIPUANAS.ONLINE
 * ARQUIVO: admin-manage.js
 * DESCRIÇÃO: Gestão no painel admin (14_admin_analytics_dashboard.html):
 *            dono e dados de cada loja, pedidos do período (com cancelamento)
 *            e entregadores (ativar/desativar). As permissões vêm do banco:
 *            só o admin passa pelas políticas/funções usadas aqui.
 *            Depende de config.js, store-settings.js e de storesCache
 *            (definido no próprio painel).
 * ==============================================================================
 */

let ownersByStore = {};  // store_id -> e-mail do dono
let ordersCache = [];    // pedidos do período (preenchido pelo painel)
let couriersCache = [];

const ORDER_STATUS_LABELS = {
    novo: 'Pendente', em_preparacao: 'Em preparação', pronto: 'Pronto',
    em_rota: 'A caminho', entregue: 'Entregue', cancelado: 'Cancelado'
};

async function loadOwners() {
    const { data, error } = await sb.rpc('admin_store_owners');
    if (error) {
        console.error('Erro ao buscar donos das lojas:', error);
        return;
    }
    ownersByStore = {};
    (data || []).forEach(row => { if (row.owner_email) ownersByStore[row.store_id] = row.owner_email; });
}

// ---------------------------------------------------------------- Lojas
function openStoreEditor(storeId) {
    const store = storesCache.find(s => s.id === storeId);
    if (!store) return;
    const box = document.getElementById('store-editor');
    box.classList.remove('hidden');
    box.innerHTML = `
        <div class="flex justify-between items-center mb-2">
            <h3 class="text-sm font-bold text-white">Editando: ${escapeHtml(store.name)}</h3>
            <button type="button" data-close-editor class="min-h-[44px] px-2 text-sm text-slate-500 underline">Fechar</button>
        </div>
        <div data-role="settings"></div>
        <div class="bg-white rounded-lg shadow-sm border border-gray-100 p-6 space-y-2">
            <p class="text-sm font-bold text-gray-800">Dono da loja</p>
            <p class="text-xs text-gray-500">A pessoa precisa ter entrado no site pelo menos uma vez com esse e-mail. Deixe em branco para remover o dono (a loja volta a poder ser vinculada no painel do lojista).</p>
            <div class="flex flex-col sm:flex-row gap-2">
                <input data-role="owner-email" type="email" value="${escapeHtml(ownersByStore[store.id] || '')}" placeholder="email@dono.com" class="flex-1 text-sm p-2.5 rounded-lg border border-gray-300">
                <button type="button" data-role="owner-save" class="min-h-[44px] bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 rounded-lg text-sm">Salvar dono</button>
            </div>
            <p data-role="owner-status" class="text-xs"></p>
            <a href="04_merchant_portal.html?store=${encodeURIComponent(store.id)}" class="inline-flex min-h-[44px] items-center text-sm text-emerald-700 underline">Abrir o painel desta loja</a>
        </div>
    `;

    renderStoreSettings(box.querySelector('[data-role="settings"]'), store, {
        open: true,
        onSaved: () => loadAdminMetrics()
    });

    box.querySelector('[data-close-editor]').addEventListener('click', () => {
        box.classList.add('hidden');
        box.innerHTML = '';
    });

    box.querySelector('[data-role="owner-save"]').addEventListener('click', async () => {
        const email = box.querySelector('[data-role="owner-email"]').value.trim();
        const statusEl = box.querySelector('[data-role="owner-status"]');
        const { error } = await sb.rpc('admin_set_store_owner', { p_store_id: store.id, p_email: email });
        if (error) {
            statusEl.className = 'text-xs text-red-600';
            statusEl.textContent = (error.message || '').includes('user_not_found')
                ? 'Nenhuma conta com esse e-mail. Peça para a pessoa entrar no site uma vez (painel do lojista) e tente de novo.'
                : 'Não foi possível salvar o dono.';
            return;
        }
        statusEl.className = 'text-xs text-emerald-700';
        statusEl.textContent = email ? `Dono definido: ${email}` : 'Dono removido.';
        await loadOwners();
        loadAdminMetrics();
    });

    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------------------------------------------------------- Pedidos
function renderAdminOrders() {
    const filter = document.getElementById('orders-filter').value;
    const storeName = id => (storesCache.find(s => s.id === id) || {}).name || 'Loja';
    const list = ordersCache.filter(o => {
        if (!filter) return true;
        if (filter === 'abertos') return !['entregue', 'cancelado'].includes(o.status);
        return o.status === filter;
    }).slice(0, 50);

    const el = document.getElementById('orders-admin-list');
    if (list.length === 0) {
        el.innerHTML = '<p class="text-slate-500">Nenhum pedido com esse filtro no período.</p>';
        return;
    }

    el.innerHTML = list.map(o => {
        const addr = o.delivery_address || {};
        const canCancel = !['entregue', 'cancelado'].includes(o.status);
        const date = new Date(o.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        return `
            <div class="flex flex-wrap justify-between items-center gap-2 bg-slate-900/50 rounded-lg px-3 py-2">
                <div class="min-w-0">
                    <p class="font-semibold text-white">#${o.id.slice(0, 8)} • ${escapeHtml(storeName(o.store_id))}</p>
                    <p class="text-[10px] text-slate-400">${date} • ${escapeHtml(addr.client_name || 'Cliente')}${addr.client_phone ? ` • ${escapeHtml(addr.client_phone)}` : ''} • ${o.is_takeout ? 'Retirada' : 'Entrega'}</p>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-700">${ORDER_STATUS_LABELS[o.status] || escapeHtml(o.status)}</span>
                    <span class="font-bold text-emerald-400">${formatBRL(o.total_amount)}</span>
                    ${canCancel ? `<button type="button" data-cancel-order="${escapeHtml(o.id)}" class="text-sm text-red-400 border border-red-400/40 rounded px-3 min-h-[44px] hover:bg-red-500/10">Cancelar</button>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

async function cancelOrderAdmin(orderId) {
    if (!confirm('Cancelar este pedido? Avise o cliente e a loja pelo WhatsApp.')) return;
    const { error } = await sb.from('orders').update({ status: 'cancelado' }).eq('id', orderId);
    if (error) {
        alert('Não foi possível cancelar o pedido.');
        console.error(error);
        return;
    }
    loadAdminMetrics();
}

// ---------------------------------------------------------------- Entregadores
async function loadCouriers(delivered) {
    const { data, error } = await sb.from('couriers').select('*').order('created_at', { ascending: false });
    const el = document.getElementById('couriers-admin-list');
    if (error) {
        console.error('Erro ao buscar entregadores:', error);
        el.innerHTML = '<p class="text-red-400">Não foi possível carregar os entregadores.</p>';
        return;
    }
    couriersCache = data || [];
    if (couriersCache.length === 0) {
        el.innerHTML = '<p class="text-slate-500">Nenhum entregador cadastrado ainda. O cadastro é feito em entregador.html.</p>';
        return;
    }

    el.innerHTML = couriersCache.map(c => {
        const rides = (delivered || []).filter(o => o.courier_ref === c.id);
        const earned = rides.reduce((acc, o) => acc + Number(o.delivery_fee || 0), 0);
        const wa = toWhatsappNumber(c.phone);
        return `
            <div class="flex flex-wrap justify-between items-center gap-2 bg-slate-900/50 rounded-lg px-3 py-2 ${c.is_active ? '' : 'opacity-60'}">
                <div>
                    <p class="font-semibold text-white">${escapeHtml(c.name)} ${c.vehicle ? `<span class="text-slate-400 font-normal">• ${escapeHtml(c.vehicle)}</span>` : ''}</p>
                    <p class="text-[10px] text-slate-400">${wa ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener" class="underline">${escapeHtml(c.phone)}</a>` : ''} • ${rides.length} entrega(s) no período • ${formatBRL(earned)} em taxas</p>
                </div>
                <button type="button" data-toggle-courier="${escapeHtml(c.id)}" class="text-sm border border-slate-600 hover:bg-slate-700 rounded px-3 min-h-[44px]">${c.is_active ? 'Desativar' : 'Ativar'}</button>
            </div>
        `;
    }).join('');
}

async function toggleCourier(courierId) {
    const courier = couriersCache.find(c => c.id === courierId);
    if (!courier) return;
    const action = courier.is_active ? 'desativar' : 'ativar';
    if (!confirm(`Deseja ${action} o entregador "${courier.name}"?`)) return;
    const { error } = await sb.from('couriers').update({ is_active: !courier.is_active }).eq('id', courierId);
    if (error) {
        alert('Não foi possível atualizar o entregador.');
        console.error(error);
        return;
    }
    loadAdminMetrics();
}

// ---------------------------------------------------------------- Mural
async function loadMuralAdmin() {
    const el = document.getElementById('mural-admin-list');
    const { data, error } = await sb.from('community_posts')
        .select('id, post_type, title, author_name, author_whatsapp, created_at, expires_at, is_active')
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(50);
    if (error) {
        console.error('Erro ao buscar o mural:', error);
        el.innerHTML = '<p class="text-red-400">Não foi possível carregar o mural.</p>';
        return;
    }
    if (!data || data.length === 0) {
        el.innerHTML = '<p class="text-slate-500">Nenhum anúncio ativo.</p>';
        return;
    }
    el.innerHTML = data.map(p => `
        <div class="flex flex-wrap justify-between items-center gap-2 bg-slate-900/50 rounded-lg px-3 py-2">
            <div class="min-w-0">
                <p class="font-semibold text-white"><span class="text-xs font-bold uppercase tracking-wide text-amber-500">${p.post_type === 'desapego' ? 'Desapego' : 'Procura'}</span> ${escapeHtml(p.title)}</p>
                <p class="text-[10px] text-slate-400">${escapeHtml(p.author_name)} • ${escapeHtml(p.author_whatsapp)} • vence ${new Date(p.expires_at).toLocaleDateString('pt-BR')}</p>
            </div>
            <button type="button" data-remove-mural="${escapeHtml(p.id)}" class="text-sm text-red-400 border border-red-400/40 rounded px-3 min-h-[44px] hover:bg-red-500/10">Remover</button>
        </div>
    `).join('');
}

async function removeMuralPost(postId) {
    if (!confirm('Remover este anúncio do mural?')) return;
    const { error } = await sb.from('community_posts').update({ is_active: false }).eq('id', postId);
    if (error) {
        alert('Não foi possível remover o anúncio.');
        console.error(error);
        return;
    }
    loadMuralAdmin();
}

// ============================================================== ENTREGA PELA PLATAFORMA
// Regra única (platform_delivery, só o admin altera): taxa base, km incluídos, R$/km e raio.

async function loadPlatformDelivery() {
    const form = document.getElementById('platform-delivery-form');
    if (!form) return;
    const { data } = await sb.from('platform_delivery').select('*').maybeSingle();
    if (data) ['base_fee', 'km_included', 'fee_per_km', 'radius_km'].forEach(k => { form.elements[k].value = Number(data[k]); });
    updatePlatformPreview();
    if (form.dataset.bound) return;
    form.dataset.bound = '1';
    form.addEventListener('input', updatePlatformPreview);
    form.addEventListener('submit', savePlatformDelivery);
}

function readPlatformForm() {
    const form = document.getElementById('platform-delivery-form');
    const n = k => Number(String(form.elements[k].value).replace(',', '.'));
    return { base_fee: n('base_fee'), km_included: n('km_included'), fee_per_km: n('fee_per_km'), radius_km: n('radius_km') };
}

function updatePlatformPreview() {
    const v = readPlatformForm();
    const rules = { base: v.base_fee, incl: v.km_included, perKm: v.fee_per_km, radius: v.radius_km };
    const points = [1, 3, 5, 8].filter(km => km <= v.radius_km);
    document.querySelector('#platform-delivery-form [data-role="preview"]').textContent = points.length
        ? `Exemplo: ${points.map(km => `${km} km = ${formatBRL(feeForDistance(rules, km))}`).join(' · ')}. Acima de ${String(v.radius_km).replace('.', ',')} km não atende.`
        : '';
}

async function savePlatformDelivery(event) {
    event.preventDefault();
    const form = event.target;
    const status = form.querySelector('[data-role="status"]');
    const v = readPlatformForm();
    if (![v.base_fee, v.km_included, v.fee_per_km].every(x => Number.isFinite(x) && x >= 0) || !(v.radius_km > 0 && v.radius_km <= 50)) {
        status.textContent = 'Confira os valores (raio entre 0,5 e 50 km).';
        status.className = 'text-[11px] text-red-400';
        return;
    }
    const { data, error } = await sb.from('platform_delivery').update({ ...v, updated_at: new Date().toISOString() }).eq('id', 1).select();
    if (error || !data || !data.length) {
        console.error('Erro ao salvar a regra de entrega:', error);
        status.textContent = 'Não foi possível salvar.';
        status.className = 'text-[11px] text-red-400';
        return;
    }
    status.textContent = 'Regra salva';
    status.className = 'text-[11px] text-emerald-300';
}

