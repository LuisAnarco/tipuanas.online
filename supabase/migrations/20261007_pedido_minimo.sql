-- Pedido mínimo por loja (item 27b do BACKLOG)
-- stores.min_order_value: opcional (null = sem mínimo), entre 0 e 1000.
-- place_order recusa com 'below_min_order' quando o valor dos itens (antes de cupom e taxa de
-- entrega) fica abaixo do mínimo. O resto da função é igual a 20260930_pix_troco.sql.

alter table public.stores add column if not exists min_order_value numeric;
alter table public.stores drop constraint if exists stores_min_order_value_check;
alter table public.stores add constraint stores_min_order_value_check
    check (min_order_value is null or (min_order_value >= 0 and min_order_value <= 1000));

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
begin
    p_is_takeout := coalesce(p_is_takeout, false);
    select * into s from public.stores where id = p_store_id and is_active and not is_paused and listing_type = 'catalogo';
    if not found then raise exception 'store_unavailable'; end if;
    if not public.store_is_open(s.opening_hours) then raise exception 'store_closed'; end if;
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
    insert into public.orders (store_id, status, total_amount, delivery_fee, is_takeout, delivery_pin, delivery_address, coupon_code, discount_amount)
    values (p_store_id, 'novo', v_subtotal - v_discount + v_fee, v_fee, p_is_takeout, v_pin,
        jsonb_build_object('client_name', v_name, 'client_phone', v_phone, 'address', nullif(v_address, ''),
            'payment_method', v_payment,
            'notes', nullif(left(trim(coalesce(p_customer->>'notes', '')), 200), ''),
            'lat', v_lat, 'lng', v_lng, 'distance_km', v_quote->'distance_km',
            'change_for', v_change),
        v_coupon_code, v_discount)
    returning id into v_order;
    insert into public.order_items (order_id, product_id, quantity, unit_price, options, note)
    select v_order, (x->>'product_id')::uuid, (x->>'quantity')::int, (x->>'unit_price')::numeric, nullif(x->'options', '[]'::jsonb), x->>'note'
      from jsonb_array_elements(v_items) x;
    return jsonb_build_object('id', v_order, 'pin', v_pin, 'subtotal', v_subtotal, 'discount', v_discount, 'coupon_code', v_coupon_code,
        'delivery_fee', v_fee, 'distance_km', v_quote->'distance_km', 'total', v_subtotal - v_discount + v_fee, 'items', v_items,
        'change_for', v_change,
        'store', jsonb_build_object('name', s.name, 'whatsapp_number', s.whatsapp_number, 'pix_key', s.pix_key, 'pix_city', s.pix_city));
end;
$$;
