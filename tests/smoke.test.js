/**
 * Testes de fumaça do Tipuanas.online — rodar com `npm test`.
 * Cada teste abre as páginas reais com o Supabase simulado (ver harness.js).
 */
const assert = require('assert');
const { launch, openPage, freshDb, isShown, visibleGolds, smallTargets, USER, S1, S2, S3, O1 } = require('./harness');

const BASE = 'http://local/';
const tests = [];
const test = (name, opts, fn) => tests.push({ name, opts, fn });

// ---------------------------------------------------------------- Cliente
test('vitrine: banners, categorias, ofertas, lojas, busca e carrinho', {}, async (page, db) => {
    await page.goto(BASE + 'index.html');
    await page.waitForSelector('#stores-container a[href="loja.html?slug=padaria-ouro"]');
    const stores = await page.innerHTML('#stores-container');
    assert.ok(stores.includes('★ 4,5') && stores.includes('30 min'), 'nota média e tempo de preparo no cartão');
    assert.ok(!(await page.$('#stores-container b')), 'nome da loja escapado');
    assert.ok(stores.includes('Sob orçamento'), 'loja de orçamento com selo');
    // Identidade (G1b): selos de confiança, ícones SVG no lugar de emoji e um só botão dourado
    assert.ok(await page.$('#stores-container a[href="loja.html?slug=padaria-ouro"] [data-role="verified"]'), 'selo Loja verificada');
    assert.ok(!(await page.$('#stores-container a[href="loja.html?slug=baratissimo"] [data-role="verified"]')), 'sem selo sem aprovação');
    assert.ok((await page.textContent('#stores-container [data-role="recommended"]')).includes('vizinho'), 'recomendada por vizinhos');
    const bodyText = await page.textContent('body');
    assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(bodyText), 'sem emoji na vitrine');
    assert.ok(await page.$('#category-chips button[aria-pressed="true"]'), 'chips com aria-pressed');

    // Banner do cupom público e ofertas com preço antigo riscado
    const banners = await page.innerHTML('#banners');
    assert.ok(banners.includes('DEZ10') && banners.includes('loja.html?slug=padaria-ouro'), 'banner do cupom');
    assert.ok(await isShown(page, '#offers-section'), 'faixa de ofertas');
    assert.ok(await page.$('#offers-row [data-add-product="p2"]'), 'oferta com botão');
    assert.ok((await page.innerHTML('#offers-row')).includes('-25%'), 'selo de desconto');
    assert.ok(await page.$('#offers-row [data-role="old-price"]'), 'preço antigo riscado');
    assert.ok(await isShown(page, '#featured-section'), 'destaques');
    assert.ok((await page.innerHTML('#top-stores-row')).includes('padaria-ouro'), 'mais bem avaliadas');

    // Carrinho usa o preço promocional
    await page.click('#offers-row [data-add-product="p2"]');
    assert.strictEqual(await page.textContent('#cart-item-count'), '1 item');
    assert.strictEqual(await visibleGolds(page), 1, 'um só botão dourado na tela (Ver sacola)');
    assert.strictEqual(await page.textContent('#cart-total-price'), 'R$ 4,50');

    // Busca por produto mostra o produto com botão de adicionar (descrição escapada)
    await page.fill('#search-input', 'arroz');
    assert.ok(!(await isShown(page, '#home-sections')), 'home escondida durante a busca');
    await page.waitForSelector('#stores-container [data-add-product="p3"]');
    let html = await page.innerHTML('#stores-container');
    assert.ok(!html.includes('Sonho'), 'busca por produto');
    await page.click('[data-add-product="p3"]');
    assert.strictEqual(await page.textContent('#cart-item-count'), '2 itens');
    await page.fill('#search-input', 'pao');
    await page.waitForSelector('#stores-container [data-add-product="p1"]');
    assert.ok(!(await page.$('#stores-container img[src="x"]')), 'descrição com HTML não pode virar tag');

    // Categoria filtra a lista de lojas
    await page.fill('#search-input', '');
    await page.click('[data-category="Mercado"]');
    html = await page.innerHTML('#stores-container');
    assert.ok(html.includes('baratissimo') && !html.includes('padaria-ouro'), 'filtro por categoria');
    assert.strictEqual(await page.textContent('#stores-title'), 'Mercado');
});

test('página da loja: capa, cupom, abas por seção, avaliações e carrinho', {}, async (page, db) => {
    await page.goto(BASE + 'loja.html?slug=padaria-ouro');
    await page.waitForSelector('[data-add-product="p1"]');
    const html = await page.innerHTML('#stores-container');
    assert.ok(!html.includes('Arroz'), 'não mostra produto de outra loja');
    const sections = await page.$$eval('#stores-container [data-section]', els => els.map(e => e.dataset.section));
    assert.deepStrictEqual(sections, ['Destaques', 'Doces <i>x</i>', 'Pães'], 'destaques + seções em ordem');
    assert.ok(!(await page.$('#stores-container i')), 'nome da seção escapado');
    assert.strictEqual((await page.$$('#section-tabs [data-section-tab]')).length, 3, 'abas das seções');
    const header = await page.innerHTML('#store-header');
    assert.ok(header.includes('★ 4,5') && header.includes('demais'), 'nota e comentário');
    assert.ok(!(await page.$('#store-header b')), 'comentário escapado');
    assert.ok(header.includes('wa.me/5547999706651'));
    assert.ok(await page.$('#store-header [data-role="store-coupon"]'), 'cupom público da loja');
    await page.click('#sec-2 [data-add-product="p1"]');
    assert.strictEqual(await page.textContent('#cart-item-count'), '1 item');

    // Produto na sacola vira seletor − quantidade + (em todas as seções onde aparece)
    await page.click('#sec-0 [data-add-product="p2"]');
    await page.click('#sec-0 [data-add-product="p2"]');
    assert.strictEqual(await page.textContent('#sec-1 [data-cart-slot="p2"] [data-role="qty"]'), '2', 'quantidade atualizada na outra seção');
    await page.click('#sec-1 [data-remove-product="p2"]');
    await page.click('#sec-1 [data-remove-product="p2"]');
    assert.ok(!(await page.$('[data-remove-product="p2"]')), 'volta para o botão +');
    assert.strictEqual(await page.textContent('#cart-item-count'), '1 item');
});

test('opções do produto: escolhe tamanho e adicionais, sacola separa as linhas e o pedido leva as escolhas', {}, async (page, db) => {
    Object.assign(db.products.find(p => p.id === 'p1'), { price: 20, options: [
        { name: 'Tamanho <b>', min: 1, max: 1, options: [{ name: 'Pequeno', price: 0 }, { name: 'Grande', price: 6 }] },
        { name: 'Adicionais', min: 0, max: 2, options: [{ name: 'Queijo', price: 2 }, { name: 'Bacon', price: 4 }, { name: 'Ovo', price: 1 }] },
        { name: 'Borda', min: 0, max: 1, options: [{ name: 'Catupiry', price: 8 }, { name: 'Cheddar', price: 8 }] }
    ] });
    await page.goto(BASE + 'loja.html?slug=padaria-ouro');
    await page.waitForSelector('[data-add-product="p1"]');
    await page.click('[data-add-product="p1"]');
    await page.waitForSelector('#options-sheet');
    assert.ok(!(await page.$('#options-sheet b')), 'nome do grupo escapado');
    assert.ok(await page.$eval('[data-sheet-add]', b => b.disabled), 'sem tamanho não adiciona');

    await page.check('[data-opt="0:1"]');
    await page.check('[data-opt="1:0"]');
    await page.check('[data-opt="1:1"]');
    assert.ok(await page.$eval('[data-opt="1:2"]', i => i.disabled), 'máximo de 2 adicionais');
    // Borda opcional de escolha única: troca e depois desmarca
    await page.check('[data-opt="2:0"]');
    await page.check('[data-opt="2:1"]');
    assert.ok(!(await page.isChecked('[data-opt="2:0"]')), 'só uma borda');
    await page.uncheck('[data-opt="2:1"]');
    await page.click('[data-sheet-qty="1"]');
    assert.ok((await page.textContent('[data-sheet-add]')).includes('R$ 64,00'), '(20+6+2+4) x 2');
    await page.fill('[data-sheet-note]', 'bem passado');
    await page.click('[data-sheet-add]');
    await page.waitForSelector('#options-sheet', { state: 'detached' });

    // Outra linha do mesmo produto, só com o tamanho pequeno
    await page.click('[data-cart-slot="p1"] [data-add-product="p1"]');
    await page.check('[data-opt="0:0"]');
    await page.click('[data-sheet-add]');
    assert.strictEqual(await page.textContent('[data-cart-slot="p1"] [data-role="qty"]'), '3');
    const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('tipuanas_cart')));
    assert.strictEqual(cart.length, 2, 'duas linhas');
    assert.deepStrictEqual(cart[0].options, [[0, 1], [1, 0], [1, 1]]);
    assert.strictEqual(cart[0].price, 32);

    await page.goto(BASE + '10_checkout_whatsapp_flow.html');
    await page.waitForSelector('[data-role="item-options"]');
    assert.ok((await page.textContent('#checkout-items')).includes('Grande, Queijo, Bacon'));
    await page.fill('#client-name', 'Ana');
    await page.fill('#client-phone', '48999998888');
    await page.fill('#client-address', 'Rua 1');
    await page.click('#submit-btn');
    await page.waitForSelector('#confirmation-view:not(.hidden)');
    const call = db.calls.find(c => c.fn === 'place_order');
    assert.deepStrictEqual(call.body.p_items.map(i => [i.options, i.note]), [[[[0, 1], [1, 0], [1, 1]], 'bem passado'], [[[0, 0]], null]]);
});

test('sacola: taxa de entrega, retirada, foto e sacola vazia', {}, async (page, db) => {
    db.products.find(p => p.id === 'p1').image_url = 'https://img.test/pao.jpg';
    await page.goto(BASE + 'loja.html?slug=padaria-ouro');
    await page.waitForSelector('[data-add-product="p1"]');
    await page.click('#sec-2 [data-add-product="p1"]');
    await page.click('#sec-2 [data-add-product="p1"]');
    await page.goto(BASE + '10_checkout_whatsapp_flow.html');
    await page.waitForSelector('#checkout-items img[src="https://img.test/pao.jpg"]', { state: 'attached' });
    assert.ok((await page.innerHTML('#checkout-items')).includes('loja.html?slug=padaria-ouro'), 'link para adicionar mais');
    assert.strictEqual(await page.textContent('#summary-fee'), 'R$ 5,00');
    assert.strictEqual(await page.textContent('#checkout-total-price'), 'R$ 8,00', '2 x 1,50 + entrega 5');
    await page.check('input[value="takeout"]');
    assert.strictEqual(await page.textContent('#checkout-total-price'), 'R$ 3,00', 'retirada sem taxa');
    await page.click('[data-id="p1"][data-qty="-1"]');
    await page.click('[data-id="p1"][data-qty="-1"]');
    await page.waitForSelector('text=Sua sacola está vazia');
    assert.ok(await page.$eval('#submit-btn', b => b.disabled), 'sem itens não envia');
});

