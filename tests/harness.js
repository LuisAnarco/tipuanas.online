/**
 * Ambiente de teste: abre as páginas do site num Chromium (Playwright) com o
 * Supabase simulado — tabelas, funções (RPC) e login — sem precisar de rede.
 * Tailwind e fontes são trocados por respostas vazias, então as classes CSS
 * (ex.: "hidden") não têm efeito visual: os testes olham classes/atributos.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const UMD = fs.readFileSync(require.resolve('@supabase/supabase-js/dist/umd/supabase.js'));
const SESSION_KEY = 'sb-fdhnzdjxbztyomzhunxw-auth-token';

const USER = { id: 'uuuuuuuu-0000-0000-0000-000000000001', email: 'lojista@teste.dev', aud: 'authenticated', role: 'authenticated' };
const S1 = '11111111-1111-1111-1111-111111111111'; // catálogo, sem dono
const S2 = '22222222-2222-2222-2222-222222222222'; // catálogo, de outra conta, sem WhatsApp
const S3 = '33333333-3333-3333-3333-333333333333'; // orçamento, do USER
const O1 = 'aaaaaaaa-0000-0000-0000-000000000001';

/** Estado do "banco" simulado; recriado a cada teste */
function freshDb() {
    const now = new Date().toISOString();
    return {
        stores: [
            { id: S1, name: "Padaria d'Ouro <b>x</b>", category: 'Padaria', whatsapp_number: '47999706651', address_line: 'Av. 10', delivery_fee: 5, is_active: true, is_paused: false, listing_type: 'catalogo', owner_id: null, description: 'Pães', slug: 'padaria-ouro' },
            { id: S2, name: 'Baratissimo', category: 'Mercado', whatsapp_number: null, address_line: 'Av. 20', delivery_fee: 0, is_active: true, is_paused: false, listing_type: 'catalogo', owner_id: 'outra-conta', slug: 'baratissimo' },
            { id: S3, name: 'BOA! Lavagem', category: 'Serviços', whatsapp_number: '47999706651', address_line: '', delivery_fee: 0, is_active: true, is_paused: false, listing_type: 'orcamento', owner_id: USER.id, description: 'Lavagem' },
        ],
        products: [
            { id: 'p1', store_id: S1, name: "Pão d'água", description: '<img src=x onerror=alert(1)>', price: 1.5, is_paused: false, image_url: null },
            { id: 'p2', store_id: S1, name: 'Sonho', description: null, price: 6, is_paused: false, image_url: null },
            { id: 'p3', store_id: S2, name: 'Arroz 5kg', description: null, price: 25, is_paused: false, image_url: null },
        ],
        orders: [
            { id: O1, store_id: S1, status: 'em_preparacao', total_amount: 14, delivery_fee: 5, is_takeout: false, delivery_pin: '1234', created_at: now,
              delivery_address: { client_name: 'Ana <script>', client_phone: '48999998888', address: 'Rua 1', payment_method: 'Pix', notes: 'sem cebola' },
              order_items: [{ quantity: 6, unit_price: 1.5, products: { name: "Pão d'água" } }] },
            { id: 'aaaaaaaa-0000-0000-0000-000000000002', store_id: S1, status: 'entregue', total_amount: 30, delivery_fee: 0, is_takeout: false, delivery_pin: '5555', created_at: now,
              delivery_address: { client_name: 'Bia', client_phone: '48999998888', address: 'Rua 2', payment_method: 'Dinheiro' },
              order_items: [{ quantity: 5, unit_price: 6, products: { name: 'Sonho' } }] },
            { id: 'aaaaaaaa-0000-0000-0000-000000000003', store_id: S2, status: 'pronto', total_amount: 25, delivery_fee: 0, is_takeout: false, delivery_pin: '9999', created_at: now,
              delivery_address: { client_name: 'Caio', address: 'Rua 3', payment_method: 'Pix' }, order_items: [] },
        ],
        reviews: [
            { store_id: S1, rating: 5, comment: '<b>bom</b> demais', created_at: now },
            { store_id: S1, rating: 4, comment: null, created_at: now },
        ],
        posts: [{ id: 'm1', post_type: 'desapego', title: 'Sofá <i>x</i>', description: 'bom', price: null, author_name: 'Zé', author_whatsapp: '48999990000', is_active: true, created_at: now }],
        couriers: [],
        admin: false,
        orderStatus: 'entregue', // status devolvido por get_order_public
        calls: [],   // chamadas de RPC: { fn, body }
        writes: [],  // POST/PATCH/DELETE em tabelas: { table, method, body, url }
        otp: null,   // pedido de link de login
    };
}

