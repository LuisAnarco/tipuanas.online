/**
 * ==============================================================================
 * PROJETO: AV. DAS TIPUANAS LOCAL
 * ARQUIVO: 16_menu_management.js
 * DESCRIÇÃO: Gestão de cardápio (produtos) pelo lojista, via Supabase.
 * ==============================================================================
 */

let currentStore = null;
let editingProductId = null;
let productsCache = [];

/** Foto do produto: reduzida e enviada para a pasta da loja (ver uploadImage em config.js) */
function uploadProductPhoto(file) {
    return uploadImage(currentStore.id, file);
}

document.addEventListener('DOMContentLoaded', () => {
    initMenuPage();
});

async function initMenuPage() {
    const user = await requireLogin({
        title: 'Gerenciar Cardápio',
        subtitle: 'Entre com o e-mail da sua loja para editar os produtos.'
    });

    const { store } = await resolveMerchantStore(user);

    if (!store) {
        document.getElementById('no-store-section').classList.remove('hidden');
        return;
    }

    currentStore = store;

    document.getElementById('store-title').textContent = store.name;
    document.getElementById('nav-pedidos').href = `04_merchant_portal.html?store=${store.id}`;
    document.getElementById('merchant-nav').classList.remove('hidden');
    document.getElementById('merchant-nav').classList.add('flex');
    document.getElementById('new-product-section').classList.remove('hidden');
    document.getElementById('products-section').classList.remove('hidden');

    loadProducts();
}

async function loadProducts() {
    const { data: products, error } = await sb
        .from('products')
        .select('*')
        .eq('store_id', currentStore.id)
        .order('name', { ascending: true });

    if (error) {
        console.error('Erro ao buscar produtos:', error);
        return;
    }

    productsCache = products || [];
    const sections = [...new Set((products || []).map(p => (p.section || '').trim()).filter(Boolean))].sort();
    document.getElementById('section-options').innerHTML = sections.map(sec => `<option value="${escapeHtml(sec)}"></option>`).join('');
    renderProducts(products || []);
}

/** Lê seção, preço promocional e destaque; devolve { error } se o promocional for inválido */
function readExtraFields(prefix, price) {
    const section = document.getElementById(`${prefix}section`).value.trim().slice(0, 40);
    const promoRaw = document.getElementById(`${prefix}promo`).value.trim();
    const promo = promoRaw === '' ? null : parseFloat(promoRaw);
    if (promo !== null && (isNaN(promo) || promo <= 0 || promo >= price)) {
        return { error: 'O preço promocional precisa ser maior que zero e menor que o preço normal.' };
    }
    return {
        fields: {
            section: section || null,
            promo_price: promo,
            is_featured: document.getElementById(`${prefix}featured`).checked
        }
    };
}