test('página da loja: slug inexistente mostra aviso', {}, async (page, db) => {
    await page.goto(BASE + 'loja.html?slug=nao-existe');
    await page.waitForSelector('text=Loja não encontrada');
});

test('QR do balcão aponta para a página da loja', {}, async (page, db) => {
    await page.goto(BASE + '13_printable_table_qr.html?slug=padaria-ouro');
    await page.waitForFunction(() => document.getElementById('qr-title').textContent.includes('Padaria'));
    const target = await page.getAttribute('#qrcode', 'data-target');
    assert.strictEqual(target, 'http://local/loja.html?slug=padaria-ouro');
});

test('horário: loja fechada aparece como fechada e sem botão de adicionar', {}, async (page, db) => {
    // Loja S1 só abre às segundas de madrugada (00:00-00:01): quase sempre fechada
    const closedDay = db.stores.find(s => s.id === S1);
    closedDay.opening_hours = { '1': '00:00-00:01' };
    await page.goto(BASE + 'index.html');
    await page.waitForSelector('#stores-container a');
    const status = await page.evaluate(h => storeOpenStatus(h, new Date('2026-09-28T15:00:00-03:00')), closedDay.opening_hours);
    assert.deepStrictEqual(status, { open: false, label: 'abre seg às 00:00' });
    const nowStatus = await page.evaluate(h => storeOpenStatus(h), closedDay.opening_hours);
    if (!nowStatus.open) {
        assert.ok(await page.$('#stores-container [data-role="closed-badge"]'), 'selo de fechada na lista');
        assert.ok(!(await page.$('#offers-row [data-add-product="p2"]')), 'oferta de loja fechada sem botão');
        await page.goto(BASE + 'loja.html?slug=padaria-ouro');
        await page.waitForSelector('#stores-container [data-section]');
        assert.ok(await page.$('#stores-container [data-role="closed-badge"]'), 'aviso de fechada na página da loja');
        assert.ok(!(await page.$('[data-add-product="p1"]')), 'sem botão de adicionar na loja fechada');
    }
});

test('horário: regra de abertura igual à do banco', {}, async (page, db) => {
    await page.goto(BASE + 'index.html');
    const r = await page.evaluate(() => {
        const h = { '1': '08:00-18:00', '5': '18:00-02:00' };
        const t = s => storeOpenStatus(h, new Date(s));
        return [
            t('2026-09-28T15:00:00-03:00').open,   // seg 15h
            t('2026-09-28T19:00:00-03:00').open,   // seg 19h
            t('2026-10-02T23:00:00-03:00').open,   // sex 23h
            t('2026-10-03T01:30:00-03:00').open,   // sáb 01h30 (faixa de sexta)
            t('2026-10-03T03:00:00-03:00').label,  // sáb 03h
            storeOpenStatus(null).open
        ];
    });
    assert.deepStrictEqual(r, [true, false, true, true, 'abre seg às 08:00', true]);
});

test('horário: lojista salva horário de funcionamento', { loggedIn: true }, async (page, db) => {
    db.stores.find(s => s.id === S1).owner_id = USER.id;
    await page.goto(BASE + '04_merchant_portal.html?store=' + S1);
    await page.waitForSelector('#store-settings summary');
    await page.click('#store-settings summary');
    await page.check('#store-settings [data-role="uses-hours"]');
    await page.check('#store-settings [data-day="1"] [data-role="day-open"]');
    await page.fill('#store-settings [data-day="1"] [data-role="day-from"]', '09:00');
    await page.fill('#store-settings [data-day="1"] [data-role="day-to"]', '17:30');
    await page.check('#store-settings [data-day="5"] [data-role="day-open"]');
    await page.fill('#store-settings [data-day="5"] [data-role="day-from"]', '18:00');
    await page.fill('#store-settings [data-day="5"] [data-role="day-to"]', '02:00');
    await page.click('#store-settings button[type="submit"]');
    await page.waitForSelector('text=Dados salvos');
    const w = db.writes.find(x => x.table === 'stores' && x.method === 'PATCH');
    assert.deepStrictEqual(w.body.opening_hours, { '1': '09:00-17:30', '5': '18:00-02:00' });
});

test('horário: checkout explica loja fora do horário', {}, async (page, db) => {
    const s1 = db.stores.find(s => s.id === S1);
    s1.opening_hours = { '1': '00:00-00:01' };
    s1.closedForTest = true;
    await page.goto(BASE + 'index.html');
    await page.evaluate(id => localStorage.setItem('tipuanas_cart', JSON.stringify([{ id: 'p1', name: 'x', price: 1, storeId: id, storeName: 'Padaria', quantity: 1 }])), S1);
    await page.goto(BASE + '10_checkout_whatsapp_flow.html');
    await page.fill('#client-name', 'Maria');
    await page.fill('#client-phone', '48999998888');
    await page.fill('#client-address', 'Av 1');
    await page.click('#submit-btn');
    await page.waitForSelector('text=fora do horário de funcionamento');
});

test('cupom: checkout mostra desconto e envia o código só para a loja do cupom', {}, async (page, db) => {
    await page.goto(BASE + 'index.html');
    await page.evaluate(([s1, s2]) => localStorage.setItem('tipuanas_cart', JSON.stringify([
        { id: 'p2', name: 'Sonho', price: 6, storeId: s1, storeName: 'Padaria', quantity: 5 },
        { id: 'p3', name: 'Arroz', price: 25, storeId: s2, storeName: 'Baratissimo', quantity: 1 },
    ])), [S1, S2]);
    await page.goto(BASE + '10_checkout_whatsapp_flow.html');
    await page.fill('#coupon-code', 'naoexiste');
    await page.click('#coupon-apply');
    await page.waitForSelector('text=Cupom não encontrado');
    await page.fill('#coupon-code', 'dez10');
    await page.click('#coupon-apply');
    await page.waitForSelector('text=10% de desconto');
    assert.ok((await page.innerHTML('#checkout-items')).includes('-R$ 3,00'), 'prévia do desconto na loja do cupom');
    assert.strictEqual(await page.textContent('#checkout-total-price'), 'R$ 57,00', '30 + 25 - 3 + entrega 5 da loja do cupom');

    await page.fill('#client-name', 'Maria');
    await page.fill('#client-phone', '48999998888');
    await page.fill('#client-address', 'Av 1');
    await page.click('#submit-btn');
    await page.waitForSelector('#confirmation-view:not(.hidden)');
    const calls = db.calls.filter(c => c.fn === 'place_order');
    assert.strictEqual(calls.find(c => c.body.p_store_id === S1).body.p_coupon, 'DEZ10');
    assert.strictEqual(calls.find(c => c.body.p_store_id === S2).body.p_coupon, null, 'outra loja sem cupom');
    assert.ok(decodeURIComponent(await page.innerHTML('#confirmation-cards')).includes('Cupom DEZ10'), 'cupom na mensagem do WhatsApp');
});

test('cupom: lojista cria e desativa cupom', { loggedIn: true }, async (page, db) => {
    db.stores.find(s => s.id === S1).owner_id = USER.id;
    await page.goto(BASE + '04_merchant_portal.html?store=' + S1);
    await page.waitForSelector('#coupons-list [data-toggle-coupon]');
    await page.fill('#coupon-form [name="code"]', 'bem vindo!');
    await page.fill('#coupon-form [name="discount_value"]', '150');
    await page.click('#coupon-form button');
    await page.waitForSelector('text=porcentagem até 100');
    await page.fill('#coupon-form [name="discount_value"]', '15');
    await page.click('#coupon-form button');
    await page.waitForFunction(() => document.querySelector('#coupon-form [name="code"]').value === '');
    const ins = db.writes.find(x => x.table === 'coupons' && x.method === 'POST');
    assert.strictEqual(ins.body[0].code, 'BEMVINDO', 'código normalizado');
    assert.strictEqual(ins.body[0].store_id, S1);
    assert.strictEqual(ins.body[0].is_public, true, 'aparece na vitrine por padrão');
    await page.click('[data-toggle-public="cp1"]');
    await page.waitForFunction(() => document.querySelector('[data-toggle-public="cp1"]').dataset.public === 'false');
    await page.click('[data-toggle-coupon="cp1"]');
    await page.waitForTimeout(200);
    assert.strictEqual(db.writes.find(x => x.table === 'coupons' && x.method === 'PATCH' && 'is_active' in x.body).body.is_active, false);
});

test('entrega por km: localização do aparelho calcula a taxa, fora do raio avisa e o pedido leva o ponto', {}, async (page, db) => {
    // Loja com entrega própria: R$ 5 até 2 km, R$ 1,50 por km a mais, até 6 km
    Object.assign(db.stores.find(s => s.id === S1), { delivery_type: 'propria', lat: -27.6, lng: -48.5, delivery_fee: 5, delivery_km_included: 2, delivery_fee_per_km: 1.5, delivery_radius_km: 6 });
    await page.addInitScript(() => {
        // ~4 km da loja; o teste troca a posição por localStorage('__pos')
        const pos = () => JSON.parse(localStorage.getItem('__pos') || '{"latitude":-27.564,"longitude":-48.5}');
        Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: ok => ok({ coords: pos() }) } });
    });
    await page.goto(BASE + 'index.html');
    await page.waitForSelector('#stores-container a');
    assert.ok((await page.textContent('#stores-container')).includes('Entrega a partir de R$ 5,00 · até 6 km'), 'cartão com a regra por km');
    await page.evaluate(s1 => localStorage.setItem('tipuanas_cart', JSON.stringify([{ id: 'p2', name: 'Sonho', price: 6, storeId: s1, storeName: 'Padaria', quantity: 2 }])), S1);
    await page.goto(BASE + '10_checkout_whatsapp_flow.html');
    await page.waitForFunction(() => document.getElementById('checkout-items').textContent.includes('Use sua localização'));
    assert.strictEqual(await page.textContent('#checkout-total-price'), 'R$ 23,00', 'sem localização: 12 + taxa máxima (5 + 1,5 x 4 = 11)');

    await page.click('#use-location');
    await page.waitForSelector('[data-role="fee-line"]');
    assert.ok((await page.textContent('[data-role="fee-line"]')).includes('4 km'), await page.textContent('[data-role="fee-line"]'));
    assert.strictEqual(await page.textContent('#checkout-total-price'), 'R$ 20,00', '12 + (5 + 1,5 x 2)');

    await page.fill('#client-name', 'Maria');
    await page.fill('#client-phone', '48999998888');
    await page.fill('#client-address', 'Rua 4');
    await page.click('#submit-btn');
    await page.waitForSelector('#confirmation-view:not(.hidden)');
    const call = db.calls.find(c => c.fn === 'place_order');
    assert.deepStrictEqual([call.body.p_customer.lat, call.body.p_customer.lng], [-27.564, -48.5], 'ponto vai para o banco');

    // Longe (8 km): aviso de fora da área
    await page.evaluate(s1 => {
        localStorage.setItem('__pos', JSON.stringify({ latitude: -27.528, longitude: -48.5 }));
        localStorage.setItem('tipuanas_cart', JSON.stringify([{ id: 'p2', name: 'Sonho', price: 6, storeId: s1, storeName: 'Padaria', quantity: 1 }]));
    }, S1);
    await page.goto(BASE + '10_checkout_whatsapp_flow.html');
    await page.click('#use-location');
    await page.waitForSelector('[data-role="out-of-range"]');
});

