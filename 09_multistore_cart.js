/**
 * ==============================================================================
 * PROJETO: AV. DAS TIPUANAS LOCAL
 * ARQUIVO: 09_multistore_cart.js
 * DESCRIÇÃO: Gestão do Carrinho e Carregamento de Produtos do Supabase
 * ==============================================================================
 */

// Configuração Oficial do Supabase (projeto real: avenidadastipuanas.online)
const SUPABASE_URL = 'https://fdhnzdjxbztyomzhunxw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkaG56ZGp4Ynp0eW9temh1bnh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3MzU4MTQsImV4cCI6MjEwNDMxMTgxNH0.5HC_ZMgtXdQWbMrhw0jzMWcmYee902crA6rbl3F42aI';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let cart = JSON.parse(localStorage.getItem('tipuanas_cart')) || [];

document.addEventListener('DOMContentLoaded', () => {
    loadStoresAndProducts();
    updateCartUI();
});

/**
 * Busca lojas e produtos cadastrados no banco
 */
async function loadStoresAndProducts() {
    const container = document.getElementById('stores-container');
    
    // Busca lojas ativas (e filtra as que estiverem pausadas pelo próprio lojista)
    const { data: allStores, error: storeErr } = await sb
        .from('stores')
        .select('*')
        .eq('is_active', true);

    const stores = (allStores || []).filter(s => !s.is_paused);

    if (storeErr || stores.length === 0) {
        container.innerHTML = `<p class="text-center text-xs text-slate-400 py-8">Nenhum estabelecimento disponível no momento.</p>`;
        return;
    }

    // Busca todos os produtos disponíveis (não pausados pelo lojista)
    const { data: products, error: prodErr } = await sb
        .from('products')
        .select('*')
        .eq('is_paused', false);

    if (prodErr) {
        console.error('Erro ao buscar produtos:', prodErr);
        return;
    }

    // Renderiza cada loja: catálogo (produtos + carrinho) ou orçamento (só divulgação/contato)
    container.innerHTML = stores.map(store => {
        if (store.listing_type === 'orcamento') {
            return `
                <div class="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
                    <div class="border-b border-slate-100 pb-2">
                        <div class="flex items-center gap-1.5">
                            <h3 class="font-bold text-slate-900 text-sm">${store.name}</h3>
                            <span class="text-[9px] bg-amber-50 text-amber-700 font-bold px-1.5 py-0.5 rounded-full border border-amber-100">Sob Orçamento</span>
                        </div>
                        ${store.category ? `<p class="text-[11px] text-slate-500">${store.category}</p>` : ''}
                    </div>
                    <p class="text-xs text-slate-600">${store.description || 'Solicite um orçamento e o prestador entra em contato pra combinar os detalhes.'}</p>
                    <a href="18_solicitar_orcamento.html?store=${store.id}" class="block text-center bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2.5 rounded-lg transition active:scale-95">
                        Solicitar Orçamento
                    </a>
                </div>
            `;
        }

        const storeProducts = products.filter(p => p.store_id === store.id);

        return `
            <div class="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
                <div class="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div>
                        <h3 class="font-bold text-slate-900 text-sm">${store.name}</h3>
                        ${store.category ? `<p class="text-[11px] text-slate-500">${store.category}</p>` : ''}
                    </div>
                    <span class="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-100">
                        Taxa: R$ ${Number(store.delivery_fee).toFixed(2)}
                    </span>
                </div>

                <div class="space-y-2">
                    ${storeProducts.length > 0 ? storeProducts.map(product => `
                        <div class="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-none">
                            <div>
                                <p class="text-xs font-semibold text-slate-800">${product.name}</p>
                                <p class="text-[10px] text-slate-400">${product.description || ''}</p>
                                <p class="text-xs font-extrabold text-emerald-600 mt-0.5">R$ ${Number(product.price).toFixed(2)}</p>
                            </div>
                            <button onclick="addToCart('${product.id}', '${product.name}', ${product.price}, '${store.id}', '${store.name}')" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition active:scale-95">
                                + Adicionar
                            </button>
                        </div>
                    `).join('') : '<p class="text-[11px] text-slate-400">Nenhum produto cadastrado nesta loja.</p>'}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Adiciona um item ao carrinho local
 */
function addToCart(id, name, price, storeId, storeName) {
    const existing = cart.find(item => item.id === id);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({ id, name, price: Number(price), storeId, storeName, quantity: 1 });
    }
    saveCart();
}

/**
 * Salva e atualiza a interface do carrinho
 */
function saveCart() {
    localStorage.setItem('tipuanas_cart', JSON.stringify(cart));
    updateCartUI();
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
        totalPriceEl.textContent = `R$ ${totalPrice.toFixed(2)}`;
    } else {
        cartBar.classList.add('hidden');
    }
}