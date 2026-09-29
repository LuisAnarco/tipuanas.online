-- Taxa de entrega por distância (km/raio), pedido do Luis em 29/09/2026
-- A loja marca a própria localização (lat/lng) e escolhe:
--   delivery_fee          taxa base (já existia)
--   delivery_km_included  km cobertos pela taxa base
--   delivery_fee_per_km   R$ por km a mais (vazio = taxa fixa, como antes)
--   delivery_radius_km    raio máximo de entrega (fora dele o pedido é recusado)
-- A distância é em linha reta (Haversine) entre a loja e o ponto do cliente. A taxa sobe em
-- degraus de R$ 0,50. Sem a localização do cliente, cobra a taxa máxima dentro do raio.

alter table public.stores add column if not exists lat double precision;
alter table public.stores add column if not exists lng double precision;
alter table public.stores add column if not exists delivery_km_included numeric not null default 0;
alter table public.stores add column if not exists delivery_fee_per_km numeric;
alter table public.stores add column if not exists delivery_radius_km numeric;

alter table public.stores drop constraint if exists stores_delivery_distance_check;
alter table public.stores add constraint stores_delivery_distance_check check (
    (lat is null) = (lng is null)
    and (lat is null or (lat between -90 and 90 and lng between -180 and 180))
    and delivery_km_included >= 0
    and (delivery_fee_per_km is null or (delivery_fee_per_km >= 0 and lat is not null and delivery_radius_km is not null))
    and (delivery_radius_km is null or (delivery_radius_km > 0 and delivery_radius_km <= 50 and lat is not null))
);

create or replace function public.distance_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns numeric
language sql immutable
as $$
    select round((6371 * 2 * asin(sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2)
        + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
    )))::numeric, 1);
$$;

-- Taxa de uma loja para um ponto: { fee, distance_km, out_of_range, estimated, radius_km }
create or replace function public.delivery_quote(p_store_id uuid, p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
    s public.stores;
    v_dist numeric;
    v_fee numeric;
    v_estimated boolean := false;
begin
    select * into s from public.stores where id = p_store_id;
    if not found then
        return null;
    end if;
    if s.lat is not null and p_lat is not null and p_lng is not null then
        v_dist := public.distance_km(s.lat, s.lng, p_lat, p_lng);
    end if;
    if s.delivery_fee_per_km is null then
        v_fee := coalesce(s.delivery_fee, 0);
    else
        if v_dist is null then
            v_estimated := true; -- sem localização: taxa máxima dentro do raio
        end if;
        v_fee := coalesce(s.delivery_fee, 0)
               + s.delivery_fee_per_km * greatest(0, coalesce(v_dist, s.delivery_radius_km) - s.delivery_km_included);
        v_fee := round(ceil(v_fee * 2) / 2, 2);
    end if;
    return jsonb_build_object(
        'store_id', s.id,
        'fee', v_fee,
        'distance_km', v_dist,
        'out_of_range', v_dist is not null and s.delivery_radius_km is not null and v_dist > s.delivery_radius_km,
        'estimated', v_estimated,
        'radius_km', s.delivery_radius_km
    );
end;
$$;

-- Prévia da taxa no checkout (várias lojas de uma vez)
create or replace function public.quote_delivery(p_store_ids uuid[], p_lat double precision default null, p_lng double precision default null)
returns jsonb
language sql stable
set search_path = public
as $$
    select coalesce(jsonb_agg(public.delivery_quote(id, p_lat, p_lng)), '[]'::jsonb)
      from unnest(p_store_ids[1:20]) as id;
$$;
grant execute on function public.quote_delivery(uuid[], double precision, double precision) to anon, authenticated;

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
    v_lat double precision;
    v_lng double precision;
    v_quote jsonb;
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

    -- Localização do cliente (opcional): usada para a taxa por distância
    if jsonb_typeof(p_customer->'lat') = 'number' and jsonb_typeof(p_customer->'lng') = 'number' then
        v_lat := (p_customer->>'lat')::double precision;
        v_lng := (p_customer->>'lng')::double precision;
        if v_lat not between -90 and 90 or v_lng not between -180 and 180 then
            v_lat := null; v_lng := null;
        end if;
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

    if p_is_takeout then
        v_fee := 0;
    else
        v_quote := public.delivery_quote(s.id, v_lat, v_lng);
        if (v_quote->>'out_of_range')::boolean then
            raise exception 'out_of_range';
        end if;
        v_fee := (v_quote->>'fee')::numeric;
    end if;
    v_pin := (1000 + floor(random() * 9000))::int::text;

    insert into public.orders (store_id, status, total_amount, delivery_fee, is_takeout, delivery_pin, delivery_address, coupon_code, discount_amount)
    values (
        p_store_id, 'novo', v_subtotal - v_discount + v_fee, v_fee, p_is_takeout, v_pin,
        jsonb_build_object(
            'client_name', v_name,
            'client_phone', v_phone,
            'address', nullif(v_address, ''),
            'payment_method', left(coalesce(p_customer->>'payment_method', ''), 40),
            'notes', nullif(left(trim(coalesce(p_customer->>'notes', '')), 200), ''),
            'lat', v_lat,
            'lng', v_lng,
            'distance_km', v_quote->'distance_km'
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
        'distance_km', v_quote->'distance_km',
        'total', v_subtotal - v_discount + v_fee,
        'items', v_items,
        'store', jsonb_build_object('name', s.name, 'whatsapp_number', s.whatsapp_number)
    );
end;
$$;

-- Entregador: distância da entrega na lista de corridas livres (aceite inteligente)
drop function if exists public.list_available_rides();
create function public.list_available_rides()
returns table (
    id uuid, created_at timestamptz, delivery_fee numeric, total_amount numeric,
    payment_method text, delivery_address text,
    store_id uuid, store_name text, store_address text, distance_km numeric
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
               s.id, s.name, s.address_line, (o.delivery_address->>'distance_km')::numeric
          from public.orders o
          join public.stores s on s.id = o.store_id
         where o.status = 'pronto' and o.courier_ref is null and not coalesce(o.is_takeout, false)
         order by o.created_at;
end;
$$;
revoke execute on function public.list_available_rides() from public, anon;
grant execute on function public.list_available_rides() to authenticated;
