/**
 * ==============================================================================
 * PROJETO: TIPUANAS.ONLINE
 * ARQUIVO: 09_multistore_cart.js
 * DESCRIÇÃO: Vitrine do bairro no estilo app de delivery:
 *            - index.html: banners (cupons públicos), categorias, ofertas,
 *              destaques, lojas mais bem avaliadas, lista de lojas e busca.
 *            - loja.html?slug=: capa, cupons da loja, abas por seção do
 *              cardápio e produtos.
 *            Carrinho multi-loja em localStorage, usado pelo checkout.
 * ==============================================================================
 */

const CART_KEY = 'tipuanas_cart';

let cart = loadCart();
let allStores = [];
let allProducts = [];
let productsById = {};
let ratingsByStore = {};
let publicCoupons = [];
let activeCategory = null;
let searchTerm = '';

// Na página da loja (<body data-page="loja">) a vitrine mostra só a loja do ?slug=
const STORE_SLUG = document.body && document.body.dataset.page === 'loja'
    ? new URLSearchParams(window.location.search).get('slug')
    : null;

const CATEGORY_ICONS = [
    ['padaria', '🥖'], ['mercado', '🛒'], ['lanche', '🍔'], ['pizza', '🍕'], ['restaurante', '🍽️'],
    ['bebida', '🥤'], ['farm', '💊'], ['pet', '🐾'], ['auto', '🚗'], ['servi', '🛠️'],
    ['doce', '🍰'], ['confeit', '🍰'], ['acai', '🍧'], ['horti', '🥬'], ['acoug', '🥩'],
    ['beleza', '💇'], ['cafe', '☕'], ['sorvet', '🍦'], ['japon', '🍣'], ['sushi', '🍣']
];

function categoryIcon(category) {
    const key = normalize(category);
    const hit = CATEGORY_ICONS.find(([k]) => key.includes(k));
    return hit ? hit[1] : '🏪';
}

