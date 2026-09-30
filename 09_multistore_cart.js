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
let platformDelivery = null; // regra de entrega da plataforma (platform_delivery)
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

// Ícone (config.js) de cada categoria, pelo começo do nome
const CATEGORY_ICONS = [
    ['padaria', 'loja'], ['mercado', 'mercado'], ['lanche', 'comida'], ['pizza', 'comida'], ['restaurante', 'comida'],
    ['bebida', 'bebida'], ['farm', 'farmacia'], ['pet', 'pet'], ['auto', 'carro'], ['servi', 'servico'],
    ['doce', 'comida'], ['confeit', 'comida'], ['acai', 'bebida'], ['horti', 'horti'], ['acoug', 'mercado'],
    ['beleza', 'beleza'], ['cafe', 'cafe'], ['sorvet', 'bebida'], ['japon', 'comida'], ['sushi', 'comida']
];

function categoryIcon(category, cls = 'w-6 h-6') {
    const key = normalize(category);
    const hit = CATEGORY_ICONS.find(([k]) => key.includes(k));
    return icon(hit ? hit[1] : 'loja', cls);
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
        const agg = ratingsByStore[r.store_id] || (ratingsByStore[r.store_id] = { sum: 0, count: 0, good: 0 });
        agg.sum += r.rating;
        agg.count += 1;
        if (r.rating >= 4) agg.good += 1;
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
/** Regra de entrega das lojas que usam os entregadores da plataforma (falha = segue sem ela) */
async function loadPlatformDelivery() {
    try {
        const { data } = await sb.from('platform_delivery').select('*').maybeSingle();
        platformDelivery = data || null;
    } catch (e) {
        platformDelivery = null;
    }
    return {};
}

async function loadStoresAndProducts() {
    const container = document.getElementById('stores-container');
    if (STORE_SLUG !== null) return loadSingleStore(container);

    const [{ data: stores, error: storeErr }, { data: products, error: prodErr }, { data: reviews }] = await Promise.all([
        sb.from('stores').select('*').eq('is_active', true).eq('is_paused', false).order('name'),
        sb.from('products').select('*').order('name'),
        sb.from('reviews').select('store_id, rating'),
        loadPublicCoupons(),
        loadPlatformDelivery()
    ]);

    // Nota média por loja (se a consulta de avaliações falhar, a vitrine segue sem nota)
    aggregateRatings(reviews);

    if (storeErr || prodErr) {
        console.error('Erro ao carregar vitrine:', storeErr || prodErr);
        container.innerHTML = `<p class="text-center text-sm text-slate-500 py-8">Não foi possível carregar a vitrine agora. Tente recarregar a página.</p>`;
        return;
    }

    allStores = stores || [];
    allProducts = products || [];
    indexProducts();

    const heroCount = document.getElementById('hero-count');
    if (heroCount && allStores.length) {
        heroCount.textContent = `${allStores.length} ${allStores.length === 1 ? 'loja' : 'lojas'} da Av. das Tipuanas. Você pede aqui e combina direto com a loja pelo WhatsApp.`;
    }
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
            <a href="${href}" data-banner="coupon" class="snap-start shrink-0 w-[85%] rounded-2xl p-4 text-slate-50 bg-emerald-800 relative overflow-hidden">
                <svg class="absolute -right-4 -bottom-6 w-24 h-24" viewBox="0 0 120 120" fill="none" aria-hidden="true"><circle cx="60" cy="60" r="44" stroke="#F0A93A" stroke-opacity="0.25" stroke-width="1.5"/><circle cx="60" cy="60" r="26" stroke="#F0A93A" stroke-opacity="0.35" stroke-width="1.5"/></svg>
                <p class="text-[11px] font-extrabold uppercase tracking-wider text-amber-500">Cupom · ${escapeHtml(c.store_name)}</p>
                <p class="font-display text-2xl font-extrabold mt-0.5">${off}</p>
                <p class="text-xs mt-1">Use <span class="font-mono font-bold bg-white/15 px-1.5 py-0.5 rounded">${escapeHtml(c.code)}</span>${Number(c.min_order_value) > 0 ? ` · pedido mín. ${formatBRL(c.min_order_value)}` : ''}</p>
            </a>`);
    });

    const freeDelivery = allStores.filter(s => s.listing_type !== 'orcamento' && deliveryFeeLabel(s, platformDelivery) === 'Entrega grátis');
    if (freeDelivery.length) {
        banners.push(`
            <div data-banner="free" class="snap-start shrink-0 w-[85%] rounded-2xl p-4 text-slate-50 bg-emerald-700 relative overflow-hidden">
                <svg class="absolute -right-4 -bottom-6 w-24 h-24" viewBox="0 0 120 120" fill="none" aria-hidden="true"><circle cx="60" cy="60" r="44" stroke="#F0A93A" stroke-opacity="0.25" stroke-width="1.5"/><circle cx="60" cy="60" r="26" stroke="#F0A93A" stroke-opacity="0.35" stroke-width="1.5"/></svg>
                <p class="text-[11px] font-extrabold uppercase tracking-wider text-amber-500">Entrega grátis</p>
                <p class="font-display text-lg font-extrabold mt-0.5 leading-tight">${freeDelivery.length === 1 ? escapeHtml(freeDelivery[0].name) : `${freeDelivery.length} lojas sem taxa`}</p>
                <p class="text-xs mt-1 text-slate-100">Peça sem pagar a entrega aqui na avenida.</p>
            </div>`);
    }

    banners.push(`
        <a href="20_mural_vizinhanca.html" data-banner="mural" class="snap-start shrink-0 w-[85%] rounded-2xl p-4 text-emerald-900 bg-slate-100 border border-slate-200 relative overflow-hidden">
            <p class="text-[11px] font-extrabold uppercase tracking-wider text-amber-700">Mural da Vizinhança</p>
            <p class="font-display text-lg font-extrabold mt-0.5 leading-tight">Desapegue ou encontre o que procura</p>
            <p class="text-xs mt-1 text-slate-500 flex items-center gap-1">Anuncie grátis para os vizinhos ${icon('seguir', 'w-3.5 h-3.5')}</p>
        </a>`);

    banners.push(`
        <a href="04_merchant_portal.html" data-banner="lojista" class="snap-start shrink-0 w-[85%] rounded-2xl p-4 text-slate-50 bg-slate-900 relative overflow-hidden">
            <svg class="absolute -right-4 -bottom-6 w-24 h-24" viewBox="0 0 120 120" fill="none" aria-hidden="true"><circle cx="60" cy="60" r="44" stroke="#F0A93A" stroke-opacity="0.25" stroke-width="1.5"/><circle cx="60" cy="60" r="26" stroke="#F0A93A" stroke-opacity="0.35" stroke-width="1.5"/></svg>
            <p class="text-[11px] font-extrabold uppercase tracking-wider text-amber-500">Tem um comércio na avenida?</p>
            <p class="font-display text-lg font-extrabold mt-0.5 leading-tight">Venda pelo Tipuanas.online</p>
            <p class="text-xs mt-1 text-slate-100 flex items-center gap-1">Cadastre sua loja em minutos ${icon('seguir', 'w-3.5 h-3.5')}</p>
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

    const chip = (value, label, svg) => {
        const active = (activeCategory || '') === value;
        return `<button type="button" data-category="${escapeHtml(value)}" aria-pressed="${active}" class="shrink-0 min-h-[44px] px-4 rounded-full flex items-center gap-2 text-[13px] font-bold border transition ${active ? 'bg-emerald-700 border-emerald-700 text-slate-50' : 'bg-white border-slate-200 text-slate-900'}">
            ${svg}<span class="whitespace-nowrap">${escapeHtml(label)}</span>
        </button>`;
    };

    chipsEl.innerHTML = chip('', 'Todas', icon('todas', 'w-4 h-4')) + categories.map(c => chip(c, c, categoryIcon(c, 'w-4 h-4'))).join('');
}

function productPriceHtml(product, size = 'text-xs') {
    const eff = effectivePrice(product);
    return eff < Number(product.price)
        ? `<span class="${size} font-extrabold text-red-600 tabular-nums">${formatBRL(eff)}</span> <span class="text-xs text-slate-500 line-through tabular-nums" data-role="old-price">${formatBRL(product.price)}</span>`
        : `<span class="${size} font-extrabold text-slate-900 tabular-nums">${formatBRL(product.price)}</span>`;
}

/** Quantidade do produto na sacola (somando as linhas com opções diferentes) */
function cartQuantity(productId) {
    return cart.filter(i => i.id === productId).reduce((acc, i) => acc + i.quantity, 0);
}

/** Linha da sacola: produto + opções + observação (a mesma pizza com bordas diferentes são linhas diferentes) */
function lineKey(item) {
    return item.key || item.id;
}

function hasOptions(product) {
    return Array.isArray(product.options) && product.options.length > 0;
}

/** Botão "+" ou, se o produto já está na sacola, o seletor − quantidade + */
function cartControl(product, store) {
    if (product.is_paused) return `<span data-role="sold-out" class="text-xs font-bold text-slate-50 bg-slate-600 rounded-full px-2 py-1">Esgotado</span>`;
    if (!isOpen(store)) return `<span class="text-xs text-slate-500 bg-white/95 rounded px-1.5">Fechada</span>`;
    const id = escapeHtml(product.id);
    const qty = cartQuantity(product.id);
    const plus = size => `<button type="button" data-add-product="${id}" aria-label="Adicionar ${escapeHtml(product.name)}" class="hit44 ${size} rounded-full bg-emerald-700 hover:bg-emerald-800 text-slate-50 flex items-center justify-center shadow-md active:scale-90 transition">${icon('mais', 'w-4 h-4')}</button>`;
    if (!qty) return plus('w-9 h-9');
    return `<span class="inline-flex items-center gap-2 bg-white rounded-full shadow-md border border-slate-200 p-0.5">
        <button type="button" data-remove-product="${id}" aria-label="Diminuir ${escapeHtml(product.name)}" class="hit44 w-8 h-8 rounded-full text-emerald-700 flex items-center justify-center active:scale-90 transition">${icon('menos', 'w-4 h-4')}</button>
        <span data-role="qty" class="min-w-[1.25rem] text-center text-sm font-extrabold text-slate-900 tabular-nums">${qty}</span>
        ${plus('w-8 h-8')}
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
        : `<div class="${cls} bg-slate-100 text-slate-500 flex items-center justify-center">${categoryIcon(store && store.category, 'w-8 h-8')}</div>`;
}

/** Cartão de produto para as faixas horizontais (ofertas / destaques) */
function productCard(product) {
    const store = storeOf(product);
    const pct = discountPercent(product);
    return `
        <div class="snap-start shrink-0 w-36 bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div class="relative">
                ${productThumb(product, store, 'w-full h-24')}
                ${pct ? `<span class="absolute top-1.5 left-1.5 bg-red-600 text-slate-50 text-xs font-extrabold px-1.5 py-0.5 rounded-md tabular-nums">-${pct}%</span>` : ''}
                <div class="absolute -bottom-3 right-2">${addButton(product, store)}</div>
            </div>
            <div class="p-2.5 pt-3 flex-1 flex flex-col">
                <p class="text-[13px] font-semibold text-slate-900 leading-tight line-clamp-2">${escapeHtml(product.name)}</p>
                <p class="text-xs text-slate-500 truncate mt-0.5">${escapeHtml(store ? store.name : '')}</p>
                <p class="mt-auto pt-1">${productPriceHtml(product, 'text-sm')}</p>
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
            ${storeLogo(store, 'w-16 h-16')}
            <span class="text-xs font-semibold text-slate-900 leading-tight line-clamp-2">${escapeHtml(store.name)}</span>
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
        : `<span class="${cls} rounded-2xl bg-slate-100 border border-slate-200 text-emerald-700 flex items-center justify-center shrink-0">${categoryIcon(store.category, 'w-7 h-7')}</span>`;
}

function ratingBadge(storeId) {
    const agg = ratingsByStore[storeId];
    if (!agg || agg.count === 0) return '';
    return `<span class="text-xs font-bold text-amber-700 tabular-nums whitespace-nowrap">★ ${(agg.sum / agg.count).toFixed(1).replace('.', ',')} <span class="font-normal text-slate-500">(${agg.count})</span></span>`;
}

/**
 * Selos de confiança (por enquanto só visuais): loja aprovada pelo admin e vizinhos
 * que deram 4 ou 5 estrelas.
 */
function trustBadges(store) {
    const agg = ratingsByStore[store.id];
    const good = agg ? agg.good : 0;
    const parts = [];
    if (store.approval_status === 'aprovada') {
        parts.push(`<span data-role="verified" class="flex items-center gap-1 text-xs font-bold text-emerald-600">${icon('verificada', 'w-3.5 h-3.5')}Loja verificada</span>`);
    }
    if (good > 0) {
        parts.push(`<span data-role="recommended" class="text-xs text-slate-500">Recomendada por <span class="font-bold text-slate-900">${good} ${good === 1 ? 'vizinho' : 'vizinhos'}</span></span>`);
    }
    return parts.length ? `<div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">${parts.join('')}</div>` : '';
}

/** Cartão de loja da lista principal */
function storeCard(store) {
    const quote = store.listing_type === 'orcamento';
    const status = storeOpenStatus(store.opening_hours);
    const meta = [];
    if (store.category) meta.push(escapeHtml(store.category));
    if (!quote && Number(store.avg_prep_time_minutes) > 0) meta.push(`${Number(store.avg_prep_time_minutes)} min`);
    const feeText = quote ? '' : deliveryFeeLabel(store, platformDelivery);
    const fee = quote ? '' : feeText === 'Entrega grátis'
        ? `<span class="text-emerald-600 font-bold">Entrega grátis</span>`
        : `<span class="text-slate-500 tabular-nums">${escapeHtml(feeText)}</span>`;
    const href = quote && !store.slug ? `18_solicitar_orcamento.html?store=${encodeURIComponent(store.id)}` : storeHref(store);

    return `
        <a href="${href}" class="flex items-center gap-3 bg-white rounded-2xl p-3 border border-slate-200 hover:border-emerald-400 transition ${!quote && !status.open ? 'opacity-75' : ''}">
            ${storeLogo(store, 'w-16 h-16')}
            <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                    <h3 class="font-display font-extrabold text-emerald-800 text-base truncate">${escapeHtml(store.name)}</h3>
                    ${ratingBadge(store.id)}
                </div>
                <p class="text-xs text-slate-500 truncate">${meta.join(' · ')}</p>
                ${trustBadges(store)}
                <p class="text-xs mt-1 flex flex-wrap gap-x-2">
                    ${quote ? '<span class="text-amber-700 font-bold">Sob orçamento</span>'
                        : status.open ? `<span class="font-bold text-emerald-600">Aberta</span> ${fee}`
                        : `<span data-role="closed-badge" class="text-slate-500 font-bold">Fechada · ${escapeHtml(status.label)}</span>`}
                </p>
            </div>
            <span class="text-slate-400">${icon('seguir', 'w-5 h-5')}</span>
        </a>`;
}

/** Linha de produto (resultado de busca e página da loja) */
function productRow(product, { showStore = false } = {}) {
    const store = storeOf(product);
    const pct = discountPercent(product);
    return `
        <div class="flex items-start justify-between gap-3 bg-white py-3 border-b border-slate-100 last:border-none ${product.is_paused ? 'opacity-60' : ''}">
            <div class="min-w-0 flex-1">
                <p class="text-sm font-bold text-slate-900 leading-tight">${escapeHtml(product.name)}</p>
                ${product.description ? `<p class="text-xs text-slate-500 mt-0.5 line-clamp-2">${escapeHtml(product.description)}</p>` : ''}
                ${showStore && store ? `<p class="text-xs text-slate-500 mt-0.5">${escapeHtml(store.name)}</p>` : ''}
                <p class="mt-1">${productPriceHtml(product, 'text-sm')}${pct ? ` <span class="text-xs font-bold text-red-600 tabular-nums">-${pct}%</span>` : ''}</p>
            </div>
            <div class="relative shrink-0">
                ${product.image_url ? `<img src="${escapeHtml(product.image_url)}" alt="" loading="lazy" class="w-20 h-20 rounded-xl object-cover bg-slate-100">` : '<div class="w-12 h-10"></div>'}
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
            container.innerHTML = `<p class="text-center text-sm text-slate-500 py-8">Nada encontrado para essa busca.</p>`;
            return;
        }
        container.innerHTML = `
            ${stores.length ? `<div class="space-y-2">${sortStores(stores).map(storeCard).join('')}</div>` : ''}
            ${products.length ? `<div class="bg-white rounded-2xl px-3 border border-slate-200">
                <p class="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider pt-3">Produtos</p>
                ${products.map(p => productRow(p, { showStore: true })).join('')}
            </div>` : ''}`;
        return;
    }

    const visible = sortStores(allStores.filter(inCategory));
    if (title) title.textContent = activeCategory ? activeCategory : 'Todas as lojas';
    if (visible.length === 0) {
        container.innerHTML = `<p class="text-center text-sm text-slate-500 py-8">${allStores.length === 0 ? 'Nenhum estabelecimento disponível no momento.' : 'Nada encontrado com esse filtro.'}</p>`;
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
            <p class="text-sm font-bold text-slate-900">Loja não encontrada</p>
            <a href="index.html" class="inline-flex min-h-[44px] items-center text-sm text-emerald-700 underline">Ver todas as lojas da avenida</a></div>`;
        return;
    }

    document.title = `${store.name} — Tipuanas.online`;

    const [{ data: products }, { data: reviews }] = await Promise.all([
        sb.from('products').select('*').eq('store_id', store.id).order('name'),
        sb.from('reviews').select('rating, comment, created_at').eq('store_id', store.id).order('created_at', { ascending: false }),
        loadPublicCoupons(),
        loadPlatformDelivery()
    ]);

    allStores = [store];
    allProducts = products || [];
    indexProducts();
    aggregateRatings((reviews || []).map(r => ({ ...r, store_id: store.id })));

    renderStoreHeader(store, reviews || []);

    if (store.is_paused) {
        container.innerHTML = `<p class="text-center text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">Esta loja está fechada no momento. Volte mais tarde.</p>`;
        return;
    }
    if (store.listing_type === 'orcamento') {
        container.innerHTML = `<div class="bg-white rounded-2xl p-4 border border-slate-200 space-y-3 text-center">
            <p class="text-sm text-slate-600">${escapeHtml(store.description || 'Solicite um orçamento e o prestador entra em contato pra combinar os detalhes.')}</p>
            <a href="18_solicitar_orcamento.html?store=${encodeURIComponent(store.id)}" class="flex min-h-[48px] items-center justify-center bg-amber-500 hover:bg-amber-600 text-emerald-900 text-sm font-extrabold rounded-xl">Pedir um orçamento</a>
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
                : `<div class="w-full h-32 bg-emerald-700 text-amber-500 flex items-center justify-center">${categoryIcon(store.category, 'w-12 h-12')}</div>`}
            <div class="absolute left-4 -bottom-8">${storeLogo(store, 'w-16 h-16 ring-4 ring-slate-50')}</div>
        </div>
        <div class="space-y-2">
            <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                    <h1 class="text-2xl font-extrabold text-emerald-800 leading-tight">${escapeHtml(store.name)}</h1>
                    ${store.category ? `<p class="text-xs text-slate-500">${escapeHtml(store.category)}</p>` : ''}
                    ${trustBadges(store)}
                </div>
                ${agg ? `<span class="shrink-0 text-sm font-bold text-amber-700 tabular-nums">★ ${(agg.sum / agg.count).toFixed(1).replace('.', ',')} <span class="text-xs font-normal text-slate-500">(${agg.count})</span></span>` : ''}
            </div>
            ${store.description ? `<p class="text-sm text-slate-600">${escapeHtml(store.description)}</p>` : ''}
            <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                ${hasHours ? `<span class="flex items-center gap-1.5 font-bold ${status.open ? 'text-emerald-600' : 'text-red-600'}"><span class="w-2 h-2 rounded-full ${status.open ? 'bg-emerald-500' : 'bg-red-500'}" aria-hidden="true"></span>${status.open ? 'Aberta agora' : `Fechada · ${escapeHtml(status.label)}`}</span>` : ''}
                ${store.listing_type !== 'orcamento' ? `<span class="flex items-center gap-1 tabular-nums">${icon('entrega', 'w-4 h-4')}${escapeHtml(deliveryFeeLabel(store, platformDelivery))}</span>` : ''}
                ${Number(store.avg_prep_time_minutes) > 0 ? `<span class="flex items-center gap-1 tabular-nums">${icon('relogio', 'w-4 h-4')}${Number(store.avg_prep_time_minutes)} min</span>` : ''}
                ${store.address_line ? `<span class="flex items-center gap-1">${icon('local', 'w-4 h-4')}${escapeHtml(store.address_line)}</span>` : ''}
            </div>
            ${coupons.length ? `<div class="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">${coupons.map(c => `
                <div data-role="store-coupon" class="shrink-0 border border-dashed border-red-300 bg-red-50 text-red-600 rounded-xl px-3 py-2">
                    <p class="text-sm font-extrabold flex items-center gap-1.5 tabular-nums">${icon('cupom', 'w-4 h-4')}${c.discount_type === 'percentage' ? `${Number(c.discount_value)}% OFF` : `${formatBRL(c.discount_value)} OFF`}</p>
                    <p class="text-xs">Cupom <span class="font-mono font-bold">${escapeHtml(c.code)}</span>${Number(c.min_order_value) > 0 ? ` · mín. ${formatBRL(c.min_order_value)}` : ''}</p>
                </div>`).join('')}</div>` : ''}
            <div class="flex gap-2 pt-1">
                ${whatsapp ? `<a href="https://wa.me/${whatsapp}" target="_blank" rel="noopener" class="flex-1 min-h-[44px] flex items-center justify-center gap-2 text-sm font-bold bg-white border border-slate-200 text-emerald-700 rounded-xl">${icon('conversa', 'w-4 h-4')}WhatsApp</a>` : ''}
                <button type="button" id="share-store-btn" class="flex-1 min-h-[44px] flex items-center justify-center gap-2 text-sm font-bold bg-white border border-slate-200 text-slate-600 rounded-xl">${icon('compartilhar', 'w-4 h-4')}Compartilhar</button>
            </div>
            ${recent.length ? `<div class="bg-white rounded-2xl border border-slate-200 p-3 space-y-1.5">
                ${recent.map(r => `<p class="text-xs text-slate-600"><span class="text-amber-700" aria-label="${r.rating} de 5 estrelas">${'★'.repeat(r.rating)}</span> ${escapeHtml(r.comment)}</p>`).join('')}
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
        container.innerHTML = '<p class="text-center text-sm text-slate-500 py-8">Nenhum produto cadastrado nesta loja ainda.</p>';
        return;
    }

    const groups = [];
    const featured = allProducts.filter(p => p.is_featured && !p.is_paused);
    if (featured.length) groups.push({ name: 'Destaques', items: featured });
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
            `<button type="button" data-section-tab="sec-${i}" class="shrink-0 min-h-[44px] text-[13px] font-bold px-4 rounded-full bg-white border border-slate-200 text-slate-900 hover:border-emerald-400">${escapeHtml(g.name)}</button>`
        ).join('') : '';
    }

    container.innerHTML = `
        ${!status.open ? `<p data-role="closed-badge" class="text-center text-sm text-slate-600 bg-slate-100 border border-slate-200 rounded-xl p-3">Loja fechada · ${escapeHtml(status.label)}. Você pode ver o cardápio, mas não dá para pedir agora.</p>` : ''}
        ${groups.map((g, i) => `
            <section id="sec-${i}" data-section="${escapeHtml(g.name)}" class="scroll-mt-28">
                <h2 class="text-lg font-extrabold text-emerald-800 mb-1">${escapeHtml(g.name)}</h2>
                <div class="bg-white rounded-2xl px-3 border border-slate-200">
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
    // Produto com tamanho/sabores/adicionais: escolhe antes de pôr na sacola
    if (hasOptions(product)) {
        openOptionsSheet(product);
        return;
    }
    addLine(product, [], '', 1);
}

