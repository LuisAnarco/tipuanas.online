-- Avaliação pós-entrega (roadmap fase 2) e identidade do entregador (fase 3).
-- Só adiciona estruturas novas; não altera dados existentes.

-- 1) Avaliações: uma por pedido, só depois de entregue, sem edição/remoção pelo cliente.
create table if not exists public.reviews (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null unique references public.orders(id) on delete cascade,
    store_id uuid not null references public.stores(id) on delete cascade,
    rating smallint not null check (rating between 1 and 5),
    comment text check (char_length(comment) <= 500),
    created_at timestamptz not null default now()
);
comment on table public.reviews is 'Avaliação do cliente sobre a loja após o pedido ser entregue (1 por pedido).';
create index if not exists reviews_store_id_idx on public.reviews(store_id);

alter table public.reviews enable row level security;

create policy "Leitura publica de avaliacoes" on public.reviews
    for select using (true);

-- Só aceita avaliação de pedido entregue e da loja certa daquele pedido
create policy "Cliente avalia pedido entregue" on public.reviews
    for insert with check (
        exists (
            select 1 from public.orders o
            where o.id = reviews.order_id
              and o.store_id = reviews.store_id
              and o.status = 'entregue'
        )
    );

-- 2) Entregadores: identidade mínima (sem login ainda, igual ao lojista).
create table if not exists public.couriers (
    id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(name) between 2 and 80),
    phone text not null check (phone ~ '^[0-9]{10,13}$'),
    vehicle text check (char_length(vehicle) <= 40),
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);
comment on table public.couriers is 'Entregadores cadastrados pelo painel entregador.html. Aceite livre, sem exigência de disponibilidade.';

alter table public.couriers enable row level security;

create policy "Acesso publico couriers" on public.couriers
    for all using (true) with check (true);

-- Qual entregador pegou a corrida (orders.courier_id aponta para profiles/auth, que ainda não é usado)
alter table public.orders add column if not exists courier_ref uuid references public.couriers(id);
comment on column public.orders.courier_ref is 'Entregador (public.couriers) que aceitou a corrida';
create index if not exists orders_courier_ref_idx on public.orders(courier_ref);
