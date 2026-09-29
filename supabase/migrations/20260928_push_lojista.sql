-- Notificação push para o lojista (item 20): pedido novo chega no celular
-- mesmo com o painel fechado.
-- - push_subscriptions: inscrições do navegador de cada lojista (uma por aparelho)
-- - gatilho em orders (AFTER INSERT) chama a função "notify-new-order" via pg_net
-- - chaves VAPID e segredo do gatilho ficam no vault (NÃO estão neste arquivo):
--     vault 'vapid_public_key', 'vapid_private_key', 'push_trigger_secret'

create extension if not exists pg_net with schema extensions;

create table if not exists public.push_subscriptions (
    id uuid primary key default gen_random_uuid(),
    store_id uuid not null references public.stores(id) on delete cascade,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    endpoint text not null unique,
    p256dh text not null,
    auth text not null,
    user_agent text,
    created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_store_idx on public.push_subscriptions (store_id);
alter table public.push_subscriptions enable row level security;

drop policy if exists "Dono gerencia as proprias inscricoes" on public.push_subscriptions;
create policy "Dono gerencia as proprias inscricoes" on public.push_subscriptions
    for all to authenticated
    using (user_id = (select auth.uid()) and (owns_store(store_id) or is_admin()))
    with check (user_id = (select auth.uid()) and (owns_store(store_id) or is_admin()));

-- Lida só pela função de push (service_role): chaves e inscrições da loja do pedido
create or replace function public.push_payload_for_order(p_order_id uuid)
returns jsonb language sql stable security definer set search_path = public, vault as $$
    select jsonb_build_object(
        'vapid_public_key', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public_key'),
        'vapid_private_key', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private_key'),
        'trigger_secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_trigger_secret'),
        'order', jsonb_build_object('id', o.id, 'total', o.total_amount, 'is_takeout', o.is_takeout,
                                    'client_name', o.delivery_address->>'client_name'),
        'store', jsonb_build_object('id', s.id, 'name', s.name),
        'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('id', ps.id, 'endpoint', ps.endpoint,
                                       'keys', jsonb_build_object('p256dh', ps.p256dh, 'auth', ps.auth)))
                                     from public.push_subscriptions ps where ps.store_id = s.id), '[]'::jsonb)
    )
      from public.orders o join public.stores s on s.id = o.store_id
     where o.id = p_order_id;
$$;
revoke execute on function public.push_payload_for_order(uuid) from public, anon, authenticated;
grant execute on function public.push_payload_for_order(uuid) to service_role;

-- Pedido novo → chama a função de push (só se a loja tiver aparelho inscrito)
create or replace function public.notify_new_order()
returns trigger language plpgsql security definer set search_path = public, vault, extensions as $$
declare
    v_secret text;
begin
    if not exists (select 1 from public.push_subscriptions where store_id = new.store_id) then
        return new;
    end if;
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_trigger_secret';
    if v_secret is null then
        return new;
    end if;
    perform net.http_post(
        url := 'https://fdhnzdjxbztyomzhunxw.supabase.co/functions/v1/notify-new-order',
        body := jsonb_build_object('order_id', new.id),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret)
    );
    return new;
exception when others then
    -- Push nunca pode impedir o pedido de ser criado
    return new;
end;
$$;
revoke execute on function public.notify_new_order() from public, anon, authenticated;

drop trigger if exists orders_notify_new on public.orders;
create trigger orders_notify_new after insert on public.orders
    for each row execute function public.notify_new_order();
