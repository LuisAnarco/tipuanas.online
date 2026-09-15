# Roadmap de Desenvolvimento — Av. das Tipuanas Local

Não é um cronograma com datas fixas — é organizado por **fase e resultado**, porque cada fase só faz sentido começar quando a anterior resolve o que ela precisava resolver. A lógica de priorização é: **o que impede colocar lojistas e entregadores reais pra rodar primeiro**, não o que é mais bonito de construir primeiro.

O critério usado pra decidir "o que é mínimo" não foi copiar o iFood — foi perguntar: *qualquer plataforma de delivery de três lados (cliente / lojista / entregador), seja qual for o modelo de comissão, precisa resolver isso pra funcionar?* Se a resposta é sim, entrou como mínimo. Assinatura, ads, fintech — tudo isso é modelo de monetização do iFood, não função estrutural, e foi deixado de fora de propósito.

---

## Onde a plataforma está agora

O que já existe e funciona, depois da consolidação da sessão anterior:

- Vitrine do cliente lendo lojas/produtos reais do Supabase, com carrinho multi-loja
- Checkout que separa por loja, cria um pedido por loja no banco, e manda o pedido pro WhatsApp de cada lojista
- Link de acompanhamento de pedido em tempo real pro cliente
- Painel do lojista com pedidos em tempo real e mudança de status
- Painel do entregador com fila de retirada e confirmação por PIN
- Painel admin com GMV total e comissão por loja
- Roteiro de abordagem presencial e display de QR Code pra recrutar lojista

Isso cobre o **fluxo de um pedido do início ao fim**, com um lojista já cadastrado manualmente no banco. É bastante coisa. O que falta não é "mais uma tela bonita" — são as peças que faltam pra você **não precisar ser o gargalo manual** de cada loja nova, cada produto novo, cada entregador novo.

---

## Fase 1 — Autonomia do lojista (bloqueador mais urgente)

**Por que primeiro:** hoje, pra colocar uma loja nova no ar, alguém (você) precisa entrar direto no Supabase e cadastrar loja e produtos na mão. Isso não escala nem pra 5 lojas na avenida, e é o oposto de "cadastrar em 3 minutos no balcão" que o seu próprio roteiro de abordagem promete ao lojista.

- **Cadastro de loja (self-service ou assistido):** formulário pra criar a própria loja — nome, categoria, endereço, WhatsApp, taxa de entrega. Hoje esse registro só existe como conceito no schema, não como tela.
- **Gestão de cardápio/produtos:** o lojista precisa poder adicionar, editar, pausar e remover produtos sozinho. É a peça que mais falta — sem ela, cada picolé novo do cardápio depende de você.
- **Ligar o botão "Pausar loja":** ele já existe visualmente no painel do lojista (`04_merchant_portal.html`), mas não está conectado a nada — hoje clicar nele não faz a loja parar de aparecer na vitrine.
- **Relatório de repasse do próprio lojista:** hoje só o painel admin (que é seu, não do lojista) mostra faturamento e comissão por loja. O lojista devia ver o próprio número — é exatamente a transparência que falta no iFood e que pode ser seu diferencial de confiança.

**Resultado da fase:** você consegue recrutar uma loja nova e ela se cadastra e mantém o próprio cardápio sem depender de você pra cada mudança.

---

## Fase 2 — Completar a experiência do cliente

**Por que em segundo:** com mais de 3 lojas cadastradas, a vitrine atual (lista plana, sem busca nem categoria) já não vai funcionar bem.

- **Página própria por loja** (hoje tudo fica achatado na home — precisa de uma tela "essa loja, esse cardápio")
- **Busca e filtro por categoria** (padaria, hortifruti, restaurante etc.)
- **Avaliação pós-entrega** — cliente avalia loja (e talvez entregador) depois do pedido concluído. Isso ainda não existe em nenhuma tela, e é o dado que sustenta qualidade a longo prazo.
- **Alguma forma de "meus pedidos" que sobrevive à sessão** — hoje, se o cliente perde o link de acompanhamento, ele não tem como recuperar. Não precisa de login completo; pode ser algo simples como buscar por telefone/nome.

