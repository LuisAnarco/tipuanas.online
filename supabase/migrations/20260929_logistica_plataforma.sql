-- Quem entrega decide a taxa (pedido do Luis em 29/09/2026):
-- - stores.delivery_type = 'propria':    a loja entrega e define taxa/raio (colunas da loja)
-- - stores.delivery_type = 'plataforma': entregadores da plataforma; taxa e raio vêm de
--   platform_delivery, que só o admin altera. Só esses pedidos entram na fila dos entregadores.

create table if not exists public.platform_delivery (
    id int primary key default 1 check (id = 1),
    base_fee numeric not null default 6 check (base_fee >= 0),
    km_included numeric not null default 2 check (km_included >= 0),
    fee_per_km numeric not null default 1.5 check (fee_per_km >= 0),
    radius_km numeric not null default 5 check (radius_km > 0 and radius_km <= 50),
    updated_at timestamptz not null default now()
);
insert into public.platform_delivery (id) values (1) on conflict (id) do nothing;

alter table public.platform_delivery enable row level security;
drop policy if exists "Leitura publica da taxa da plataforma" on public.platform_delivery;
create policy "Leitura publica da taxa da plataforma" on public.platform_delivery
    for select to anon, authenticated using (true);
drop policy if exists "Admin altera a taxa da plataforma" on public.platform_delivery;
create policy "Admin altera a taxa da plataforma" on public.platform_delivery
    for update to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.delivery_quote(p_store_id uuid, p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
    s public.stores;
    pd public.platform_delivery;
    v_base numeric; v_incl numeric; v_per_km numeric; v_radius numeric;
    v_dist numeric;
    v_fee numeric;
    v_estimated boolean := false;
begin
    select * into s from public.stores where id = p_store_id;
    if not found then
        return null;
    end if;
    if s.delivery_type = 'plataforma' then
        select * into pd from public.platform_delivery where id = 1;
        v_base := pd.base_fee; v_incl := pd.km_included; v_per_km := pd.fee_per_km; v_radius := pd.radius_km;
        if s.lat is null then
            v_per_km := null; v_radius := null; -- loja sem localização: só a taxa base
        end if;
    else
        v_base := coalesce(s.delivery_fee, 0); v_incl := s.delivery_km_included;
        v_per_km := s.delivery_fee_per_km; v_radius := s.delivery_radius_km;
    end if;

    if s.lat is not null and p_lat is not null and p_lng is not null then
        v_dist := public.distance_km(s.lat, s.lng, p_lat, p_lng);
    end if;
    if v_per_km is null then
        v_fee := v_base;
    else
        if v_dist is null then
            v_estimated := true; -- sem localização do cliente: taxa máxima dentro do raio
        end if;
        v_fee := round(ceil((v_base + v_per_km * greatest(0, coalesce(v_dist, v_radius) - v_incl)) * 2) / 2, 2);
    end if;
    return jsonb_build_object(
        'store_id', s.id,
        'fee', v_fee,
        'distance_km', v_dist,
        'out_of_range', v_dist is not null and v_radius is not null and v_dist > v_radius,
        'estimated', v_estimated,
        'radius_km', v_radius,
        'logistics', s.delivery_type
    );
end;
$$;

-- Fila dos entregadores: só lojas que usam a logística da plataforma
create or replace function public.list_available_rides()
returns table (id uuid, created_at timestamptz, delivery_fee numeric, total_amount numeric, payment_method text, delivery_address text,
    store_id uuid, store_name text, store_address text, distance_km numeric)
language plpgsql stable security definer set search_path = public as $$
begin
    if public.my_courier_id() is null then raise exception 'not_courier'; end if;
    return query
        select o.id, o.created_at, o.delivery_fee::numeric, o.total_amount::numeric,
               o.delivery_address->>'payment_method', o.delivery_address->>'address',
               s.id, s.name, s.address_line, (o.delivery_address->>'distance_km')::numeric
          from public.orders o join public.stores s on s.id = o.store_id
         where o.status = 'pronto' and o.courier_ref is null and not coalesce(o.is_takeout, false)
           and s.delivery_type = 'plataforma'
         order by o.created_at;
end;
$$;

create or replace function public.accept_ride(p_order_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
    v_courier uuid := public.my_courier_id();
begin
    if v_courier is null then
        raise exception 'not_courier';
    end if;
    update public.orders o set status = 'em_rota', courier_ref = v_courier
      from public.stores s
     where o.id = p_order_id and s.id = o.store_id and s.delivery_type = 'plataforma'
       and o.status = 'pronto' and o.courier_ref is null and not coalesce(o.is_takeout, false);
    return found;
end;
$$;
