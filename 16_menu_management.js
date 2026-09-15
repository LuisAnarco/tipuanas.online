/**
 * ==============================================================================
 * PROJETO: AV. DAS TIPUANAS LOCAL
 * ARQUIVO: 16_menu_management.js
 * DESCRIÇÃO: Gestão de cardápio (produtos) pelo lojista, via Supabase.
 * ==============================================================================
 */

const SUPABASE_URL = 'https://uiroqxinszrhvyzuiqfu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpcm9xeGluc3pyaHZ5enVpcWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3MzEyNDYsImV4cCI6MjEwNDMwNzI0Nn0.suJIxTU26t8U7S6IRiNChZtfLyQzftOVF0sZe1c7x2k';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STORE_ID_KEY = 'tipuanas_store_id';
let currentStore = null;
let editingProductId = null;

document.addEventListener('DOMContentLoaded', () => {
    initMenuPage();
});

async function initMenuPage() {
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

    currentStore = store;
    localStorage.setItem(STORE_ID_KEY, store.id);

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

    renderProducts(products || []);
}

function renderProducts(products) {
    const container = document.getElementById('products-list');

    if (products.length === 0) {
        container.innerHTML = `<p class="text-sm text-gray-400 text-center py-8">Nenhum produto cadastrado ainda. Adicione o primeiro acima.</p>`;
        return;
    }

    container.innerHTML = products.map(p => {
        if (editingProductId === p.id) {
            return `
                <div class="border border-emerald-200 rounded-lg p-4 bg-emerald-50 space-y-2">
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-2">
                        <input id="edit-name-${p.id}" type="text" value="${escapeAttr(p.name)}" class="md:col-span-2 text-sm p-2 rounded border border-gray-300">
                        <input id="edit-price-${p.id}" type="number" min="0" step="0.01" value="${Number(p.price)}" class="text-sm p-2 rounded border border-gray-300">
                        <div class="flex gap-2">
                            <button onclick="salvarEdicao('${p.id}')" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded px-2">Salvar</button>
                            <button onclick="cancelarEdicao()" class="flex-1 bg-gray-200 hover:bg-gray-300 text-xs font-bold rounded px-2">Cancelar</button>
                        </div>
                    </div>
                    <input id="edit-desc-${p.id}" type="text" value="${escapeAttr(p.description || '')}" placeholder="Descrição (opcional)" class="w-full text-xs p-2 rounded border border-gray-300">
                </div>
            `;
        }

        return `
            <div class="border border-gray-200 rounded-lg p-4 flex flex-col md:flex-row justify-between md:items-center gap-3 ${p.is_available ? '' : 'bg-gray-50 opacity-60'}">
                <div>
                    <div class="flex items-center gap-2">
                        <p class="font-bold text-gray-900">${escapeHtml(p.name)}</p>
                        ${!p.is_available ? '<span class="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-bold">Pausado</span>' : ''}
                    </div>
                    ${p.description ? `<p class="text-xs text-gray-500">${escapeHtml(p.description)}</p>` : ''}
                    <p class="text-sm font-extrabold text-emerald-600 mt-1">R$ ${Number(p.price).toFixed(2)}</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="iniciarEdicao('${p.id}')" class="bg-white border border-gray-300 hover:bg-gray-50 text-xs font-bold px-3 py-1.5 rounded-lg">Editar</button>
                    <button onclick="alternarDisponibilidade('${p.id}', ${p.is_available})" class="bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-bold px-3 py-1.5 rounded-lg">
                        ${p.is_available ? 'Pausar' : 'Ativar'}
                    </button>
                    <button onclick="removerProduto('${p.id}')" class="bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold px-3 py-1.5 rounded-lg">Remover</button>
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
    errorEl.classList.add('hidden');

    const { error } = await sb.from('products').insert([{
        store_id: currentStore.id,
        name,
        description: description || null,
        price,
        is_available: true
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

    const { error } = await sb
        .from('products')
        .update({ name, description: description || null, price })
        .eq('id', productId);

    if (error) {
        console.error('Erro ao salvar produto:', error);
        alert('Não foi possível salvar as alterações.');
        return;
    }

    editingProductId = null;
    loadProducts();
}

async function alternarDisponibilidade(productId, isAvailable) {
    const { error } = await sb
        .from('products')
        .update({ is_available: !isAvailable })
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

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function escapeAttr(str) {
    return escapeHtml(str);
}
