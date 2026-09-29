-- Limpeza de legado (item 17 do BACKLOG). Tudo vazio e sem uso no site nem em funções:
-- - express_jobs, ingredients, recipes: esboços antigos (corridas avulsas, estoque por insumo)
-- - trechos_codigo + buscar_codigo_referencia + extensão vector: busca de código por IA, nunca usada
-- - orders.courier_id: substituída por orders.courier_ref (couriers)
drop function if exists public.buscar_codigo_referencia(vector, integer);
drop table if exists public.recipes;
drop table if exists public.ingredients;
drop table if exists public.express_jobs;
drop table if exists public.trechos_codigo;
drop type if exists public.unit_type;
alter table public.orders drop column if exists courier_id;
drop extension if exists vector;