test('entrega: loja escolhe entregar por conta própria com taxa por km; admin define a regra da plataforma', { loggedIn: true }, async (page, db) => {
    db.stores.find(s => s.id === S1).owner_id = USER.id;
    await page.goto(BASE + '04_merchant_portal.html?store=' + S1);
    await page.waitForSelector('#store-settings summary');
    await page.click('#store-settings summary');
    await page.waitForFunction(() => document.querySelector('[data-role="platform-rules"]').textContent.includes('4 km = R$ 9,00'));
    await page.check('[name="delivery_type"][value="propria"]');
    await page.check('[data-role="per-km"]');
    await page.fill('[name="delivery_fee"]', '4');
    await page.fill('[name="delivery_km_included"]', '1');
    await page.fill('[name="delivery_fee_per_km"]', '2');
    await page.fill('[name="delivery_radius_km"]', '3');
    assert.ok((await page.textContent('[data-role="fee-preview"]')).includes('3 km = R$ 8,00'), '4 + 2 x 2');
    await page.click('#store-settings button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('#store-settings [data-role="status"]').textContent.includes('localização'));
    assert.ok(!db.writes.some(w => w.table === 'stores' && w.method === 'PATCH'), 'sem localização não salva taxa por km');
    await page.fill('[name="lat"]', '-27,6');
    await page.fill('[name="lng"]', '-48.5');
    await page.click('#store-settings button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('#store-settings [data-role="status"]').textContent.includes('salvos'));
    const w = db.writes.find(x => x.table === 'stores' && x.method === 'PATCH');
    assert.deepStrictEqual([w.body.delivery_type, w.body.lat, w.body.lng, w.body.delivery_fee, w.body.delivery_fee_per_km, w.body.delivery_radius_km], ['propria', -27.6, -48.5, 4, 2, 3]);

    // Loja com entrega própria: pedido em preparo mostra "Saiu para entrega"
    await page.waitForSelector(`[data-order-action="${O1}"][data-status="em_rota"]`);
    assert.ok((await page.textContent(`[data-order-action="${O1}"][data-status="em_rota"]`)).includes('Saiu para entrega'));

    // Admin: regra da plataforma
    db.admin = true;
    await page.goto(BASE + '14_admin_analytics_dashboard.html');
    await page.waitForFunction(() => document.querySelector('#platform-delivery-form [name="base_fee"]').value === '6');
    await page.fill('#platform-delivery-form [name="base_fee"]', '7');
    await page.fill('#platform-delivery-form [name="radius_km"]', '4');
    assert.ok((await page.textContent('#platform-delivery-form [data-role="preview"]')).includes('3 km = R$ 8,50'), '7 + 1,5 x 1');
    await page.click('#platform-delivery-form button[type="submit"]');
    await page.waitForSelector('#platform-delivery-form [data-role="status"]:text("Regra salva")');
    const pw = db.writes.find(x => x.table === 'platform_delivery');
    assert.deepStrictEqual([pw.body.base_fee, pw.body.km_included, pw.body.fee_per_km, pw.body.radius_km], [7, 2, 1.5, 4]);
});

test('pagamento: Pix copia-e-cola com valor exato e troco no dinheiro', {}, async (page, db) => {
    Object.assign(db.stores.find(s => s.id === S1), { pix_key: 'pix@padaria.com', pix_city: 'Joinville' });
    const cart = [{ id: 'p2', name: 'Sonho', price: 6, storeId: S1, storeName: 'Padaria', quantity: 2 }];
    await page.goto(BASE + 'index.html');
    await page.evaluate(c => localStorage.setItem('tipuanas_cart', JSON.stringify(c)), cart);
    await page.goto(BASE + '10_checkout_whatsapp_flow.html');
    await page.fill('#client-name', 'Maria');
    await page.fill('#client-phone', '48999998888');
    await page.fill('#client-address', 'Rua 1');
    assert.ok(await isShown(page, '#pix-hint') && !(await isShown(page, '#change-wrap')), 'Pix é o padrão');
    await page.click('#submit-btn');
    await page.waitForSelector('[data-role="pix-box"]');
    const code = await page.inputValue('[data-pix-code]');
    // 2 x 6 (promo 4,50 no mock → 9) + entrega 5 = 14,00
    assert.ok(code.startsWith('000201') && code.includes('0014br.gov.bcb.pix0115pix@padaria.com') && code.includes('540514.00') && code.includes('6009JOINVILLE'), code);
    const crc = await page.evaluate(c => pixCrc16(c.slice(0, -4)), code);
    assert.strictEqual(code.slice(-4), crc, 'CRC do BR Code confere');
    assert.ok(decodeURIComponent(await page.getAttribute('#confirmation-cards a[href^="https://wa.me/"]', 'href')).includes('Pix copia-e-cola'), 'código vai na mensagem da loja');
    await page.click('[data-copy-pix]');
    await page.waitForSelector('[data-copy-pix]:text("copiado")');

    // Dinheiro: troco para 50
    await page.evaluate(c => localStorage.setItem('tipuanas_cart', JSON.stringify(c)), cart);
    await page.goto(BASE + '10_checkout_whatsapp_flow.html');
    await page.selectOption('#payment-method', 'Dinheiro');
    assert.ok(await isShown(page, '#change-wrap'), 'pergunta o troco');
    await page.fill('#change-for', '50');
    await page.fill('#client-address', 'Rua 1');
    await page.click('#submit-btn');
    await page.waitForSelector('#confirmation-view:not(.hidden)');
    const call = db.calls.filter(c => c.fn === 'place_order').pop();
    assert.strictEqual(call.body.p_customer.change_for, 50);
    assert.ok((await page.textContent('#confirmation-cards')).includes('Troco para R$ 50,00'));
    assert.ok(!(await page.$('[data-role="pix-box"]')), 'sem Pix quando paga em dinheiro');
});

test('checkout: cria pedido via place_order, WhatsApp com 55 e pula loja fechada', {}, async (page, db) => {
    await page.goto(BASE + 'index.html');
    await page.evaluate(([s1, s2]) => localStorage.setItem('tipuanas_cart', JSON.stringify([
        { id: 'p1', name: 'x', price: 0.01, storeId: s1, storeName: "Padaria d'Ouro", quantity: 6 },
        { id: 'p3', name: 'Arroz', price: 25, storeId: s2, storeName: 'Baratissimo', quantity: 1 },
    ])), [S1, S2]);
    await page.goto(BASE + '10_checkout_whatsapp_flow.html');
    await page.fill('#client-name', 'Maria');
    await page.fill('#client-phone', '(48) 99999-8888');
    await page.fill('#client-address', 'Av 1');
    await page.click('#submit-btn');
    await page.waitForSelector('#confirmation-view:not(.hidden)');

    const html = await page.innerHTML('#confirmation-cards');
    assert.ok(html.includes('wa.me/5547999706651'), 'link do WhatsApp com DDI 55');
    assert.ok(html.includes('4321'), 'PIN gerado pelo banco');
    assert.ok(html.includes('loja fechada no momento'), 'motivo da loja pulada');

    const call = db.calls.find(c => c.fn === 'place_order');
    assert.ok(!JSON.stringify(call.body).includes('0.01'), 'preço do navegador não vai para o banco');
    assert.strictEqual(call.body.p_customer.phone, '48999998888');

    const cart = JSON.parse(await page.evaluate(() => localStorage.getItem('tipuanas_cart')));
    assert.deepStrictEqual(cart.map(i => i.id), ['p3'], 'carrinho mantém só a loja que falhou');
    const mine = JSON.parse(await page.evaluate(() => localStorage.getItem('tipuanas_my_orders')));
    assert.strictEqual(mine.length, 1, 'pedido salvo em Meus pedidos');
});

test('limites: muitos pedidos ou anúncios seguidos mostram aviso claro', {}, async (page, db) => {
    db.tooManyOrders = true;
    await page.goto(BASE + 'index.html');
    await page.evaluate(s1 => localStorage.setItem('tipuanas_cart', JSON.stringify([
        { id: 'p1', name: 'Pão', price: 1.5, storeId: s1, storeName: 'Padaria', quantity: 1 }])), S1);
    await page.goto(BASE + '10_checkout_whatsapp_flow.html');
    await page.fill('#client-name', 'Maria');
    await page.fill('#client-phone', '48999998888');
    await page.fill('#client-address', 'Av 1');
    await page.click('#submit-btn');
    await page.waitForSelector('text=muitos pedidos seguidos');

    db.tooManyPosts = true;
    await page.goto(BASE + '20_mural_vizinhanca.html');
    await page.fill('#mp-title', 'Bicicleta');
    await page.fill('#mp-name', 'Zé');
    await page.fill('#mp-whatsapp', '48999990000');
    await page.click('#mp-submit');
    await page.waitForSelector('text=Limite de 3 anúncios por dia');
});

test('acompanhamento: linha do tempo e avaliação após entrega', {}, async (page, db) => {
    db.orderStatus = 'em_preparacao';
    await page.goto(BASE + '11_order_tracking_realtime.html?id=' + O1);
    await page.waitForSelector('#order-details:not(.hidden)');
    assert.ok((await page.getAttribute('#step-preparing', 'class')).includes('text-emerald-700'), 'etapa atual acesa');
    assert.ok(!(await page.getAttribute('#step-transit', 'class')).includes('text-emerald-700'), 'etapa futura apagada');
    assert.ok(!(await isShown(page, '#review-card')), 'sem avaliação antes de entregar');
});

test('acompanhamento: previsão de entrega pelo tempo de preparo da loja', {}, async (page, db) => {
    // Padaria: 30 min de preparo + 10 de trajeto, janela de 15 min
    const created = new Date(Date.now() - 5 * 60000);
    const order = db.orders.find(o => o.id === O1);
    order.created_at = created.toISOString();
    db.orderStatus = 'em_preparacao';
    const hhmm = ms => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).replace(':', 'h');
    await page.goto(BASE + '11_order_tracking_realtime.html?id=' + O1);
    await page.waitForSelector('#eta:not(.hidden)');
    assert.strictEqual(await page.textContent('#eta'), `Chega entre ${hhmm(created.getTime() + 40 * 60000)} e ${hhmm(created.getTime() + 55 * 60000)}`);

    // Passou da janela: avisa e sugere falar com a loja
    order.created_at = new Date(Date.now() - 3 * 3600000).toISOString();
    await page.goto(BASE + '11_order_tracking_realtime.html?id=' + O1);
    await page.waitForSelector('#eta:text("A previsão era até")');

    // Entregue ou loja sem tempo de preparo: sem previsão
    db.orderStatus = 'entregue';
    await page.goto(BASE + '11_order_tracking_realtime.html?id=' + O1);
    await page.waitForSelector('#order-details:not(.hidden)');
    assert.strictEqual((await page.textContent('#eta')).trim(), '');
    db.orderStatus = 'em_preparacao';
    db.stores.find(s => s.id === S1).avg_prep_time_minutes = 0;
    await page.goto(BASE + '11_order_tracking_realtime.html?id=' + O1);
    await page.waitForSelector('#order-details:not(.hidden)');
    assert.strictEqual((await page.textContent('#eta')).trim(), '');
});

test('acompanhamento: cliente avalia pedido entregue', {}, async (page, db) => {
    db.orderStatus = 'entregue';
    await page.goto(BASE + '11_order_tracking_realtime.html?id=' + O1);
    await page.waitForSelector('#review-card:not(.hidden)');
    await page.click('[data-rating="4"]');
    await page.fill('#review-comment', 'ótimo');
    await page.click('#review-submit');
    await page.waitForSelector('#review-done:not(.hidden)');
    const w = db.writes.find(x => x.table === 'reviews');
    assert.strictEqual(w.body[0].rating, 4);
    assert.strictEqual(w.body[0].store_id, S1);
});

test('acompanhamento: cliente cancela pedido ainda novo', {}, async (page, db) => {
    db.orderStatus = 'novo';
    await page.goto(BASE + '11_order_tracking_realtime.html?id=' + O1);
    await page.waitForSelector('#cancel-order-btn:not(.hidden)');
    await page.click('#cancel-order-btn');
    await page.waitForSelector('#cancel-order-btn.hidden', { state: 'attached' });
    assert.strictEqual(await page.textContent('#status-title'), 'Pedido Cancelado');
    assert.ok(db.calls.some(c => c.fn === 'cancel_order_public' && c.body.p_id === O1));
});

test('acompanhamento: sem botão de cancelar depois que a loja aceita', {}, async (page, db) => {
    db.orderStatus = 'em_preparacao';
    await page.goto(BASE + '11_order_tracking_realtime.html?id=' + O1);
    await page.waitForSelector('#order-details:not(.hidden)');
    assert.ok(!(await isShown(page, '#cancel-order-btn')));
});

test('identidade nas telas do cliente: sacola, acompanhamento e meus pedidos sem emoji', {}, async (page, db) => {
    const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{2604}\u{2606}-\u{27BF}]/u;
    await page.goto(BASE + 'index.html');
    await page.evaluate(s1 => localStorage.setItem('tipuanas_cart', JSON.stringify([
        { id: 'p1', name: 'Pão', price: 1.5, storeId: s1, storeName: 'Padaria', quantity: 1 }])), S1);
    await page.goto(BASE + '10_checkout_whatsapp_flow.html');
    await page.waitForSelector('#checkout-items [data-qty]');
    assert.ok(!EMOJI.test(await page.textContent('body')), 'sacola sem emoji');
    assert.strictEqual(await visibleGolds(page), 1, 'um só botão dourado (enviar pedido)');
    const unlabeled = await page.$$eval('#checkout-view input:not([type=radio]):not([type=hidden]), #checkout-view select',
        els => els.filter(e => !document.querySelector(`label[for="${e.id}"]`)).map(e => e.id));
    assert.deepStrictEqual(unlabeled, [], 'todo campo tem <label for>');
    await page.fill('#client-name', 'Maria');
    await page.fill('#client-phone', '48999998888');
    await page.fill('#client-address', 'Av 1');
    await page.click('#submit-btn');
    await page.waitForSelector('#confirmation-view:not(.hidden)');
    const wa = await page.$eval('#confirmation-cards a[href*="wa.me"]', a => decodeURIComponent(a.href));
    assert.ok(wa.includes('*Cliente:* Maria') && wa.includes('*Total:*'), 'mensagem com os dados');
    assert.ok(!EMOJI.test(wa), 'mensagem do WhatsApp sem emoji');
    assert.ok(!EMOJI.test(await page.textContent('#confirmation-view')), 'confirmação sem emoji');

    db.orderStatus = 'em_rota';
    await page.goto(BASE + '11_order_tracking_realtime.html?id=' + O1);
    await page.waitForSelector('#order-details:not(.hidden)');
    assert.ok(await page.$('#status-icon svg'), 'ícone do status em SVG');
    assert.strictEqual(await page.textContent('#status-title'), 'A caminho');
    assert.ok(!EMOJI.test(await page.textContent('body')), 'acompanhamento sem emoji');

    await page.goto(BASE + 'pedidos.html');
    await page.waitForSelector('#phone-input');
    assert.ok(!EMOJI.test(await page.textContent('body')), 'meus pedidos sem emoji');
});

