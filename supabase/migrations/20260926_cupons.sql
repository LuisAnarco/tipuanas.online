-- Cupons de desconto (tabela coupons já existia, vazia e sem uso).
-- - O lojista cria cupons da própria loja (política "Dono ou admin gerencia cupons").
-- - O cliente confere o cupom com check_coupon e o place_order aplica o desconto
--   no servidor (o valor nunca vem do navegador).
-- - O pedido guarda coupon_code e discount_amount; total_amount já sai com desconto.

alter table public.orders add column if not exists coupon_code text;
alter table public.orders add column if not exists discount_amount numeric not null default 0;

alter table public.coupons drop constraint if exists coupons_value_valid;
alter table public.coupons add constraint coupons_value_valid check (
    discount_value > 0 and (discount_type <> 'percentage' or discount_value <= 100)
);
alter table public.coupons drop constraint if exists coupons_code_format;
alter table public.coupons add constraint coupons_code_format check (code ~ '^[A-Z0-9]{3,20}$');

-- Desconto de um cupom sobre um subtotal (nunca maior que o subtotal)
create or replace function public.coupon_discount(p_type text, p_value numeric, p_subtotal numeric)
returns numeric language sql immutable set search_path = public as $$
    select round(least(p_subtotal, case when p_type = 'percentage' then p_subtotal * p_value / 100 else p_value end), 2);
$$;

-- Cliente confere um cupom antes de pedir (sem login)
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
       and s.is_active;
$$;

-- place_order ganha p_coupon (opcional). A versão antiga (4 parâmetros) é trocada
-- por esta; quem chama sem cupom continua funcionando igual.
drop function if exists public.place_order(uuid, jsonb, jsonb, boolean);

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
            v_subtotal := v_subtotal + p.price * q;
            v_items := v_items || jsonb_build_object('product_id', p.id, 'name', p.name, 'quantity', q, 'unit_price', p.price);
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
