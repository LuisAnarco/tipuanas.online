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
4. **Banco (Supabase `avenidadastipuanas.online`)**: os dados são fictícios, então migrações não
   aditivas (renomear, remover coluna/tabela antiga) são permitidas quando ajudam. Sempre salvar o SQL
   em `supabase/migrations/` e testar os papéis em transação com rollback. Continua proibido desligar
   RLS, afrouxar o acesso a dados de outra pessoa (pedidos, telefones, endereços) ou alterar `auth`.
5. **Merge**: mergear o próprio PR quando os testes passam e o preview da Vercel fica "Ready", sem
   esperar o Luis. Se algo quebrar, corrigir no PR seguinte.
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
- [x] **8. PWA de verdade.** _(26/09/2026, PR #11)_ Ícones próprios no repositório (hoje o manifest aponta para flaticon),
  service worker simples para cache da vitrine, `manifest` e `theme-color` em todas as telas.
- [x] **9. Cupons de desconto.** _(26/09/2026, PR #12)_ Usar a tabela `coupons` já existente: lojista cria cupom; checkout
  aplica via `place_order` (validação no banco).
- [x] **10. Mural: moderação e validade.** _(26/09/2026, PR #13)_ Posts expiram em 30 dias; autor remove o próprio post com
  um código gerado na publicação; admin remove qualquer post.
- [x] **11. Acabamento de publicação.** _(26/09/2026, PR #14; URLs limpas ficaram de fora para não quebrar links e QR Codes já impressos)_ `vercel.json` com URLs limpas e cabeçalhos de segurança,
  página 404, títulos/descrições para SEO e pré-visualização no WhatsApp (Open Graph).
- [x] **12. Revisão geral.** _(27/09/2026, PR #15)_ Rodar revisão de segurança e de código no projeto inteiro, corrigir o
  que for encontrado e propor os próximos itens deste backlog. Encontrado e corrigido: a busca de
  "Meus pedidos" só pelo WhatsApp expunha endereço e PIN de quem soubesse o número (agora pede
  também o PIN de um pedido, com limite de 10 erros por hora); política antiga deixava inserir no
  mural por fora da função (removida, só aperta o acesso); índices nas chaves estrangeiras e
  `auth.uid()` avaliado uma vez por consulta. Telas conferidas: dados de usuário sempre escapados.

## Análise de funcionamento (28/09/2026)

Teste de ponta a ponta no site publicado (Supabase real), com `npm run e2e:producao`: vitrine,
busca, loja, sacola com cupom, pedido, PIN, WhatsApp, acompanhamento, Meus pedidos e cancelamento
funcionando, sem erros de console nem de servidor. Logs do Supabase sem erros 4xx/5xx.
Corrigido nesta análise: testes do CI abriam websocket com a produção; pedidos e anúncios sem limite.
O que ainda impede a operação real, em ordem de impacto:

- [x] **19. Robustez do fluxo do cliente.** _(28/09/2026, PR #22)_ Teste E2E em produção
  (`tests/e2e-producao.js`), limites antiabuso (5 pedidos/10 min e 3 anúncios/dia por WhatsApp)
  e testes do CI isolados da produção.
- [x] **20. Lojista não perde pedido com o painel fechado.** _(29/09/2026)_ Web Push: "Ativar alertas"
  inscreve o aparelho (`push_subscriptions`), o pedido novo dispara (gatilho + pg_net) a função
  `notify-new-order`, que envia com as chaves VAPID do cofre; tocar na notificação abre o painel.
  Contador de pendentes no título da aba. No iPhone precisa instalar o site na tela de início.
- [x] **21. Fluxo do entregador de ponta a ponta.** _(29/09/2026)_ Testado no banco (transação com
  rollback) e no CI: corrida livre sem nome/telefone do cliente (`list_available_rides`), aceite,
  devolver corrida (`release_ride`), PIN na tela, só quem aceitou conclui; entrega própria da loja não
  vira corrida. Mapa e WhatsApp, lista que se atualiza sozinha, loja e cliente veem o entregador.
  Próximo passo possível: push para entregadores quando surgir corrida.
- [x] **22. Painel do lojista mais simples no celular.** _(29/09/2026)_ Pedidos logo abaixo dos números
  do dia, ativos no topo (novo primeiro) e finalizados embaixo; botão grande do próximo passo
  (Aceitar/Recusar, Pronto, Saiu com entrega própria, Cliente retirou/Entregue), seletor completo em
  "Mais opções"; opção de abrir o WhatsApp do cliente com o aviso no mesmo toque (lembrada no aparelho).
- [x] **23. Cadastro de loja guiado.** _(29/09/2026)_ Loja criada por lojista nasce pendente e
  desativada (gatilho no banco; o dono não consegue se aprovar), fora da vitrine e sem pedidos.
  Painel mostra "Primeiros passos" (logo, horário, 3 produtos, foto, QR) e o botão de pedir aprovação
  pelo WhatsApp; admin vê as pendentes no topo com Aprovar/Recusar.
- [ ] **24. Fotos de demonstração.** Fotos livres (domínio público) nos produtos fictícios.

## Próximos itens (propostos na revisão geral)

- [x] **12b. Vitrine estilo iFood.** Pedido do Luis ("tipo iFood, com ainda mais funções").
  - [x] Banco: seção do cardápio, preço promocional, destaque, capa da loja, cupom público
    (`list_public_coupons`) e `place_order` cobrando o promocional. _(27/09/2026, PR #16)_
  - [x] Home com banners, categorias com ícones, Ofertas, Destaques, Mais bem avaliadas, cartões de
    loja, busca com produtos e barra inferior. _(27/09/2026, PR #16)_
  - [x] Página da loja com capa, logo, cupons e abas por seção. _(27/09/2026, PR #16)_
  - [x] Painel: seção/promoção/destaque no cardápio, logo/capa/tempo de preparo nos dados da loja,
    cupom "mostrar na vitrine". _(27/09/2026, PR #16)_
  - [x] Dados de demonstração: 9 lojas, 41 produtos com seções/ofertas/destaques e 3 cupons públicos. _(27/09/2026, direto no banco; fotos ficam para o lojista enviar)_
  - [x] Carrinho com quantidade (+/−) direto no cartão do produto e tela de sacola mais bonita. _(27/09/2026, PR #17)_

- [x] **13. Privacidade e termos (LGPD).** _(27/09/2026, PR #18)_ Página curta explicando quais dados guardamos (nome,
  WhatsApp, endereço), para quê e como pedir exclusão; link no rodapé do checkout e do mural.
- [x] **14. Extrato do lojista.** _(27/09/2026, PR #19)_ No painel do lojista, resumo do mês: pedidos entregues, total
  vendido, descontos de cupom, taxas de entrega e comissão da plataforma (8%), com exportação CSV.
- [x] **15. Avisar o cliente pelo WhatsApp.** _(28/09/2026, PR #20)_ No painel do lojista, botão em cada pedido que abre
  o WhatsApp do cliente com mensagem pronta do status (aceito, saiu para entrega, pronto para
  retirar) e link do acompanhamento.
- [x] **16. Produto esgotado com um toque.** _(28/09/2026, PR #21)_ Atalho no painel de pedidos/cardápio para pausar e
  reativar produtos rapidamente, e a vitrine mostrando "esgotado" em vez de esconder.
- [ ] **17. Limpeza de legado.** Levantar tabelas antigas sem uso (`express_jobs`, `ingredients`,
  `recipes`, `trechos_codigo`) e telas órfãs e remover o que não for usado (dados fictícios).
- [ ] **18. Domínio de produção.** _(depende do Luis)_ Apontar o domínio no Vercel, incluir a URL em
  Supabase → Auth → Redirect URLs e trocar o e-mail padrão por SMTP próprio quando houver.