function rpc(db, fn, body) {
    db.calls.push({ fn, body });
    switch (fn) {
        case 'is_admin': return db.admin;
        case 'admin_store_owners':
            return db.stores.map(st => ({ store_id: st.id, owner_email: st.owner_id === USER.id ? USER.email : (st.owner_id ? 'outro@teste.dev' : null) }));
        case 'admin_set_store_owner': {
            if (body.p_email && body.p_email !== USER.email) throw { status: 400, body: { code: 'P0001', message: 'user_not_found' } };
            db.stores.find(x => x.id === body.p_store_id).owner_id = body.p_email ? USER.id : null;
            return body.p_email || null;
        }
        case 'claim_store': {
            const s = db.stores.find(x => x.id === body.p_store_id);
            s.owner_id = USER.id;
            return s;
        }
        case 'place_order': {
            const store = db.stores.find(s => s.id === body.p_store_id);
            if (!store || store.id === S2) throw { status: 400, body: { code: 'P0001', message: 'store_unavailable' } };
            const items = body.p_items.map(it => {
                const p = db.products.find(x => x.id === it.product_id);
                return { product_id: p.id, name: p.name, quantity: it.quantity, unit_price: p.price };
            });
            const subtotal = items.reduce((a, i) => a + i.unit_price * i.quantity, 0);
            const fee = body.p_is_takeout ? 0 : store.delivery_fee;
            return { id: 'bbbbbbbb-0000-0000-0000-00000000000' + db.calls.length, pin: '4321', subtotal, delivery_fee: fee, total: subtotal + fee, items, store: { name: store.name, whatsapp_number: store.whatsapp_number } };
        }
        case 'get_order_public': {
            const o = db.orders.find(x => x.id === body.p_id);
            if (!o) return null;
            return { ...o, status: db.orderStatus, has_review: false, delivery_address: { address: o.delivery_address.address },
                stores: { name: "Padaria d'Ouro", whatsapp_number: '47999706651', address_line: 'Av. 10' } };
        }
        case 'get_orders_public':
        case 'get_orders_by_phone':
            return [{ id: O1, status: 'em_rota', total_amount: 14, created_at: new Date().toISOString(), is_takeout: false, stores: { name: 'Padaria <b>x</b>' }, order_items: [{ quantity: 1, products: { name: 'Sonho' } }] }];
        case 'cancel_order_public': {
            if (db.orderStatus !== 'novo') return false;
            db.orderStatus = 'cancelado';
            return true;
        }
        case 'accept_ride': return true;
        case 'finish_ride': return body.p_pin === '1234';
        case 'create_service_request': return 'cccccccc-0000-0000-0000-000000000001';
        case 'get_service_request_public':
            return { request: { id: body.p_id, status: 'proposta_enviada', proposal_amount: 100, proposal_description: 'Lavagem', client_name: 'X' },
                     updates: [{ note: '<i>ok</i>', created_at: new Date().toISOString() }] };
        case 'respond_service_proposal':
        case 'client_confirm_service_payment':
            return true;
        default:
            throw new Error('RPC não simulada: ' + fn);
    }
}

function select(db, table, url) {
    const q = k => url.searchParams.get(k);
    const byEq = (rows, col) => {
        const v = q(col);
        if (!v) return rows;
        if (v.startsWith('eq.')) return rows.filter(r => String(r[col]) === v.slice(3));
        if (v.startsWith('in.')) return rows.filter(r => v.includes(r[col]));
        return rows;
    };
    switch (table) {
        case 'stores': return byEq(byEq(byEq(db.stores, 'id'), 'owner_id'), 'slug');
        case 'products': return byEq(byEq(db.products, 'id'), 'store_id');
        case 'orders': return byEq(byEq(db.orders, 'id'), 'store_id');
        case 'reviews': return byEq(db.reviews, 'store_id');
        case 'community_posts': return db.posts;
        case 'couriers': return db.couriers;
        default: return [];
    }
}

