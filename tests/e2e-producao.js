/**
 * Teste de ponta a ponta NO SITE PUBLICADO (Supabase real) — rodar com `npm run e2e:producao`.
 * Faz o caminho do cliente: vitrine, busca, loja, sacola com cupom, pedido real (loja de
 * demonstração), acompanhamento, Meus pedidos com PIN e cancela o pedido no fim.
 * Também abre as demais telas públicas. Mostra erros de console e requisições com falha.
 * E2E_URL troca o endereço (ex.: preview da Vercel). Prints ficam em e2e-prints/.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = (process.env.E2E_URL || 'https://avenidadastipuanas-online.vercel.app').replace(/\/?$/, '/');
const OUT = require('path').join(__dirname, '..', 'e2e-prints') + '/';
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const preinstalled = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const b = await chromium.launch({ ...(fs.existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
    proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
  // Atrás de proxy (ambiente de nuvem), o Node busca cada requisição: o Chromium falha no túnel
  if (process.env.HTTPS_PROXY) await ctx.route('**/*', async route => {
    for (let i = 0; i < 3; i++) {
      try { const r = await route.fetch({ timeout: 30000 }); return route.fulfill({ response: r }); }
      catch (e) { if (i === 2) return route.abort(); }
    }
  });
  const page = await ctx.newPage();
  const log = [];
  let current = '';
  page.on('pageerror', e => log.push(`[${current}] pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') log.push(`[${current}] console: ${m.text().slice(0, 200)}`); });
  page.on('requestfailed', r => log.push(`[${current}] requestfailed: ${r.url().slice(0, 120)} ${r.failure() && r.failure().errorText}`));
  page.on('response', r => { if (r.status() >= 400 && !r.url().includes('favicon')) log.push(`[${current}] HTTP ${r.status()}: ${r.url().slice(0, 140)}`); });
  page.on('dialog', d => { log.push(`[${current}] dialog: ${d.message().slice(0,120)}`); d.accept(); });
  const step = async (name, fn) => {
    current = name;
    try { await fn(); console.log('OK  ', name); }
    catch (e) { failures++; console.log('FAIL', name, '-', e.message.split('\n')[0]); }
    await page.screenshot({ path: OUT + name + '.png', fullPage: true }).catch(() => {});
  };
  let orderId = null, pin = null, failures = 0;

  await step('01-home', async () => {
    await page.goto(BASE + 'index.html', { waitUntil: 'networkidle' });
    await page.waitForSelector('#stores-container a', { timeout: 15000 });
    console.log('     lojas:', await page.$$eval('#stores-container > a', e => e.length),
      '| ofertas:', await page.$$eval('#offers-row > div', e => e.length),
      '| banners:', await page.$$eval('#banners > *', e => e.length),
      '| categorias:', await page.$$eval('#category-chips [data-category]', e => e.length));
  });
  await step('02-busca', async () => {
    await page.fill('#search-input', 'pizza');
    await page.waitForSelector('#stores-container [data-add-product], #stores-container [data-role="sold-out"]', { timeout: 5000 });
    await page.fill('#search-input', '');
  });
  await step('03-loja', async () => {
    await page.goto(BASE + 'loja.html?slug=pizzaria-forno-da-tipuanas', { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-add-product]', { timeout: 15000 });
    const first = await page.$eval('[data-add-product]', e => e.dataset.addProduct);
    await page.click(`[data-add-product="${first}"]`);
    await page.click(`[data-add-product="${first}"]`);
    console.log('     sacola:', await page.textContent('#cart-item-count'), await page.textContent('#cart-total-price'));
  });
  await step('04-sacola', async () => {
    await page.goto(BASE + '10_checkout_whatsapp_flow.html', { waitUntil: 'networkidle' });
    console.log('     total:', await page.textContent('#checkout-total-price'), '| entrega:', await page.textContent('#summary-fee'));
    await page.fill('#coupon-code', 'PIZZA15');
    await page.click('#coupon-apply');
    await page.waitForTimeout(1500);
    console.log('     cupom:', (await page.textContent('#coupon-status')).trim(), '| total:', await page.textContent('#checkout-total-price'));
    await page.fill('#client-name', 'Teste Automatizado');
    await page.fill('#client-phone', '47999706651');
    await page.fill('#client-address', 'Av. das Tipuanas, 100 (teste)');
    await page.fill('#client-notes', 'PEDIDO DE TESTE - pode cancelar');
    await page.click('#submit-btn');
    await page.waitForSelector('#confirmation-view:not(.hidden)', { timeout: 15000 });
    const html = await page.innerHTML('#confirmation-cards');
    orderId = (html.match(/11_order_tracking_realtime\.html\?id=([0-9a-f-]{36})/) || [])[1];
    pin = (html.match(/(\d{4})<\/strong>/) || [])[1];
    console.log('     pedido:', orderId, '| PIN:', pin, '| wa.me:', /wa\.me\/55\d+/.test(html));
  });
  await step('05-acompanhamento', async () => {
    await page.goto(BASE + '11_order_tracking_realtime.html?id=' + orderId, { waitUntil: 'networkidle' });
    await page.waitForSelector('#order-details:not(.hidden)', { timeout: 15000 });
    console.log('     PIN na tela:', await page.textContent('#delivery-pin'));
  });
  await step('06-meus-pedidos-pin', async () => {
    await page.goto(BASE + 'pedidos.html', { waitUntil: 'networkidle' });
    await page.fill('#phone-input', '47999706651');
    await page.fill('#pin-input', pin || '0000');
    await page.click('#search-btn');
    await page.waitForSelector('#orders-list a', { timeout: 15000 });
    console.log('     pedidos encontrados:', await page.$$eval('#orders-list a', e => e.length));
  });
  await step('07-cancelar', async () => {
    await page.goto(BASE + '11_order_tracking_realtime.html?id=' + orderId, { waitUntil: 'networkidle' });
    await page.waitForSelector('#cancel-order-btn', { timeout: 15000 });
    await page.click('#cancel-order-btn');
    await page.waitForTimeout(3000);
    console.log('     status:', (await page.textContent('body')).includes('Cancelado') ? 'cancelado' : 'NÃO cancelou');
  });
  for (const [name, path, sel] of [
    ['08-mural', '20_mural_vizinhanca.html', 'body'], ['09-orcamento', 'loja.html?slug=boa-lavagem-e-estetica-automotiva-sob-demanda-5666', 'a[href*="18_solicitar"]'],
    ['10-privacidade', 'privacidade.html', '#privacy-contact'], ['11-lojista-login', '04_merchant_portal.html', 'input[type=email]'],
    ['12-entregador', 'entregador.html', 'input[type=email]'], ['13-admin', '14_admin_analytics_dashboard.html', 'input[type=email]'],
    ['14-404', 'nao-existe-xyz', 'body']]) {
    await step(name, async () => { await page.goto(BASE + path, { waitUntil: 'networkidle' }); await page.waitForSelector(sel, { timeout: 15000 }); });
  }
  // Aviso esperado atrás de proxy: o service worker não passa pelo route do Playwright
  const problems = log.filter(l => !/unknown error occurred when fetching the script|14-404\]/.test(l) && !/dialog: Cancelar/.test(l));
  console.log('\n--- PROBLEMAS ---\n' + (problems.join('\n') || 'nenhum'));
  await b.close();
  process.exit(problems.length || failures ? 1 : 0);
})();
