/**
 * ==============================================================================
 * PROJETO: TIPUANAS.ONLINE
 * ARQUIVO: store-settings.js
 * DESCRIÇÃO: Formulário "Dados da loja" (nome, categoria, descrição, WhatsApp,
 *            endereço, taxa de entrega e tipo de negócio). Usado no painel do
 *            lojista (catálogo e orçamentos) e no painel admin. Quem pode salvar
 *            é decidido pelo banco: dono da loja ou admin (RLS de stores).
 *            Carregar depois do config.js.
 * ==============================================================================
 */

/**
 * Monta o formulário dentro de `container` para a loja `store`.
 * opts.onSaved(storeAtualizada) é chamado depois de salvar.
 * opts.open: já abre o formulário expandido.
 */
function renderStoreSettings(container, store, opts = {}) {
    const id = `ss-${store.id.slice(0, 8)}`;
    const field = (label, input, extra = '') => `
        <div class="${extra}">
            <label class="block text-xs font-semibold text-gray-600 mb-1">${label}</label>
            ${input}
        </div>`;
    const inputCls = 'w-full text-sm p-2.5 rounded-lg border border-gray-300';

    container.innerHTML = `
        <details class="bg-white rounded-lg shadow-sm border border-gray-100 mb-6 group" ${opts.open ? 'open' : ''}>
            <summary class="cursor-pointer select-none px-6 py-4 text-sm font-bold text-gray-800 flex justify-between items-center">
                <span>⚙️ Dados da loja</span>
                <span class="text-xs font-normal text-gray-400 group-open:hidden">Editar</span>
            </summary>
            <form id="${id}" class="px-6 pb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                ${field('Nome da loja', `<input name="name" required maxlength="80" class="${inputCls}" value="${escapeHtml(store.name)}">`)}
                ${field('Categoria', `<input name="category" maxlength="60" class="${inputCls}" value="${escapeHtml(store.category || '')}" placeholder="Ex: Padaria, Mercado, Serviços">`)}
                ${field('WhatsApp para pedidos (com DDD)', `<input name="whatsapp_number" inputmode="tel" class="${inputCls}" value="${escapeHtml(store.whatsapp_number || '')}" placeholder="Ex: 48999998888">`)}
                ${field('Endereço na avenida', `<input name="address_line" maxlength="200" class="${inputCls}" value="${escapeHtml(store.address_line || '')}">`)}
                ${field('Taxa de entrega (R$)', `<input name="delivery_fee" type="number" min="0" step="0.5" class="${inputCls}" value="${Number(store.delivery_fee || 0)}">`)}
                ${field('Tipo de negócio', `
                    <select name="listing_type" class="${inputCls} bg-white">
                        <option value="catalogo" ${store.listing_type !== 'orcamento' ? 'selected' : ''}>Comércio — preço fixo (cardápio)</option>
                        <option value="orcamento" ${store.listing_type === 'orcamento' ? 'selected' : ''}>Serviços — sob orçamento</option>
                    </select>`)}
                ${field('Descrição curta', `<textarea name="description" rows="2" maxlength="300" class="${inputCls}">${escapeHtml(store.description || '')}</textarea>`, 'md:col-span-2')}
                <div class="md:col-span-2 flex items-center gap-3">
                    <button type="submit" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-lg text-sm">Salvar dados</button>
                    <span data-role="status" class="text-xs"></span>
                </div>
            </form>
        </details>
    `;

    const form = container.querySelector('form');
    const statusEl = form.querySelector('[data-role="status"]');

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());
        const whatsapp = String(data.whatsapp_number || '').replace(/\D/g, '');
        const fee = Number(data.delivery_fee);

        const setStatus = (msg, ok) => {
            statusEl.textContent = msg;
            statusEl.className = `text-xs ${ok ? 'text-emerald-700' : 'text-red-600'}`;
        };

        if (!data.name.trim()) return setStatus('Informe o nome da loja.', false);
        if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 13)) return setStatus('WhatsApp deve ter DDD + número (10 ou 11 dígitos).', false);
        if (!Number.isFinite(fee) || fee < 0) return setStatus('Taxa de entrega inválida.', false);

        const changes = {
            name: data.name.trim(),
            category: data.category.trim() || null,
            whatsapp_number: whatsapp || null,
            address_line: data.address_line.trim() || null,
            delivery_fee: fee,
            listing_type: data.listing_type,
            description: data.description.trim() || null
        };

        setStatus('Salvando...', true);
        const { data: rows, error } = await sb.from('stores').update(changes).eq('id', store.id).select();

        if (error || !rows || !rows[0]) {
            console.error('Erro ao salvar loja:', error);
            return setStatus('Não foi possível salvar. Verifique se você está logado com a conta dona da loja.', false);
        }

        Object.assign(store, rows[0]);
        setStatus('Dados salvos ✓', true);
        if (typeof opts.onSaved === 'function') opts.onSaved(store);
    });
}
