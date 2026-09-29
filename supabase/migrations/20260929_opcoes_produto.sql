-- Adicionais e variações do produto (item 25 do BACKLOG)
-- products.options: grupos de escolha, ex.:
--   [{"name":"Tamanho","min":1,"max":1,"options":[{"name":"P","price":0},{"name":"G","price":8}]},
--    {"name":"Adicionais","min":0,"max":3,"options":[{"name":"Bacon","price":4}]}]
-- O cliente manda, por item, os índices escolhidos ([[grupo, opção], ...]) e uma observação.
-- place_order confere mínimo/máximo de cada grupo, soma os preços das opções ao preço do produto
-- e grava o que foi escolhido em order_items.options (nome do grupo, opção e preço na hora).

create or replace function public.product_options_valid(p jsonb)
returns boolean
language sql immutable
as $$
    select p is null or (
        jsonb_typeof(p) = 'array' and jsonb_array_length(p) <= 10
        and not exists (
            select 1 from jsonb_array_elements(p) g
             where jsonb_typeof(g) <> 'object'
                or coalesce(trim(g->>'name'), '') = ''
                or jsonb_typeof(g->'options') is distinct from 'array'
                or jsonb_array_length(g->'options') not between 1 and 30
                or coalesce((g->>'min')::int, -1) < 0
                or coalesce((g->>'max')::int, 0) < greatest(1, (g->>'min')::int)
                or (g->>'min')::int > jsonb_array_length(g->'options')
                or exists (
                    select 1 from jsonb_array_elements(g->'options') o
                     where coalesce(trim(o->>'name'), '') = ''
                        or coalesce((o->>'price')::numeric, -1) < 0
                )
        )
    );
$$;

alter table public.products add column if not exists options jsonb;
alter table public.products drop constraint if exists products_options_valid;
alter table public.products add constraint products_options_valid check (public.product_options_valid(options));

alter table public.order_items add column if not exists options jsonb;
alter table public.order_items add column if not exists note text;

