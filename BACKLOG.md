# Backlog — Tipuanas.online

Lista de trabalho da **rotina automática** (e de quem mais for mexer no projeto).
Cada execução pega **o primeiro item `[ ]` de cima para baixo**, entrega e marca como `[x]`
com a data e o número do PR. Itens grandes podem ser quebrados em sub-itens.

Contexto: `README.md` (telas, banco, login) e `Claude outputs/roadmap-av-tipuanas-local.md`
(visão do produto). Objetivo: deixar o piloto **funcional para lojistas, entregadores e clientes reais**.

## Regras da rotina

1. **Uma entrega por execução**, pequena o bastante para revisar: um item (ou sub-item) do backlog.
2. Trabalhar na branch `claude/finish-project-898xnu` recriada a partir da `main` atualizada
   (é a única branch em que a sessão da rotina pode publicar), abrir PR em português com o que mudou
   e como foi testado.
3. **Testar antes de publicar**: rodar `npm test` (a partir do item 1) e, para o banco, simular os
   papéis (anon / lojista / entregador / admin) em transação com `rollback`, como já feito nas migrações.
4. **Banco (Supabase `avenidadastipuanas.online`)**: só migrações **aditivas** (tabela, coluna, função,
   política que não afrouxa acesso). Salvar o SQL em `supabase/migrations/`. Nunca apagar dados,
   desligar RLS, remover/afrouxar políticas existentes nem alterar `auth`. Se o item exigir algo
   destrutivo, abrir o PR **sem** aplicar nem mergear e explicar o motivo.
5. **Merge**: pode mergear o próprio PR quando os testes passam, o preview da Vercel fica "Ready" e a
   regra 4 foi respeitada. Caso contrário, deixar o PR aberto explicando o bloqueio.
6. Se houver um PR da rotina ainda aberto (head `claude/finish-project-898xnu`), **primeiro terminar/corrigir esse PR** antes de começar outro.
7. Manter o padrão do código: HTML + Tailwind CDN + `config.js`/`auth.js`, textos em português,
   sempre `escapeHtml` ao montar HTML com dados do banco, cliente sem login usando funções (RPC).
8. Atualizar o `README.md` quando mudar telas, tabelas ou fluxo.

## Itens (prioridade de cima para baixo)

- [x] **1. Testes automatizados + CI.** _(26/09/2026, PR #4)_ Trazer para `tests/` uma suíte Playwright com Supabase e login
  simulados (vitrine, checkout via `place_order`, acompanhamento, meus pedidos, painel do lojista com
  login, cardápio, entregador, admin, orçamento). `package.json` com `npm test`, e GitHub Action
  rodando nos PRs. Usar o Chromium já instalado quando existir (`/opt/pw-browsers`).
- [x] **2. Lojista edita os dados da loja.** _(26/09/2026, PR #5)_ Tela/aba no painel para alterar nome, categoria, descrição,
  WhatsApp, endereço, taxa de entrega e tipo (catálogo/orçamento). Hoje só dá para pausar.
- [x] **3. Admin gerencia lojas e entregadores.** _(26/09/2026, PR #6)_ No painel admin: editar qualquer loja (inclusive
  WhatsApp — a "Lanchonete Av. das Tipuanas" está sem número), ver/definir dono, listar entregadores
  e ativar/desativar, lista de pedidos recentes com filtro por status e botão de cancelar.
- [x] **4. Cliente cancela pedido ainda "novo".** _(26/09/2026, PR #7)_ Função `cancel_order_public(id)` que só cancela se o
  status for `novo`; botão na página de acompanhamento.
- [x] **5. Página própria de cada loja** _(26/09/2026, PR #8)_ (`loja.html?slug=`): cabeçalho, avaliações, cardápio e link
  compartilhável; vitrine e QR do balcão (`13_printable_table_qr.html`) apontando para ela.
- [x] **6. Horário de funcionamento.** _(26/09/2026, PR #9)_ Colunas de horário por dia da semana; vitrine mostra
  "Fechado — abre às X" e `place_order` recusa fora do horário; lojista configura no painel.
- [x] **7. Fotos de produtos.** _(26/09/2026, PR #10)_ Upload no cardápio para Supabase Storage (bucket público de leitura,
  escrita só do dono da loja), exibindo em `products.image_url`.
- [ ] **8. PWA de verdade.** Ícones próprios no repositório (hoje o manifest aponta para flaticon),
  service worker simples para cache da vitrine, `manifest` e `theme-color` em todas as telas.
- [ ] **9. Cupons de desconto.** Usar a tabela `coupons` já existente: lojista cria cupom; checkout
  aplica via `place_order` (validação no banco).
- [ ] **10. Mural: moderação e validade.** Posts expiram em 30 dias; autor remove o próprio post com
  um código gerado na publicação; admin remove qualquer post.
- [ ] **11. Acabamento de publicação.** `vercel.json` com URLs limpas e cabeçalhos de segurança,
  página 404, títulos/descrições para SEO e pré-visualização no WhatsApp (Open Graph).
- [ ] **12. Revisão geral.** Rodar revisão de segurança e de código no projeto inteiro, corrigir o
  que for encontrado e propor os próximos itens deste backlog.
