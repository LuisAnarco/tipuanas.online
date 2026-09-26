-- Cliente (sem login) cancela o próprio pedido pelo link de acompanhamento,
-- mas só enquanto a loja ainda não começou a preparar (status 'novo').
create or replace function public.cancel_order_public(p_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
    update public.orders
       set status = 'cancelado'
     where id = p_id and status = 'novo';
    return found;
end;
$$;
