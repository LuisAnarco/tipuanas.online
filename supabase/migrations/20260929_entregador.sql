-- Fluxo do entregador (item 21 do BACKLOG)
-- 1. Privacidade: o entregador só lê pela tabela os pedidos que aceitou. As corridas livres
--    chegam por list_available_rides(), sem nome nem telefone do cliente.
-- 2. Pedido que a própria loja leva ("A caminho" sem entregador) não vira corrida e não
--    pode ser concluído por um entregador qualquer.
-- 3. release_ride(): o entregador desiste e a corrida volta para a fila.
-- 4. Loja e cliente veem quem está levando o pedido.

drop policy if exists "Dono, entregador e admin veem pedidos" on public.orders;
create policy "Dono, entregador e admin veem pedidos" on public.orders
    for select to authenticated
    using (owns_store(store_id) or is_admin() or (courier_ref is not null and courier_ref = my_courier_id()));

-- Corridas livres: só o necessário para decidir se aceita
create or replace function public.list_available_rides()
returns table (
    id uuid, created_at timestamptz, delivery_fee numeric, total_amount numeric,
    payment_method text, delivery_address text,
    store_id uuid, store_name text, store_address text
)
language plpgsql stable security definer set search_path = public
as $$
begin
    if public.my_courier_id() is null then
        raise exception 'not_courier';
    end if;
    return query
        select o.id, o.created_at, o.delivery_fee::numeric, o.total_amount::numeric,
               o.delivery_address->>'payment_method', o.delivery_address->>'address',
               s.id, s.name, s.address_line
          from public.orders o
          join public.stores s on s.id = o.store_id
         where o.status = 'pronto' and o.courier_ref is null and not coalesce(o.is_takeout, false)
         order by o.created_at;
end;
$$;
revoke execute on function public.list_available_rides() from public, anon;
grant execute on function public.list_available_rides() to authenticated;

-- Concluir: só quem aceitou a corrida
create or replace function public.finish_ride(p_order_id uuid, p_pin text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
    v_courier uuid := public.my_courier_id();
begin
    if v_courier is null then
        raise exception 'not_courier';
    end if;
    update public.orders set status = 'entregue'
     where id = p_order_id
       and status = 'em_rota'
       and courier_ref = v_courier
       and delivery_pin = trim(p_pin);
    return found;
end;
$$;

-- Desistir: a corrida volta a ficar disponível
create or replace function public.release_ride(p_order_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
    v_courier uuid := public.my_courier_id();
begin
    if v_courier is null then
        raise exception 'not_courier';
    end if;
    update public.orders set status = 'pronto', courier_ref = null
     where id = p_order_id and status = 'em_rota' and courier_ref = v_courier;
    return found;
end;
$$;
revoke execute on function public.release_ride(uuid) from public, anon;
grant execute on function public.release_ride(uuid) to authenticated;

-- Loja (ou admin): quem está levando cada pedido
create or replace function public.order_couriers(p_order_ids uuid[])
returns table (order_id uuid, name text, phone text, vehicle text)
language sql stable security definer set search_path = public
as $$
    select o.id, c.name, c.phone, c.vehicle
      from public.orders o
      join public.couriers c on c.id = o.courier_ref
     where o.id = any(p_order_ids)
       and (public.owns_store(o.store_id) or public.is_admin());
$$;
revoke execute on function public.order_couriers(uuid[]) from public, anon;
grant execute on function public.order_couriers(uuid[]) to authenticated;

-- Cliente: primeiro nome e veículo do entregador no acompanhamento
create or replace function public.get_order_public(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
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
        'courier', case when c.id is not null then jsonb_build_object('name', split_part(trim(c.name), ' ', 1), 'vehicle', c.vehicle) end,
        'order_items', coalesce((
            select jsonb_agg(jsonb_build_object('quantity', oi.quantity, 'unit_price', oi.unit_price, 'products', jsonb_build_object('name', pr.name)))
              from public.order_items oi left join public.products pr on pr.id = oi.product_id
             where oi.order_id = o.id), '[]'::jsonb),
        'has_review', exists (select 1 from public.reviews r where r.order_id = o.id)
    )
      from public.orders o
      left join public.stores s on s.id = o.store_id
      left join public.couriers c on c.id = o.courier_ref
     where o.id = p_id;
$$;