/**
 * Abre uma página nova com o banco simulado.
 * opts.loggedIn: grava uma sessão falsa do USER no localStorage (Supabase Auth).
 */
async function openPage(browser, db, { loggedIn = false } = {}) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = [];

    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => {
        // 400 = erro de negócio simulado de propósito (ex.: loja fechada)
        if (m.type() === 'error' && !/WebSocket|realtime|net::ERR|status of 400|Erro ao registrar pedido/i.test(m.text())) {
            errors.push('console: ' + m.text());
        }
    });
    page.on('dialog', d => d.accept(d.type() === 'prompt' ? '1234' : undefined));

    if (loggedIn) {
        const session = { access_token: 'fake', refresh_token: 'fake', token_type: 'bearer', expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600, user: USER };
        await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [SESSION_KEY, JSON.stringify(session)]);
    }

    await page.route('**/*', async route => {
        const req = route.request();
        const url = new URL(req.url());
        const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

        if (url.host === 'local') {
            const file = path.join(ROOT, decodeURIComponent(url.pathname));
            if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
            const type = file.endsWith('.js') ? 'application/javascript' : file.endsWith('.json') ? 'application/json' : 'text/html';
            return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(file) });
        }
        if (url.href.includes('supabase-js@2')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: UMD });
        if (url.pathname.startsWith('/auth/v1/otp')) {
            db.otp = { ...JSON.parse(req.postData() || '{}'), url: url.href };
            return json(200, {});
        }
        if (url.pathname.startsWith('/auth/v1/')) return json(200, {});
        if (url.pathname.startsWith('/rest/v1/rpc/')) {
            const fn = url.pathname.split('/').pop();
            try {
                return json(200, rpc(db, fn, JSON.parse(req.postData() || '{}')));
            } catch (e) {
                if (e.body) return json(e.status, e.body);
                errors.push(e.message);
                return json(404, {});
            }
        }
        if (url.pathname.startsWith('/rest/v1/')) {
            const table = url.pathname.split('/').pop();
            const method = req.method();
            if (method !== 'GET' && method !== 'HEAD') {
                const body = req.postData() ? JSON.parse(req.postData()) : null;
                db.writes.push({ table, method, body, url: url.href });
                if (method === 'POST') {
                    const rows = (Array.isArray(body) ? body : [body]).map((r, i) => ({ id: `new-${table}-${db.writes.length}-${i}`, is_active: true, ...r }));
                    if (table === 'couriers') db.couriers.push(...rows);
                    if (table === 'stores') db.stores.push(...rows);
                    return json(201, rows);
                }
                if (method === 'PATCH') {
                    // Aplica a alteração nas linhas filtradas por id (como o PostgREST)
                    const rows = select(db, table, url);
                    rows.forEach(r => Object.assign(r, body));
                    return json(200, rows);
                }
                return json(200, []);
            }
            const rows = select(db, table, url);
            const accept = req.headers()['accept'] || '';
            return json(200, accept.includes('vnd.pgrst.object') ? (rows[0] || null) : rows);
        }
        // Tailwind, fontes, QR Code e demais CDNs: resposta vazia
        return route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
    });

    return { page, errors, close: () => context.close() };
}

/** Chromium: usa o pré-instalado do ambiente quando existir, senão o padrão do Playwright */
async function launch() {
    const preinstalled = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
    return chromium.launch(fs.existsSync(preinstalled) ? { executablePath: preinstalled } : {});
}

/** Checagem: classe "hidden" ausente (Tailwind não carrega no teste) */
async function isShown(page, selector) {
    return page.$eval(selector, el => !el.classList.contains('hidden'));
}

module.exports = { launch, openPage, freshDb, isShown, USER, S1, S2, S3, O1 };