test('meus pedidos: histórico do aparelho e busca por WhatsApp', {}, async (page, db) => {
    await page.addInitScript(id => localStorage.setItem('tipuanas_my_orders', JSON.stringify([id, 'lixo'])), O1);
    await page.goto(BASE + 'pedidos.html');
    await page.waitForSelector('#orders-list a');
    assert.ok(!(await page.$('#orders-list b')), 'nome da loja escapado');
    assert.deepStrictEqual(db.calls.find(c => c.fn === 'get_orders_public').body.p_ids, [O1], 'id inválido filtrado');
    await page.fill('#phone-input', '48999998888');
    await page.fill('#pin-input', '0000');
    await page.click('#search-btn');
    await page.waitForFunction(() => document.getElementById('orders-list').textContent.includes('PIN'));
    assert.ok(!(await page.$('#orders-list a')), 'PIN errado não mostra pedidos');
    await page.fill('#pin-input', '1234');
    await page.click('#search-btn');
    await page.waitForSelector('#orders-list a');
    const call = db.calls.filter(c => c.fn === 'get_orders_by_phone').pop();
    assert.deepStrictEqual(call.body, { p_phone: '48999998888', p_pin: '1234' });
});

test('orçamento: cliente solicita e aceita proposta', {}, async (page, db) => {
    await page.goto(BASE + '18_solicitar_orcamento.html?store=' + S3);
    await page.waitForSelector('#form-section:not(.hidden)');
    await page.fill('#sr-name', 'Cli');
    await page.fill('#sr-whatsapp', '48999997777');
    await page.fill('#sr-description', 'Lavar carro');
    await page.click('#sr-submit');
    await page.waitForSelector('#confirm-section:not(.hidden)');

    await page.goto(BASE + '19_acompanhar_orcamento.html?id=cccccccc-0000-0000-0000-000000000001');
    await page.waitForSelector('#proposal-card:not(.hidden)');
    assert.ok(!(await page.$('#updates-list i')), 'etapa escapada');
    await page.click("button[onclick=\"responderProposta('aceito')\"]");
    await page.waitForFunction(() => true);
    await page.waitForTimeout(200);
    assert.ok(db.calls.some(c => c.fn === 'respond_service_proposal' && c.body.p_accept === true));
});

test('mural: lista posts escapados e publica', {}, async (page, db) => {
    await page.goto(BASE + '20_mural_vizinhanca.html');
    await page.waitForSelector('#posts-list h3');
    assert.ok(!(await page.$('#posts-list h3 i')), 'título escapado');
    assert.ok((await page.innerHTML('#posts-list')).includes('wa.me/5548999990000'));
});

test('mural: publica via função, guarda a chave e o autor remove o próprio anúncio', {}, async (page, db) => {
    await page.goto(BASE + '20_mural_vizinhanca.html');
    await page.waitForSelector('#posts-list h3');
    assert.ok((await page.innerHTML('#posts-list')).includes('vence em 10 dia(s)'));
    assert.ok(!(await page.$('[data-remove-post]')), 'sem botão de remover em anúncio alheio');

    await page.click('#tab-postar');
    await page.fill('#mp-title', 'Bicicleta aro 20');
    await page.fill('#mp-name', 'Ana');
    await page.fill('#mp-whatsapp', '48999990000');
    await page.click('#mp-submit');
    await page.waitForSelector('[data-remove-post="m2"]');
    assert.ok(db.calls.some(c => c.fn === 'create_community_post' && c.body.p_title === 'Bicicleta aro 20'));
    assert.ok(!db.writes.some(w => w.table === 'community_posts'), 'não grava direto na tabela');

    await page.click('[data-remove-post="m2"]');
    await page.waitForFunction(() => !document.querySelector('[data-remove-post="m2"]'));
    assert.ok(db.calls.some(c => c.fn === 'remove_community_post' && c.body.p_key === 'chave-m2'));
});

test('mural: admin remove anúncio', { loggedIn: true }, async (page, db) => {
    db.admin = true;
    await page.goto(BASE + '14_admin_analytics_dashboard.html');
    await page.waitForSelector('[data-remove-mural="m1"]');
    assert.ok(!(await page.$('#mural-admin-list i')), 'título escapado');
    await page.click('[data-remove-mural="m1"]');
    await page.waitForTimeout(200);
    const w = db.writes.find(x => x.table === 'community_posts' && x.method === 'PATCH');
    assert.strictEqual(w.body.is_active, false);
});

// ---------------------------------------------------------------- Login
test('login: sem sessão mostra tela de e-mail e envia link para a página atual', {}, async (page, db) => {
    await page.goto(BASE + '04_merchant_portal.html?store=' + S1);
    await page.waitForSelector('#login-overlay');
    await page.fill('#login-email', 'lojista@teste.dev');
    await page.click('#login-submit');
    await page.waitForSelector('#login-sent:not(.hidden)');
    assert.strictEqual(db.otp.email, 'lojista@teste.dev');
    assert.ok(decodeURIComponent(db.otp.url).includes('04_merchant_portal.html?store='), 'link volta para a mesma página');
    assert.ok(!(await isShown(page, '#orders-section')), 'painel oculto sem login');
});

// ---------------------------------------------------------------- Lojista
test('lojista: vincula loja sem dono e vê pedidos escapados', { loggedIn: true }, async (page, db) => {
    db.orders.find(o => o.id === O1).status = 'novo';
    db.orders.find(o => o.id === O1).delivery_address.change_for = 50;
    await page.goto(BASE + '04_merchant_portal.html?store=' + S1);
    await page.waitForSelector('#orders-list [data-order]');
    assert.ok(db.calls.some(c => c.fn === 'claim_store'), 'claim_store chamado');
    assert.ok(!(await page.$('#orders-list script')), 'nome do cliente escapado');
    assert.strictEqual(await page.textContent('#total-orders-today'), '2', 'pedidos de hoje sem cancelados');
    assert.strictEqual(await page.textContent('#pending-badge'), '1 pendente');
    assert.ok((await page.textContent('[data-role="change"]')).includes('levar R$ 36,00'), 'troco: 50 - 14');
    assert.strictEqual(await page.title(), '(1) Painel do Comerciante - Tipuanas.online', 'contador de pendentes na aba');
    assert.ok((await page.textContent('#user-bar')).includes(USER.email));
    await page.waitForSelector('#reviews-section:not(.hidden)');
    assert.ok(!(await page.$('#reviews-list b')), 'comentário escapado');
});

