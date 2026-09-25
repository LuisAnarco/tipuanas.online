/**
 * ==============================================================================
 * PROJETO: TIPUANAS.ONLINE
 * ARQUIVO: 09_multistore_cart.js
 * DESCRIÇÃO: Vitrine do bairro — carrega lojas/produtos do Supabase, busca,
 *            filtro por categoria e carrinho multi-loja (localStorage).
 * ==============================================================================
 */

const CART_KEY = 'tipuanas_cart';

let cart = loadCart();
let allStores = [];
let allProducts = [];
let productsById = {};
let activeCategory = null;
let searchTerm = '';

document.addEventListener('DOMContentLoaded', () => {
    loadStoresAndProducts();
    updateCartUI();

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            searchTerm = normalize(searchInput.value.trim());
            renderStores();
        });
    }

    // Delegação de eventos: evita montar onclick com texto do banco (nome com
    // apóstrofo quebrava o botão e abria brecha de XSS).
    document.getElementById('stores-container').addEventListener('click', event => {
        const btn = event.target.closest('[data-add-product]');
        if (btn) addToCart(btn.dataset.addProduct);
    });
    document.getElementById('category-chips').addEventListener('click', event => {
        const chip = event.target.closest('[data-category]');
        if (!chip) return;
        activeCategory = chip.dataset.category || null;
        renderCategoryChips();
        renderStores();
    });
});

function loadCart() {
    try {
        return JSON.parse(localStorage.getItem(CART_KEY)) || [];
    } catch (e) {
        return [];
    }
}

