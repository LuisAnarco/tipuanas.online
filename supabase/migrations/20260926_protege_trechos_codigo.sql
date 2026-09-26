-- Tabela da busca de código por IA (não usada pelo site): fecha o acesso público
-- e fixa o search_path da função que a consulta (alertas do Supabase).
alter table public.trechos_codigo enable row level security;
alter function public.buscar_codigo_referencia(vector, integer) set search_path = public;