test('identidade no painel do lojista: sem emoji, botões de 44px e "Reabrir loja" como o único dourado', { loggedIn: true }, async (page, db) => {
    const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{2604}\u{2606}-\u{27BF}]/u;
    db.orders.find(o => o.id === O1).status = 'novo';
    await page.goto(BASE + '04_merchant_portal.html?store=' + S1);
    await page.waitForSelector('#orders-list [data-order]');
    await page.waitForSelector('#store-status.flex');
    assert.ok(!EMOJI.test(await page.textContent('body')), 'painel sem emoji');
    assert.ok(await page.$('#alerts-btn svg'), 'alertas com ícone SVG');
    assert.strictEqual(await visibleGolds(page), 0, 'loja aberta: nenhum dourado ("Pausar" em contorno)');
    assert.deepStrictEqual(await smallTargets(page, '#orders-list button, #orders-list a'), [], 'botões e links dos pedidos com 44px');
    const wa = decodeURIComponent(await page.getAttribute(`[data-notify-client="${O1}"]`, 'href'));
    assert.ok(!EMOJI.test(wa), 'aviso ao cliente sem emoji');

    await page.click('#toggle-pause-btn');
    await page.waitForFunction(() => document.getElementById('toggle-pause-btn').textContent.includes('Reabrir'));
    assert.ok(db.writes.some(w => w.table === 'stores' && w.method === 'PATCH' && w.body.is_paused === true), 'pausa gravada');
    assert.strictEqual(await visibleGolds(page), 1, 'loja pausada: "Reabrir loja" é o dourado');
    assert.strictEqual(await page.textContent('#status-text'), 'Loja pausada');
});

test('esgotado: lojista marca com um toque e a vitrine mostra "Esgotado" sem botão', { loggedIn: true }, async (page, db) => {
    db.stores.find(s => s.id === S1).owner_id = USER.id;
    await page.goto(BASE + '04_merchant_portal.html?store=' + S1);
    await page.waitForSelector('[data-toggle-stock="p2"]');
    assert.ok((await page.textContent('#stock-summary')).includes('2 disponíveis'));
    // Espera a gravação terminar antes de sair da página (senão a navegação corta a requisição)
    await Promise.all([
        page.waitForResponse(r => r.url().includes('/rest/v1/products') && r.request().method() === 'PATCH'),
        page.click('[data-toggle-stock="p2"]')
    ]);
    await page.waitForFunction(() => document.querySelector('[data-toggle-stock="p2"]').textContent.includes('Esgotado'));
    const patch = db.writes.find(w => w.table === 'products' && w.method === 'PATCH');
    assert.deepStrictEqual(patch.body, { is_paused: true });
    assert.ok(patch.url.includes('id=eq.p2'));

    await page.goto(BASE + 'loja.html?slug=padaria-ouro');
    await page.waitForSelector('[data-role="sold-out"]');
    assert.ok(!(await page.$('[data-add-product="p2"]')), 'produto esgotado sem botão de adicionar');
    assert.ok(await page.$('[data-add-product="p1"]'), 'os demais continuam');
    const destaques = await page.$('#stores-container [data-section="Destaques"]');
    assert.ok(!destaques, 'esgotado sai dos destaques');

    await page.goto(BASE + 'index.html');
    await page.waitForSelector('#stores-container a');
    assert.ok(!(await page.$('#offers-row [data-cart-slot="p2"]')), 'esgotado fora das ofertas');
});

test('lojista: avisar o cliente pelo WhatsApp com mensagem do status e link de acompanhamento', { loggedIn: true }, async (page, db) => {
    db.stores.find(s => s.id === S1).owner_id = USER.id;
    await page.goto(BASE + '04_merchant_portal.html?store=' + S1);
    await page.waitForSelector(`[data-notify-client="${O1}"]`);
    let href = decodeURIComponent(await page.getAttribute(`[data-notify-client="${O1}"]`, 'href'));
    assert.ok(href.startsWith('https://wa.me/5548999998888?text='), href);
    assert.ok(href.includes('está sendo preparado') && href.includes(`11_order_tracking_realtime.html?id=${O1}`), 'mensagem do status + link');
    assert.ok(!href.includes('<script>'), 'nome do cliente só pelo primeiro nome');

    // Botões grandes seguem o fluxo: Pronto → Saiu com entrega própria
    await page.click(`[data-order-action="${O1}"][data-status="pronto"]`);
    await page.waitForSelector(`[data-order-action="${O1}"][data-status="em_rota"]`);
    await page.click(`[data-order-action="${O1}"][data-status="em_rota"]`);
    await page.waitForFunction(id => decodeURIComponent(document.querySelector(`[data-notify-client="${id}"]`).href).includes('saiu para entrega'), O1);
    assert.ok(await page.$(`[data-order-action="${O1}"][data-status="entregue"]`), 'entrega própria: botão Entregue');
    assert.deepStrictEqual(db.writes.filter(w => w.table === 'orders').map(w => w.body.status), ['pronto', 'em_rota']);
    href = decodeURIComponent(await page.getAttribute(`[data-notify-client="${O1}"]`, 'href'));
    assert.ok(href.includes('PIN 1234'), 'PIN na mensagem de saída para entrega');
    assert.ok((await page.getAttribute(`[data-notify-client="${O1}"]`, 'class')).includes('animate-pulse'), 'botão em destaque depois da mudança');
});

test('push: lojista ativa alertas e o aparelho fica inscrito na loja', { loggedIn: true }, async (page, db) => {
    db.stores.find(s => s.id === S1).owner_id = USER.id;
    // Navegador simulado: permissão concedida e pushManager falso
    await page.addInitScript(() => {
        window.Notification = class { static permission = 'granted'; static requestPermission() { return Promise.resolve('granted'); } };
        window.PushManager = function () {};
        const sub = { toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'P256', auth: 'AUTH' } }) };
        const reg = { pushManager: { getSubscription: async () => null, subscribe: async opts => { window.__pushOpts = opts; return sub; } } };
        Object.defineProperty(navigator, 'serviceWorker', { value: { register: async () => reg, ready: Promise.resolve(reg) } });
    });
    await page.goto(BASE + '04_merchant_portal.html?store=' + S1);
    await page.waitForSelector('#orders-list [data-order]');
    await page.click('#alerts-btn');
    await page.waitForSelector('#push-hint:not(.hidden)');
    assert.ok((await page.textContent('#push-hint')).includes('mesmo com o painel fechado'), await page.textContent('#push-hint'));
    const w = db.writes.find(x => x.table === 'push_subscriptions');
    assert.ok(w && w.method === 'POST', 'inscrição salva');
    assert.deepStrictEqual([w.body.store_id, w.body.endpoint, w.body.p256dh, w.body.auth], [S1, 'https://push.example/abc', 'P256', 'AUTH']);
    assert.ok(w.url.includes('on_conflict=endpoint'), 'upsert por endpoint');
    assert.strictEqual(await page.evaluate(() => window.__pushOpts.applicationServerKey.length), 65, 'chave VAPID decodificada (65 bytes)');
});

test('push: service worker mostra o aviso e abre o painel ao tocar', {}, async () => {
    const vm = require('vm');
    const handlers = {};
    const shown = [];
    const opened = [];
    const self = {
        location: { origin: 'https://tipuanas.test' },
        addEventListener: (type, fn) => { handlers[type] = fn; },
        registration: { showNotification: async (title, opts) => shown.push({ title, opts }) },
        clients: { matchAll: async () => [], openWindow: async url => opened.push(url), claim: async () => {} },
        skipWaiting: () => {}
    };
    vm.runInNewContext(require('fs').readFileSync(require('path').join(__dirname, '..', 'sw.js'), 'utf8'), { self, caches: {}, fetch: () => {}, URL });
    const waits = [];
    const payload = { title: 'Novo pedido — Loja', body: 'Ana • R$ 12,90 • Entrega', url: '04_merchant_portal.html?store=' + S1, tag: 'o1' };
    handlers.push({ data: { json: () => payload }, waitUntil: p => waits.push(p) });
    await Promise.all(waits);
    assert.strictEqual(shown[0].title, payload.title);
    assert.strictEqual(shown[0].opts.body, payload.body);
    assert.strictEqual(shown[0].opts.tag, 'o1');
    let closed = false;
    handlers.notificationclick({ notification: { close: () => { closed = true; }, data: shown[0].opts.data }, waitUntil: p => waits.push(p) });
    await Promise.all(waits);
    assert.ok(closed, 'notificação fechada');
    assert.deepStrictEqual(opened, ['https://tipuanas.test/04_merchant_portal.html?store=' + S1]);
});

test('lojista: pedido novo no topo, aceitar com um toque e avisar o cliente no mesmo toque', { loggedIn: true }, async (page, db) => {
    db.stores.find(s => s.id === S1).owner_id = USER.id;
    db.orders.push({ id: 'aaaaaaaa-0000-0000-0000-000000000009', store_id: S1, status: 'novo', total_amount: 9, delivery_fee: 0, is_takeout: true, delivery_pin: '4444',
        created_at: new Date().toISOString(), delivery_address: { client_name: 'Duda', client_phone: '48988887777', payment_method: 'Pix' }, order_items: [] });
    await page.addInitScript(() => { window.__opened = []; window.open = (url) => { window.__opened.push(url); return null; }; });
    await page.goto(BASE + '04_merchant_portal.html?store=' + S1);
    await page.waitForSelector('#orders-list [data-order]');
    const order = await page.$$eval('#orders-list [data-order]', els => els.map(e => e.dataset.order));
    assert.strictEqual(order[0], 'aaaaaaaa-0000-0000-0000-000000000009', 'pedido novo primeiro');
    assert.strictEqual(order[order.length - 1], 'aaaaaaaa-0000-0000-0000-000000000002', 'finalizado por último');

    await page.check('#notify-on-tap');
    await page.click('[data-order-action="aaaaaaaa-0000-0000-0000-000000000009"][data-status="em_preparacao"]');
    await page.waitForSelector('[data-order-action="aaaaaaaa-0000-0000-0000-000000000009"][data-status="pronto"]');
    const opened = await page.evaluate(() => window.__opened);
    assert.strictEqual(opened.length, 1);
    assert.ok(decodeURIComponent(opened[0]).startsWith('https://wa.me/5548988887777?text=') && decodeURIComponent(opened[0]).includes('sendo preparado'), opened[0]);
    assert.ok((await page.textContent('[data-order-action="aaaaaaaa-0000-0000-0000-000000000009"][data-status="pronto"]')).includes('retirar'), 'retirada: pronto para retirar');
    assert.strictEqual(await page.evaluate(() => localStorage.getItem('tipuanas_notify_on_tap')), '1', 'preferência lembrada');
});

