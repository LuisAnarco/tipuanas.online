/**
 * ==============================================================================
 * PROJETO: AV. DAS TIPUANAS LOCAL
 * ARQUIVO: 09_multistore_cart.js
 * DESCRIÇÃO: Gestão do Carrinho e Carregamento de Produtos do Supabase
 * ==============================================================================
 */

// Configuração Oficial do Supabase
const SUPABASE_URL = 'https://uiroqxinszrhvyzuiqfu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpcm9xeGluc3pyaHZ5enVpcWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3MzEyNDYsImV4cCI6MjEwNDMwNzI0Nn0.suJIxTU26t8U7S6IRiNChZtfLyQzftOVF0sZe1c7x2k';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
    
    // Busca lojas ativas
    const { data: stores, error: storeErr } = await supabase
        .from('stores')
        .select('*')
        .eq('is_active', true);

    if (storeErr || !stores || stores.length === 0) {
        container.innerHTML = `<p class="text-center text-xs text-slate-400 py-8">Nenhum estabelecimento disponível no momento.</p>`;
        return;
    }

    // Busca todos os produtos disponíveis
    const { data: products, error: prodErr } = await supabase
        .from('products')
        .select('*')
        .eq('is_available', true);

    if (prodErr) {
        console.error('Erro ao buscar produtos:', prodErr);
        return;
    }

    // Renderiza cada loja e seus respectivos produtos
    container.innerHTML = stores.map(store => {
        const storeProducts = products.filter(p => p.store_id === store.id);
        
        return `
            <div class="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
                <div class="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div>
                        <h3 class="font-bold text-slate-900 text-sm">${store.name}</h3>
                        <p class="text-[11px] text-slate-500">${store.category}</p>
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