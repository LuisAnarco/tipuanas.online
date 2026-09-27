-- Revisão geral (item 12 do backlog)
--
-- 1) "Meus pedidos" por WhatsApp: antes bastava o número para listar os pedidos
--    de alguém (e, pelo id, ver endereço e PIN no acompanhamento). Agora a busca
--    exige também o PIN de um dos pedidos daquele número, com limite de 10
--    tentativas erradas por número a cada hora.
-- 2) Mural: remove a política que deixava inserir direto na tabela (passando por
--    fora do create_community_post, sem chave de remoção).
-- 3) Desempenho: índices nas chaves estrangeiras usadas pelas telas e
--    auth.uid() avaliado uma vez por consulta nas políticas.

-- 1) ---------------------------------------------------------------------------
create table if not exists public.order_lookup_attempts (
    phone text not null,
    created_at timestamptz not null default now()
);
create index if not exists order_lookup_attempts_phone_idx on public.order_lookup_attempts (phone, created_at);
alter table public.order_lookup_attempts enable row level security;
revoke all on public.order_lookup_attempts from anon, authenticated;

drop function if exists public.get_orders_by_phone(text);

create or replace function public.get_orders_by_phone(p_phone text, p_pin text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
    v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
    v_pin text := regexp_replace(coalesce(p_pin, ''), '\D', '', 'g');
begin
    if length(v_phone) < 10 or length(v_pin) <> 4 then
        raise exception 'invalid_lookup';
    end if;

    delete from public.order_lookup_attempts where created_at < now() - interval '1 day';
    if (select count(*) from public.order_lookup_attempts
         where phone = v_phone and created_at > now() - interval '1 hour') >= 10 then
        raise exception 'too_many_attempts';
    end if;

    if not exists (select 1 from public.orders
                    where delivery_address->>'client_phone' = v_phone and delivery_pin = v_pin) then
        insert into public.order_lookup_attempts (phone) values (v_phone);
        return '[]'::jsonb;
    end if;

    return public.order_summaries(array(
        select id from public.orders
         where delivery_address->>'client_phone' = v_phone
         order by created_at desc
         limit 30
    ));
end;
$$;
grant execute on function public.get_orders_by_phone(text, text) to anon, authenticated;

-- 2) ---------------------------------------------------------------------------
drop policy if exists "Mural qualquer um publica" on public.community_posts;

-- 3) ---------------------------------------------------------------------------
create index if not exists orders_store_id_idx on public.orders (store_id, created_at desc);
create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists order_items_product_id_idx on public.order_items (product_id);
create index if not exists products_store_id_idx on public.products (store_id);
create index if not exists stores_owner_id_idx on public.stores (owner_id);
create index if not exists service_requests_store_id_idx on public.service_requests (store_id);
create index if not exists service_updates_request_idx on public.service_updates (service_request_id);
create index if not exists orders_client_phone_idx on public.orders ((delivery_address->>'client_phone'));

-- Mesmas regras, com (select auth.uid()) para avaliar uma vez só por consulta
alter policy "Entregador gerencia o proprio cadastro" on public.couriers
    using ((user_id = (select auth.uid())) or is_admin())
    with check ((user_id = (select auth.uid())) or is_admin());
alter policy "Acesso aos chamados express" on public.express_jobs
    using (((select auth.uid()) = requester_id) or ((select auth.uid()) = courier_id));
alter policy "Gestores acessam insumos da loja" on public.ingredients
    using (exists (select 1 from public.stores where stores.id = ingredients.store_id and stores.owner_id = (select auth.uid())));
alter policy "Clientes vêem próprios pedidos" on public.orders
    using ((select auth.uid()) = customer_id);
alter policy "Usuario ve o proprio perfil" on public.profiles
    using ((id = (select auth.uid())) or is_admin());
alter policy "Gestores acessam receitas da loja" on public.recipes
    using (exists (select 1 from public.products join public.stores on stores.id = products.store_id
                    where products.id = recipes.product_id and stores.owner_id = (select auth.uid())));
alter policy "Lojista cria a propria loja" on public.stores
    with check ((owner_id = (select auth.uid())) or is_admin());
alter policy "Dono ou admin atualiza loja" on public.stores
    using ((owner_id = (select auth.uid())) or is_admin())
    with check ((owner_id = (select auth.uid())) or is_admin());
