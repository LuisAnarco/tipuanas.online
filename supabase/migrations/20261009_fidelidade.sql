-- Fidelidade por loja (item 32 do BACKLOG)
-- Lojista liga o cartão de selos: a cada N pedidos entregues (stores.loyalty_every, 2 a 20) o cliente
-- (pelo WhatsApp do pedido) ganha um cupom de X% (stores.loyalty_discount, 1 a 50) daquela loja.
-- O cupom é uma linha em coupons com customer_phone (só vale para esse WhatsApp) e single_use.
-- Gatilho em orders (status vira 'entregue') emite o cupom; place_order confere telefone e uso único;
-- check_coupon esconde cupom de uso único já usado; loyalty_status mostra o progresso para quem tem
-- o link de um pedido. O resto do place_order é igual a 20261009_agendar_pedido.sql.

alter table public.stores add column if not exists loyalty_every int;
alter table public.stores add column if not exists loyalty_discount numeric;
alter table public.stores drop constraint if exists stores_loyalty_check;
alter table public.stores add constraint stores_loyalty_check check (
    (loyalty_every is null or loyalty_every between 2 and 20)
    and (loyalty_discount is null or (loyalty_discount >= 1 and loyalty_discount <= 50)));

alter table public.coupons add column if not exists customer_phone text;
alter table public.coupons add column if not exists single_use boolean not null default false;
create index if not exists coupons_store_phone_idx on public.coupons (store_id, customer_phone) where customer_phone is not null;
create index if not exists orders_coupon_code_idx on public.orders (coupon_code) where coupon_code is not null;

-- Emite o cupom quando o pedido completa N entregas daquele WhatsApp na loja
create or replace function public.issue_loyalty_reward()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    s public.stores;
    v_phone text := new.delivery_address->>'client_phone';
    v_delivered int; v_issued int;
begin
    select * into s from public.stores where id = new.store_id;
    if s.loyalty_every is null or s.loyalty_discount is null or coalesce(v_phone, '') = '' then return new; end if;
    select count(*) into v_delivered from public.orders
     where store_id = new.store_id and status = 'entregue' and delivery_address->>'client_phone' = v_phone;
    select count(*) into v_issued from public.coupons where store_id = new.store_id and customer_phone = v_phone;
    if v_delivered - v_issued * s.loyalty_every >= s.loyalty_every then
        insert into public.coupons (store_id, code, discount_type, discount_value, min_order_value, is_active, is_public, customer_phone, single_use)
        values (new.store_id, 'FIEL' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)), 'percentage', s.loyalty_discount, 0, true, false, v_phone, true);
    end if;
    return new;
exception when others then
    -- Fidelidade nunca pode impedir a mudança de status do pedido
    return new;
end;
$$;
revoke execute on function public.issue_loyalty_reward() from public, anon, authenticated;

drop trigger if exists orders_loyalty_reward on public.orders;
create trigger orders_loyalty_reward after update of status on public.orders
    for each row when (new.status = 'entregue' and old.status is distinct from 'entregue')
    execute function public.issue_loyalty_reward();

