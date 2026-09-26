-- Mural: posts expiram em 30 dias; o autor remove o próprio post com uma chave
-- secreta gerada na publicação; o admin remove qualquer post (política existente).

alter table public.community_posts add column if not exists expires_at timestamptz;
update public.community_posts set expires_at = created_at + interval '30 days' where expires_at is null;
alter table public.community_posts alter column expires_at set default (now() + interval '30 days');
alter table public.community_posts alter column expires_at set not null;

-- Leitura pública passa a esconder posts vencidos (restringe, não afrouxa)
drop policy if exists "Mural leitura publica" on public.community_posts;
create policy "Mural leitura publica" on public.community_posts
    for select using (is_active and expires_at > now());

-- Chaves de remoção ficam numa tabela sem acesso pela API (só funções internas)
create table if not exists public.community_post_keys (
    post_id uuid primary key references public.community_posts(id) on delete cascade,
    manage_key uuid not null default gen_random_uuid()
);
alter table public.community_post_keys enable row level security;

create or replace function public.create_community_post(
    p_type text, p_title text, p_description text, p_price numeric, p_author_name text, p_author_whatsapp text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_id uuid;
    v_key uuid;
    v_phone text := regexp_replace(coalesce(p_author_whatsapp, ''), '\D', '', 'g');
begin
    if p_type not in ('desapego', 'procuro') then
        raise exception 'invalid_post';
    end if;
    if trim(coalesce(p_title, '')) = '' or trim(coalesce(p_author_name, '')) = '' or length(v_phone) not between 10 and 13 then
        raise exception 'invalid_post';
    end if;
    if p_price is not null and p_price < 0 then
        raise exception 'invalid_post';
    end if;

    insert into public.community_posts (post_type, title, description, price, author_name, author_whatsapp, is_active)
    values (p_type::community_post_type, left(trim(p_title), 120), nullif(left(trim(coalesce(p_description, '')), 1000), ''),
            p_price, left(trim(p_author_name), 80), v_phone, true)
    returning id into v_id;

    insert into public.community_post_keys (post_id) values (v_id) returning manage_key into v_key;
    return jsonb_build_object('id', v_id, 'key', v_key);
end;
$$;

create or replace function public.remove_community_post(p_id uuid, p_key uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
    update public.community_posts p
       set is_active = false
      from public.community_post_keys k
     where p.id = p_id and k.post_id = p.id and k.manage_key = p_key;
    return found;
end;
$$;