test('lojista: extrato do mês com comissão, filtro por mês e CSV', { loggedIn: true }, async (page, db) => {
    db.stores.find(s => s.id === S1).owner_id = USER.id;
    const lastMonth = new Date(); lastMonth.setDate(1); lastMonth.setMonth(lastMonth.getMonth() - 1);
    db.orders.find(o => o.status === 'entregue').discount_amount = 2;
    db.orders.push({ id: 'aaaaaaaa-0000-0000-0000-000000000009', store_id: S1, status: 'entregue', total_amount: 100, delivery_fee: 5, is_takeout: false,
        delivery_pin: '1111', created_at: lastMonth.toISOString(), delivery_address: { client_name: '=HYPERLINK("x")' }, order_items: [] });
    await page.goto(BASE + '04_merchant_portal.html?store=' + S1);
    await page.waitForFunction(() => document.getElementById('repasse-orders-count').textContent === '1');
    assert.strictEqual(await page.textContent('#repasse-gross'), 'R$ 30,00', 'só o entregue deste mês');
    assert.strictEqual(await page.textContent('#repasse-commission'), 'R$ 2,40');
    assert.strictEqual(await page.textContent('#repasse-net'), 'R$ 27,60');
    assert.strictEqual(await page.textContent('#extrato-discounts'), 'R$ 2,00');
    assert.ok((await page.textContent('#extrato-top')).includes('Sonho (5)'), 'mais vendidos');

    const options = await page.$$eval('#extrato-month option', els => els.map(e => e.value));
    await page.selectOption('#extrato-month', options[1]);
    assert.strictEqual(await page.textContent('#repasse-gross'), 'R$ 100,00', 'mês anterior');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#extrato-csv')]);
    const csv = require('fs').readFileSync(await download.path(), 'utf8');
    assert.ok(download.suggestedFilename().startsWith('extrato-padaria-ouro-'), download.suggestedFilename());
    assert.ok(csv.includes('"100,00"') && csv.includes('"8,00"'), 'valores e comissão no CSV');
    assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`), 'texto do cliente não vira fórmula');
});

test('lojista: loja de outra conta é recusada e cadastro cria loja com dono', { loggedIn: true }, async (page, db) => {
    db.stores.find(s => s.id === S3).owner_id = 'outra-conta';
    await page.goto(BASE + '04_merchant_portal.html?store=' + S2);
    await page.waitForSelector('#bootstrap-section:not(.hidden)');
    assert.ok((await page.textContent('#bs-error')).includes('outra conta'));
    await page.fill('#bs-name', 'Minha Loja');
    await page.fill('#bs-whatsapp', '48999990000');
    await page.fill('#bs-address', 'Av 1');
    await page.click('#bs-submit');
    await page.waitForSelector('#orders-section:not(.hidden)');
    const w = db.writes.find(x => x.table === 'stores' && x.method === 'POST');
    assert.strictEqual(w.body[0].owner_id, USER.id);
    assert.ok(!('is_active' in w.body[0]), 'ativação fica com o banco (loja nasce pendente)');
});

test('lojista: loja pendente vê "em análise", pede aprovação e segue os primeiros passos', { loggedIn: true }, async (page, db) => {
    Object.assign(db.stores.find(s => s.id === S1), { owner_id: USER.id, approval_status: 'pendente', is_active: false, opening_hours: { seg: '08:00-18:00' } });
    await page.goto(BASE + '04_merchant_portal.html?store=' + S1);
    await page.waitForSelector('#onboarding-section:not(.hidden)');
    const text = await page.textContent('#onboarding-section');
    assert.ok(text.includes('em análise') && text.includes('2 de 6') && text.includes('2 cadastrados'), text);
    const href = decodeURIComponent(await page.getAttribute('[data-ask-approval]', 'href'));
    assert.ok(href.startsWith('https://wa.me/5547999706651?text=') && href.includes('Padaria'), href);
    assert.strictEqual(await page.$$eval('#onboarding-section [data-step-done="false"]', els => els.length), 4, 'logo, 3 produtos, foto e QR pendentes');
    assert.ok(!(await page.$('[data-hide-onboarding]')), 'não dá para fechar antes da aprovação');

    // QR: marcar como feito ao abrir
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('[data-qr-step]')]);
    await popup.close();
    await page.waitForFunction(() => document.querySelector('#onboarding-section').textContent.includes('3 de 6'));
});

test('lojista: edita os dados da loja', { loggedIn: true }, async (page, db) => {
    db.stores.find(s => s.id === S1).owner_id = USER.id;
    await page.goto(BASE + '04_merchant_portal.html?store=' + S1);
    await page.waitForSelector('#store-settings summary');
    assert.strictEqual(await page.inputValue('#store-settings [name="name"]'), "Padaria d'Ouro <b>x</b>", 'nome carregado sem virar HTML');
    await page.click('#store-settings summary');
    await page.fill('#store-settings [name="name"]', 'Padaria Nova');
    await page.fill('#store-settings [name="whatsapp_number"]', '(47) 99970-6651');
    await page.fill('#store-settings [name="delivery_fee"]', '7');
    await page.click('#store-settings button[type="submit"]');
    await page.waitForSelector('text=Dados salvos');
    const w = db.writes.find(x => x.table === 'stores' && x.method === 'PATCH');
    assert.strictEqual(w.body.whatsapp_number, '47999706651', 'WhatsApp só com dígitos');
    assert.strictEqual(w.body.delivery_fee, 7);
    assert.ok(!('owner_id' in w.body) && !('is_active' in w.body), 'não mexe em dono/ativação');
    assert.strictEqual(await page.textContent('#store-title'), 'Padaria Nova');
});

test('pedido mínimo: lojista define, vitrine mostra e a sacola só envia quando atinge', { loggedIn: true }, async (page, db) => {
    db.stores.find(s => s.id === S1).owner_id = USER.id;
    await page.goto(BASE + '04_merchant_portal.html?store=' + S1);
    await page.waitForSelector('#store-settings summary');
    await page.click('#store-settings summary');
    await page.fill('#store-settings [name="min_order_value"]', '5000');
    await page.click('#store-settings button[type="submit"]');
    await page.waitForSelector('text=Pedido mínimo inválido');
    await page.fill('#store-settings [name="min_order_value"]', '20');
    await page.click('#store-settings button[type="submit"]');
    await page.waitForSelector('text=Dados salvos');
    assert.strictEqual(db.writes.find(x => x.table === 'stores' && x.method === 'PATCH').body.min_order_value, 20);

    // Loja muda o mínimo com a sacola já aberta: o banco recusa e a tela explica
    db.stores.find(s => s.id === S1).min_order_value = null;
    const cart = [{ id: 'p2', name: 'Sonho', price: 4.5, storeId: S1, storeName: 'Padaria', quantity: 2 }];
    await page.evaluate(c => localStorage.setItem('tipuanas_cart', JSON.stringify(c)), cart);
    await page.goto(BASE + '10_checkout_whatsapp_flow.html');
    await page.fill('#client-name', 'Maria');
    await page.fill('#client-phone', '48999998888');
    await page.fill('#client-address', 'Rua 1');
    await page.waitForTimeout(300);
    db.stores.find(s => s.id === S1).min_order_value = 20;
    await page.click('#submit-btn');
    await page.waitForSelector('#checkout-error:text("abaixo do mínimo da loja")');

    await page.goto(BASE + 'index.html');
    await page.waitForSelector('#stores-container a[href="loja.html?slug=padaria-ouro"]');
    assert.ok((await page.textContent('#stores-container a[href="loja.html?slug=padaria-ouro"]')).includes('Pedido mín. R$ 20,00'), 'cartão da loja mostra o mínimo');
    await page.goto(BASE + 'loja.html?slug=padaria-ouro');
    await page.waitForSelector('[data-role="min-order"]');

    // Abaixo do mínimo: 2 x 4,50 = 9 → faltam 11, nem chama o banco
    const calls = db.calls.filter(c => c.fn === 'place_order').length;
    await page.evaluate(c => localStorage.setItem('tipuanas_cart', JSON.stringify(c)), cart);
    await page.goto(BASE + '10_checkout_whatsapp_flow.html');
    await page.waitForSelector('#checkout-items [data-role="min-order"]:text("faltam R$ 11,00")');
    await page.fill('#client-address', 'Rua 1');
    await page.click('#submit-btn');
    await page.waitForSelector('#checkout-error:text("pedido mínimo de R$ 20,00")');
    assert.strictEqual(db.calls.filter(c => c.fn === 'place_order').length, calls, 'não envia abaixo do mínimo');

    // Atingiu o mínimo: 5 x 4,50 = 22,50 → envia
    cart[0].quantity = 5;
    await page.evaluate(c => localStorage.setItem('tipuanas_cart', JSON.stringify(c)), cart);
    await page.goto(BASE + '10_checkout_whatsapp_flow.html');
    await page.waitForSelector('#checkout-items [data-role="min-order"]:text("atingido")');
    await page.fill('#client-address', 'Rua 1');
    await page.click('#submit-btn');
    await page.waitForSelector('#confirmation-view:not(.hidden)');
});

test('lojista: WhatsApp inválido não é salvo', { loggedIn: true }, async (page, db) => {
    db.stores.find(s => s.id === S1).owner_id = USER.id;
    await page.goto(BASE + '04_merchant_portal.html?store=' + S1);
    await page.waitForSelector('#store-settings summary');
    await page.click('#store-settings summary');
    await page.fill('#store-settings [name="whatsapp_number"]', '123');
    await page.click('#store-settings button[type="submit"]');
    await page.waitForSelector('text=WhatsApp deve ter DDD');
    assert.ok(!db.writes.some(x => x.table === 'stores' && x.method === 'PATCH'));
});

test('lojista: cardápio carrega com login', { loggedIn: true }, async (page, db) => {
    await page.goto(BASE + '15_gerenciar_cardapio.html?store=' + S1);
    await page.waitForSelector('#products-list button');
    assert.ok(!(await page.$('#products-list img')), 'descrição escapada');
});

test('cardápio: lojista monta as opções do produto (modelo, validação e copiar de outro)', { loggedIn: true }, async (page, db) => {
    db.products.find(p => p.id === 'p2').options = [{ name: 'Recheio <i>', min: 1, max: 1, options: [{ name: 'Creme', price: 0 }, { name: 'Doce de leite', price: 1.5 }] }];
    await page.goto(BASE + '15_gerenciar_cardapio.html?store=' + S1);
    await page.waitForSelector('[data-edit-options="p1"]');
    assert.ok((await page.textContent('[data-edit-options="p2"]')).includes('(1)'), 'contador de grupos');

    await page.click('[data-edit-options="p1"]');
    await page.waitForSelector('#options-editor');
    await page.click('[data-oe="template:tamanho"]');
    await page.fill('[data-o-name="0:2"]', 'Família');
    await page.fill('[data-o-price="0:2"]', '12.5');
    await page.click('[data-oe="del-opt:0:1"]');
    assert.strictEqual(await page.inputValue('[data-o-name="0:1"]'), 'Família', 'removeu a opção do meio e manteve o texto digitado');

    // Grupo novo vazio: salvar mostra o erro e não grava
    await page.click('[data-oe="add-group"]');
    await page.click('[data-oe="save"]');
    await page.waitForSelector('#oe-error:not(.hidden)');
    assert.ok(!db.writes.some(w => w.table === 'products' && w.body && 'options' in w.body), 'nada gravado com erro');
    await page.fill('[data-g-name="1"]', 'Adicionais');
    await page.fill('[data-o-name="1:0"]', 'Queijo');
    await page.fill('[data-o-price="1:0"]', '3');
    await page.fill('[data-g-max="1"]', '2');
    await page.click('[data-oe="save"]');
    await page.waitForSelector('#options-editor', { state: 'detached' });
    const w = db.writes.find(x => x.table === 'products' && x.body && 'options' in x.body);
    assert.ok(w.url.includes('id=eq.p1'));
    assert.deepStrictEqual(w.body.options, [
        { name: 'Tamanho', min: 1, max: 1, options: [{ name: 'Pequeno', price: 0 }, { name: 'Família', price: 12.5 }] },
        { name: 'Adicionais', min: 0, max: 2, options: [{ name: 'Queijo', price: 3 }] }
    ]);

    // Copiar de outro produto (nome escapado na lista)
    await page.click('[data-edit-options="p1"]');
    await page.selectOption('#oe-copy', 'p2');
    assert.strictEqual(await page.inputValue('[data-g-name="0"]'), 'Recheio <i>');
    assert.ok(!(await page.$('#options-editor i')), 'nome escapado');
    await page.click('[data-oe="close"]');
    await page.waitForSelector('#options-editor', { state: 'detached' });
});

test('cardápio: produto novo com foto reduzida e enviada para a pasta da loja', { loggedIn: true }, async (page, db) => {
    db.stores.find(s => s.id === S1).owner_id = USER.id;
    await page.goto(BASE + '15_gerenciar_cardapio.html?store=' + S1);
    await page.waitForSelector('#products-list button');

    // Gera uma imagem 2000x1500 no próprio navegador para simular foto de celular
    const png = await page.evaluate(async () => {
        const c = document.createElement('canvas');
        c.width = 2000; c.height = 1500;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#c33'; ctx.fillRect(0, 0, 2000, 1500);
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    await page.fill('#np-name', 'Bolo');
    await page.fill('#np-price', '20');
    await page.fill('#np-section', 'Doces');
    await page.fill('#np-promo', '25');
    await page.click('button[onclick="adicionarProduto()"]');
    await page.waitForSelector('#np-error:has-text("promocional")');
    await page.fill('#np-promo', '17.5');
    await page.check('#np-featured');
    await page.setInputFiles('#np-photo', { name: 'bolo.png', mimeType: 'image/png', buffer: Buffer.from(png) });
    await page.click('button[onclick="adicionarProduto()"]');
    await page.waitForFunction(() => document.getElementById('np-name').value === '');

    assert.strictEqual(db.uploads.length, 1);
    assert.ok(db.uploads[0].path.startsWith(`product-images/${S1}/`), 'foto na pasta da loja: ' + db.uploads[0].path);
    assert.ok(db.uploads[0].head.includes('image/jpeg'), 'convertida para JPEG');
    assert.ok(db.uploads[0].size < png.length, `reduzida (${db.uploads[0].size} < ${png.length} bytes)`);
    const ins = db.writes.find(x => x.table === 'products' && x.method === 'POST');
    assert.ok(ins.body[0].image_url.includes(`/storage/v1/object/public/product-images/${S1}/`), 'URL pública salva no produto');
    assert.deepStrictEqual([ins.body[0].section, ins.body[0].promo_price, ins.body[0].is_featured], ['Doces', 17.5, true], 'seção, promoção e destaque');
});

test('lojista: painel de orçamentos carrega com login', { loggedIn: true }, async (page, db) => {
    await page.goto(BASE + '17_gerenciar_orcamentos.html?store=' + S3);
    await page.waitForSelector('#requests-section:not(.hidden)');
});

test('identidade no cardápio e nos orçamentos: sem emoji, botões de 44px e pausa em contorno', { loggedIn: true }, async (page, db) => {
    const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{2604}\u{2606}-\u{27BF}]/u;
    await page.goto(BASE + '15_gerenciar_cardapio.html?store=' + S1);
    await page.waitForSelector('#products-list button');
    assert.ok(!EMOJI.test(await page.textContent('body')), 'cardápio sem emoji');
    assert.deepStrictEqual(await smallTargets(page, '#products-list button'), [], 'botões dos produtos com 44px');
    const unlabeled = await page.$$eval('#new-product-section input:not([type=checkbox])',
        els => els.filter(e => !document.querySelector(`label[for="${e.id}"]`)).map(e => e.id));
    assert.deepStrictEqual(unlabeled, [], 'campos do produto novo com <label for>');
    assert.strictEqual(await visibleGolds(page), 0, 'cardápio sem dourado');

    await page.goto(BASE + '17_gerenciar_orcamentos.html?store=' + S3);
    await page.waitForSelector('#requests-section:not(.hidden)');
    await page.waitForSelector('#store-status.flex');
    assert.ok(!EMOJI.test(await page.textContent('body')), 'orçamentos sem emoji');
    assert.strictEqual(await visibleGolds(page), 0, 'loja aberta: "Pausar" em contorno');
    await page.click('#toggle-pause-btn');
    await page.waitForFunction(() => document.getElementById('toggle-pause-btn').textContent.includes('Reabrir'));
    assert.strictEqual(await visibleGolds(page), 1, 'loja pausada: "Reabrir loja" é o dourado');
});

// ---------------------------------------------------------------- Entregador
test('entregador: cadastro, corrida sem dados do cliente, aceite, desistência e PIN', { loggedIn: true }, async (page, db) => {
    const O3 = 'aaaaaaaa-0000-0000-0000-000000000003';
    await page.goto(BASE + 'entregador.html');
    await page.waitForSelector('#signup-section:not(.hidden)');
    await page.fill('#su-name', 'Joao');
    await page.fill('#su-phone', '48911112222');
    await page.fill('#su-vehicle', 'Moto');
    await page.click('#su-submit');
    await page.waitForSelector(`#feed-entregas [data-accept="${O3}"]`);
    assert.strictEqual(db.writes.find(x => x.table === 'couriers').body[0].user_id, USER.id);
    const card = await page.textContent(`[data-ride="${O3}"]`);
    assert.ok(card.includes('Rua 3') && !card.includes('Caio'), 'corrida livre mostra destino, sem nome do cliente');
    assert.strictEqual(await page.title(), '(1) Painel do Entregador — Tipuanas.online');

    // Aceita: vai para "em andamento" com cliente, mapa e WhatsApp
    await page.click(`[data-accept="${O3}"]`);
    await page.waitForSelector(`#feed-mine [data-finish="${O3}"]`);
    assert.ok((await page.textContent('#feed-mine')).includes('Caio'), 'nome do cliente depois de aceitar');
    assert.ok(await page.$('#feed-mine a[href^="https://www.google.com/maps/search/"]'), 'link do mapa');
    assert.ok((await page.textContent('#feed-entregas')).includes('Nenhuma corrida'));

    // Desiste: volta para a lista
    await page.click(`[data-release="${O3}"]`);
    await page.waitForSelector(`#feed-entregas [data-accept="${O3}"]`);
    assert.ok(db.calls.some(c => c.fn === 'release_ride'));

    // Aceita de novo e conclui: PIN errado avisa, certo conclui
    await page.click(`[data-accept="${O3}"]`);
    await page.waitForSelector(`[data-pin-for="${O3}"]`);
    await page.fill(`[data-pin-for="${O3}"]`, '0000');
    await page.click(`[data-finish="${O3}"]`);
    await page.waitForSelector('#toast:text("PIN incorreto")');
    await page.fill(`[data-pin-for="${O3}"]`, '9999');
    await page.click(`[data-finish="${O3}"]`);
    await page.waitForSelector('#toast:text("Entrega concluída")');
    await page.waitForFunction(() => document.getElementById('stat-today-count').textContent === '1');

    const orderReads = await page.evaluate(() => performance.getEntriesByType('resource').map(r => r.name).filter(n => n.includes('/rest/v1/orders')));
    assert.ok(orderReads.every(u => !decodeURIComponent(u).includes('delivery_pin') && !u.includes('select=*')), 'PIN não é buscado pelo entregador');
});

