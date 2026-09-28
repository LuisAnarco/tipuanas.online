/**
 * Testes de fumaça do Tipuanas.online — rodar com `npm test`.
 * Cada teste abre as páginas reais com o Supabase simulado (ver harness.js).
 */
const assert = require('assert');
const { launch, openPage, freshDb, isShown, USER, S1, S2, S3, O1 } = require('./harness');

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
    assert.deepStrictEqual(sections, ['⭐ Destaques', 'Doces <i>x</i>', 'Pães'], 'destaques + seções em ordem');
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
    assert.strictEqual(await page.textContent('#checkout-total-price'), 'R$ 52,00', '30 + 25 - 3');

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

test('acompanhamento: linha do tempo e avaliação após entrega', {}, async (page, db) => {
    db.orderStatus = 'em_preparacao';
    await page.goto(BASE + '11_order_tracking_realtime.html?id=' + O1);
    await page.waitForSelector('#order-details:not(.hidden)');
    assert.ok((await page.getAttribute('#step-preparing', 'class')).includes('text-emerald-700'), 'etapa atual acesa');
    assert.ok(!(await page.getAttribute('#step-transit', 'class')).includes('text-emerald-700'), 'etapa futura apagada');
    assert.ok(!(await isShown(page, '#review-card')), 'sem avaliação antes de entregar');
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
    await page.goto(BASE + '04_merchant_portal.html?store=' + S1);
    await page.waitForSelector('#orders-list select');
    assert.ok(db.calls.some(c => c.fn === 'claim_store'), 'claim_store chamado');
    assert.ok(!(await page.$('#orders-list script')), 'nome do cliente escapado');
    assert.strictEqual(await page.textContent('#total-orders-today'), '2', 'pedidos de hoje sem cancelados');
    assert.ok((await page.textContent('#user-bar')).includes(USER.email));
    await page.waitForSelector('#reviews-section:not(.hidden)');
    assert.ok(!(await page.$('#reviews-list b')), 'comentário escapado');
});

test('lojista: avisar o cliente pelo WhatsApp com mensagem do status e link de acompanhamento', { loggedIn: true }, async (page, db) => {
    db.stores.find(s => s.id === S1).owner_id = USER.id;
    await page.goto(BASE + '04_merchant_portal.html?store=' + S1);
    await page.waitForSelector(`[data-notify-client="${O1}"]`);
    let href = decodeURIComponent(await page.getAttribute(`[data-notify-client="${O1}"]`, 'href'));
    assert.ok(href.startsWith('https://wa.me/5548999998888?text='), href);
    assert.ok(href.includes('está sendo preparado') && href.includes(`11_order_tracking_realtime.html?id=${O1}`), 'mensagem do status + link');
    assert.ok(!href.includes('<script>'), 'nome do cliente só pelo primeiro nome');

    await page.selectOption(`[data-notify-client="${O1}"] >> xpath=ancestor::div[contains(@class,"rounded-lg")][1] >> select`, 'em_rota');
    await page.waitForFunction(id => decodeURIComponent(document.querySelector(`[data-notify-client="${id}"]`).href).includes('saiu para entrega'), O1);
    href = decodeURIComponent(await page.getAttribute(`[data-notify-client="${O1}"]`, 'href'));
    assert.ok(href.includes('PIN 1234'), 'PIN na mensagem de saída para entrega');
    assert.ok((await page.getAttribute(`[data-notify-client="${O1}"]`, 'class')).includes('animate-pulse'), 'botão em destaque depois da mudança');
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

// ---------------------------------------------------------------- Entregador
test('entregador: cadastro vinculado ao usuário e aceite via accept_ride', { loggedIn: true }, async (page, db) => {
    await page.goto(BASE + 'entregador.html');
    await page.waitForSelector('#signup-section:not(.hidden)');
    await page.fill('#su-name', 'Joao');
    await page.fill('#su-phone', '48911112222');
    await page.click('#su-submit');
    await page.waitForSelector('#feed-entregas [data-accept]');
    assert.strictEqual(db.writes.find(x => x.table === 'couriers').body[0].user_id, USER.id);
    await page.click('#feed-entregas [data-accept]');
    await page.waitForTimeout(200);
    assert.ok(db.calls.some(c => c.fn === 'accept_ride'));
    const orderReads = await page.evaluate(() => performance.getEntriesByType('resource').map(r => r.name).filter(n => n.includes('/rest/v1/orders')));
    assert.ok(orderReads.every(u => !decodeURIComponent(u).includes('delivery_pin') && !u.includes('select=*')), 'PIN não é buscado pelo entregador');
});

// ---------------------------------------------------------------- Admin
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
