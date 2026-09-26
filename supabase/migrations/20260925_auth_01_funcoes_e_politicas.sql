-- ============================================================================
-- Login por link no e-mail (Supabase Auth) — ETAPA 1 (aditiva)
--
-- Cria funções, colunas e políticas novas SEM remover o acesso público antigo,
-- então o site que está no ar continua funcionando. O bloqueio do acesso
-- público fica na etapa 2 (20260925_auth_02_bloqueio_acesso_publico.sql), que
-- só deve ser aplicada depois que o front-end novo estiver publicado.
--
-- Papéis:
--   cliente    -> sem login; usa só as funções place_order/get_order_public/...
--   lojista    -> login; dono da loja (stores.owner_id = auth.uid())
--   entregador -> login; couriers.user_id = auth.uid()
--   admin      -> login; profiles.role = 'admin' (definido por admin_emails)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Admin: e-mails que viram admin automaticamente no primeiro login.
-- (Preencher com: insert into public.admin_emails values ('seu@email');)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_emails (
    email text primary key
);
alter table public.admin_emails enable row level security; -- sem políticas: só funções internas leem

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, name, phone, role)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'Usuário'),
        new.phone,
        case when exists (select 1 from public.admin_emails a where lower(a.email) = lower(new.email))
             then 'admin'::user_role else 'cliente'::user_role end
    )
    on conflict (id) do nothing;
    return new;