test('lojista e cliente veem quem está levando o pedido', { loggedIn: true }, async (page, db) => {
    db.stores.find(s => s.id === S1).owner_id = USER.id;
    db.couriers.push({ id: 'c1', name: 'Joao Silva', phone: '48911112222', vehicle: 'Moto', user_id: 'outro', is_active: true });
    Object.assign(db.orders.find(o => o.id === O1), { status: 'em_rota', courier_ref: 'c1' });
    await page.goto(BASE + '04_merchant_portal.html?store=' + S1);
    await page.waitForSelector(`[data-courier="${O1}"]`);
    const line = await page.textContent(`[data-courier="${O1}"]`);
    assert.ok(line.includes('Joao Silva') && line.includes('Moto'), line);
    assert.ok(await page.$(`[data-courier="${O1}"] a[href="https://wa.me/5548911112222"]`));

    db.orderStatus = 'em_rota';
    await page.goto(BASE + '11_order_tracking_realtime.html?id=' + O1);
    await page.waitForSelector('#status-desc:text("Joao (Moto) está levando")');
});

// ---------------------------------------------------------------- Admin
test('identidade no entregador e no admin: sem emoji, botões de 44px e nenhuma corrida dourada', { loggedIn: true }, async (page, db) => {
    const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{2604}\u{2606}-\u{27BF}]/u;
    const O3 = 'aaaaaaaa-0000-0000-0000-000000000003';
    await page.goto(BASE + 'entregador.html');
    await page.waitForSelector('#signup-section:not(.hidden)');
    assert.strictEqual(await visibleGolds(page), 1, 'cadastro: "Cadastrar e ver corridas" é o dourado');
    await page.fill('#su-name', 'Joao');
    await page.fill('#su-phone', '48911112222');
    await page.fill('#su-vehicle', 'Moto');
    await page.click('#su-submit');
    await page.waitForSelector(`#feed-entregas [data-accept="${O3}"]`);
    assert.ok(!EMOJI.test(await page.textContent('body')), 'entregador sem emoji');
    assert.strictEqual(await visibleGolds(page), 0, 'corridas em verde-copa (várias na lista, nenhuma dourada)');
    assert.deepStrictEqual(await smallTargets(page, '#feed-entregas button'), [], 'botões das corridas com 44px');

    db.admin = true;
    await page.goto(BASE + '14_admin_analytics_dashboard.html');
    await page.waitForSelector('[data-toggle-store]');
    assert.ok(!EMOJI.test(await page.textContent('body')), 'admin sem emoji');
    assert.deepStrictEqual(await smallTargets(page, '#stores-admin-table button'), [], 'botões da tabela de lojas com 44px');
});