/** Põe na sacola uma linha (produto + opções escolhidas + observação) */
function addLine(product, selected, note, quantity) {
    const store = allStores.find(s => s.id === product.store_id);
    const extras = selected.reduce((acc, [g, o]) => acc + Number(product.options[g].options[o].price || 0), 0);
    const key = selected.length || note ? `${product.id}|${JSON.stringify(selected)}|${note}` : product.id;
    const existing = cart.find(item => lineKey(item) === key);
    if (existing) {
        existing.quantity += quantity;
        existing.price = effectivePrice(product) + extras;
    } else {
        cart.push({
            key,
            id: product.id,
            name: product.name,
            price: effectivePrice(product) + extras,
            options: selected,
            optionsLabel: selected.map(([g, o]) => product.options[g].options[o].name).join(', '),
            note: note || '',
            storeId: product.store_id,
            storeName: store ? store.name : 'Loja',
            storeSlug: store ? store.slug || null : null,
            deliveryFee: store ? deliveryRules(store, platformDelivery).base : 0,
            image: product.image_url || null,
            quantity
        });
    }
    saveCart();
    refreshCartSlots(product.id);
    flashCartBar();
}

function removeFromCart(productId) {
    // Tira uma unidade da última linha desse produto
    const lines = cart.filter(i => i.id === productId);
    const item = lines[lines.length - 1];
    if (!item) return;
    item.quantity -= 1;
    if (item.quantity <= 0) cart = cart.filter(i => i !== item);
    saveCart();
    refreshCartSlots(productId);
}

