-- Painel admin: ver e definir o dono de cada loja pelo e-mail.
-- O e-mail fica em auth.users, que o navegador não acessa: por isso funções
-- security definer, liberadas só para admin.

create or replace function public.admin_store_owners()
returns table (store_id uuid, owner_email text)
language plpgsql stable security definer set search_path = public as $$
begin
    if not public.is_admin() then
        raise exception 'admin_only';
    end if;
    return query
        select s.id, u.email::text
          from public.stores s
          left join auth.users u on u.id = s.owner_id;
end;
$$;

-- p_email vazio/nulo remove o dono (a loja volta a poder ser vinculada)
create or replace function public.admin_set_store_owner(p_store_id uuid, p_email text)
returns text
language plpgsql security definer set search_path = public as $$
declare
    v_user uuid;
begin
    if not public.is_admin() then
        raise exception 'admin_only';
    end if;
    if coalesce(trim(p_email), '') = '' then
        update public.stores set owner_id = null where id = p_store_id;
        return null;
    end if;
    select id into v_user from auth.users where lower(email) = lower(trim(p_email)) limit 1;
    if v_user is null then
        raise exception 'user_not_found';
    end if;
    update public.stores set owner_id = v_user where id = p_store_id;
    update public.profiles set role = 'gestor' where id = v_user and role = 'cliente';
    return lower(trim(p_email));
end;
$$;

revoke execute on function public.admin_store_owners() from public, anon;
revoke execute on function public.admin_set_store_owner(uuid, text) from public, anon;
grant execute on function public.admin_store_owners() to authenticated;
grant execute on function public.admin_set_store_owner(uuid, text) to authenticated;
