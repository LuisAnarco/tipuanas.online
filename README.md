# Tipuanas.online — Compre do Vizinho

Vitrine e delivery hiperlocal da Av. das Tipuanas (Palhoça/SC). O cliente pede sem baixar app,
o pedido vai para o WhatsApp da loja e é acompanhado em tempo real. Site estático (HTML + Tailwind
via CDN) em cima do Supabase, publicado na Vercel.

## Telas

| Quem | Arquivo | O que faz |
|---|---|---|
| Cliente | `index.html` + `09_multistore_cart.js` | Vitrine com busca, filtro por categoria, nota das lojas e carrinho multi-loja |
| Cliente | `10_checkout_whatsapp_flow.html` | Checkout (entrega ou retirada), cria um pedido por loja e abre o WhatsApp de cada uma |
| Cliente | `11_order_tracking_realtime.html?id=` | Acompanhamento em tempo real com PIN de entrega e avaliação da loja após a entrega |
| Cliente | `pedidos.html` | Meus pedidos: histórico do aparelho + busca pelo WhatsApp |
| Cliente | `18_solicitar_orcamento.html` / `19_acompanhar_orcamento.html` | Pedido e acompanhamento de orçamento (lojas de serviço) |
| Cliente | `20_mural_vizinhanca.html` | Mural de desapego / "procuro por" |
| Lojista | `04_merchant_portal.html` + `05_merchant_order_management.js` | Cadastro da loja, pedidos em tempo real, alerta sonoro, pausa, repasse, avaliações |
| Lojista | `15_gerenciar_cardapio.html` + `16_menu_management.js` | Cardápio: adicionar, editar, pausar, remover produtos |
| Lojista | `17_gerenciar_orcamentos.html` + `.js` | Painel das lojas tipo orçamento (visita → proposta → pagamento → execução) |
| Lojista | `13_printable_table_qr.html` | Display com QR Code para o balcão |
| Entregador | `entregador.html` | Cadastro, corridas disponíveis com ganho, aceite exclusivo, PIN conferido no banco, histórico e ganhos |
| Admin | `14_admin_analytics_dashboard.html` | GMV, comissão, recorrência, ranking de produtos, ativar/desativar lojas |

Arquivos de apoio: `config.js` (cliente Supabase e utilitários compartilhados — todas as páginas
carregam ele), `06_push_notification_service.js` (alertas do lojista), `07_client_pwa_manifest.json`,
`02_schema_design.json`, `12_merchant_pitch_script.md` e `Claude outputs/` (roadmap e estudos).

## Rodando localmente

Não há build. Sirva a pasta com qualquer servidor estático:

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

## Banco (Supabase)

Projeto `avenidadastipuanas.online`. Tabelas usadas: `stores`, `products`, `orders`, `order_items`,
`service_requests`, `service_updates`, `community_posts`, `reviews`, `couriers`
(`orders.courier_ref` aponta para o entregador). Migrações novas ficam em `supabase/migrations/`. Status do pedido (`order_status`):
`novo → em_preparacao → pronto → em_rota → entregue` (ou `cancelado`). Dados do cliente ficam em
`orders.delivery_address` (jsonb): `client_name`, `client_phone`, `address`, `payment_method`, `notes`.

Comissão: 8% fixo sobre pedidos **entregues** (`PLATFORM_COMMISSION_RATE` em `config.js`).

## Login e segurança

Login por **link no e-mail** (Supabase Auth, sem senha) para lojista, entregador e admin — código em
`auth.js`. O cliente que compra continua sem login.

| Quem | Como é identificado | O que pode |
|---|---|---|
| Cliente | sem login | faz pedido, acompanha e avalia só pelo link do pedido (funções `place_order`, `get_order_public`, `get_orders_*`, `create_service_request`, ...) |
| Lojista | `stores.owner_id = auth.uid()` | só a própria loja, produtos, pedidos e orçamentos |
| Entregador | `couriers.user_id = auth.uid()` | fila de corridas livres e as próprias; aceite e PIN via `accept_ride` / `finish_ride` |
| Admin | `profiles.role = 'admin'` (e-mails em `admin_emails` viram admin no 1º login) | tudo |

Lojas cadastradas antes do login não têm dono: o primeiro lojista que abrir o painel dela logado
pode vincular (`claim_store`). Só o admin muda dono ou ativação de loja.

Migrações em `supabase/migrations/`:
- `20260925_auth_01_funcoes_e_politicas.sql` — **aplicada**. Só adiciona (funções e políticas novas).
- `20260925_auth_01b_restringe_funcoes.sql` — **aplicada**.
- `20260925_auth_02_bloqueio_acesso_publico.sql` — **aplicada em 26/09/2026**, depois da publicação
  do front-end com login. Remove o acesso público de escrita/leitura.
- `20260926_protege_trechos_codigo.sql` — **aplicada**.

Configuração no painel do Supabase (Authentication):
- **URL Configuration**: *Site URL* = domínio do site e, em *Redirect URLs*, `https://SEU-DOMINIO/**`
  (e `http://localhost:8000/**` para testes locais).
- **Emails / SMTP**: o envio padrão do Supabase tem limite baixo de e-mails por hora; para uso real,
  configure um SMTP próprio (ex.: Resend, Brevo) e traduza o modelo "Magic Link" para português.