document.addEventListener('DOMContentLoaded', () => {
    loadStoresAndProducts();
    updateCartUI();

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            searchTerm = normalize(searchInput.value.trim());
            renderHome();
        });
    }

    // Delegação de eventos: evita montar onclick com texto do banco
    document.addEventListener('click', event => {
        const add = event.target.closest('[data-add-product]');
        if (add) {
            event.preventDefault();
            addToCart(add.dataset.addProduct);
            return;
        }
        const remove = event.target.closest('[data-remove-product]');
        if (remove) {
            event.preventDefault();
            removeFromCart(remove.dataset.removeProduct);
            return;
        }
        const chip = event.target.closest('[data-category]');
        if (chip) {
            activeCategory = chip.dataset.category || null;
            renderCategoryChips();
            renderHome();
            const title = document.getElementById('stores-title');
            if (title && activeCategory) title.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
        const tab = event.target.closest('[data-section-tab]');
        if (tab) {
            const target = document.getElementById(tab.dataset.sectionTab);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });

    const focusSearch = document.querySelector('[data-focus-search]');
    if (focusSearch && searchInput) {
        focusSearch.addEventListener('click', event => {
            event.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            searchInput.focus();
        });
    }
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

/** Preço cobrado: o promocional, quando houver */
function effectivePrice(product) {
    const promo = Number(product.promo_price);
    return promo > 0 && promo < Number(product.price) ? promo : Number(product.price);
}

function discountPercent(product) {
    const eff = effectivePrice(product);
    const price = Number(product.price);
    return eff < price ? Math.round((1 - eff / price) * 100) : 0;
}

function indexProducts() {
    productsById = {};
    allProducts.forEach(p => { productsById[p.id] = p; });
}

function aggregateRatings(reviews) {
    ratingsByStore = {};
    (reviews || []).forEach(r => {
        const agg = ratingsByStore[r.store_id] || (ratingsByStore[r.store_id] = { sum: 0, count: 0 });
        agg.sum += r.rating;
        agg.count += 1;
    });
}

function storeRating(storeId) {
    const agg = ratingsByStore[storeId];
    return agg && agg.count ? agg.sum / agg.count : 0;
}

async function loadPublicCoupons() {
    const { data, error } = await sb.rpc('list_public_coupons');
    publicCoupons = error ? [] : (data || []);
}

/**
 * Busca lojas ativas (não pausadas), produtos disponíveis, avaliações e cupons públicos
 */
async function loadStoresAndProducts() {
    const container = document.getElementById('stores-container');
    if (STORE_SLUG !== null) return loadSingleStore(container);

    const [{ data: stores, error: storeErr }, { data: products, error: prodErr }, { data: reviews }] = await Promise.all([
        sb.from('stores').select('*').eq('is_active', true).eq('is_paused', false).order('name'),
        sb.from('products').select('*').order('name'),
        sb.from('reviews').select('store_id, rating'),
        loadPublicCoupons()
    ]);

    // Nota média por loja (se a consulta de avaliações falhar, a vitrine segue sem nota)
    aggregateRatings(reviews);

    if (storeErr || prodErr) {
        console.error('Erro ao carregar vitrine:', storeErr || prodErr);
        container.innerHTML = `<p class="text-center text-xs text-slate-400 py-8">Não foi possível carregar a vitrine agora. Tente recarregar a página.</p>`;
        return;
    }

    allStores = stores || [];
    allProducts = products || [];
    indexProducts();

    renderCategoryChips();
    renderHome();
}

// ============================================================== HOME

function storeOf(product) {
    return allStores.find(s => s.id === product.store_id);
}

function isOpen(store) {
    return store && store.listing_type !== 'orcamento' && storeOpenStatus(store.opening_hours).open;
}

function renderHome() {
    const home = document.getElementById('home-sections');
    const searching = Boolean(searchTerm);
    if (home) home.classList.toggle('hidden', searching);

    if (!searching) {
        renderBanners();
        renderOffers();
        renderFeatured();
        renderTopStores();
    }
    renderStores();
}

function renderBanners() {
    const el = document.getElementById('banners');
    if (!el) return;
    const banners = [];

    publicCoupons.forEach(c => {
        const off = c.discount_type === 'percentage' ? `${Number(c.discount_value)}% OFF` : `${formatBRL(c.discount_value)} OFF`;
        const href = c.store_slug ? `loja.html?slug=${encodeURIComponent(c.store_slug)}` : '#';
        banners.push(`
            <a href="${href}" data-banner="coupon" class="snap-start shrink-0 w-[85%] rounded-2xl p-4 text-white bg-gradient-to-br from-rose-500 to-orange-500 shadow-sm relative overflow-hidden">
                <span class="absolute -right-3 -bottom-4 text-7xl opacity-25">🏷️</span>
                <p class="text-[10px] font-bold uppercase tracking-wider text-white/80">Cupom · ${escapeHtml(c.store_name)}</p>
                <p class="text-2xl font-extrabold mt-0.5">${off}</p>
                <p class="text-xs mt-1">Use <span class="font-mono font-bold bg-white/20 px-1.5 py-0.5 rounded">${escapeHtml(c.code)}</span>${Number(c.min_order_value) > 0 ? ` · pedido mín. ${formatBRL(c.min_order_value)}` : ''}</p>
            </a>`);
    });

    const freeDelivery = allStores.filter(s => s.listing_type !== 'orcamento' && !(Number(s.delivery_fee) > 0));
    if (freeDelivery.length) {
        banners.push(`
            <div data-banner="free" class="snap-start shrink-0 w-[85%] rounded-2xl p-4 text-white bg-gradient-to-br from-emerald-600 to-teal-700 shadow-sm relative overflow-hidden">
                <span class="absolute -right-3 -bottom-4 text-7xl opacity-25">🛵</span>
                <p class="text-[10px] font-bold uppercase tracking-wider text-emerald-100">Entrega grátis</p>
                <p class="text-lg font-extrabold mt-0.5 leading-tight">${freeDelivery.length === 1 ? escapeHtml(freeDelivery[0].name) : `${freeDelivery.length} lojas sem taxa`}</p>
                <p class="text-xs mt-1 text-emerald-50">Peça sem pagar a entrega aqui na avenida.</p>
            </div>`);
    }

    banners.push(`
        <a href="20_mural_vizinhanca.html" data-banner="mural" class="snap-start shrink-0 w-[85%] rounded-2xl p-4 text-white bg-gradient-to-br from-indigo-600 to-violet-700 shadow-sm relative overflow-hidden">
            <span class="absolute -right-3 -bottom-4 text-7xl opacity-25">🎁</span>
            <p class="text-[10px] font-bold uppercase tracking-wider text-indigo-100">Mural da Vizinhança</p>
            <p class="text-lg font-extrabold mt-0.5 leading-tight">Desapegue ou encontre o que procura</p>
            <p class="text-xs mt-1 text-indigo-50">Anuncie grátis para os vizinhos →</p>
        </a>`);

    banners.push(`
        <a href="04_merchant_portal.html" data-banner="lojista" class="snap-start shrink-0 w-[85%] rounded-2xl p-4 text-white bg-gradient-to-br from-slate-700 to-slate-900 shadow-sm relative overflow-hidden">
            <span class="absolute -right-3 -bottom-4 text-7xl opacity-25">🏪</span>
            <p class="text-[10px] font-bold uppercase tracking-wider text-slate-300">Tem um comércio na avenida?</p>
            <p class="text-lg font-extrabold mt-0.5 leading-tight">Venda pelo Tipuanas.online</p>
            <p class="text-xs mt-1 text-slate-200">Cadastre sua loja em minutos →</p>
        </a>`);

    el.innerHTML = banners.join('');
}

function renderCategoryChips() {
    const chipsEl = document.getElementById('category-chips');
    if (!chipsEl) return;
    const categories = [...new Set(allStores.map(s => s.category).filter(Boolean))].sort();

    if (categories.length < 2) {
        chipsEl.innerHTML = '';
        return;
    }

    const chip = (value, label, icon) => {
        const active = (activeCategory || '') === value;
        return `<button data-category="${escapeHtml(value)}" class="shrink-0 w-[72px] flex flex-col items-center gap-1 group">
            <span class="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl transition ${active ? 'bg-emerald-600 shadow-md ring-2 ring-emerald-300' : 'bg-white border border-slate-200 shadow-sm'}">${icon}</span>
            <span class="text-[10px] font-semibold text-center leading-tight ${active ? 'text-emerald-700' : 'text-slate-600'}">${escapeHtml(label)}</span>
        </button>`;
    };

    chipsEl.innerHTML = chip('', 'Todas', '✨') + categories.map(c => chip(c, c, categoryIcon(c))).join('');
}

function productPriceHtml(product, size = 'text-xs') {
    const eff = effectivePrice(product);
    return eff < Number(product.price)
        ? `<span class="${size} font-extrabold text-emerald-600">${formatBRL(eff)}</span> <span class="text-[10px] text-slate-400 line-through" data-role="old-price">${formatBRL(product.price)}</span>`
        : `<span class="${size} font-extrabold text-slate-800">${formatBRL(product.price)}</span>`;
}

function cartQuantity(productId) {
    const item = cart.find(i => i.id === productId);
    return item ? item.quantity : 0;
}

/** Botão "+" ou, se o produto já está na sacola, o seletor − quantidade + */
function cartControl(product, store) {
    if (product.is_paused) return `<span data-role="sold-out" class="text-[10px] font-bold text-white bg-slate-500 rounded-full px-2 py-1 shadow">Esgotado</span>`;
    if (!isOpen(store)) return `<span class="text-[10px] text-slate-400 bg-white/90 rounded px-1">Fechada</span>`;
    const id = escapeHtml(product.id);
    const qty = cartQuantity(product.id);
    const plus = `<button data-add-product="${id}" aria-label="Adicionar ${escapeHtml(product.name)}" class="w-8 h-8 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-bold leading-none shadow-md active:scale-90 transition">+</button>`;
    if (!qty) return plus;
    return `<span class="inline-flex items-center gap-1 bg-white rounded-full shadow-md border border-emerald-100 p-0.5">
        <button data-remove-product="${id}" aria-label="Diminuir" class="w-7 h-7 rounded-full text-emerald-700 text-lg font-bold leading-none active:scale-90 transition">−</button>
        <span data-role="qty" class="min-w-[1.25rem] text-center text-sm font-extrabold text-slate-800">${qty}</span>
        ${plus.replace('w-8 h-8', 'w-7 h-7')}
    </span>`;
}

function addButton(product, store) {
    return `<span data-cart-slot="${escapeHtml(product.id)}">${cartControl(product, store)}</span>`;
}

/** Atualiza só os botões do produto na tela (sem redesenhar as faixas) */
function refreshCartSlots(productId) {
    const product = productsById[productId];
    if (!product) return;
    const html = cartControl(product, storeOf(product));
    document.querySelectorAll(`[data-cart-slot="${CSS.escape(productId)}"]`).forEach(el => { el.innerHTML = html; });
}

function productThumb(product, store, cls) {
    return product.image_url
        ? `<img src="${escapeHtml(product.image_url)}" alt="" loading="lazy" class="${cls} object-cover bg-slate-100">`
        : `<div class="${cls} bg-gradient-to-br from-emerald-50 to-slate-100 flex items-center justify-center text-3xl">${categoryIcon(store && store.category)}</div>`;
}

/** Cartão de produto para as faixas horizontais (ofertas / destaques) */
function productCard(product) {
    const store = storeOf(product);
    const pct = discountPercent(product);
    return `
        <div class="snap-start shrink-0 w-36 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
            <div class="relative">
                ${productThumb(product, store, 'w-full h-24')}
                ${pct ? `<span class="absolute top-1.5 left-1.5 bg-rose-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-md">-${pct}%</span>` : ''}
                <div class="absolute -bottom-3 right-2">${addButton(product, store)}</div>
            </div>
            <div class="p-2.5 pt-3 flex-1 flex flex-col">
                <p class="text-xs font-semibold text-slate-800 leading-tight line-clamp-2">${escapeHtml(product.name)}</p>
                <p class="text-[10px] text-slate-400 truncate mt-0.5">${escapeHtml(store ? store.name : '')}</p>
                <p class="mt-auto pt-1">${productPriceHtml(product)}</p>
            </div>
        </div>`;
}

function renderRow(sectionId, rowId, items, render) {
    const section = document.getElementById(sectionId);
    const row = document.getElementById(rowId);
    if (!section || !row) return;
    section.classList.toggle('hidden', items.length === 0);
    row.innerHTML = items.map(render).join('');
}

function inCategory(store) {
    return !activeCategory || (store && store.category === activeCategory);
}

function renderOffers() {
    const offers = allProducts
        .filter(p => !p.is_paused && discountPercent(p) > 0 && inCategory(storeOf(p)))
        .sort((a, b) => discountPercent(b) - discountPercent(a))
        .slice(0, 12);
    renderRow('offers-section', 'offers-row', offers, productCard);
}

function renderFeatured() {
    const featured = allProducts.filter(p => !p.is_paused && p.is_featured && inCategory(storeOf(p))).slice(0, 12);
    renderRow('featured-section', 'featured-row', featured, productCard);
}

function renderTopStores() {
    const top = allStores
        .filter(s => ratingsByStore[s.id] && inCategory(s))
        .sort((a, b) => storeRating(b.id) - storeRating(a.id))
        .slice(0, 8);
    renderRow('top-stores-section', 'top-stores-row', top, store => `
        <a href="${storeHref(store)}" class="snap-start shrink-0 w-24 flex flex-col items-center gap-1 text-center">
            ${storeLogo(store, 'w-16 h-16 text-2xl')}
            <span class="text-[11px] font-semibold text-slate-700 leading-tight line-clamp-2">${escapeHtml(store.name)}</span>
            ${ratingBadge(store.id)}
        </a>`);
}

function storeHref(store) {
    if (store.listing_type === 'orcamento' && !store.slug) return `18_solicitar_orcamento.html?store=${encodeURIComponent(store.id)}`;
    return store.slug ? `loja.html?slug=${encodeURIComponent(store.slug)}` : '#';
}

function storeLogo(store, cls) {
    return store.logo_url
        ? `<img src="${escapeHtml(store.logo_url)}" alt="" loading="lazy" class="${cls} rounded-2xl object-cover bg-white border border-slate-100 shadow-sm shrink-0">`
        : `<span class="${cls} rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">${categoryIcon(store.category)}</span>`;
}

function ratingBadge(storeId) {
    const agg = ratingsByStore[storeId];
    if (!agg || agg.count === 0) return '';
    return `<span class="text-[10px] font-bold text-amber-600">★ ${(agg.sum / agg.count).toFixed(1).replace('.', ',')} <span class="font-normal text-slate-400">(${agg.count})</span></span>`;
}

/** Cartão de loja da lista principal */
function storeCard(store) {
    const quote = store.listing_type === 'orcamento';
    const status = storeOpenStatus(store.opening_hours);
    const meta = [];
    if (store.category) meta.push(escapeHtml(store.category));
    if (!quote && Number(store.avg_prep_time_minutes) > 0) meta.push(`${Number(store.avg_prep_time_minutes)} min`);
    const fee = quote ? '' : (Number(store.delivery_fee) > 0
        ? `<span class="text-slate-500">Entrega ${formatBRL(store.delivery_fee)}</span>`
        : `<span class="text-emerald-600 font-bold">Entrega grátis</span>`);
    const href = quote && !store.slug ? `18_solicitar_orcamento.html?store=${encodeURIComponent(store.id)}` : storeHref(store);

    return `
        <a href="${href}" class="flex items-center gap-3 bg-white rounded-2xl p-3 border border-slate-100 shadow-sm hover:border-emerald-200 transition ${!quote && !status.open ? 'opacity-70' : ''}">
            ${storeLogo(store, 'w-14 h-14 text-2xl')}
            <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                    <h3 class="font-bold text-slate-900 text-sm truncate">${escapeHtml(store.name)}</h3>
                    ${ratingBadge(store.id)}
                </div>
                <p class="text-[11px] text-slate-500 truncate">${meta.join(' • ')}</p>
                <p class="text-[11px] mt-0.5 flex flex-wrap gap-x-2">
                    ${quote ? '<span class="text-amber-700 font-bold">Sob orçamento</span>'
                        : status.open ? fee
                        : `<span data-role="closed-badge" class="text-slate-500 font-bold">Fechada · ${escapeHtml(status.label)}</span>`}
                </p>
            </div>
            <span class="text-slate-300 text-lg">›</span>
        </a>`;
}

/** Linha de produto (resultado de busca e página da loja) */
function productRow(product, { showStore = false } = {}) {
    const store = storeOf(product);
    const pct = discountPercent(product);
    return `
        <div class="flex items-start justify-between gap-3 bg-white py-3 border-b border-slate-100 last:border-none ${product.is_paused ? 'opacity-50' : ''}">
            <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-slate-800 leading-tight">${escapeHtml(product.name)}</p>
                ${product.description ? `<p class="text-[11px] text-slate-500 mt-0.5 line-clamp-2">${escapeHtml(product.description)}</p>` : ''}
                ${showStore && store ? `<p class="text-[10px] text-slate-400 mt-0.5">${escapeHtml(store.name)}</p>` : ''}
                <p class="mt-1">${productPriceHtml(product, 'text-sm')}${pct ? ` <span class="text-[10px] font-bold text-rose-500">-${pct}%</span>` : ''}</p>
            </div>
            <div class="relative shrink-0">
                ${product.image_url ? `<img src="${escapeHtml(product.image_url)}" alt="" loading="lazy" class="w-20 h-20 rounded-xl object-cover bg-slate-100">` : '<div class="w-12 h-8"></div>'}
                <div class="absolute -bottom-2 -right-1">${addButton(product, store)}</div>
            </div>
        </div>`;
}

function sortStores(stores) {
    const rank = s => s.listing_type === 'orcamento' ? 1 : (storeOpenStatus(s.opening_hours).open ? 0 : 2);
    return [...stores].sort((a, b) => rank(a) - rank(b) || storeRating(b.id) - storeRating(a.id) || a.name.localeCompare(b.name));
}

function renderStores() {
    if (STORE_SLUG !== null) return renderStoreMenu();
    const container = document.getElementById('stores-container');
    const title = document.getElementById('stores-title');

    if (searchTerm) {
        const stores = allStores.filter(s => normalize(`${s.name} ${s.category} ${s.description}`).includes(searchTerm));
        const products = allProducts.filter(p => normalize(`${p.name} ${p.description} ${p.section}`).includes(searchTerm) && storeOf(p));
        if (title) title.textContent = 'Resultados da busca';
        if (!stores.length && !products.length) {
            container.innerHTML = `<p class="text-center text-xs text-slate-400 py-8">Nada encontrado para essa busca.</p>`;
            return;
        }
        container.innerHTML = `
            ${stores.length ? `<div class="space-y-2">${sortStores(stores).map(storeCard).join('')}</div>` : ''}
            ${products.length ? `<div class="bg-white rounded-2xl px-3 border border-slate-100 shadow-sm">
                <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider pt-3">Produtos</p>
                ${products.map(p => productRow(p, { showStore: true })).join('')}
            </div>` : ''}`;
        return;
    }

    const visible = sortStores(allStores.filter(inCategory));
    if (title) title.textContent = activeCategory ? activeCategory : 'Todas as lojas';
    if (visible.length === 0) {
        container.innerHTML = `<p class="text-center text-xs text-slate-400 py-8">${allStores.length === 0 ? 'Nenhum estabelecimento disponível no momento.' : 'Nada encontrado com esse filtro.'}</p>`;
        return;
    }
    container.innerHTML = visible.map(storeCard).join('');
}

// ============================================================== PÁGINA DA LOJA

/**
 * Página própria da loja: capa, cupons, abas por seção e cardápio
 */
async function loadSingleStore(container) {
    const header = document.getElementById('store-header');
    const { data: store } = await sb.from('stores').select('*').eq('slug', STORE_SLUG || '').maybeSingle();

    if (!store || !store.is_active) {
        header.innerHTML = '';
        container.innerHTML = `<div class="text-center py-10 space-y-2">
            <p class="text-sm font-bold text-slate-700">Loja não encontrada</p>
            <a href="index.html" class="text-xs text-emerald-700 underline">Ver todas as lojas do bairro</a></div>`;
        return;
    }

    document.title = `${store.name} — Tipuanas.online`;

    const [{ data: products }, { data: reviews }] = await Promise.all([
        sb.from('products').select('*').eq('store_id', store.id).order('name'),
        sb.from('reviews').select('rating, comment, created_at').eq('store_id', store.id).order('created_at', { ascending: false }),
        loadPublicCoupons()
    ]);

    allStores = [store];
    allProducts = products || [];
    indexProducts();
    aggregateRatings((reviews || []).map(r => ({ ...r, store_id: store.id })));

    renderStoreHeader(store, reviews || []);

    if (store.is_paused) {
        container.innerHTML = `<p class="text-center text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3">Esta loja está fechada no momento. Volte mais tarde!</p>`;
        return;
    }
    if (store.listing_type === 'orcamento') {
        container.innerHTML = `<div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-3 text-center">
            <p class="text-sm text-slate-600">${escapeHtml(store.description || 'Solicite um orçamento e o prestador entra em contato pra combinar os detalhes.')}</p>
            <a href="18_solicitar_orcamento.html?store=${encodeURIComponent(store.id)}" class="block bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold py-3 rounded-xl">Solicitar orçamento</a>
        </div>`;
        return;
    }
    renderStores();
}

function renderStoreHeader(store, reviews) {
    const header = document.getElementById('store-header');
    const agg = ratingsByStore[store.id];
    const whatsapp = toWhatsappNumber(store.whatsapp_number);
    const recent = reviews.filter(r => r.comment).slice(0, 3);
    const status = storeOpenStatus(store.opening_hours);
    const hasHours = store.opening_hours && Object.keys(store.opening_hours).length;
    const coupons = publicCoupons.filter(c => c.store_id === store.id);

    header.innerHTML = `
        <div class="-mx-4 -mt-5 mb-10 relative">
            ${store.cover_url
                ? `<img src="${escapeHtml(store.cover_url)}" alt="" class="w-full h-36 object-cover">`
                : `<div class="w-full h-32 bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 flex items-center justify-center text-6xl opacity-90">${categoryIcon(store.category)}</div>`}
            <div class="absolute left-4 -bottom-8">${storeLogo(store, 'w-16 h-16 text-3xl ring-4 ring-slate-50')}</div>
        </div>
        <div class="space-y-2">
            <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                    <h2 class="text-xl font-extrabold text-slate-900 leading-tight">${escapeHtml(store.name)}</h2>
                    ${store.category ? `<p class="text-xs text-slate-500">${escapeHtml(store.category)}</p>` : ''}
                </div>
                ${agg ? `<span class="shrink-0 text-sm font-bold text-amber-600">★ ${(agg.sum / agg.count).toFixed(1).replace('.', ',')} <span class="text-[10px] font-normal text-slate-400">(${agg.count})</span></span>` : ''}
            </div>
            ${store.description ? `<p class="text-xs text-slate-600">${escapeHtml(store.description)}</p>` : ''}
            <div class="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                ${hasHours ? `<span class="font-bold ${status.open ? 'text-emerald-700' : 'text-slate-500'}">${status.open ? '🟢 Aberta agora' : `🔴 Fechada · ${escapeHtml(status.label)}`}</span>` : ''}
                ${store.listing_type !== 'orcamento' ? `<span>🛵 ${Number(store.delivery_fee) > 0 ? `Entrega ${formatBRL(store.delivery_fee)}` : 'Entrega grátis'}</span>` : ''}
                ${Number(store.avg_prep_time_minutes) > 0 ? `<span>⏱️ ${Number(store.avg_prep_time_minutes)} min</span>` : ''}
                ${store.address_line ? `<span>📍 ${escapeHtml(store.address_line)}</span>` : ''}
            </div>
            ${coupons.length ? `<div class="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">${coupons.map(c => `
                <div data-role="store-coupon" class="shrink-0 border border-dashed border-rose-300 bg-rose-50 text-rose-700 rounded-xl px-3 py-2">
                    <p class="text-xs font-extrabold">🏷️ ${c.discount_type === 'percentage' ? `${Number(c.discount_value)}% OFF` : `${formatBRL(c.discount_value)} OFF`}</p>
                    <p class="text-[10px]">Cupom <span class="font-mono font-bold">${escapeHtml(c.code)}</span>${Number(c.min_order_value) > 0 ? ` · mín. ${formatBRL(c.min_order_value)}` : ''}</p>
                </div>`).join('')}</div>` : ''}
            <div class="flex gap-2 pt-1">
                ${whatsapp ? `<a href="https://wa.me/${whatsapp}" target="_blank" rel="noopener" class="flex-1 text-center text-xs font-semibold bg-white border border-emerald-200 text-emerald-700 rounded-xl py-2">💬 WhatsApp</a>` : ''}
                <button id="share-store-btn" class="flex-1 text-xs font-semibold bg-white border border-slate-200 text-slate-600 rounded-xl py-2">🔗 Compartilhar</button>
            </div>
            ${recent.length ? `<div class="bg-white rounded-2xl border border-slate-100 p-3 space-y-1.5">
                ${recent.map(r => `<p class="text-[11px] text-slate-600"><span class="text-amber-500">${'★'.repeat(r.rating)}</span> ${escapeHtml(r.comment)}</p>`).join('')}
            </div>` : ''}
        </div>
    `;

    document.getElementById('share-store-btn').addEventListener('click', async () => {
        const url = window.location.href;
        try {
            if (navigator.share) {
                await navigator.share({ title: store.name, text: `Peça na ${store.name} pelo Tipuanas.online`, url });
            } else {
                await navigator.clipboard.writeText(url);
                alert('Link copiado!');
            }
        } catch (e) { /* compartilhamento cancelado */ }
    });
}

/** Cardápio da loja agrupado por seção, com abas no topo */
function renderStoreMenu() {
    const container = document.getElementById('stores-container');
    const tabsEl = document.getElementById('section-tabs');
    const store = allStores[0];

    if (allProducts.length === 0) {
        if (tabsEl) tabsEl.innerHTML = '';
        container.innerHTML = '<p class="text-center text-xs text-slate-400 py-8">Nenhum produto cadastrado nesta loja ainda.</p>';
        return;
    }

    const groups = [];
    const featured = allProducts.filter(p => p.is_featured && !p.is_paused);
    if (featured.length) groups.push({ name: '⭐ Destaques', items: featured });
    const bySection = {};
    allProducts.forEach(p => {
        const name = (p.section || '').trim() || 'Outros';
        (bySection[name] = bySection[name] || []).push(p);
    });
    Object.keys(bySection)
        .sort((a, b) => (a === 'Outros') - (b === 'Outros') || a.localeCompare(b))
        .forEach(name => groups.push({ name, items: bySection[name].sort((a, b) => Boolean(a.is_paused) - Boolean(b.is_paused)) }));

    const status = storeOpenStatus(store.opening_hours);
    if (tabsEl) {
        tabsEl.innerHTML = groups.length > 1 ? groups.map((g, i) =>
            `<button data-section-tab="sec-${i}" class="shrink-0 text-xs font-bold px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-600 hover:border-emerald-400">${escapeHtml(g.name)}</button>`
        ).join('') : '';
    }

    container.innerHTML = `
        ${!status.open ? `<p data-role="closed-badge" class="text-center text-xs text-slate-600 bg-slate-100 border border-slate-200 rounded-xl p-3">Loja fechada · ${escapeHtml(status.label)}. Você pode ver o cardápio, mas não dá para pedir agora.</p>` : ''}
        ${groups.map((g, i) => `
            <section id="sec-${i}" data-section="${escapeHtml(g.name)}" class="scroll-mt-28">
                <h3 class="text-base font-extrabold text-slate-900 mb-1">${escapeHtml(g.name)}</h3>
                <div class="bg-white rounded-2xl px-3 border border-slate-100 shadow-sm">
                    ${g.items.map(p => productRow(p)).join('')}
                </div>
            </section>`).join('')}`;
}

// ============================================================== CARRINHO

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
        existing.price = effectivePrice(product);
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: effectivePrice(product),
            storeId: product.store_id,
            storeName: store ? store.name : 'Loja',
            storeSlug: store ? store.slug || null : null,
            deliveryFee: store ? Number(store.delivery_fee || 0) : 0,
            image: product.image_url || null,
            quantity: 1
        });
    }
    saveCart();
    refreshCartSlots(productId);
    flashCartBar();
}

function removeFromCart(productId) {
    const item = cart.find(i => i.id === productId);
    if (!item) return;
    item.quantity -= 1;
    if (item.quantity <= 0) cart = cart.filter(i => i.id !== productId);
    saveCart();
    refreshCartSlots(productId);
}

function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartUI();
}

function flashCartBar() {
    const bar = document.getElementById('cart-bar');
    if (!bar) return;
    const target = bar.querySelector('a') || bar;
    target.classList.add('ring-4', 'ring-emerald-300', 'scale-[1.02]');
    setTimeout(() => target.classList.remove('ring-4', 'ring-emerald-300', 'scale-[1.02]'), 300);
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
