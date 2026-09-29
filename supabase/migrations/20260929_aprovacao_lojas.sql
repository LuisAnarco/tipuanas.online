-- Aprovação de lojas novas (item 23 do BACKLOG)
-- Loja criada por lojista nasce "pendente" e desativada (is_active = false): fica fora da
-- vitrine e não recebe pedido, cupom nem orçamento (todas as funções já exigem is_active).
-- O lojista já pode montar o cardápio enquanto isso. Só o admin aprova ou recusa.

alter table public.stores
    add column if not exists approval_status text not null default 'aprovada';

alter table public.stores drop constraint if exists stores_approval_status_check;
alter table public.stores
    add constraint stores_approval_status_check check (approval_status in ('pendente', 'aprovada', 'recusada'));

create or replace function public.stores_insert_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if current_user not in ('anon', 'authenticated') or public.is_admin() then
        return new;
    end if;
    new.approval_status := 'pendente';
    new.is_active := false;
    return new;
end;
$$;

drop trigger if exists stores_insert_guard on public.stores;
create trigger stores_insert_guard before insert on public.stores
    for each row execute function public.stores_insert_guard();

-- O dono não muda a própria aprovação (o is_active já era protegido)
create or replace function public.stores_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if current_user not in ('anon', 'authenticated') or public.is_admin() then
        return new;
    end if;
    if new.owner_id is distinct from old.owner_id
       or new.is_active is distinct from old.is_active
       or new.approval_status is distinct from old.approval_status then
        raise exception 'Somente o admin pode alterar o dono, a ativação ou a aprovação da loja';
    end if;
    return new;
end;
$$;
