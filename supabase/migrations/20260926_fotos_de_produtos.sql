-- Fotos de produtos no Supabase Storage.
-- Bucket público para leitura (a vitrine mostra as fotos sem login), até 2 MB,
-- só imagens. Caminho obrigatório: <store_id>/<arquivo>. Só o dono da loja
-- (ou o admin) envia, troca ou apaga arquivos da pasta da própria loja.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Primeiro trecho do caminho como uuid da loja (nulo se não for um uuid válido)
create or replace function public.storage_store_id(p_name text)
returns uuid language plpgsql immutable set search_path = public as $$
begin
    return split_part(p_name, '/', 1)::uuid;
exception when others then
    return null;
end;
$$;

create policy "Fotos de produto: dono envia" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'product-images' and (public.owns_store(public.storage_store_id(name)) or public.is_admin()));

create policy "Fotos de produto: dono atualiza" on storage.objects
    for update to authenticated
    using (bucket_id = 'product-images' and (public.owns_store(public.storage_store_id(name)) or public.is_admin()))
    with check (bucket_id = 'product-images' and (public.owns_store(public.storage_store_id(name)) or public.is_admin()));

create policy "Fotos de produto: dono apaga" on storage.objects
    for delete to authenticated
    using (bucket_id = 'product-images' and (public.owns_store(public.storage_store_id(name)) or public.is_admin()));
