-- ============================================================================
-- Login por link no e-mail — ETAPA 2 (bloqueio do acesso público)
--
-- ⚠️  APLICAR SÓ DEPOIS que o front-end com login estiver publicado.
--     Antes disso, o site antigo (que grava direto nas tabelas) para de funcionar.
--
-- Remove as políticas "qualquer um pode tudo" e deixa:
--   - leitura pública só do que a vitrine precisa (lojas, produtos, avaliações, mural)
--   - escrita anônima só via funções (place_order, create_service_request, ...)
--     e nas tabelas reviews / community_posts (com checagens)
--   - o resto só para dono da loja, entregador ou admin (políticas da etapa 1)
-- ============================================================================

-- Lojas: leitura pública continua ("Permitir leitura pública de lojas")
drop policy if exists "Acesso publico lojas" on public.stores;
drop policy if exists "Lojas ativas visíveis" on public.stores;

-- Produtos: leitura pública continua ("Permitir leitura pública de produtos")
drop policy if exists "Acesso publico produtos" on public.products;
drop policy if exists "Produtos visíveis se ativos" on public.products;

-- Pedidos e itens: cliente usa place_order / get_order_public / get_orders_*
drop policy if exists "Acesso publico pedidos" on public.orders;
drop policy if exists "Acesso publico itens pedidos" on public.order_items;
drop policy if exists "Clientes anônimos e autenticados criam itens do pedido" on public.order_items;
drop policy if exists "Leitura de itens do pedido" on public.order_items;

-- Orçamentos: cliente usa create_service_request / get_service_request_public / respond_*
drop policy if exists "Acesso publico service_requests" on public.service_requests;
drop policy if exists "Acesso publico service_updates" on public.service_updates;

-- Entregadores: só o próprio (etapa 1)
drop policy if exists "Acesso publico couriers" on public.couriers;

-- Mural: qualquer um lê posts ativos e publica; editar/apagar só o admin
drop policy if exists "Acesso publico community_posts" on public.community_posts;
create policy "Mural leitura publica" on public.community_posts
    for select using (is_active);
create policy "Mural qualquer um publica" on public.community_posts
    for insert with check (
        is_active
        and char_length(title) between 1 and 120
        and char_length(coalesce(description, '')) <= 1000
        and author_whatsapp ~ '^[0-9]{10,13}$'
    );

-- Tabelas ainda não usadas pelo app: fecha o acesso público
drop policy if exists "Acesso publico cupons" on public.coupons;
create policy "Dono ou admin gerencia cupons" on public.coupons
    for all to authenticated using (public.owns_store(store_id) or public.is_admin())
    with check (public.owns_store(store_id) or public.is_admin());
drop policy if exists "Acesso publico express" on public.express_jobs;
