-- Vitrine estilo iFood
-- - products.section (seção do cardápio), promo_price (preço promocional) e is_featured (destaque)
-- - stores.cover_url (capa da página da loja; logo_url já existia)
-- - coupons.is_public: cupom aparece nos banners da vitrine (list_public_coupons)
-- - place_order cobra o preço promocional quando houver

alter table public.products add column if not exists section text;
alter table public.products add column if not exists promo_price numeric;
alter table public.products add column if not exists is_featured boolean not null default false;
alter table public.products drop constraint if exists products_promo_price_valid;
alter table public.products add constraint products_promo_price_valid
    check (promo_price is null or (promo_price > 0 and promo_price < price));
alter table public.products drop constraint if exists products_section_len;
alter table public.products add constraint products_section_len check (section is null or char_length(section) <= 40);

alter table public.stores add column if not exists cover_url text;

alter table public.coupons add column if not exists is_public boolean not null default false;

-- Cupons que o lojista marcou para aparecer na vitrine (sem login)
create or replace function public.list_public_coupons()
returns jsonb language sql stable security definer set search_path = public as $$
    select coalesce(jsonb_agg(jsonb_build_object(
        'code', c.code,
        'store_id', c.store_id,
        'store_name', s.name,
        'store_slug', s.slug,
        'discount_type', c.discount_type,
        'discount_value', c.discount_value,
        'min_order_value', coalesce(c.min_order_value, 0)
    ) order by c.created_at desc), '[]'::jsonb)
      from public.coupons c
      join public.stores s on s.id = c.store_id
     where c.is_active and c.is_public and s.is_active and not s.is_paused;
$$;
grant execute on function public.list_public_coupons() to anon, authenticated;

create or replace function public.place_order(
    p_store_id uuid,
    p_items jsonb,
    p_customer jsonb,
    p_is_takeout boolean default false,
    p_coupon text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    s public.stores;
    p public.products;
    c public.coupons;
    it jsonb;
    q int;
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
        if found then
            -- Preço promocional (quando houver) é o preço cobrado
            v_subtotal := v_subtotal + coalesce(p.promo_price, p.price) * q;
            v_items := v_items || jsonb_build_object('product_id', p.id, 'name', p.name, 'quantity', q, 'unit_price', coalesce(p.promo_price, p.price));
        end if;
    end loop;

    if jsonb_array_length(v_items) = 0 then
        raise exception 'items_unavailable';
    end if;

    -- Cupom: precisa ser desta loja, estar ativo e o subtotal atingir o mínimo
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

    insert into public.order_items (order_id, product_id, quantity, unit_price)
    select v_order, (x->>'product_id')::uuid, (x->>'quantity')::int, (x->>'unit_price')::numeric
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
