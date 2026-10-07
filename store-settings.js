/**
 * ==============================================================================
 * PROJETO: TIPUANAS.ONLINE
 * ARQUIVO: store-settings.js
 * DESCRIÇÃO: Formulário "Dados da loja" (nome, categoria, descrição, WhatsApp,
 *            endereço, entrega (própria com taxa fixa ou por km/raio, ou pela
 *            plataforma), localização, tempo de preparo, logo, capa, tipo de
 *            negócio e horário de funcionamento). Usado no painel do
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
    // Rótulo envolvendo o campo: tocar no texto foca o campo
    const field = (label, input, extra = '') => `
        <label class="block ${extra}">
            <span class="block text-sm font-bold text-gray-900 mb-1">${label}</span>
            ${input}
        </label>`;
    const inputCls = 'w-full text-base min-h-[44px] px-3 rounded-lg border border-gray-300';
    const hours = store.opening_hours || {};
    const usesHours = Object.keys(hours).length > 0;
    const dayRow = (day, label) => {
        const [from, to] = String(hours[day] || '').split('-');
        const openDay = /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(hours[day] || '');
        return `
            <div class="flex items-center gap-2 text-xs" data-day="${day}">
                <label class="w-20 flex items-center gap-1.5"><input type="checkbox" data-role="day-open" ${openDay ? 'checked' : ''} class="accent-emerald-600"> ${label}</label>
                <input type="time" data-role="day-from" value="${openDay ? from : '08:00'}" class="p-1.5 rounded border border-gray-300">
                <span>às</span>
                <input type="time" data-role="day-to" value="${openDay ? to : '18:00'}" class="p-1.5 rounded border border-gray-300">
            </div>`;
    };
    const DAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

    container.innerHTML = `
        <details class="bg-white rounded-lg shadow-sm border border-gray-100 mb-6 group" ${opts.open ? 'open' : ''}>
            <summary class="cursor-pointer select-none px-6 min-h-[56px] text-base font-extrabold text-emerald-800 flex justify-between items-center">
                <span>Dados da loja</span>
                <span class="text-sm font-normal text-gray-500 group-open:hidden">Editar</span>
            </summary>
            <form id="${id}" class="px-6 pb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                ${field('Nome da loja', `<input name="name" required maxlength="80" class="${inputCls}" value="${escapeHtml(store.name)}">`)}
                ${field('Categoria', `<input name="category" maxlength="60" class="${inputCls}" value="${escapeHtml(store.category || '')}" placeholder="Ex: Padaria, Mercado, Serviços">`)}
                ${field('WhatsApp para pedidos (com DDD)', `<input name="whatsapp_number" inputmode="tel" class="${inputCls}" value="${escapeHtml(store.whatsapp_number || '')}" placeholder="Ex: 48999998888">`)}
                ${field('Endereço na avenida', `<input name="address_line" maxlength="200" class="${inputCls}" value="${escapeHtml(store.address_line || '')}">`)}
                ${field('Chave Pix (aparece para o cliente pagar)', `<input name="pix_key" maxlength="77" class="${inputCls}" value="${escapeHtml(store.pix_key || '')}" placeholder="E-mail, CNPJ, aleatória ou +5547999999999">`)}
                ${field('Cidade da conta Pix', `<input name="pix_city" maxlength="15" class="${inputCls}" value="${escapeHtml(store.pix_city || '')}" placeholder="Ex: Joinville">`)}
                ${field('Pedido mínimo (R$, opcional)', `<input name="min_order_value" type="number" min="0" step="0.01" inputmode="decimal" class="${inputCls}" value="${Number(store.min_order_value || 0) || ''}" placeholder="Sem mínimo">`)}
                ${field('Tempo médio de preparo (min)', `<input name="avg_prep_time_minutes" type="number" min="0" max="240" step="5" class="${inputCls}" value="${Number(store.avg_prep_time_minutes || 0) || ''}" placeholder="Ex: 30">`)}
                ${field('Tipo de negócio', `
                    <select name="listing_type" class="${inputCls} bg-white">
                        <option value="catalogo" ${store.listing_type !== 'orcamento' ? 'selected' : ''}>Comércio — preço fixo (cardápio)</option>
                        <option value="orcamento" ${store.listing_type === 'orcamento' ? 'selected' : ''}>Serviços — sob orçamento</option>
                    </select>`)}
                <div class="md:col-span-2 grid grid-cols-2 gap-3">
                    <div class="space-y-1">
                        <span class="block text-sm font-bold text-gray-900">Logo (quadrado)</span>
                        ${store.logo_url ? `<img src="${escapeHtml(store.logo_url)}" alt="" class="w-14 h-14 rounded-xl object-cover border">` : ''}
                        <input name="logo_file" type="file" accept="image/*" aria-label="Enviar logo" class="w-full text-sm">
                    </div>
                    <div class="space-y-1">
                        <span class="block text-sm font-bold text-gray-900">Capa da página da loja</span>
                        ${store.cover_url ? `<img src="${escapeHtml(store.cover_url)}" alt="" class="w-full h-14 rounded-xl object-cover border">` : ''}
                        <input name="cover_file" type="file" accept="image/*" aria-label="Enviar capa" class="w-full text-sm">
                    </div>
                </div>
                <div class="md:col-span-2 border border-gray-200 rounded-lg p-3 space-y-2" data-role="delivery-box">
                    <p class="flex items-center gap-1.5 text-sm font-bold text-gray-900">${icon('entrega', 'w-4 h-4 text-emerald-700')}Quem faz a entrega?</p>
                    <div class="flex flex-col sm:flex-row gap-2 text-sm">
                        <label class="flex-1 min-h-[44px] flex items-center gap-2 px-3 rounded-lg border border-gray-300 has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50">
                            <input type="radio" name="delivery_type" value="plataforma" ${store.delivery_type !== 'propria' ? 'checked' : ''} class="accent-emerald-600"> Entregadores da plataforma
                        </label>
                        <label class="flex-1 min-h-[44px] flex items-center gap-2 px-3 rounded-lg border border-gray-300 has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50">
                            <input type="radio" name="delivery_type" value="propria" ${store.delivery_type === 'propria' ? 'checked' : ''} class="accent-emerald-600"> Minha loja entrega
                        </label>
                    </div>
                    <p data-role="platform-rules" class="${store.delivery_type === 'propria' ? 'hidden' : ''} text-[11px] text-gray-600 bg-gray-50 rounded p-2">Taxa e raio definidos pela plataforma.</p>
                    <div data-role="own-rules" class="${store.delivery_type === 'propria' ? '' : 'hidden'} space-y-2">
                        ${field('Taxa de entrega (R$)', `<input name="delivery_fee" type="number" min="0" step="0.5" class="${inputCls}" value="${Number(store.delivery_fee || 0)}">`)}
                        <label class="flex items-center gap-2 min-h-[44px] text-sm font-bold text-gray-900">
                            <input type="checkbox" data-role="per-km" ${store.delivery_fee_per_km !== null && store.delivery_fee_per_km !== undefined ? 'checked' : ''} class="accent-emerald-600">
                            Cobrar por distância (km) e limitar o raio
                        </label>
                        <div data-role="per-km-fields" class="${store.delivery_fee_per_km !== null && store.delivery_fee_per_km !== undefined ? '' : 'hidden'} grid grid-cols-3 gap-2 text-sm">
                            <label>Km incluídos na taxa<input name="delivery_km_included" type="number" min="0" step="0.5" value="${Number(store.delivery_km_included || 0)}" class="w-full min-h-[44px] px-2 text-base rounded-lg border border-gray-300"></label>
                            <label>R$ por km a mais<input name="delivery_fee_per_km" type="number" min="0" step="0.1" value="${store.delivery_fee_per_km ?? 1.5}" class="w-full min-h-[44px] px-2 text-base rounded-lg border border-gray-300"></label>
                            <label>Raio máximo (km)<input name="delivery_radius_km" type="number" min="0.5" max="50" step="0.5" value="${store.delivery_radius_km ?? 5}" class="w-full min-h-[44px] px-2 text-base rounded-lg border border-gray-300"></label>
                            <p data-role="fee-preview" class="col-span-3 text-[11px] text-emerald-800 bg-emerald-50 rounded p-2"></p>
                        </div>
                    </div>
                    <p class="flex items-center gap-1.5 text-sm font-bold text-gray-900 pt-1">${icon('local', 'w-4 h-4 text-emerald-700')}Localização da loja</p>
                    <div class="flex flex-wrap gap-2 items-center">
                        <input name="lat" inputmode="decimal" placeholder="Latitude" aria-label="Latitude" value="${store.lat ?? ''}" class="w-32 min-h-[44px] text-base px-2 rounded-lg border border-gray-300">
                        <input name="lng" inputmode="decimal" placeholder="Longitude" aria-label="Longitude" value="${store.lng ?? ''}" class="w-32 min-h-[44px] text-base px-2 rounded-lg border border-gray-300">
                        <button type="button" data-role="use-gps" class="min-h-[44px] text-sm font-bold border border-emerald-300 text-emerald-700 rounded-lg px-3">Usar minha localização</button>
                        <button type="button" data-role="find-address" class="min-h-[44px] text-sm font-bold border border-gray-300 rounded-lg px-3">Achar pelo endereço</button>
                    </div>
                    <p data-role="geo-status" class="text-[11px] text-gray-500">Marque estando na loja: a taxa por distância é calculada a partir daqui.</p>
                </div>
                ${field('Descrição curta', `<textarea name="description" rows="2" maxlength="300" class="${inputCls}">${escapeHtml(store.description || '')}</textarea>`, 'md:col-span-2')}
                <div class="md:col-span-2 border border-gray-200 rounded-lg p-3 space-y-2">
                    <label class="flex items-center gap-2 min-h-[44px] text-sm font-bold text-gray-900">
                        <input type="checkbox" data-role="uses-hours" ${usesHours ? 'checked' : ''} class="accent-emerald-600">
                        Usar horário de funcionamento (fora dele a loja aparece "Fechada" e não recebe pedidos)
                    </label>
                    <div data-role="hours" class="${usesHours ? '' : 'hidden'} space-y-1.5">
                        ${DAY_LABELS.map((label, day) => dayRow(day, label)).join('')}
                        <p class="text-[11px] text-gray-400">Horário de Brasília. Pode passar da meia-noite (ex.: 18:00 às 02:00).</p>
                    </div>
                </div>
                <div class="md:col-span-2 flex items-center gap-3">
                    <button type="submit" class="min-h-[48px] bg-emerald-700 hover:bg-emerald-800 text-gray-50 font-bold px-5 rounded-lg text-base">Salvar dados</button>
                    <span data-role="status" class="text-xs"></span>
                </div>
            </form>
        </details>
    `;

    const form = container.querySelector('form');
    const statusEl = form.querySelector('[data-role="status"]');
    const usesHoursEl = form.querySelector('[data-role="uses-hours"]');
    usesHoursEl.addEventListener('change', () => {
        form.querySelector('[data-role="hours"]').classList.toggle('hidden', !usesHoursEl.checked);
    });

    // Entrega: quem entrega, regra própria (taxa fixa ou por km) e localização da loja
    const perKmEl = form.querySelector('[data-role="per-km"]');
    const geoStatus = form.querySelector('[data-role="geo-status"]');
    const num = name => { const v = String(form.querySelector(`[name="${name}"]`).value).replace(',', '.').trim(); return v === '' ? null : Number(v); };
    const deliveryType = () => form.querySelector('[name="delivery_type"]:checked').value;
    const updateFeePreview = () => {
        const radius = num('delivery_radius_km') || 0;
        const rules = { base: num('delivery_fee') || 0, incl: num('delivery_km_included') || 0, perKm: num('delivery_fee_per_km') || 0, radius };
        const points = [1, 3, 5, 8].filter(km => km <= radius);
        form.querySelector('[data-role="fee-preview"]').textContent = points.length
            ? `Exemplo: ${points.map(km => `${km} km = ${formatBRL(feeForDistance(rules, km))}`).join(' · ')}. Acima de ${String(radius).replace('.', ',')} km a loja não entrega.`
            : 'Defina um raio de pelo menos 1 km.';
    };
    form.querySelectorAll('[name="delivery_type"]').forEach(el => el.addEventListener('change', () => {
        form.querySelector('[data-role="own-rules"]').classList.toggle('hidden', deliveryType() !== 'propria');
        form.querySelector('[data-role="platform-rules"]').classList.toggle('hidden', deliveryType() === 'propria');
    }));
    perKmEl.addEventListener('change', () => {
        form.querySelector('[data-role="per-km-fields"]').classList.toggle('hidden', !perKmEl.checked);
        updateFeePreview();
    });
    form.addEventListener('input', event => {
        if (['delivery_fee', 'delivery_km_included', 'delivery_fee_per_km', 'delivery_radius_km'].includes(event.target.name)) updateFeePreview();
    });
    updateFeePreview();
    sb.from('platform_delivery').select('*').maybeSingle().then(({ data: pd }) => {
        if (!pd) return;
        const rules = { base: Number(pd.base_fee), incl: Number(pd.km_included), perKm: Number(pd.fee_per_km), radius: Number(pd.radius_km) };
        form.querySelector('[data-role="platform-rules"]').textContent =
            `Regra da plataforma: ${formatBRL(rules.base)} até ${String(rules.incl).replace('.', ',')} km, depois ${formatBRL(rules.perKm)} por km, até ${String(rules.radius).replace('.', ',')} km (ex.: 4 km = ${formatBRL(feeForDistance(rules, 4))}). Os pedidos prontos vão para os entregadores da plataforma. Sem a localização da loja, cobra só ${formatBRL(rules.base)}.`;
    });
    const setCoords = (pos, msg) => {
        if (!pos) { geoStatus.textContent = msg; geoStatus.className = 'text-xs text-red-600'; return; }
        form.querySelector('[name="lat"]').value = pos.lat.toFixed(6);
        form.querySelector('[name="lng"]').value = pos.lng.toFixed(6);
        geoStatus.textContent = 'Localização preenchida. Clique em "Salvar dados".';
        geoStatus.className = 'text-xs font-semibold text-emerald-600';
    };
    form.querySelector('[data-role="use-gps"]').addEventListener('click', async () => {
        geoStatus.textContent = 'Buscando localização...';
        setCoords(await getDevicePosition(), 'Não deu para pegar a localização. Libere a permissão ou use "Achar pelo endereço".');
    });
    form.querySelector('[data-role="find-address"]').addEventListener('click', async () => {
        const address = form.querySelector('[name="address_line"]').value.trim();
        if (!address) return setCoords(null, 'Preencha o endereço (com a cidade) primeiro.');
        geoStatus.textContent = 'Procurando o endereço...';
        setCoords(await geocodeAddress(address), 'Endereço não encontrado. Inclua a cidade (ex: Av. das Tipuanas, 140, Joinville).');
    });

    // { "1": "08:00-18:00", ... } só com os dias marcados; null = sempre aberta
    const readHours = () => {
        if (!usesHoursEl.checked) return null;
        const result = {};
        form.querySelectorAll('[data-day]').forEach(row => {
            if (!row.querySelector('[data-role="day-open"]').checked) return;
            const from = row.querySelector('[data-role="day-from"]').value;
            const to = row.querySelector('[data-role="day-to"]').value;
            if (from && to) result[row.dataset.day] = `${from}-${to}`;
        });
        return result;
    };

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());
        const whatsapp = String(data.whatsapp_number || '').replace(/\D/g, '');
        const fee = Number(data.delivery_fee || 0);
        const prep = data.avg_prep_time_minutes === '' ? null : Number(data.avg_prep_time_minutes);
        const minOrder = String(data.min_order_value ?? '').trim() === '' ? null : Number(String(data.min_order_value).replace(',', '.'));

        const setStatus = (msg, ok) => {
            statusEl.textContent = msg;
            statusEl.className = `text-xs ${ok ? 'text-emerald-700' : 'text-red-600'}`;
        };

        if (!data.name.trim()) return setStatus('Informe o nome da loja.', false);
        if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 13)) return setStatus('WhatsApp deve ter DDD + número (10 ou 11 dígitos).', false);
        if (!Number.isFinite(fee) || fee < 0) return setStatus('Taxa de entrega inválida.', false);
        if (minOrder !== null && (!Number.isFinite(minOrder) || minOrder < 0 || minOrder > 1000)) return setStatus('Pedido mínimo inválido (de 0 a R$ 1.000).', false);
        if (prep !== null && (!Number.isInteger(prep) || prep < 0 || prep > 240)) return setStatus('Tempo de preparo inválido (0 a 240 minutos).', false);
        const lat = num('lat'), lng = num('lng');
        if ((lat === null) !== (lng === null) || (lat !== null && (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180))) {
            return setStatus('Localização inválida: preencha latitude e longitude (ou use o botão).', false);
        }
        const own = deliveryType() === 'propria';
        const perKm = own && perKmEl.checked;
        const kmIncluded = num('delivery_km_included') ?? 0, feePerKm = num('delivery_fee_per_km'), radius = num('delivery_radius_km');
        if (perKm) {
            if (lat === null) return setStatus('Para cobrar por km, marque a localização da loja.', false);
            if (!(feePerKm >= 0) || !(kmIncluded >= 0)) return setStatus('Confira os valores da entrega por km.', false);
            if (!(radius > 0 && radius <= 50)) return setStatus('O raio máximo deve ser entre 0,5 e 50 km.', false);
        }
        const pixKey = String(data.pix_key || '').trim();
        if (pixKey && (pixKey.length < 5 || pixKey.length > 77)) return setStatus('Chave Pix inválida.', false);
        const openingHours = readHours();
        if (openingHours && Object.keys(openingHours).length === 0) {
            return setStatus('Marque pelo menos um dia de funcionamento (ou desligue o horário).', false);
        }

        const changes = {
            name: data.name.trim(),
            category: data.category.trim() || null,
            whatsapp_number: whatsapp || null,
            address_line: data.address_line.trim() || null,
            delivery_fee: fee,
            listing_type: data.listing_type,
            description: data.description.trim() || null,
            opening_hours: openingHours,
            avg_prep_time_minutes: prep,
            min_order_value: minOrder || null,
            pix_key: pixKey || null,
            pix_city: String(data.pix_city || '').trim().slice(0, 15) || null,
            delivery_type: own ? 'propria' : 'plataforma',
            lat,
            lng,
            delivery_km_included: perKm ? kmIncluded : 0,
            delivery_fee_per_km: perKm ? feePerKm : null,
            delivery_radius_km: perKm ? radius : null
        };

        setStatus('Salvando...', true);
        try {
            const logo = await uploadImage(store.id, form.querySelector('[name="logo_file"]').files[0], 400);
            if (logo) changes.logo_url = logo;
            const cover = await uploadImage(store.id, form.querySelector('[name="cover_file"]').files[0], 1200);
            if (cover) changes.cover_url = cover;
        } catch (e) {
            console.error('Erro ao enviar imagem da loja:', e);
            return setStatus('Não foi possível enviar a imagem (use JPG, PNG ou WEBP).', false);
        }
        const { data: rows, error } = await sb.from('stores').update(changes).eq('id', store.id).select();

        if (error || !rows || !rows[0]) {
            console.error('Erro ao salvar loja:', error);
            return setStatus('Não foi possível salvar. Verifique se você está logado com a conta dona da loja.', false);
        }

        Object.assign(store, rows[0]);
        setStatus('Dados salvos', true);
        if (typeof opts.onSaved === 'function') opts.onSaved(store);
    });
}