end;
$$;
-- Função de gatilho: ninguém precisa chamá-la pela API
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Funções auxiliares usadas nas políticas (security definer evita recursão de RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.owns_store(p_store_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.stores where id = p_store_id and owner_id = auth.uid());
$$;

alter table public.couriers add column if not exists user_id uuid unique references auth.users(id) on delete cascade;

create or replace function public.my_courier_id()
returns uuid language sql stable security definer set search_path = public as $$
    select id from public.couriers where user_id = auth.uid() and is_active limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Lojas: só admin muda dono (owner_id) ou ativação (is_active)
-- ---------------------------------------------------------------------------
create or replace function public.stores_guard()
returns trigger language plpgsql set search_path = public as $$
begin
    -- Funções internas (security definer) e o painel do Supabase passam direto
    if current_user not in ('anon', 'authenticated') or public.is_admin() then
        return new;
    end if;
    if new.owner_id is distinct from old.owner_id or new.is_active is distinct from old.is_active then
        raise exception 'Somente o admin pode alterar o dono ou a ativação da loja';
    end if;
    return new;
end;
$$;
drop trigger if exists stores_guard on public.stores;
create trigger stores_guard before update on public.stores
    for each row execute function public.stores_guard();

-- Lojista reivindica uma loja que ainda não tem dono (lojas cadastradas antes do login)
create or replace function public.claim_store(p_store_id uuid)
returns public.stores language plpgsql security definer set search_path = public as $$
declare
    r public.stores;
begin
    if auth.uid() is null then
        raise exception 'login_required';
    end if;
    update public.stores set owner_id = auth.uid()
     where id = p_store_id and owner_id is null
    returning * into r;
    if not found then
        raise exception 'store_already_owned';
    end if;
    update public.profiles set role = 'gestor' where id = auth.uid() and role = 'cliente';
    return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pedido do cliente (sem login): preço, taxa e PIN calculados no banco
-- ---------------------------------------------------------------------------
create or replace function public.place_order(
    p_store_id uuid,
    p_items jsonb,        -- [{ "product_id": uuid, "quantity": int }]
    p_customer jsonb,     -- { name, phone, address, payment_method, notes }
    p_is_takeout boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    s public.stores;
    p public.products;
    it jsonb;
    q int;
    v_items jsonb := '[]'::jsonb;
    v_subtotal numeric := 0;
    v_fee numeric;
    v_pin text;
    v_order uuid;
    v_name text := left(trim(coalesce(p_customer->>'name', '')), 80);
    v_phone text := regexp_replace(coalesce(p_customer->>'phone', ''), '\D', '', 'g');
    v_address text := left(trim(coalesce(p_customer->>'address', '')), 200);
begin
    p_is_takeout := coalesce(p_is_takeout, false);

    select * into s from public.stores
     where id = p_store_id and is_active and not is_paused and listing_type = 'catalogo';
    if not found then
        raise exception 'store_unavailable';
    end if;

    if v_name = '' or length(v_phone) not between 10 and 13 or (not p_is_takeout and v_address = '') then
        raise exception 'invalid_customer';
    end if;

    if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
        raise exception 'invalid_items';
    end if;

    for it in select * from jsonb_array_elements(p_items) loop
        q := (it->>'quantity')::int;
        if q is null or q < 1 or q > 99 then
            raise exception 'invalid_items';
        end if;
        select * into p from public.products
         where id = (it->>'product_id')::uuid and store_id = p_store_id and not coalesce(is_paused, false);
        if found then
            v_subtotal := v_subtotal + p.price * q;
            v_items := v_items || jsonb_build_object('product_id', p.id, 'name', p.name, 'quantity', q, 'unit_price', p.price);
        end if;
    end loop;

    if jsonb_array_length(v_items) = 0 then
        raise exception 'items_unavailable';
    end if;

    v_fee := case when p_is_takeout then 0 else coalesce(s.delivery_fee, 0) end;
    v_pin := (1000 + floor(random() * 9000))::int::text;

    insert into public.orders (store_id, status, total_amount, delivery_fee, is_takeout, delivery_pin, delivery_address)
    values (
        p_store_id, 'novo', v_subtotal + v_fee, v_fee, p_is_takeout, v_pin,
        jsonb_build_object(
            'client_name', v_name,
            'client_phone', v_phone,
            'address', nullif(v_address, ''),
            'payment_method', left(coalesce(p_customer->>'payment_method', ''), 40),
            'notes', nullif(left(trim(coalesce(p_customer->>'notes', '')), 200), '')
        )
    )
    returning id into v_order;

    insert into public.order_items (order_id, product_id, quantity, unit_price)
    select v_order, (x->>'product_id')::uuid, (x->>'quantity')::int, (x->>'unit_price')::numeric
      from jsonb_array_elements(v_items) x;

    return jsonb_build_object(
        'id', v_order,
        'pin', v_pin,
        'subtotal', v_subtotal,
        'delivery_fee', v_fee,
        'total', v_subtotal + v_fee,
        'items', v_items,
        'store', jsonb_build_object('name', s.name, 'whatsapp_number', s.whatsapp_number)
    );
end;
$$;

-- Resumo de pedidos para as telas do cliente (sem endereço/PIN)
create or replace function public.order_summaries(p_ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
    select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
            'id', o.id,
            'status', o.status,
            'total_amount', o.total_amount,
            'created_at', o.created_at,
            'is_takeout', o.is_takeout,
            'stores', jsonb_build_object('name', s.name),
            'order_items', coalesce((
                select jsonb_agg(jsonb_build_object('quantity', oi.quantity, 'products', jsonb_build_object('name', pr.name)))
                  from public.order_items oi left join public.products pr on pr.id = oi.product_id
                 where oi.order_id = o.id), '[]'::jsonb)
        ) as x
          from public.orders o
          left join public.stores s on s.id = o.store_id
         where o.id = any(p_ids[1:50])
      ) t;
$$;
revoke execute on function public.order_summaries(uuid[]) from public, anon, authenticated;

create or replace function public.get_orders_public(p_ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
    select public.order_summaries(p_ids);
$$;

create or replace function public.get_orders_by_phone(p_phone text)
returns jsonb language sql stable security definer set search_path = public as $$
    select public.order_summaries(array(
        select id from public.orders
         where length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 10
           and delivery_address->>'client_phone' = regexp_replace(p_phone, '\D', '', 'g')
         order by created_at desc
         limit 30
    ));
$$;

-- Acompanhamento de um pedido pelo link (o id é o "segredo" do cliente)
create or replace function public.get_order_public(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
    select jsonb_build_object(
        'id', o.id,
        'store_id', o.store_id,
        'status', o.status,
        'total_amount', o.total_amount,
        'delivery_fee', o.delivery_fee,
        'is_takeout', o.is_takeout,
        'delivery_pin', o.delivery_pin,
        'created_at', o.created_at,
        'delivery_address', jsonb_build_object('address', o.delivery_address->>'address'),
        'stores', jsonb_build_object('name', s.name, 'whatsapp_number', s.whatsapp_number, 'address_line', s.address_line),
        'order_items', coalesce((
            select jsonb_agg(jsonb_build_object('quantity', oi.quantity, 'unit_price', oi.unit_price, 'products', jsonb_build_object('name', pr.name)))
              from public.order_items oi left join public.products pr on pr.id = oi.product_id
             where oi.order_id = o.id), '[]'::jsonb),
        'has_review', exists (select 1 from public.reviews r where r.order_id = o.id)
    )
      from public.orders o
      left join public.stores s on s.id = o.store_id
     where o.id = p_id;
$$;

-- ---------------------------------------------------------------------------
-- Entregador: aceite exclusivo e conclusão com PIN conferido no banco
-- ---------------------------------------------------------------------------
create or replace function public.accept_ride(p_order_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
    v_courier uuid := public.my_courier_id();
begin
    if v_courier is null then
        raise exception 'not_courier';
    end if;
    update public.orders set status = 'em_rota', courier_ref = v_courier
     where id = p_order_id and status = 'pronto' and courier_ref is null and not coalesce(is_takeout, false);
    return found;
end;
$$;

create or replace function public.finish_ride(p_order_id uuid, p_pin text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
    v_courier uuid := public.my_courier_id();
begin
    if v_courier is null then
        raise exception 'not_courier';
    end if;
    update public.orders set status = 'entregue', courier_ref = v_courier
     where id = p_order_id
       and status = 'em_rota'
       and (courier_ref = v_courier or courier_ref is null)
       and delivery_pin = trim(p_pin);
    return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- Avaliação: a checagem "pedido entregue" roda com privilégio próprio para
-- continuar funcionando quando o cliente anônimo não puder mais ler orders
-- ---------------------------------------------------------------------------
create or replace function public.can_review(p_order_id uuid, p_store_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.orders where id = p_order_id and store_id = p_store_id and status = 'entregue');
$$;

drop policy if exists "Cliente avalia pedido entregue" on public.reviews;
create policy "Cliente avalia pedido entregue" on public.reviews
    for insert with check (public.can_review(order_id, store_id));

-- ---------------------------------------------------------------------------
-- Orçamentos (cliente sem login)
-- ---------------------------------------------------------------------------
create or replace function public.create_service_request(p_store_id uuid, p_name text, p_whatsapp text, p_description text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
    v_id uuid;
    v_phone text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
begin
    if not exists (select 1 from public.stores where id = p_store_id and is_active and not is_paused and listing_type = 'orcamento') then
        raise exception 'store_unavailable';
    end if;
    if trim(coalesce(p_name, '')) = '' or length(v_phone) not between 10 and 13 or trim(coalesce(p_description, '')) = '' then
        raise exception 'invalid_request';
    end if;
    insert into public.service_requests (store_id, client_name, client_whatsapp, necessity_description, status)
    values (p_store_id, left(trim(p_name), 80), v_phone, left(trim(p_description), 1000), 'solicitado')
    returning id into v_id;
    return v_id;
end;
$$;

create or replace function public.get_service_request_public(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
    select jsonb_build_object(
        'request', to_jsonb(sr) - 'platform_commission',
        'updates', coalesce((
            select jsonb_agg(jsonb_build_object('note', su.note, 'created_at', su.created_at) order by su.created_at)
              from public.service_updates su where su.service_request_id = sr.id), '[]'::jsonb)
    )
      from public.service_requests sr
     where sr.id = p_id;
$$;

create or replace function public.respond_service_proposal(p_id uuid, p_accept boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
    update public.service_requests
       set status = case when p_accept then 'aceito'::service_request_status else 'rejeitado'::service_request_status end,
           client_decision_at = now()
     where id = p_id and status = 'proposta_enviada';
    return found;
end;
$$;

-- Pagamento combinado por fora (sem gateway ainda). Comissão fixa de 8% = PLATFORM_COMMISSION_RATE no config.js
create or replace function public.client_confirm_service_payment(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
    update public.service_requests
       set status = 'pago', paid_at = now(), platform_commission = round(proposal_amount * 0.08, 2)
     where id = p_id and status = 'aceito';
    return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- Políticas novas para usuários logados (convivem com as antigas até a etapa 2)
-- ---------------------------------------------------------------------------
create policy "Usuario ve o proprio perfil" on public.profiles
    for select to authenticated using (id = auth.uid() or public.is_admin());

-- Lojas
create policy "Lojista cria a propria loja" on public.stores
    for insert to authenticated with check (owner_id = auth.uid() or public.is_admin());
create policy "Dono ou admin atualiza loja" on public.stores
    for update to authenticated using (owner_id = auth.uid() or public.is_admin())
    with check (owner_id = auth.uid() or public.is_admin());
create policy "Admin remove loja" on public.stores
    for delete to authenticated using (public.is_admin());

-- Produtos
create policy "Dono ou admin gerencia produtos" on public.products
    for all to authenticated using (public.owns_store(store_id) or public.is_admin())
    with check (public.owns_store(store_id) or public.is_admin());

-- Pedidos: dono da loja, admin e entregador (fila livre + as próprias corridas)
create policy "Dono, entregador e admin veem pedidos" on public.orders
    for select to authenticated using (
        public.owns_store(store_id)
        or public.is_admin()
        or (
            public.my_courier_id() is not null
            and not coalesce(is_takeout, false)
            and (
                (status in ('pronto', 'em_rota') and courier_ref is null)
                or courier_ref = public.my_courier_id()
            )
        )
    );
create policy "Dono ou admin atualiza pedidos" on public.orders
    for update to authenticated using (public.owns_store(store_id) or public.is_admin())
    with check (public.owns_store(store_id) or public.is_admin());

-- Itens: visíveis para quem enxerga o pedido (a subconsulta respeita a RLS de orders)
create policy "Itens visiveis para quem ve o pedido" on public.order_items
    for select to authenticated using (exists (select 1 from public.orders o where o.id = order_items.order_id));

-- Entregadores
create policy "Entregador gerencia o proprio cadastro" on public.couriers
    for all to authenticated using (user_id = auth.uid() or public.is_admin())
    with check (user_id = auth.uid() or public.is_admin());

-- Orçamentos
create policy "Dono ou admin ve orcamentos" on public.service_requests
    for select to authenticated using (public.owns_store(store_id) or public.is_admin());
create policy "Dono ou admin atualiza orcamentos" on public.service_requests
    for update to authenticated using (public.owns_store(store_id) or public.is_admin())
    with check (public.owns_store(store_id) or public.is_admin());
create policy "Dono ou admin registra etapas" on public.service_updates
    for all to authenticated using (exists (select 1 from public.service_requests sr where sr.id = service_updates.service_request_id))
    with check (exists (select 1 from public.service_requests sr where sr.id = service_updates.service_request_id));

-- Mural: admin modera
create policy "Admin modera o mural" on public.community_posts
    for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Funções internas de política não precisam ficar expostas para anônimos via /rpc
revoke execute on function public.stores_guard() from public, anon, authenticated;
