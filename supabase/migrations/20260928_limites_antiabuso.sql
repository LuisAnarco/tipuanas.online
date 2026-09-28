-- Limites contra abuso nas funções públicas (cliente não tem login):
-- - no máximo 5 pedidos por WhatsApp a cada 10 minutos (too_many_orders);
-- - no máximo 3 anúncios no mural por WhatsApp a cada 24 horas (too_many_posts).
-- Feito com gatilho para valer em qualquer caminho de inserção.

create or replace function public.limit_orders_per_phone()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    v_phone text := new.delivery_address->>'client_phone';
begin
    if v_phone is not null and (
        select count(*) from public.orders
         where delivery_address->>'client_phone' = v_phone
           and created_at > now() - interval '10 minutes'
    ) >= 5 then
        raise exception 'too_many_orders';
    end if;
    return new;
end;
$$;

drop trigger if exists orders_limit_per_phone on public.orders;
create trigger orders_limit_per_phone before insert on public.orders
    for each row execute function public.limit_orders_per_phone();

create or replace function public.limit_posts_per_phone()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    if (select count(*) from public.community_posts
         where author_whatsapp = new.author_whatsapp
           and created_at > now() - interval '24 hours') >= 3 then
        raise exception 'too_many_posts';
    end if;
    return new;
end;
$$;

drop trigger if exists community_posts_limit_per_phone on public.community_posts;
create trigger community_posts_limit_per_phone before insert on public.community_posts
    for each row execute function public.limit_posts_per_phone();

create index if not exists community_posts_author_idx on public.community_posts (author_whatsapp, created_at);

-- Funções de gatilho não são chamáveis pela API
revoke execute on function public.limit_orders_per_phone() from public, anon, authenticated;
revoke execute on function public.limit_posts_per_phone() from public, anon, authenticated;
