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
test('vitrine: lista lojas, escapa HTML, busca, categoria e carrinho', {}, async (page, db) => {
    await page.goto(BASE + 'index.html');
    await page.waitForSelector('[data-add-product="p1"]');
    assert.ok(!(await page.$('#stores-container img[src="x"]')), 'descrição com HTML não pode virar tag');
    assert.ok((await page.innerHTML('#stores-container')).includes('★ 4,5'), 'nota média da loja');

    await page.click('[data-add-product="p1"]'); // produto com apóstrofo
    await page.click('[data-add-product="p1"]');
    await page.click('[data-add-product="p3"]');
    assert.strictEqual(await page.textContent('#cart-item-count'), '3 itens');

    await page.fill('#search-input', 'arroz');
    let html = await page.innerHTML('#stores-container');
    assert.ok(html.includes('Arroz') && !html.includes('Sonho'), 'busca por produto');

    await page.fill('#search-input', '');
    await page.click('[data-category="Mercado"]');
    html = await page.innerHTML('#stores-container');
    assert.ok(!html.includes('Sonho'), 'filtro por categoria');
});

test('página da loja: só a loja do slug, com avaliações e carrinho', {}, async (page, db) => {
    await page.goto(BASE + 'index.html');
    await page.waitForSelector('#stores-container a[href="loja.html?slug=padaria-ouro"]');

    await page.goto(BASE + 'loja.html?slug=padaria-ouro');
    await page.waitForSelector('[data-add-product="p1"]');
    const html = await page.innerHTML('#stores-container');
    assert.ok(!html.includes('Arroz'), 'não mostra produto de outra loja');
    const header = await page.innerHTML('#store-header');
    assert.ok(header.includes('★ 4,5') && header.includes('demais'), 'nota e comentário');
    assert.ok(!(await page.$('#store-header b')), 'comentário escapado');
    assert.ok(header.includes('wa.me/5547999706651'));
    await page.click('[data-add-product="p2"]');
    assert.strictEqual(await page.textContent('#cart-item-count'), '1 item');
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

test('horário: vitrine mostra loja fechada e esconde o botão de adicionar', {}, async (page, db) => {
    // Loja S1 só abre às segundas de madrugada (00:00-00:01): quase sempre fechada
    const closedDay = db.stores.find(s => s.id === S1);
    closedDay.opening_hours = { '1': '00:00-00:01' };
    await page.goto(BASE + 'index.html');
    await page.waitForSelector('[data-add-product="p3"]');
    const status = await page.evaluate(h => storeOpenStatus(h, new Date('2026-09-28T15:00:00-03:00')), closedDay.opening_hours);
    assert.deepStrictEqual(status, { open: false, label: 'abre seg às 00:00' });
    const nowStatus = await page.evaluate(h => storeOpenStatus(h), closedDay.opening_hours);
    if (!nowStatus.open) {
        assert.ok(await page.$('[data-role="closed-badge"]'), 'selo de fechada');
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
    await page.click('#search-btn');
    await page.waitForSelector('#orders-list a');
    assert.ok(db.calls.some(c => c.fn === 'get_orders_by_phone'));
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
    await page.setInputFiles('#np-photo', { name: 'bolo.png', mimeType: 'image/png', buffer: Buffer.from(png) });
    await page.click('button[onclick="adicionarProduto()"]');
    await page.waitForFunction(() => document.getElementById('np-name').value === '');

    assert.strictEqual(db.uploads.length, 1);
    assert.ok(db.uploads[0].path.startsWith(`product-images/${S1}/`), 'foto na pasta da loja: ' + db.uploads[0].path);
    assert.ok(db.uploads[0].head.includes('image/jpeg'), 'convertida para JPEG');
    assert.ok(db.uploads[0].size < png.length, `reduzida (${db.uploads[0].size} < ${png.length} bytes)`);
    const ins = db.writes.find(x => x.table === 'products' && x.method === 'POST');
    assert.ok(ins.body[0].image_url.includes(`/storage/v1/object/public/product-images/${S1}/`), 'URL pública salva no produto');
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
    assert.strictEqual(await page.textContent('#total-gmv'), 'R$ 30.00');
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
        assert.ok(html.includes('rel="manifest" href="07_client_pwa_manifest.json"'), 'manifest em ' + f);
        assert.ok(html.includes('name="theme-color"'), 'theme-color em ' + f);
    }
    await page.goto(BASE + 'sw.js');
    assert.ok((await page.content()).includes('CACHE_VERSION'));
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
