# Tipuanas.online — Compre do Vizinho

Vitrine e delivery hiperlocal da Av. das Tipuanas (Palhoça/SC). O cliente pede sem baixar app,
o pedido vai para o WhatsApp da loja e é acompanhado em tempo real. Site estático (HTML + Tailwind
via CDN) em cima do Supabase, publicado na Vercel.

## Telas

| Quem | Arquivo | O que faz |
|---|---|---|
| Cliente | `index.html` + `09_multistore_cart.js` | Vitrine estilo app de delivery: banners de cupons, categorias com ícones, Ofertas do dia, Destaques, Mais bem avaliadas, lista de lojas, busca de lojas e produtos, barra inferior e carrinho multi-loja |
| Cliente | `loja.html?slug=` | Página própria da loja: capa e logo, cupons, abas por seção do cardápio, destaques, preço promocional, produto com opções (tamanho, borda, adicionais com mínimo/máximo e observação, preço conferido no `place_order`), avaliações e compartilhar (link do QR do balcão) |
| Cliente | `privacidade.html` | Privacidade e termos (LGPD): dados guardados, uso, compartilhamento, prazo, direitos, contato e botão para apagar os dados do aparelho |
| Cliente | `10_checkout_whatsapp_flow.html` | Checkout (entrega ou retirada, cupom de desconto, taxa por distância com "Usar minha localização" ou endereço no mapa, aviso de fora da área, Pix copia-e-cola com QR e valor exato, troco no dinheiro), cria um pedido por loja e abre o WhatsApp de cada uma |
| Cliente | `11_order_tracking_realtime.html?id=` | Acompanhamento com PIN de entrega, cancelamento enquanto o pedido é "novo" e avaliação da loja após a entrega |
| Cliente | `pedidos.html` | Meus pedidos: histórico do aparelho + busca pelo WhatsApp |
| Cliente | `18_solicitar_orcamento.html` / `19_acompanhar_orcamento.html` | Pedido e acompanhamento de orçamento (lojas de serviço) |
| Cliente | `20_mural_vizinhanca.html` | Mural de desapego / "procuro por": anúncios valem 30 dias; o autor remove o próprio anúncio pelo aparelho em que publicou |
| Lojista | `04_merchant_portal.html` + `05_merchant_order_management.js` | Cadastro da loja (nasce aguardando aprovação do admin) com guia de primeiros passos, edição dos dados da loja, pedidos em tempo real, alerta sonoro e notificação push no celular (mesmo com o painel fechado), botão "Avisar cliente" (WhatsApp com mensagem do status e link de acompanhamento), pausa, disponibilidade rápida (produto esgotado com um toque), extrato do mês (entregues, taxas, descontos, comissão, líquido, mais vendidos, CSV), avaliações, cupons |
| Lojista | `15_gerenciar_cardapio.html` + `16_menu_management.js` | Cardápio: adicionar, editar, pausar, remover produtos, com foto (reduzida no navegador e enviada ao Storage), seção, promoção, destaque e opções do produto (grupos com mínimo/máximo e preço, modelos prontos e copiar de outro produto) |
| Lojista | `17_gerenciar_orcamentos.html` + `.js` | Painel das lojas tipo orçamento (visita → proposta → pagamento → execução) |
| Lojista | `13_printable_table_qr.html?slug=` | Display com QR Code para o balcão, apontando para a página da loja |
| Entregador | `entregador.html` | Cadastro, corridas disponíveis com ganho (atualiza sozinha, sem dados do cliente até aceitar), aceite exclusivo, mapa e WhatsApp do cliente/loja, devolver corrida, PIN digitado na tela e conferido no banco, histórico e ganhos. Loja e cliente veem quem está levando |
| Admin | `14_admin_analytics_dashboard.html` + `admin-manage.js` | GMV, comissão, recorrência, ranking de produtos; aprovar/recusar lojas novas; regra de entrega da plataforma (taxa base, km incluídos, R$/km, raio); editar lojas e definir dono por e-mail; ativar/desativar lojas e entregadores; pedidos do período com cancelamento; moderação do mural |

Arquivos de apoio: `config.js` (inclui `icon()`/`data-icon`: ícones SVG da marca no lugar de emoji) (cliente Supabase e utilitários compartilhados — todas as páginas
carregam ele), `store-settings.js` (formulário "Dados da loja", usado pelo lojista e pelo admin), `06_push_notification_service.js` (alertas do lojista), `07_client_pwa_manifest.json`,
`theme.js` (identidade canopy+bloom: paletas, fontes e regras de legibilidade, carregado logo após o Tailwind em todas as páginas; classe `hit44` para alvo de toque de 44px), `vercel.json` (cabeçalhos de segurança e cache), `404.html`, `sw.js` (service worker do PWA: rede primeiro, cópia offline dos arquivos do site; nunca guarda dados do Supabase), `icons/` (ícones do app), `12_merchant_pitch_script.md` e `Claude outputs/` (roadmap e estudos).

## Rodando localmente

Não há build. Sirva a pasta com qualquer servidor estático:

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

## Testes

```bash
npm install
npm test          # todos os testes
npm test -- lojista   # só os que têm "lojista" no nome
```

Teste no **site publicado** (Supabase real): `npm run e2e:producao` faz o caminho do cliente
(vitrine → loja → sacola com cupom → pedido → PIN → acompanhamento → Meus pedidos) numa loja de
demonstração, **cancela o pedido no fim** e abre as outras telas públicas. `E2E_URL=<preview>` testa
um preview da Vercel. Prints em `e2e-prints/`.