function renderProducts(products) {
    const container = document.getElementById('products-list');

    if (products.length === 0) {
        container.innerHTML = `<p class="text-sm text-gray-500 text-center py-8">Nenhum produto cadastrado ainda. Adicione o primeiro acima.</p>`;
        return;
    }

    container.innerHTML = products.map(p => {
        if (editingProductId === p.id) {
            return `
                <div class="border border-emerald-200 rounded-lg p-4 bg-emerald-50 space-y-2">
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-2">
                        <input id="edit-name-${p.id}" type="text" value="${escapeHtml(p.name)}" class="md:col-span-2 text-base min-h-[44px] px-3 rounded-lg border border-gray-300">
                        <input id="edit-price-${p.id}" type="number" min="0" step="0.01" value="${Number(p.price)}" class="text-base min-h-[44px] px-3 rounded-lg border border-gray-300">
                        <div class="flex gap-2">
                            <button onclick="salvarEdicao('${p.id}')" class="flex-1 min-h-[44px] bg-emerald-700 hover:bg-emerald-800 text-gray-50 text-sm font-bold rounded-lg px-2">Salvar</button>
                            <button onclick="cancelarEdicao()" class="flex-1 min-h-[44px] bg-gray-200 hover:bg-gray-300 text-sm font-bold rounded-lg px-2">Cancelar</button>
                        </div>
                    </div>
                    <input id="edit-desc-${p.id}" type="text" value="${escapeHtml(p.description || '')}" placeholder="Descrição (opcional)" class="w-full text-base min-h-[44px] px-3 rounded-lg border border-gray-300">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                        <input id="edit-${p.id}-section" type="text" list="section-options" maxlength="40" value="${escapeHtml(p.section || '')}" placeholder="Seção (ex: Lanches)" class="text-base min-h-[44px] px-3 rounded-lg border border-gray-300">
                        <input id="edit-${p.id}-promo" type="number" min="0" step="0.01" value="${p.promo_price ? Number(p.promo_price) : ''}" placeholder="Preço promocional" class="text-base min-h-[44px] px-3 rounded-lg border border-gray-300">
                        <label class="flex items-center gap-2 min-h-[44px] text-sm"><input id="edit-${p.id}-featured" type="checkbox" ${p.is_featured ? 'checked' : ''} class="accent-emerald-700 w-5 h-5"> Destaque na vitrine</label>
                    </div>
                    <div class="flex flex-wrap items-center gap-3 text-xs">
                        ${p.image_url ? `<img src="${escapeHtml(p.image_url)}" alt="" class="w-12 h-12 rounded object-cover">` : ''}
                        <label class="flex items-center gap-2">Trocar foto: <input id="edit-photo-${p.id}" type="file" accept="image/*" class="text-sm"></label>
                        ${p.image_url ? `<label class="flex items-center gap-2 min-h-[44px]"><input id="edit-remove-photo-${p.id}" type="checkbox" class="accent-emerald-700 w-5 h-5"> Remover foto</label>` : ''}
                    </div>
                </div>
            `;
        }

        return `
            <div class="border border-gray-200 rounded-lg p-4 flex flex-col md:flex-row justify-between md:items-center gap-3 ${p.is_paused ? 'bg-gray-50 opacity-60' : ''}">
                <div class="flex items-center gap-3">
                ${p.image_url ? `<img src="${escapeHtml(p.image_url)}" alt="" loading="lazy" class="w-14 h-14 rounded-lg object-cover bg-gray-100 shrink-0">` : `<div class="w-14 h-14 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center text-gray-400">${icon('loja', 'w-6 h-6')}</div>`}
                <div>
                    <div class="flex items-center gap-2">
                        <p class="font-bold text-gray-900">${escapeHtml(p.name)}</p>
                        ${p.is_paused ? '<span class="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">Esgotado</span>' : ''}
                        ${p.is_featured ? '<span class="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">Destaque</span>' : ''}
                        ${p.section ? `<span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">${escapeHtml(p.section)}</span>` : ''}
                    </div>
                    ${p.description ? `<p class="text-xs text-gray-500">${escapeHtml(p.description)}</p>` : ''}
                    <p class="text-sm font-extrabold text-emerald-800 mt-1 tabular-nums">${p.promo_price ? `${formatBRL(p.promo_price)} <span class="text-xs text-gray-500 line-through font-normal">${formatBRL(p.price)}</span>` : formatBRL(p.price)}</p>
                </div>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button type="button" onclick="iniciarEdicao('${p.id}')" class="bg-white border border-gray-300 hover:bg-gray-50 text-sm font-bold px-3 min-h-[44px] rounded-lg">Editar</button>
                    <button type="button" data-edit-options="${escapeHtml(p.id)}" class="bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-sm font-bold px-3 min-h-[44px] rounded-lg">Opções${(p.options || []).length ? ` (${p.options.length})` : ''}</button>
                    <button type="button" onclick="alternarDisponibilidade('${p.id}', ${p.is_paused})" class="bg-amber-100 hover:bg-amber-200 text-amber-800 text-sm font-bold px-3 min-h-[44px] rounded-lg">
                        ${p.is_paused ? 'Voltou' : 'Esgotou'}
                    </button>
                    <button type="button" onclick="removerProduto('${p.id}')" class="bg-red-50 hover:bg-red-100 text-red-700 text-sm font-bold px-3 min-h-[44px] rounded-lg">Remover</button>
                </div>
            </div>
        `;
    }).join('');
}

async function adicionarProduto() {
    const name = document.getElementById('np-name').value.trim();
    const description = document.getElementById('np-description').value.trim();
    const price = parseFloat(document.getElementById('np-price').value);
    const errorEl = document.getElementById('np-error');

    if (!name || isNaN(price) || price <= 0) {
        errorEl.textContent = 'Preencha nome e um preço válido.';
        errorEl.classList.remove('hidden');
        return;
    }
    const extra = readExtraFields('np-', price);
    if (extra.error) {
        errorEl.textContent = extra.error;
        errorEl.classList.remove('hidden');
        return;
    }
    errorEl.classList.add('hidden');

    let imageUrl = null;
    try {
        imageUrl = await uploadProductPhoto(document.getElementById('np-photo').files[0]);
    } catch (e) {
        console.error('Erro ao enviar foto:', e);
        errorEl.textContent = 'Não foi possível enviar a foto (use JPG, PNG ou WEBP). O produto não foi salvo.';
        errorEl.classList.remove('hidden');
        return;
    }

    const { error } = await sb.from('products').insert([{
        store_id: currentStore.id,
        name,
        description: description || null,
        price,
        image_url: imageUrl,
        is_paused: false,
        ...extra.fields
    }]);

    if (error) {
        console.error('Erro ao adicionar produto:', error);
        errorEl.textContent = 'Não foi possível adicionar o produto. Tente novamente.';
        errorEl.classList.remove('hidden');
        return;
    }

    document.getElementById('np-name').value = '';
    document.getElementById('np-description').value = '';
    document.getElementById('np-price').value = '';
    document.getElementById('np-photo').value = '';
    document.getElementById('np-section').value = '';
    document.getElementById('np-promo').value = '';
    document.getElementById('np-featured').checked = false;
    loadProducts();
}

function iniciarEdicao(productId) {
    editingProductId = productId;
    loadProducts();
}

function cancelarEdicao() {
    editingProductId = null;
    loadProducts();
}

async function salvarEdicao(productId) {
    const name = document.getElementById(`edit-name-${productId}`).value.trim();
    const description = document.getElementById(`edit-desc-${productId}`).value.trim();
    const price = parseFloat(document.getElementById(`edit-price-${productId}`).value);

    if (!name || isNaN(price) || price <= 0) {
        alert('Preencha nome e um preço válido.');
        return;
    }

    const extra = readExtraFields(`edit-${productId}-`, price);
    if (extra.error) {
        alert(extra.error);
        return;
    }
    const changes = { name, description: description || null, price, ...extra.fields };
    const removePhoto = document.getElementById(`edit-remove-photo-${productId}`);
    if (removePhoto && removePhoto.checked) changes.image_url = null;
    try {
        const newPhoto = await uploadProductPhoto(document.getElementById(`edit-photo-${productId}`).files[0]);
        if (newPhoto) changes.image_url = newPhoto;
    } catch (e) {
        console.error('Erro ao enviar foto:', e);
        alert('Não foi possível enviar a foto (use JPG, PNG ou WEBP).');
        return;
    }

    const { error } = await sb
        .from('products')
        .update(changes)
        .eq('id', productId);

    if (error) {
        console.error('Erro ao salvar produto:', error);
        alert('Não foi possível salvar as alterações.');
        return;
    }

    editingProductId = null;
    loadProducts();
}

async function alternarDisponibilidade(productId, isPaused) {
    const { error } = await sb
        .from('products')
        .update({ is_paused: !isPaused })
        .eq('id', productId);

    if (error) {
        console.error('Erro ao atualizar disponibilidade:', error);
        alert('Não foi possível atualizar o produto.');
        return;
    }

    loadProducts();
}

async function removerProduto(productId) {
    if (!confirm('Remover este produto do cardápio? Essa ação não pode ser desfeita.')) return;

    const { error } = await sb.from('products').delete().eq('id', productId);

    if (error) {
        console.error('Erro ao remover produto:', error);
        alert('Não foi possível remover o produto.');
        return;
    }

    loadProducts();
}

// ============================================================== OPÇÕES DO PRODUTO
// Grupos de escolha (tamanho, borda, adicionais) gravados em products.options.
// O banco confere o formato (product_options_valid) e o preço no place_order.

const OPTION_TEMPLATES = {
    tamanho: { name: 'Tamanho', min: 1, max: 1, options: [{ name: 'Pequeno', price: 0 }, { name: 'Médio', price: 5 }, { name: 'Grande', price: 10 }] },
    adicionais: { name: 'Adicionais', min: 0, max: 3, options: [{ name: 'Queijo extra', price: 3 }, { name: 'Bacon', price: 4 }] },
    retirar: { name: 'Retirar ingrediente', min: 0, max: 5, options: [{ name: 'Sem cebola', price: 0 }, { name: 'Sem tomate', price: 0 }] },
    ponto: { name: 'Ponto da carne', min: 1, max: 1, options: [{ name: 'Mal passado', price: 0 }, { name: 'Ao ponto', price: 0 }, { name: 'Bem passado', price: 0 }] }
};

let optionsDraft = null; // { productId, groups: [...] }

document.addEventListener('click', event => {
    const open = event.target.closest('[data-edit-options]');
    if (open) return openOptionsEditor(open.dataset.editOptions);
    if (!optionsDraft) return;
    const el = event.target.closest('[data-oe]');
    if (!el) {
        if (event.target.id === 'options-editor') closeOptionsEditor();
        return;
    }
    const [action, gi, oi] = el.dataset.oe.split(':');
    syncOptionsDraft();
    const groups = optionsDraft.groups;
    if (action === 'close') return closeOptionsEditor();
    if (action === 'save') return saveOptions();
    if (action === 'template') groups.push(JSON.parse(JSON.stringify(OPTION_TEMPLATES[gi])));
    if (action === 'add-group') groups.push({ name: '', min: 0, max: 1, options: [{ name: '', price: 0 }] });
    if (action === 'del-group') groups.splice(Number(gi), 1);
    if (action === 'up' && Number(gi) > 0) groups.splice(Number(gi) - 1, 0, groups.splice(Number(gi), 1)[0]);
    if (action === 'add-opt') groups[gi].options.push({ name: '', price: 0 });
    if (action === 'del-opt') groups[gi].options.splice(Number(oi), 1);
    renderOptionsEditor();
});

document.addEventListener('change', event => {
    if (!optionsDraft || event.target.id !== 'oe-copy' || !event.target.value) return;
    const source = productsCache.find(p => p.id === event.target.value);
    if (source && Array.isArray(source.options)) {
        syncOptionsDraft();
        optionsDraft.groups = JSON.parse(JSON.stringify(source.options));
        renderOptionsEditor();
    }
});

function openOptionsEditor(productId) {
    const product = productsCache.find(p => p.id === productId);
    if (!product) return;
    optionsDraft = { productId, groups: JSON.parse(JSON.stringify(product.options || [])) };
    renderOptionsEditor();
}

function closeOptionsEditor() {
    optionsDraft = null;
    const el = document.getElementById('options-editor');
    if (el) el.remove();
}

/** Lê os campos da tela para o rascunho (antes de redesenhar ou salvar) */
function syncOptionsDraft() {
    const root = document.getElementById('options-editor');
    if (!root) return;
    optionsDraft.groups.forEach((g, gi) => {
        const val = sel => { const el = root.querySelector(sel); return el ? el.value : undefined; };
        if (val(`[data-g-name="${gi}"]`) !== undefined) g.name = val(`[data-g-name="${gi}"]`);
        if (val(`[data-g-min="${gi}"]`) !== undefined) g.min = parseInt(val(`[data-g-min="${gi}"]`), 10) || 0;
        if (val(`[data-g-max="${gi}"]`) !== undefined) g.max = parseInt(val(`[data-g-max="${gi}"]`), 10) || 0;
        g.options.forEach((o, oi) => {
            if (val(`[data-o-name="${gi}:${oi}"]`) !== undefined) o.name = val(`[data-o-name="${gi}:${oi}"]`);
            if (val(`[data-o-price="${gi}:${oi}"]`) !== undefined) o.price = Math.max(0, parseFloat(val(`[data-o-price="${gi}:${oi}"]`)) || 0);
        });
    });
}

/** Mesmas regras do banco (product_options_valid), com mensagem em português */
function validateOptions(groups) {
    if (groups.length > 10) return 'No máximo 10 grupos por produto.';
    for (const g of groups) {
        const label = g.name.trim() || 'sem nome';
        if (!g.name.trim()) return 'Dê um nome para cada grupo (ex: Tamanho).';
        if (g.options.length < 1 || g.options.length > 30) return `O grupo "${label}" precisa ter de 1 a 30 opções.`;
        if (g.options.some(o => !o.name.trim())) return `Preencha o nome de todas as opções do grupo "${label}".`;
        if (g.min < 0 || g.min > g.options.length) return `No grupo "${label}", o mínimo não pode passar do número de opções.`;
        if (g.max < Math.max(1, g.min)) return `No grupo "${label}", o máximo precisa ser pelo menos ${Math.max(1, g.min)}.`;
    }
    return null;
}

function renderOptionsEditor() {
    const product = productsCache.find(p => p.id === optionsDraft.productId);
    const others = productsCache.filter(p => p.id !== optionsDraft.productId && (p.options || []).length);
    let root = document.getElementById('options-editor');
    if (!root) {
        root = document.createElement('div');
        root.id = 'options-editor';
        root.className = 'fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center';
        document.body.appendChild(root);
    }
    const inputCls = 'text-base min-h-[44px] px-3 rounded-lg border border-gray-300';
    root.innerHTML = `
        <div class="bg-white w-full max-w-lg rounded-t-2xl md:rounded-2xl max-h-[92vh] flex flex-col" role="dialog" aria-modal="true">
            <div class="p-4 border-b flex justify-between items-start gap-2">
                <div>
                    <p class="text-xs text-gray-500">Opções de</p>
                    <h2 class="font-bold text-gray-900">${escapeHtml(product ? product.name : 'Produto')}</h2>
                    <p class="text-[11px] text-gray-500">O preço de cada opção é somado ao preço do produto. Mínimo 1 = obrigatório.</p>
                </div>
                <button data-oe="close" class="text-2xl text-gray-400 leading-none" aria-label="Fechar">×</button>
            </div>
            <div class="overflow-y-auto flex-1 p-4 space-y-4">
                <div class="flex flex-wrap gap-2 text-xs">
                    <span class="text-gray-500 self-center">Modelos:</span>
                    <button data-oe="template:tamanho" class="border rounded-full px-2.5 py-1">+ Tamanho</button>
                    <button data-oe="template:adicionais" class="border rounded-full px-2.5 py-1">+ Adicionais</button>
                    <button data-oe="template:retirar" class="border rounded-full px-2.5 py-1">+ Retirar ingrediente</button>
                    <button data-oe="template:ponto" class="border rounded-full px-2.5 py-1">+ Ponto da carne</button>
                </div>
                ${others.length ? `<select id="oe-copy" class="w-full ${inputCls} text-xs"><option value="">Copiar opções de outro produto…</option>${others.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('')}</select>` : ''}
                ${optionsDraft.groups.length ? '' : '<p class="text-sm text-gray-400 text-center py-4">Sem opções: o cliente põe o produto direto na sacola.</p>'}
                ${optionsDraft.groups.map((g, gi) => `
                    <fieldset data-group-card="${gi}" class="border border-gray-200 rounded-xl p-3 space-y-2">
                        <div class="flex gap-2 items-center">
                            <input data-g-name="${gi}" value="${escapeHtml(g.name)}" maxlength="40" placeholder="Nome do grupo (ex: Tamanho)" class="flex-1 font-semibold ${inputCls}">
                            ${gi > 0 ? `<button data-oe="up:${gi}" class="text-gray-400 text-sm" title="Subir">▲</button>` : ''}
                            <button data-oe="del-group:${gi}" class="text-red-500 text-xs font-bold" title="Remover grupo">Remover</button>
                        </div>
                        <div class="flex gap-3 text-xs text-gray-600 items-center">
                            <label>Mínimo <input data-g-min="${gi}" type="number" min="0" max="30" value="${Number(g.min)}" class="w-14 ${inputCls}"></label>
                            <label>Máximo <input data-g-max="${gi}" type="number" min="1" max="30" value="${Number(g.max)}" class="w-14 ${inputCls}"></label>
                            <span class="text-[11px] text-gray-400">${Number(g.min) > 0 ? 'obrigatório' : 'opcional'}</span>
                        </div>
                        ${g.options.map((o, oi) => `
                            <div class="flex gap-2 items-center">
                                <input data-o-name="${gi}:${oi}" value="${escapeHtml(o.name)}" maxlength="60" placeholder="Opção (ex: Grande)" class="flex-1 ${inputCls}">
                                <span class="text-xs text-gray-500 whitespace-nowrap">+ R$</span>
                                <input data-o-price="${gi}:${oi}" type="number" min="0" step="0.01" value="${Number(o.price)}" class="w-20 ${inputCls}">
                                <button data-oe="del-opt:${gi}:${oi}" class="text-gray-400 hover:text-red-600 text-lg leading-none" title="Remover opção">×</button>
                            </div>`).join('')}
                        <button data-oe="add-opt:${gi}" class="text-xs font-bold text-emerald-700">+ Opção</button>
                    </fieldset>`).join('')}
                <button data-oe="add-group" class="w-full border-2 border-dashed border-gray-300 rounded-xl py-2 text-sm font-bold text-gray-600">+ Novo grupo</button>
                <p id="oe-error" class="hidden text-xs text-red-600"></p>
            </div>
            <div class="p-4 border-t flex gap-2">
                <button data-oe="close" class="flex-1 bg-gray-100 rounded-lg py-2.5 text-sm font-bold">Cancelar</button>
                <button data-oe="save" class="flex-1 bg-emerald-700 hover:bg-emerald-800 text-gray-50 rounded-lg py-2.5 text-sm font-bold">Salvar opções</button>
            </div>
        </div>`;
}

async function saveOptions() {
    const groups = optionsDraft.groups.map(g => ({
        name: g.name.trim(),
        min: Number(g.min) || 0,
        max: Number(g.max) || 0,
        options: g.options.map(o => ({ name: o.name.trim(), price: Math.round(Number(o.price || 0) * 100) / 100 }))
    }));
    const problem = validateOptions(groups);
    const errorEl = document.getElementById('oe-error');
    if (problem) {
        errorEl.textContent = problem;
        errorEl.classList.remove('hidden');
        return;
    }
    const { error } = await sb.from('products')
        .update({ options: groups.length ? groups : null })
        .eq('id', optionsDraft.productId);
    if (error) {
        console.error('Erro ao salvar opções:', error);
        errorEl.textContent = 'Não foi possível salvar. Confira os campos e tente de novo.';
        errorEl.classList.remove('hidden');
        return;
    }
    closeOptionsEditor();
    loadProducts();
}