function normalize(str) {
    return String(str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Busca lojas ativas (não pausadas) e produtos disponíveis
 */
async function loadStoresAndProducts() {
    const container = document.getElementById('stores-container');

    const [{ data: stores, error: storeErr }, { data: products, error: prodErr }] = await Promise.all([
        sb.from('stores').select('*').eq('is_active', true).eq('is_paused', false).order('name'),
        sb.from('products').select('*').eq('is_paused', false).order('name')
    ]);

    if (storeErr || prodErr) {
        console.error('Erro ao carregar vitrine:', storeErr || prodErr);
        container.innerHTML = `<p class="text-center text-xs text-slate-400 py-8">Não foi possível carregar a vitrine agora. Tente recarregar a página.</p>`;
        return;
    }

    allStores = stores || [];
    allProducts = products || [];
    productsById = {};
    allProducts.forEach(p => { productsById[p.id] = p; });

    renderCategoryChips();
    renderStores();
}

function renderCategoryChips() {
    const chipsEl = document.getElementById('category-chips');
    const categories = [...new Set(allStores.map(s => s.category).filter(Boolean))].sort();

    if (categories.length < 2) {
        chipsEl.innerHTML = '';
        return;
    }

    const chip = (value, label) => {
        const active = (activeCategory || '') === value;
        return `<button data-category="${escapeHtml(value)}" class="shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-full border transition ${active ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200'}">${escapeHtml(label)}</button>`;
    };

    chipsEl.innerHTML = chip('', 'Todas') + categories.map(c => chip(c, c)).join('');
}

function renderStores() {
    const container = document.getElementById('stores-container');

    const visible = allStores
        .filter(store => !activeCategory || store.category === activeCategory)
        .map(store => {
            const storeMatches = !searchTerm || normalize(`${store.name} ${store.category} ${store.description}`).includes(searchTerm);
            let storeProducts = allProducts.filter(p => p.store_id === store.id);
            if (searchTerm && !storeMatches) {
                storeProducts = storeProducts.filter(p => normalize(`${p.name} ${p.description}`).includes(searchTerm));
            }
            const show = !searchTerm || storeMatches || storeProducts.length > 0;
            return show ? { store, storeProducts } : null;
        })
        .filter(Boolean);

    if (visible.length === 0) {
        container.innerHTML = `<p class="text-center text-xs text-slate-400 py-8">${allStores.length === 0 ? 'Nenhum estabelecimento disponível no momento.' : 'Nada encontrado com esse filtro.'}</p>`;
        return;
    }

    container.innerHTML = visible.map(({ store, storeProducts }) => store.listing_type === 'orcamento'
        ? renderQuoteStore(store)
        : renderCatalogStore(store, storeProducts)
    ).join('');
}

// Loja do tipo orçamento: só divulgação + botão pra pedir orçamento
function renderQuoteStore(store) {
    return `
        <div class="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
            <div class="border-b border-slate-100 pb-2">
                <div class="flex items-center gap-1.5">
                    <h3 class="font-bold text-slate-900 text-sm">${escapeHtml(store.name)}</h3>
                    <span class="text-[9px] bg-amber-50 text-amber-700 font-bold px-1.5 py-0.5 rounded-full border border-amber-100">Sob Orçamento</span>
                </div>
                ${store.category ? `<p class="text-[11px] text-slate-500">${escapeHtml(store.category)}</p>` : ''}
            </div>
            <p class="text-xs text-slate-600">${escapeHtml(store.description || 'Solicite um orçamento e o prestador entra em contato pra combinar os detalhes.')}</p>
            <a href="18_solicitar_orcamento.html?store=${encodeURIComponent(store.id)}" class="block text-center bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2.5 rounded-lg transition active:scale-95">
                Solicitar Orçamento
            </a>
        </div>
    `;
}

function renderCatalogStore(store, storeProducts) {
    return `
        <div class="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
            <div class="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <div>
                    <h3 class="font-bold text-slate-900 text-sm">${escapeHtml(store.name)}</h3>
                    ${store.category ? `<p class="text-[11px] text-slate-500">${escapeHtml(store.category)}</p>` : ''}
                    ${store.address_line ? `<p class="text-[10px] text-slate-400">📍 ${escapeHtml(store.address_line)}</p>` : ''}
                </div>
                <span class="shrink-0 text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-100">
                    ${Number(store.delivery_fee) > 0 ? `Taxa: ${formatBRL(store.delivery_fee)}` : 'Entrega grátis'}
                </span>
            </div>
            ${store.description ? `<p class="text-[11px] text-slate-500">${escapeHtml(store.description)}</p>` : ''}

            <div class="space-y-2">
                ${storeProducts.length > 0 ? storeProducts.map(product => `
                    <div class="flex items-center justify-between gap-3 py-1.5 border-b border-slate-50 last:border-none">
                        <div class="flex items-center gap-2.5 min-w-0">
                            ${product.image_url ? `<img src="${escapeHtml(product.image_url)}" alt="" loading="lazy" class="w-11 h-11 rounded-lg object-cover bg-slate-100 shrink-0">` : ''}
                            <div class="min-w-0">
                                <p class="text-xs font-semibold text-slate-800">${escapeHtml(product.name)}</p>
                                ${product.description ? `<p class="text-[10px] text-slate-400">${escapeHtml(product.description)}</p>` : ''}
                                <p class="text-xs font-extrabold text-emerald-600 mt-0.5">${formatBRL(product.price)}</p>
                            </div>
                        </div>
                        <button data-add-product="${escapeHtml(product.id)}" class="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition active:scale-95">
                            + Adicionar
                        </button>
                    </div>
                `).join('') : '<p class="text-[11px] text-slate-400">Nenhum produto cadastrado nesta loja.</p>'}
            </div>
        </div>
    `;
}

/**
 * Adiciona um item ao carrinho local (dados vêm do produto já carregado, não do HTML)
 */
function addToCart(productId) {
    const product = productsById[productId];
    if (!product) return;
    const store = allStores.find(s => s.id === product.store_id);

    const existing = cart.find(item => item.id === productId);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: Number(product.price),
            storeId: product.store_id,
            storeName: store ? store.name : 'Loja',
            quantity: 1
        });
    }
    saveCart();
    flashCartBar();
}

function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartUI();
}

function flashCartBar() {
    const bar = document.getElementById('cart-bar');
    if (!bar) return;
    bar.classList.add('ring-2', 'ring-emerald-400');
    setTimeout(() => bar.classList.remove('ring-2', 'ring-emerald-400'), 300);
}

function updateCartUI() {
    const cartBar = document.getElementById('cart-bar');
    const itemCountEl = document.getElementById('cart-item-count');
    const totalPriceEl = document.getElementById('cart-total-price');

    if (!cartBar) return;

    const totalCount = cart.reduce((acc, item) => acc + item.quantity, 0);
    const totalPrice = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

    if (totalCount > 0) {
        cartBar.classList.remove('hidden');
        itemCountEl.textContent = `${totalCount} ${totalCount === 1 ? 'item' : 'itens'}`;
        totalPriceEl.textContent = formatBRL(totalPrice);
    } else {
        cartBar.classList.add('hidden');
    }
}