`tests/smoke.test.js` abre as páginas reais num Chromium (Playwright) com o Supabase, o login e as
CDNs simulados em `tests/harness.js` — não precisa de rede nem de banco. Roda também no GitHub
Actions em cada PR (`.github/workflows/tests.yml`). Ao criar uma tela ou fluxo, acrescente um teste.

## Banco (Supabase)

Projeto `avenidadastipuanas.online`. Tabelas usadas: `stores`, `products`, `orders`, `order_items`,
`service_requests`, `service_updates`, `community_posts`, `reviews`, `couriers`
(`orders.courier_ref` aponta para o entregador). Migrações novas ficam em `supabase/migrations/`. Status do pedido (`order_status`):
`novo → em_preparacao → pronto → em_rota → entregue` (ou `cancelado`). Dados do cliente ficam em
`orders.delivery_address` (jsonb): `client_name`, `client_phone`, `address`, `payment_method`, `notes`.

Horário: `stores.opening_hours` = `{"0":"HH:MM-HH:MM", ...}` (0 = domingo, fuso de Brasília; nulo = sempre aberta).
A mesma regra existe no banco (`store_is_open`) e no navegador (`storeOpenStatus` em `config.js`).

Comissão: 8% fixo sobre pedidos **entregues** (`PLATFORM_COMMISSION_RATE` em `config.js`).

## Login e segurança

Login por **link no e-mail** (Supabase Auth, sem senha) para lojista, entregador e admin — código em
`auth.js`. O cliente que compra continua sem login.

| Quem | Como é identificado | O que pode |
|---|---|---|
| Cliente | sem login | faz pedido, acompanha e avalia só pelo link do pedido (funções `place_order`, `get_order_public`, `get_orders_*`, `create_service_request`, ...) |
| Lojista | `stores.owner_id = auth.uid()` | só a própria loja, produtos, pedidos e orçamentos |
| Entregador | `couriers.user_id = auth.uid()` | lê só as próprias corridas; as livres vêm de `list_available_rides` (sem nome/telefone); `accept_ride`, `release_ride`, `finish_ride` (só quem aceitou) |
| Admin | `profiles.role = 'admin'` (e-mails em `admin_emails` viram admin no 1º login) | tudo |

Lojas cadastradas antes do login não têm dono: o primeiro lojista que abrir o painel dela logado
pode vincular (`claim_store`). Só o admin muda dono ou ativação de loja.

Migrações em `supabase/migrations/`:
- `20260925_auth_01_funcoes_e_politicas.sql` — **aplicada**. Só adiciona (funções e políticas novas).
- `20260925_auth_01b_restringe_funcoes.sql` — **aplicada**.
- `20260925_auth_02_bloqueio_acesso_publico.sql` — **aplicada em 26/09/2026**, depois da publicação
  do front-end com login. Remove o acesso público de escrita/leitura.
- `20260926_protege_trechos_codigo.sql` — **aplicada**.
- `20260926_cancelamento_pelo_cliente.sql` — **aplicada**. Função `cancel_order_public` (só cancela pedido `novo`).
- `20260926_admin_donos_de_loja.sql` — **aplicada**. Funções `admin_store_owners` / `admin_set_store_owner` (só admin).
- `20260926_fotos_de_produtos.sql` — **aplicada**. Bucket público `product-images` (até 2 MB, JPG/PNG/WEBP); só o dono da loja (ou admin) grava em `<store_id>/...`.
- `20260926_cupons.sql` — **aplicada**. `orders.coupon_code`/`discount_amount`, `check_coupon` e `place_order(..., p_coupon)` aplicando o desconto no servidor.
- `20260926_mural_validade_moderacao.sql` — **aplicada**. `community_posts.expires_at` (30 dias), chaves de remoção em `community_post_keys` (sem acesso pela API), `create_community_post` / `remove_community_post`.
- `20260928_limites_antiabuso.sql` — **aplicada**. Gatilhos: no máximo 5 pedidos por WhatsApp a cada 10 min (`too_many_orders`) e 3 anúncios no mural por WhatsApp por dia (`too_many_posts`).
- `20260927_vitrine.sql` — **aplicada**. `products.section/promo_price/is_featured`, `stores.cover_url`, `coupons.is_public`, `list_public_coupons()` e `place_order` cobrando o preço promocional.
- `20260926_revisao_geral.sql` — **aplicada**. `get_orders_by_phone(telefone, PIN)` com limite de 10 erros/hora por número (`order_lookup_attempts`), fim do insert direto no mural, índices e políticas otimizadas.
- `20260926_horario_de_funcionamento.sql` — **aplicada**. Coluna `stores.opening_hours`, função `store_is_open` e `place_order` recusando pedido fora do horário (`store_closed`).

Configuração no painel do Supabase (Authentication):
- **URL Configuration**: *Site URL* = domínio do site e, em *Redirect URLs*, `https://SEU-DOMINIO/**`
  (e `http://localhost:8000/**` para testes locais).
- **Emails / SMTP**: o envio padrão do Supabase tem limite baixo de e-mails por hora; para uso real,
  configure um SMTP próprio (ex.: Resend, Brevo) e traduza o modelo "Magic Link" para português.
