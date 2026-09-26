-- Horário de funcionamento das lojas.
-- stores.opening_hours: {"0": "08:00-12:00", "1": "08:00-18:00", ...} — chave = dia da semana
-- (0 = domingo … 6 = sábado), valor "HH:MM-HH:MM"; dia ausente/nulo = fechado.
-- Faixa que passa da meia-noite é aceita (ex.: "18:00-02:00").
-- Coluna nula ou {} = sem horário configurado = sempre aberta (comportamento anterior).
-- Dia com valor fora do formato conta como fechado; erro inesperado na conversão = aberta.

alter table public.stores add column if not exists opening_hours jsonb;
comment on column public.stores.opening_hours is 'Horário por dia da semana (0=dom..6=sáb) no formato "HH:MM-HH:MM"; nulo = sempre aberta';

create or replace function public.store_is_open(p_hours jsonb, p_at timestamptz default now())
returns boolean
language plpgsql stable set search_path = public as $$
declare
    v_local timestamp := p_at at time zone 'America/Sao_Paulo';
    v_dow int := extract(dow from v_local)::int;
    v_time time := v_local::time;
    v_today text;
    v_prev text;
    v_start time;
    v_end time;
begin
    if p_hours is null or p_hours = '{}'::jsonb then
        return true;
    end if;

    v_today := p_hours->>v_dow::text;
    if v_today like '__:__-__:__' then
        v_start := split_part(v_today, '-', 1)::time;
        v_end := split_part(v_today, '-', 2)::time;
        if v_start <= v_end then
            if v_time >= v_start and v_time < v_end then return true; end if;
        elsif v_time >= v_start then
            return true;
        end if;
    end if;

    -- Faixa do dia anterior que vira a madrugada de hoje
    v_prev := p_hours->>(((v_dow + 6) % 7)::text);
    if v_prev like '__:__-__:__' then
        v_start := split_part(v_prev, '-', 1)::time;
        v_end := split_part(v_prev, '-', 2)::time;
        if v_start > v_end and v_time < v_end then return true; end if;
    end if;

    return false;
exception when others then
    -- Erro inesperado (ex.: hora inexistente como 25:00) não pode travar a loja
    return true;
end;
$$;

-- place_order: igual à versão anterior + recusa pedido fora do horário ('store_closed')
create or replace function public.place_order(
    p_store_id uuid,
    p_items jsonb,
    p_customer jsonb,
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
