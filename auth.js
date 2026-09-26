/**
 * ==============================================================================
 * PROJETO: TIPUANAS.ONLINE
 * ARQUIVO: auth.js
 * DESCRIÇÃO: Login por link no e-mail (Supabase Auth) para as telas internas:
 *            lojista, cardápio, orçamentos, entregador e admin.
 *            Carregar depois do config.js. O cliente que compra não precisa de login.
 * ==============================================================================
 */

/**
 * Garante que há alguém logado. Se não houver, mostra a tela de login por
 * e-mail e só resolve quando a pessoa voltar pelo link (nesta ou em outra aba).
 */
async function requireLogin({ title = 'Entrar', subtitle = 'Informe seu e-mail para receber o link de acesso.' } = {}) {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        renderUserBar(session.user);
        return session.user;
    }

    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.id = 'login-overlay';
        overlay.className = 'fixed inset-0 z-50 bg-slate-100 flex items-center justify-center p-4';
        overlay.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-2xl shadow-lg border border-slate-200 p-6 space-y-4">
                <div class="text-center space-y-1">
                    <span class="text-3xl">🌿</span>
                    <h1 class="text-lg font-extrabold text-slate-900">${escapeHtml(title)}</h1>
                    <p class="text-xs text-slate-500">${escapeHtml(subtitle)}</p>
                </div>
                <form id="login-form" class="space-y-3">
                    <input id="login-email" type="email" required autocomplete="email" placeholder="seu@email.com" class="w-full text-sm p-3 rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-500">
                    <button id="login-submit" type="submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm">Enviar link de acesso</button>
                </form>
                <div id="login-sent" class="hidden text-center space-y-2">
                    <p class="text-sm font-bold text-emerald-700">📬 Link enviado!</p>
                    <p class="text-xs text-slate-600">Abra o e-mail enviado para <strong id="login-sent-email"></strong> e toque no link. Pode fechar esta aba depois.</p>
                    <button id="login-retry" type="button" class="text-xs text-slate-500 underline">Usar outro e-mail</button>
                </div>
                <p id="login-error" class="hidden text-xs text-red-600 text-center"></p>
                <p class="text-[10px] text-slate-400 text-center">Sem senha: a cada acesso enviamos um link novo para o seu e-mail.</p>
                <a href="index.html" class="block text-center text-[11px] text-slate-400 underline">Voltar para a vitrine</a>
            </div>
        `;
        document.body.appendChild(overlay);

        const form = overlay.querySelector('#login-form');
        const errorEl = overlay.querySelector('#login-error');
        const btn = overlay.querySelector('#login-submit');

        form.addEventListener('submit', async event => {
            event.preventDefault();
            const email = overlay.querySelector('#login-email').value.trim();
            errorEl.classList.add('hidden');
            btn.disabled = true;
            btn.textContent = 'Enviando...';

            // Volta para esta mesma página (com o ?store= etc.) depois de clicar no link
            const { error } = await sb.auth.signInWithOtp({
                email,
                options: { emailRedirectTo: window.location.href.split('#')[0] }
            });

            btn.disabled = false;
            btn.textContent = 'Enviar link de acesso';

            if (error) {
                console.error('Erro ao enviar link:', error);
                errorEl.textContent = error.status === 429
                    ? 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
                    : 'Não foi possível enviar o link. Confira o e-mail e tente novamente.';
                errorEl.classList.remove('hidden');
                return;
            }

            form.classList.add('hidden');
            overlay.querySelector('#login-sent-email').textContent = email;
            overlay.querySelector('#login-sent').classList.remove('hidden');
        });

        overlay.querySelector('#login-retry').addEventListener('click', () => {
            overlay.querySelector('#login-sent').classList.add('hidden');
            form.classList.remove('hidden');
        });

        // Logou (pelo link nesta aba ou em outra aba do mesmo navegador)
        const { data: { subscription } } = sb.auth.onAuthStateChange((event, newSession) => {
            if (newSession && newSession.user) {
                subscription.unsubscribe();
                overlay.remove();
                renderUserBar(newSession.user);
                resolve(newSession.user);
            }
        });
    });
}

/** Barra fina no topo com o e-mail logado e o botão Sair */
function renderUserBar(user) {
    if (document.getElementById('user-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'user-bar';
    bar.className = 'bg-slate-800 text-slate-200 text-[11px] px-4 py-1.5 flex justify-end items-center gap-3';
    bar.innerHTML = `<span>Conectado como <strong>${escapeHtml(user.email || '')}</strong></span>
        <button id="logout-btn-global" class="underline hover:text-white">Sair</button>`;
    document.body.prepend(bar);
    bar.querySelector('#logout-btn-global').addEventListener('click', signOut);
}

async function signOut() {
    await sb.auth.signOut();
    localStorage.removeItem('tipuanas_store_id');
    window.location.reload();
}

async function isAdminUser() {
    const { data, error } = await sb.rpc('is_admin');
    return !error && data === true;
}

/**
 * Descobre qual loja o lojista logado vai gerenciar:
 *  1. a do ?store= (ou a última usada), se for dele — ou se ele for admin;
 *  2. se essa loja ainda não tem dono (cadastrada antes do login), oferece vincular;
 *  3. senão, a primeira loja da conta.
 * Retorna { store, admin } ou { admin, message } quando não há loja.
 */
async function resolveMerchantStore(user) {
    const STORE_KEY = 'tipuanas_store_id';
    const admin = await isAdminUser();
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get('store') || localStorage.getItem(STORE_KEY);
    let message = null;

    if (wanted) {
        const { data: store } = await sb.from('stores').select('*').eq('id', wanted).maybeSingle();
        if (store) {
            if (store.owner_id === user.id || admin) {
                localStorage.setItem(STORE_KEY, store.id);
                return { store, admin };
            }
            if (!store.owner_id) {
                const ok = confirm(`A loja "${store.name}" ainda não está vinculada a nenhuma conta.\n\nVincular à sua conta (${user.email})? Depois disso, só você acessa o painel dela.`);
                if (ok) {
                    const { data: claimed, error } = await sb.rpc('claim_store', { p_store_id: store.id });
                    if (!error && claimed) {
                        localStorage.setItem(STORE_KEY, claimed.id);
                        return { store: claimed, admin };
                    }
                    console.error('Erro ao vincular loja:', error);
                    message = 'Não foi possível vincular a loja. Talvez outra conta tenha vinculado antes.';
                }
            } else {
                message = `A loja "${store.name}" pertence a outra conta. Entre com o e-mail do dono.`;
            }
        }
        localStorage.removeItem(STORE_KEY);
    }

    const { data: mine } = await sb.from('stores').select('*').eq('owner_id', user.id).order('created_at').limit(1);
    if (mine && mine[0]) {
        localStorage.setItem(STORE_KEY, mine[0].id);
        return { store: mine[0], admin };
    }
    return { admin, message };
}