// ============================================================== OPÇÕES DO PRODUTO

/**
 * Painel do produto (estilo iFood): grupos de escolha com mínimo/máximo, observação,
 * quantidade e total. O preço final é recalculado no banco (place_order).
 */
function openOptionsSheet(product) {
    closeOptionsSheet();
    const state = { product, picked: product.options.map(() => []), qty: 1 };
    const sheet = document.createElement('div');
    sheet.id = 'options-sheet';
    sheet.className = 'fixed inset-0 z-50 flex items-end justify-center bg-black/40';
    sheet.innerHTML = `
        <div class="bg-white w-full max-w-md rounded-t-3xl max-h-[90vh] flex flex-col" role="dialog" aria-modal="true" aria-label="${escapeHtml(product.name)}">
            <div class="p-4 border-b border-slate-100 flex gap-3 items-start">
                ${product.image_url ? `<img src="${escapeHtml(product.image_url)}" alt="" class="w-16 h-16 rounded-xl object-cover bg-slate-100 shrink-0">` : ''}
                <div class="min-w-0 flex-1">
                    <h2 class="font-extrabold text-emerald-800 leading-tight">${escapeHtml(product.name)}</h2>
                    ${product.description ? `<p class="text-xs text-slate-500 mt-0.5">${escapeHtml(product.description)}</p>` : ''}
                    <p class="text-sm font-bold text-slate-900 mt-1 tabular-nums">${formatBRL(effectivePrice(product))}</p>
                </div>
                <button type="button" data-sheet-close class="w-11 h-11 -mr-2 -mt-2 flex items-center justify-center text-slate-500" aria-label="Fechar">${icon('fechar', 'w-5 h-5')}</button>
            </div>
            <div class="overflow-y-auto flex-1 px-4 pb-4">
                ${product.options.map((g, gi) => `
                    <fieldset class="pt-4" data-group="${gi}">
                        <div class="flex items-center justify-between bg-slate-50 -mx-4 px-4 py-2">
                            <div>
                                <legend class="text-sm font-extrabold text-slate-900">${escapeHtml(g.name)}</legend>
                                <p class="text-xs text-slate-500" data-group-hint="${gi}">${groupHint(g)}</p>
                            </div>
                            ${Number(g.min) > 0 ? '<span class="text-[11px] font-extrabold tracking-wide text-slate-50 bg-slate-700 rounded px-1.5 py-0.5">OBRIGATÓRIO</span>' : ''}
                        </div>
                        ${g.options.map((o, oi) => `
                            <label class="flex items-center justify-between gap-3 min-h-[48px] py-2 border-b border-slate-100 last:border-none cursor-pointer">
                                <span class="text-sm text-slate-900">${escapeHtml(o.name)}${Number(o.price) > 0 ? `<span class="block text-xs text-emerald-700 font-semibold tabular-nums">+ ${formatBRL(o.price)}</span>` : ''}</span>
                                <input type="${Number(g.max) === 1 && Number(g.min) === 1 ? 'radio' : 'checkbox'}" name="opt-${gi}" data-opt="${gi}:${oi}" class="w-5 h-5 accent-emerald-600 shrink-0">
                            </label>`).join('')}
                    </fieldset>`).join('')}
                <label class="block pt-4">
                    <span class="text-sm font-extrabold text-slate-900">Alguma observação?</span>
                    <textarea data-sheet-note maxlength="140" rows="2" placeholder="Ex: tirar a cebola, maionese à parte" class="mt-1 w-full text-sm p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500"></textarea>
                </label>
            </div>
            <div class="p-4 border-t border-slate-100 flex items-center gap-3">
                <div class="flex items-center border border-slate-200 rounded-full shrink-0">
                    <button type="button" data-sheet-qty="-1" class="w-11 h-11 flex items-center justify-center text-emerald-700" aria-label="Diminuir">${icon('menos', 'w-4 h-4')}</button>
                    <span data-sheet-qty-value class="px-1 font-extrabold text-slate-900 tabular-nums">1</span>
                    <button type="button" data-sheet-qty="1" class="w-11 h-11 flex items-center justify-center text-emerald-700" aria-label="Aumentar">${icon('mais', 'w-4 h-4')}</button>
                </div>
                <button type="button" data-sheet-add class="flex-1 min-h-[48px] bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-500 text-slate-50 font-bold rounded-xl text-sm">Adicionar</button>
            </div>
        </div>`;
    document.body.appendChild(sheet);
    document.body.classList.add('overflow-hidden');

    const update = () => {
        const selected = state.picked.flatMap((list, gi) => list.map(oi => [gi, oi]));
        const extras = selected.reduce((acc, [g, o]) => acc + Number(product.options[g].options[o].price || 0), 0);
        const missing = product.options.some((g, gi) => state.picked[gi].length < Number(g.min));
        const btn = sheet.querySelector('[data-sheet-add]');
        btn.disabled = missing;
        btn.textContent = missing ? 'Escolha as opções obrigatórias' : `Adicionar • ${formatBRL((effectivePrice(product) + extras) * state.qty)}`;
        sheet.querySelector('[data-sheet-qty-value]').textContent = state.qty;
        // Grupo cheio: trava as outras caixas
        product.options.forEach((g, gi) => {
            if (Number(g.max) === 1) return;
            const full = state.picked[gi].length >= Number(g.max);
            sheet.querySelectorAll(`[data-opt^="${gi}:"]`).forEach(input => { input.disabled = full && !input.checked; });
        });
        return selected;
    };

    sheet.addEventListener('change', event => {
        const input = event.target.closest('[data-opt]');
        if (!input) return;
        const [gi, oi] = input.dataset.opt.split(':').map(Number);
        if (Number(product.options[gi].max) === 1) {
            // Escolha única: marcar troca a opção; no grupo opcional, desmarcar deixa sem nenhuma
            state.picked[gi] = input.checked ? [oi] : [];
            sheet.querySelectorAll(`[data-opt^="${gi}:"]`).forEach(el => { if (el !== input) el.checked = false; });
        } else state.picked[gi] = input.checked ? [...state.picked[gi], oi].sort((a, b) => a - b) : state.picked[gi].filter(x => x !== oi);
        update();
    });
    sheet.addEventListener('click', event => {
        if (event.target === sheet || event.target.closest('[data-sheet-close]')) return closeOptionsSheet();
        const qtyBtn = event.target.closest('[data-sheet-qty]');
        if (qtyBtn) {
            state.qty = Math.min(99, Math.max(1, state.qty + Number(qtyBtn.dataset.sheetQty)));
            update();
            return;
        }
        if (event.target.closest('[data-sheet-add]')) {
            const selected = update();
            if (product.options.some((g, gi) => state.picked[gi].length < Number(g.min))) return;
            const note = sheet.querySelector('[data-sheet-note]').value.trim().slice(0, 140);
            closeOptionsSheet();
            addLine(product, selected, note, state.qty);
        }
    });
    update();
}

function groupHint(g) {
    const min = Number(g.min), max = Number(g.max);
    if (max === 1) return min ? 'Escolha 1 opção' : 'Escolha até 1 opção';
    if (min === max) return `Escolha ${min} opções`;
    return min ? `Escolha de ${min} a ${max} opções` : `Escolha até ${max} opções`;
}

function closeOptionsSheet() {
    const sheet = document.getElementById('options-sheet');
    if (sheet) sheet.remove();
    document.body.classList.remove('overflow-hidden');
}

function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartUI();
}

function flashCartBar() {
    const bar = document.getElementById('cart-bar');
    if (!bar) return;
    const target = bar.querySelector('a') || bar;
    target.classList.add('ring-4', 'ring-amber-300', 'scale-[1.02]');
    setTimeout(() => target.classList.remove('ring-4', 'ring-amber-300', 'scale-[1.02]'), 300);
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