create or replace function public.place_order(p_store_id uuid, p_items jsonb, p_customer jsonb, p_is_takeout boolean default false, p_coupon text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    s public.stores;
    p public.products;
    c public.coupons;
    it jsonb;
    sel jsonb;
    g jsonb;
    o jsonb;
    gi int;
    oi int;
    q int;
    v_unit numeric;
    v_chosen jsonb;
    v_counts int[];
    v_note text;
    v_items jsonb := '[]'::jsonb;
    v_subtotal numeric := 0;
    v_discount numeric := 0;
    v_coupon_code text;
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

    if not public.store_is_open(s.opening_hours) then
        raise exception 'store_closed';
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
        if not found then
            continue;
        end if;

        -- Opções escolhidas: [[grupo, opção], ...] conferidas contra o cadastro atual
        v_unit := coalesce(p.promo_price, p.price);
        v_chosen := '[]'::jsonb;
        v_counts := array_fill(0, array[greatest(jsonb_array_length(coalesce(p.options, '[]'::jsonb)), 1)]);
        if jsonb_typeof(it->'options') = 'array' then
            if jsonb_array_length(it->'options') > 40 then
                raise exception 'invalid_options';
            end if;
            for sel in select * from jsonb_array_elements(it->'options') loop
                gi := (sel->>0)::int;
                oi := (sel->>1)::int;
                g := p.options->gi;
                o := g->'options'->oi;
                if gi is null or oi is null or g is null or o is null then
                    raise exception 'invalid_options';
                end if;
                if v_chosen @> jsonb_build_array(jsonb_build_object('g', gi, 'o', oi)) then
                    raise exception 'invalid_options';
                end if;
                v_counts[gi + 1] := v_counts[gi + 1] + 1;
                v_unit := v_unit + (o->>'price')::numeric;
                v_chosen := v_chosen || jsonb_build_object('g', gi, 'o', oi, 'group', g->>'name', 'name', o->>'name', 'price', (o->>'price')::numeric);
            end loop;
        elsif it ? 'options' and jsonb_typeof(it->'options') <> 'null' then
            raise exception 'invalid_options';
        end if;

        -- Mínimo e máximo de cada grupo
        for gi in 0 .. coalesce(jsonb_array_length(p.options), 0) - 1 loop
            g := p.options->gi;
            if v_counts[gi + 1] < (g->>'min')::int or v_counts[gi + 1] > (g->>'max')::int then
                raise exception 'invalid_options';
            end if;
        end loop;

        v_note := nullif(left(trim(coalesce(it->>'note', '')), 140), '');
        v_subtotal := v_subtotal + v_unit * q;
        v_items := v_items || jsonb_build_object(
            'product_id', p.id, 'name', p.name, 'quantity', q, 'unit_price', v_unit,
            'options', (select coalesce(jsonb_agg(x - 'g' - 'o'), '[]'::jsonb) from jsonb_array_elements(v_chosen) x),
            'note', v_note);
    end loop;

    if jsonb_array_length(v_items) = 0 then
        raise exception 'items_unavailable';
    end if;

    if coalesce(trim(p_coupon), '') <> '' then
        select * into c from public.coupons
         where code = upper(trim(p_coupon)) and store_id = p_store_id and is_active;
        if not found then
            raise exception 'invalid_coupon';
        end if;
        if v_subtotal < coalesce(c.min_order_value, 0) then
            raise exception 'coupon_min_order';
        end if;
        v_discount := public.coupon_discount(c.discount_type, c.discount_value, v_subtotal);
        v_coupon_code := c.code;
    end if;

    v_fee := case when p_is_takeout then 0 else coalesce(s.delivery_fee, 0) end;
    v_pin := (1000 + floor(random() * 9000))::int::text;

    insert into public.orders (store_id, status, total_amount, delivery_fee, is_takeout, delivery_pin, delivery_address, coupon_code, discount_amount)
    values (
        p_store_id, 'novo', v_subtotal - v_discount + v_fee, v_fee, p_is_takeout, v_pin,
        jsonb_build_object(
            'client_name', v_name,
            'client_phone', v_phone,
            'address', nullif(v_address, ''),
            'payment_method', left(coalesce(p_customer->>'payment_method', ''), 40),
            'notes', nullif(left(trim(coalesce(p_customer->>'notes', '')), 200), '')
        ),
        v_coupon_code, v_discount
    )
    returning id into v_order;

    insert into public.order_items (order_id, product_id, quantity, unit_price, options, note)
    select v_order, (x->>'product_id')::uuid, (x->>'quantity')::int, (x->>'unit_price')::numeric,
           nullif(x->'options', '[]'::jsonb), x->>'note'
      from jsonb_array_elements(v_items) x;

    return jsonb_build_object(
        'id', v_order,
        'pin', v_pin,
        'subtotal', v_subtotal,
        'discount', v_discount,
        'coupon_code', v_coupon_code,
        'delivery_fee', v_fee,
        'total', v_subtotal - v_discount + v_fee,
        'items', v_items,
        'store', jsonb_build_object('name', s.name, 'whatsapp_number', s.whatsapp_number)
    );
end;
$$;

-- Acompanhamento do cliente: opções e observação de cada item
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
            select jsonb_agg(jsonb_build_object('quantity', oi.quantity, 'unit_price', oi.unit_price, 'options', oi.options, 'note', oi.note, 'products', jsonb_build_object('name', pr.name)))
              from public.order_items oi left join public.products pr on pr.id = oi.product_id
             where oi.order_id = o.id), '[]'::jsonb),
        'has_review', exists (select 1 from public.reviews r where r.order_id = o.id)
    )
      from public.orders o
      left join public.stores s on s.id = o.store_id
      left join public.couriers c on c.id = o.courier_ref
     where o.id = p_id;
$$;
