/**
 * ==============================================================================
 * PROJETO: AV. DAS TIPUANAS LOCAL
 * ARQUIVO: 16_menu_management.js
 * DESCRIÇÃO: Gestão de cardápio (produtos) pelo lojista, via Supabase.
 * ==============================================================================
 */

let currentStore = null;
let editingProductId = null;

const PHOTO_BUCKET = 'product-images';
const PHOTO_MAX_SIDE = 900; // px — foto de celular vira ~100-200 KB

/**
 * Reduz a foto no navegador (JPEG, lado maior até PHOTO_MAX_SIDE) e envia para
 * o Storage na pasta da loja (<store_id>/...). Devolve a URL pública.
 * O banco só aceita o envio de quem é dono da loja (ou admin).
 */
async function uploadProductPhoto(file) {
    if (!file) return null;
    if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.');

    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));

    const path = `${currentStore.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await sb.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    return sb.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
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
                        <input id="edit-name-${p.id}" type="text" value="${escapeHtml(p.name)}" class="md:col-span-2 text-sm p-2 rounded border border-gray-300">
                        <input id="edit-price-${p.id}" type="number" min="0" step="0.01" value="${Number(p.price)}" class="text-sm p-2 rounded border border-gray-300">
                        <div class="flex gap-2">
                            <button onclick="salvarEdicao('${p.id}')" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded px-2">Salvar</button>
                            <button onclick="cancelarEdicao()" class="flex-1 bg-gray-200 hover:bg-gray-300 text-xs font-bold rounded px-2">Cancelar</button>
                        </div>
                    </div>
                    <input id="edit-desc-${p.id}" type="text" value="${escapeHtml(p.description || '')}" placeholder="Descrição (opcional)" class="w-full text-xs p-2 rounded border border-gray-300">
                    <div class="flex flex-wrap items-center gap-3 text-xs">
                        ${p.image_url ? `<img src="${escapeHtml(p.image_url)}" alt="" class="w-12 h-12 rounded object-cover">` : ''}
                        <label class="flex items-center gap-2">Trocar foto: <input id="edit-photo-${p.id}" type="file" accept="image/*" class="text-xs"></label>
                        ${p.image_url ? `<label class="flex items-center gap-1"><input id="edit-remove-photo-${p.id}" type="checkbox"> Remover foto</label>` : ''}
                    </div>
                </div>
            `;
        }

        return `
            <div class="border border-gray-200 rounded-lg p-4 flex flex-col md:flex-row justify-between md:items-center gap-3 ${p.is_paused ? 'bg-gray-50 opacity-60' : ''}">
                <div class="flex items-center gap-3">
                ${p.image_url ? `<img src="${escapeHtml(p.image_url)}" alt="" loading="lazy" class="w-14 h-14 rounded-lg object-cover bg-gray-100 shrink-0">` : '<div class="w-14 h-14 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center text-gray-300 text-xl">📷</div>'}
                <div>
                    <div class="flex items-center gap-2">
                        <p class="font-bold text-gray-900">${escapeHtml(p.name)}</p>
                        ${p.is_paused ? '<span class="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-bold">Pausado</span>' : ''}
                    </div>
                    ${p.description ? `<p class="text-xs text-gray-500">${escapeHtml(p.description)}</p>` : ''}
                    <p class="text-sm font-extrabold text-emerald-600 mt-1">R$ ${Number(p.price).toFixed(2)}</p>
                </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="iniciarEdicao('${p.id}')" class="bg-white border border-gray-300 hover:bg-gray-50 text-xs font-bold px-3 py-1.5 rounded-lg">Editar</button>
                    <button onclick="alternarDisponibilidade('${p.id}', ${p.is_paused})" class="bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-bold px-3 py-1.5 rounded-lg">
                        ${p.is_paused ? 'Ativar' : 'Pausar'}
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
        is_paused: false
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

    const changes = { name, description: description || null, price };
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