**Resultado da fase:** a vitrine se sustenta com 10+ lojas e o cliente tem uma experiência completa, incluindo dar feedback.

---

## Fase 3 — Completar o entregador

**Por que em terceiro:** o fluxo de entrega já funciona pra um piloto pequeno e informal. Isso vira urgente quando você tiver entregadores fixos, não antes.

- **Cadastro do entregador** — hoje o painel é anônimo, qualquer pessoa que abrir a URL vê e aceita corridas. Precisa de identidade mínima (nome, telefone, veículo).
- **Estimativa de ganho antes de aceitar** — mostrar a taxa de entrega daquele pedido específico na tela de aceite (hoje o `entregador.html` nem exibe o valor da taxa de entrega, só o endereço).
- **Histórico de entregas e ganhos do entregador** — pra ele acompanhar o que já recebeu.
- **Cuidado deliberado com o modelo de vínculo:** ao desenhar disponibilidade/agenda do entregador, evite qualquer coisa parecida com "horário fixo obrigatório + penalidade por indisponibilidade" — é exatamente o ponto que está sendo questionado na Justiça no modelo atual do iFood. Manter aceite livre, sem exigência de disponibilidade mínima, protege você desse risco.

**Resultado da fase:** dá pra ter mais de um entregador ativo, cada um com sua identidade, ganho e histórico.

---

## Fase 4 — Maturidade operacional (visão admin)

**Por que em quarto:** essas são melhorias de gestão que importam quando o volume de pedidos/lojas cresce, não pra rodar o piloto.

- **Painel de ativação de loja** — hoje ativar/desativar uma loja (`is_active`) só é possível direto no banco. Precisa de uma tela admin pra isso.
- **Corrigir o cálculo de comissão no admin** — o painel admin hoje aplica 5% fixo pra todas as lojas, mas o schema já tem um campo `custom_commission_percent` por loja que não está sendo usado. Se algum dia você negociar taxas diferentes por lojista, o painel vai mostrar número errado até isso ser corrigido.
- **Fluxo mínimo de disputa/cancelamento** — hoje não existe um jeito de cancelar ou marcar um pedido como problema; o status só avança.
- **Métricas alem de GMV** — produtos mais vendidos, lojas mais ativas, taxa de repetição de cliente.

**Resultado da fase:** você consegue operar a rede sem depender de acesso direto ao banco de dados pra tarefas do dia a dia.

---

## Fase 5 — Só depois de validado (não é pra agora)

Coisas que o iFood tem e que fazem sentido **apenas depois que o modelo básico provar que funciona na avenida**:

- Notificação push real pro lojista (o módulo `06_push_notification_service.js` já existe no código, mas nunca foi ligado a nada — é barato religar quando fizer sentido)
- Algum tipo de fidelidade/assinatura pro cliente recorrente
- Expandir pra mais de uma avenida/bairro (aí sim entra a pergunta de arquitetura: uma instância por bairro, ou uma plataforma multi-bairro)

---

## Recomendação de por onde começar

Já que você decidiu manter o WhatsApp e já tem o fluxo de pedido funcionando ponta a ponta, o gargalo real agora é a **Fase 1** — especificamente **gestão de cardápio pelo lojista**. Sem isso, toda vez que você fechar uma loja nova no roteiro de abordagem, o trabalho de digitar produto por produto cai em você, e isso não escala nem pros próximos 3 lojistas que você for recrutar.

Posso começar já pela tela de gestão de cardápio (adicionar/editar/pausar produto) e o botão de pausar loja, que são as duas peças mais baratas de resolver primeiro dentro da Fase 1. Quer que eu comece por aí?