-- Prévia do cupom: cupom de uso único já usado some
create or replace function public.check_coupon(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
    select jsonb_build_object(
        'code', c.code,
        'store_id', c.store_id,
        'store_name', s.name,
        'discount_type', c.discount_type,
        'discount_value', c.discount_value,
        'min_order_value', coalesce(c.min_order_value, 0)
    )
      from public.coupons c
      join public.stores s on s.id = c.store_id
     where c.code = upper(trim(coalesce(p_code, '')))
       and c.is_active
       and s.is_active
       and not (c.single_use and exists (select 1 from public.orders o where o.coupon_code = c.code and o.status <> 'cancelado'));
$$;

-- Progresso do cartão de selos: precisa do link de um pedido do cliente nessa loja
create or replace function public.loyalty_status(p_order_ids uuid[], p_store_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    s public.stores; v_phone text; v_delivered int; v_issued int;
begin
    select * into s from public.stores where id = p_store_id and is_active;
    if not found or s.loyalty_every is null or s.loyalty_discount is null then
        return jsonb_build_object('enabled', false);
    end if;
    select delivery_address->>'client_phone' into v_phone from public.orders
     where id = any((coalesce(p_order_ids, '{}'::uuid[]))[1:50]) and store_id = p_store_id
     order by created_at desc limit 1;
    if v_phone is null then
        return jsonb_build_object('enabled', true, 'every', s.loyalty_every, 'discount', s.loyalty_discount);
    end if;
    select count(*) into v_delivered from public.orders
     where store_id = p_store_id and status = 'entregue' and delivery_address->>'client_phone' = v_phone;
    select count(*) into v_issued from public.coupons where store_id = p_store_id and customer_phone = v_phone;
    return jsonb_build_object('enabled', true, 'every', s.loyalty_every, 'discount', s.loyalty_discount,
        'stamps', greatest(v_delivered - v_issued * s.loyalty_every, 0),
        'rewards', coalesce((select jsonb_agg(jsonb_build_object('code', c.code, 'discount', c.discount_value) order by c.created_at)
            from public.coupons c
           where c.store_id = p_store_id and c.customer_phone = v_phone and c.is_active
             and not exists (select 1 from public.orders o where o.coupon_code = c.code and o.status <> 'cancelado')), '[]'::jsonb));
end;
$$;
revoke execute on function public.loyalty_status(uuid[], uuid) from public;
grant execute on function public.loyalty_status(uuid[], uuid) to anon, authenticated;

create or replace function public.place_order(p_store_id uuid, p_items jsonb, p_customer jsonb, p_is_takeout boolean default false, p_coupon text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    s public.stores; p public.products; c public.coupons;
    it jsonb; sel jsonb; g jsonb; o jsonb; gi int; oi int; q int;
    v_unit numeric; v_chosen jsonb; v_counts int[]; v_note text;
    v_items jsonb := '[]'::jsonb; v_subtotal numeric := 0; v_discount numeric := 0;
    v_coupon_code text; v_fee numeric; v_pin text; v_order uuid;
    v_name text := left(trim(coalesce(p_customer->>'name', '')), 80);
    v_phone text := regexp_replace(coalesce(p_customer->>'phone', ''), '\D', '', 'g');
    v_address text := left(trim(coalesce(p_customer->>'address', '')), 200);
    v_payment text := left(coalesce(p_customer->>'payment_method', ''), 40);
    v_lat double precision; v_lng double precision; v_quote jsonb;
    v_change numeric;
    v_sched timestamptz;
begin
    p_is_takeout := coalesce(p_is_takeout, false);
    select * into s from public.stores where id = p_store_id and is_active and not is_paused and listing_type = 'catalogo';
    if not found then raise exception 'store_unavailable'; end if;
    -- Agendamento: de 20 min a 3 dias à frente, num horário em que a loja funciona.
    -- Pedido agendado pode ser feito com a loja fechada agora.
    if coalesce(p_customer->>'scheduled_for', '') <> '' then
        begin
            v_sched := (p_customer->>'scheduled_for')::timestamptz;
        exception when others then
            raise exception 'invalid_schedule';
        end;
        if v_sched < now() + interval '20 minutes' or v_sched > now() + interval '3 days'
           or not public.store_is_open(s.opening_hours, v_sched) then
            raise exception 'invalid_schedule';
        end if;
    elsif not public.store_is_open(s.opening_hours) then
        raise exception 'store_closed';
    end if;
    if v_name = '' or length(v_phone) not between 10 and 13 or (not p_is_takeout and v_address = '') then raise exception 'invalid_customer'; end if;
    if jsonb_typeof(p_customer->'lat') = 'number' and jsonb_typeof(p_customer->'lng') = 'number' then
        v_lat := (p_customer->>'lat')::double precision; v_lng := (p_customer->>'lng')::double precision;
        if v_lat not between -90 and 90 or v_lng not between -180 and 180 then v_lat := null; v_lng := null; end if;
    end if;
    -- Troco: só para pagamento em dinheiro, valor positivo e razoável
    if v_payment ilike 'dinheiro%' and jsonb_typeof(p_customer->'change_for') = 'number' then
        v_change := round((p_customer->>'change_for')::numeric, 2);
        if v_change <= 0 or v_change > 5000 then v_change := null; end if;
    end if;
    if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then raise exception 'invalid_items'; end if;
    for it in select * from jsonb_array_elements(p_items) loop
        q := (it->>'quantity')::int;
        if q is null or q < 1 or q > 99 then raise exception 'invalid_items'; end if;
        select * into p from public.products where id = (it->>'product_id')::uuid and store_id = p_store_id and not coalesce(is_paused, false);
        if not found then continue; end if;
        v_unit := coalesce(p.promo_price, p.price);
        v_chosen := '[]'::jsonb;
        v_counts := array_fill(0, array[greatest(jsonb_array_length(coalesce(p.options, '[]'::jsonb)), 1)]);
        if jsonb_typeof(it->'options') = 'array' then
            if jsonb_array_length(it->'options') > 40 then raise exception 'invalid_options'; end if;
            for sel in select * from jsonb_array_elements(it->'options') loop
                gi := (sel->>0)::int; oi := (sel->>1)::int;
                g := p.options->gi; o := g->'options'->oi;
                if gi is null or oi is null or g is null or o is null then raise exception 'invalid_options'; end if;
                if v_chosen @> jsonb_build_array(jsonb_build_object('g', gi, 'o', oi)) then raise exception 'invalid_options'; end if;
                v_counts[gi + 1] := v_counts[gi + 1] + 1;
                v_unit := v_unit + (o->>'price')::numeric;
                v_chosen := v_chosen || jsonb_build_object('g', gi, 'o', oi, 'group', g->>'name', 'name', o->>'name', 'price', (o->>'price')::numeric);
            end loop;
        elsif it ? 'options' and jsonb_typeof(it->'options') <> 'null' then
            raise exception 'invalid_options';
        end if;
        for gi in 0 .. coalesce(jsonb_array_length(p.options), 0) - 1 loop
            g := p.options->gi;
            if v_counts[gi + 1] < (g->>'min')::int or v_counts[gi + 1] > (g->>'max')::int then raise exception 'invalid_options'; end if;
        end loop;
        v_note := nullif(left(trim(coalesce(it->>'note', '')), 140), '');
        v_subtotal := v_subtotal + v_unit * q;
        v_items := v_items || jsonb_build_object('product_id', p.id, 'name', p.name, 'quantity', q, 'unit_price', v_unit,
            'options', (select coalesce(jsonb_agg(x - 'g' - 'o'), '[]'::jsonb) from jsonb_array_elements(v_chosen) x), 'note', v_note);
    end loop;
    if jsonb_array_length(v_items) = 0 then raise exception 'items_unavailable'; end if;
    -- Pedido mínimo da loja: vale sobre o valor dos itens, antes de cupom e entrega
    if coalesce(s.min_order_value, 0) > 0 and v_subtotal < s.min_order_value then raise exception 'below_min_order'; end if;
    if coalesce(trim(p_coupon), '') <> '' then
        select * into c from public.coupons where code = upper(trim(p_coupon)) and store_id = p_store_id and is_active;
        if not found then raise exception 'invalid_coupon'; end if;
        -- Cupom de fidelidade: só do próprio cliente e de uso único
        if c.customer_phone is not null and c.customer_phone <> v_phone then raise exception 'invalid_coupon'; end if;
        if c.single_use and exists (select 1 from public.orders where coupon_code = c.code and status <> 'cancelado') then raise exception 'invalid_coupon'; end if;
        if v_subtotal < coalesce(c.min_order_value, 0) then raise exception 'coupon_min_order'; end if;
        v_discount := public.coupon_discount(c.discount_type, c.discount_value, v_subtotal);
        v_coupon_code := c.code;
    end if;
    if p_is_takeout then v_fee := 0;
    else
        v_quote := public.delivery_quote(s.id, v_lat, v_lng);
        if (v_quote->>'out_of_range')::boolean then raise exception 'out_of_range'; end if;
        v_fee := (v_quote->>'fee')::numeric;
    end if;
    -- Troco menor que o total não faz sentido: ignora
    if v_change is not null and v_change < v_subtotal - v_discount + v_fee then v_change := null; end if;
    v_pin := (1000 + floor(random() * 9000))::int::text;
    insert into public.orders (store_id, status, total_amount, delivery_fee, is_takeout, delivery_pin, delivery_address, coupon_code, discount_amount, scheduled_for)
    values (p_store_id, 'novo', v_subtotal - v_discount + v_fee, v_fee, p_is_takeout, v_pin,
        jsonb_build_object('client_name', v_name, 'client_phone', v_phone, 'address', nullif(v_address, ''),
            'payment_method', v_payment,
            'notes', nullif(left(trim(coalesce(p_customer->>'notes', '')), 200), ''),
            'lat', v_lat, 'lng', v_lng, 'distance_km', v_quote->'distance_km',
            'change_for', v_change),
        v_coupon_code, v_discount, v_sched)
    returning id into v_order;
    insert into public.order_items (order_id, product_id, quantity, unit_price, options, note)
    select v_order, (x->>'product_id')::uuid, (x->>'quantity')::int, (x->>'unit_price')::numeric, nullif(x->'options', '[]'::jsonb), x->>'note'
      from jsonb_array_elements(v_items) x;
    return jsonb_build_object('id', v_order, 'pin', v_pin, 'subtotal', v_subtotal, 'discount', v_discount, 'coupon_code', v_coupon_code,
        'delivery_fee', v_fee, 'distance_km', v_quote->'distance_km', 'total', v_subtotal - v_discount + v_fee, 'items', v_items,
        'change_for', v_change, 'scheduled_for', v_sched,
        'store', jsonb_build_object('name', s.name, 'whatsapp_number', s.whatsapp_number, 'pix_key', s.pix_key, 'pix_city', s.pix_city));
end;
$$;
