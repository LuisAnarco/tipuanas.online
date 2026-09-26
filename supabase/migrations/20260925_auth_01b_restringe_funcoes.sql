-- Funções que só fazem sentido para quem está logado: tira do acesso anônimo.
-- (is_admin e can_review continuam liberadas: são chamadas dentro de gatilho/política
--  avaliados também para o papel anon.)
revoke execute on function public.claim_store(uuid) from public, anon;
revoke execute on function public.accept_ride(uuid) from public, anon;
revoke execute on function public.finish_ride(uuid, text) from public, anon;
revoke execute on function public.owns_store(uuid) from public, anon;
revoke execute on function public.my_courier_id() from public, anon;
grant execute on function public.claim_store(uuid) to authenticated;
grant execute on function public.accept_ride(uuid) to authenticated;
grant execute on function public.finish_ride(uuid, text) to authenticated;
grant execute on function public.owns_store(uuid) to authenticated;
grant execute on function public.my_courier_id() to authenticated;