test('identidade em todo o site: nenhum emoji nem a fonte Inter antiga nos arquivos das telas', {}, async () => {
    const fs = require('fs');
    const path = require('path');
    const root = path.join(__dirname, '..');
    const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{2604}\u{2606}-\u{27BF}\u{FE0F}]/u;
    const files = fs.readdirSync(root).filter(f => /\.(html|js)$/.test(f));
    const withEmoji = files.filter(f => EMOJI.test(fs.readFileSync(path.join(root, f), 'utf8')));
    assert.deepStrictEqual(withEmoji, [], 'arquivos com emoji');
    const withInter = files.filter(f => /family=Inter/.test(fs.readFileSync(path.join(root, f), 'utf8')));
    assert.deepStrictEqual(withInter, [], 'arquivos com a fonte Inter');
});

test('identidade no mural, orçamento do cliente e 404: um só dourado e campos com rótulo', {}, async (page, db) => {
    await page.goto(BASE + '20_mural_vizinhanca.html');
    await page.waitForSelector('#posts-list');
    assert.strictEqual(await visibleGolds(page), 0, 'ver mural: nenhum dourado (WhatsApp em verde-copa)');
    await page.click('#tab-postar');
    assert.strictEqual(await visibleGolds(page), 1, 'postar: "Publicar no mural" é o dourado');
    const unlabeled = await page.$$eval('#postar-section input[id], #postar-section textarea',
        els => els.filter(e => !document.querySelector(`label[for="${e.id}"]`)).map(e => e.id));
    assert.deepStrictEqual(unlabeled, [], 'campos do anúncio com <label for>');
    assert.deepStrictEqual(await smallTargets(page, 'header button, #ver-section button'), [], 'abas e filtros com 44px');

    await page.goto(BASE + '404.html');
    await page.waitForSelector('h1');
    assert.strictEqual(await visibleGolds(page), 1, '404: "Ver as lojas da avenida" é o dourado');
});

test('admin: conta comum vê acesso restrito', { loggedIn: true }, async (page, db) => {
    await page.goto(BASE + '14_admin_analytics_dashboard.html');
    await page.waitForSelector('text=Acesso restrito');
});

test('admin: admin vê métricas (comissão só sobre entregues)', { loggedIn: true }, async (page, db) => {
    db.admin = true;
    await page.goto(BASE + '14_admin_analytics_dashboard.html');
    await page.waitForSelector('[data-toggle-store]');
    assert.strictEqual(await page.textContent('#total-gmv'), 'R$ 30,00');
});

test('admin: loja pendente aparece primeiro e é aprovada com um toque', { loggedIn: true }, async (page, db) => {
    db.admin = true;
    Object.assign(db.stores.find(s => s.id === S2), { approval_status: 'pendente', is_active: false });
    await page.goto(BASE + '14_admin_analytics_dashboard.html');
    await page.waitForSelector(`[data-approve-store="${S2}"]`);
    assert.ok((await page.textContent('#pending-stores-alert')).includes('1 loja aguardando aprovação'));
    const first = await page.$eval('#stores-admin-table tr', tr => tr.textContent);
    assert.ok(first.includes('Aguardando aprovação'), 'pendente na primeira linha');
    await page.click(`[data-approve-store="${S2}"]`);
    await page.waitForFunction(() => document.getElementById('pending-stores-alert').classList.contains('hidden'));
    const w = db.writes.find(x => x.table === 'stores' && x.method === 'PATCH');
    assert.deepStrictEqual(w.body, { approval_status: 'aprovada', is_active: true });
});

test('admin: edita loja, define dono, cancela pedido e desativa entregador', { loggedIn: true }, async (page, db) => {
    db.admin = true;
    db.couriers.push({ id: 'c1', name: 'Joao <b>', phone: '48911112222', vehicle: 'Moto', is_active: true, user_id: 'x' });
    await page.goto(BASE + '14_admin_analytics_dashboard.html');
    await page.waitForSelector('[data-edit-store]');
    assert.ok((await page.innerHTML('#stores-admin-table')).includes('sem dono'), 'loja sem dono sinalizada');
    assert.ok(!(await page.$('#couriers-admin-list b')), 'nome do entregador escapado');

    // Edita a loja S2 (sem WhatsApp) e define o dono
    await page.click(`[data-edit-store="${S2}"]`);
    await page.waitForSelector('#store-editor [name="whatsapp_number"]');
    await page.fill('#store-editor [name="whatsapp_number"]', '47999706651');
    await page.click('#store-editor button[type="submit"]');
    await page.waitForSelector('text=Dados salvos');
    const patch = db.writes.find(x => x.table === 'stores' && x.method === 'PATCH');
    assert.strictEqual(patch.body.whatsapp_number, '47999706651');

    await page.click(`[data-edit-store="${S2}"]`);
    await page.fill('#store-editor [data-role="owner-email"]', 'naoexiste@x.dev');
    await page.click('#store-editor [data-role="owner-save"]');
    await page.waitForSelector('text=Nenhuma conta com esse e-mail');
    await page.fill('#store-editor [data-role="owner-email"]', USER.email);
    await page.click('#store-editor [data-role="owner-save"]');
    await page.waitForSelector('text=Dono definido');
    assert.strictEqual(db.stores.find(x => x.id === S2).owner_id, USER.id);

    // Pedidos em aberto: cancela um
    await page.waitForSelector('[data-cancel-order]');
    await page.click('[data-cancel-order]');
    await page.waitForTimeout(200);
    assert.ok(db.writes.some(x => x.table === 'orders' && x.method === 'PATCH' && x.body.status === 'cancelado'));

    // Entregador
    await page.click('[data-toggle-courier="c1"]');
    await page.waitForTimeout(200);
    const cw = db.writes.find(x => x.table === 'couriers' && x.method === 'PATCH');
    assert.strictEqual(cw.body.is_active, false);
});

test('privacidade: página com contato, apaga dados do aparelho e está ligada nas telas do cliente', {}, async (page, db) => {
    const fs = require('fs');
    const path = require('path');
    for (const f of ['index.html', '10_checkout_whatsapp_flow.html', '20_mural_vizinhanca.html', 'pedidos.html']) {
        assert.ok(fs.readFileSync(path.join(__dirname, '..', f), 'utf8').includes('href="privacidade.html"'), 'link em ' + f);
    }
    await page.goto(BASE + 'index.html');
    await page.evaluate(() => {
        localStorage.setItem('tipuanas_cart', '[{"id":"p1"}]');
        localStorage.setItem('tipuanas_client', '{"name":"Ana"}');
        localStorage.setItem('outra_coisa', 'fica');
    });
    await page.goto(BASE + 'privacidade.html');
    await page.waitForFunction(() => document.getElementById('privacy-contact').href.includes('wa.me/55'));
    await page.click('#clear-device-btn');
    await page.waitForSelector('#clear-device-status:not(.hidden)');
    const keys = await page.evaluate(() => Object.keys(localStorage));
    assert.ok(!keys.some(k => k.startsWith('tipuanas_')), 'dados do site apagados');
    assert.ok(keys.includes('outra_coisa'), 'não mexe em chaves de outros');
});

test('PWA: manifest válido, ícones no repositório e todas as telas ligadas ao app', {}, async (page, db) => {
    const fs = require('fs');
    const path = require('path');
    const root = path.join(__dirname, '..');
    const manifest = JSON.parse(fs.readFileSync(path.join(root, '07_client_pwa_manifest.json'), 'utf8'));
    for (const icon of manifest.icons) {
        assert.ok(!/^https?:/.test(icon.src), 'ícone local: ' + icon.src);
        assert.ok(fs.existsSync(path.join(root, icon.src)), 'ícone existe: ' + icon.src);
    }
    assert.ok(manifest.icons.some(i => i.purpose === 'maskable'), 'ícone maskable');
    for (const f of fs.readdirSync(root).filter(n => n.endsWith('.html'))) {
        const html = fs.readFileSync(path.join(root, f), 'utf8');
        assert.ok(/rel="manifest" href="\/?07_client_pwa_manifest\.json"/.test(html), 'manifest em ' + f);
        assert.ok(html.includes('name="theme-color"'), 'theme-color em ' + f);
        if (html.includes('cdn.tailwindcss.com')) assert.ok(/cdn\.tailwindcss\.com"><\/script>\s*<script src="theme\.js"><\/script>/.test(html), 'identidade (theme.js) logo depois do Tailwind em ' + f);
    }
    await page.goto(BASE + 'sw.js');
    assert.ok((await page.content()).includes('CACHE_VERSION'));
});

test('publicação: vercel.json válido, página 404 e prévia de link (Open Graph)', {}, async (page, db) => {
    const fs = require('fs');
    const path = require('path');
    const root = path.join(__dirname, '..');
    const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
    const all = vercel.headers.find(h => h.source === '/(.*)').headers.map(h => h.key);
    for (const key of ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy']) assert.ok(all.includes(key), key);
    assert.ok(vercel.headers.some(h => h.source === '/sw.js'), 'sw.js sem cache');
    assert.ok(vercel.redirects.some(r => r.source === '/lojista.html' && r.destination === '/04_merchant_portal.html'), 'tela antiga redireciona');

    await page.goto(BASE + '404.html');
    await page.waitForSelector('text=Página não encontrada');

    for (const f of ['index.html', 'loja.html', '20_mural_vizinhanca.html']) {
        const html = fs.readFileSync(path.join(root, f), 'utf8');
        assert.ok(html.includes('property="og:title"') && html.includes('property="og:image"'), 'Open Graph em ' + f);
    }
});

// ---------------------------------------------------------------- Runner
(async () => {
    const only = process.argv[2];
    const browser = await launch();
    let failed = 0;

    for (const t of tests) {
        if (only && !t.name.includes(only)) continue;
        const db = freshDb();
        const { page, errors, close } = await openPage(browser, db, t.opts);
        page.setDefaultTimeout(8000);
        try {
            await t.fn(page, db);
            if (errors.length) throw new Error(errors.join('\n'));
            console.log(`  ✓ ${t.name}`);
        } catch (e) {
            failed++;
            console.log(`  ✗ ${t.name}\n      ${String(e.message).split('\n').join('\n      ')}`);
        }
        await close();
    }

    await browser.close();
    console.log(failed ? `\n${failed} teste(s) falharam` : '\nTodos os testes passaram');
    process.exit(failed ? 1 : 0);
})();
