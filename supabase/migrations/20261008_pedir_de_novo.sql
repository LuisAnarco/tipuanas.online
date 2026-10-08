-- "Pedir de novo" em Meus pedidos (item 29 do BACKLOG)
-- order_summaries (usada por get_orders_public e get_orders_by_phone) passa a devolver, além do
-- resumo de antes, o que a tela precisa para refazer a sacola: id e slug da loja e, por item, o
-- id do produto, o preço pago, as opções escolhidas e a observação. São dados do próprio pedido
-- (mesmo nível do get_order_public); continua sem endereço, telefone ou PIN.

create or replace function public.order_summaries(p_ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
    select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
            'id', o.id,
            'status', o.status,
            'total_amount', o.total_amount,
            'created_at', o.created_at,
            'is_takeout', o.is_takeout,
            'store_id', o.store_id,
            'stores', jsonb_build_object('name', s.name, 'slug', s.slug),
            'order_items', coalesce((
                select jsonb_agg(jsonb_build_object('quantity', oi.quantity, 'product_id', oi.product_id,
                    'unit_price', oi.unit_price, 'options', oi.options, 'note', oi.note,
                    'products', jsonb_build_object('name', pr.name)))
                  from public.order_items oi left join public.products pr on pr.id = oi.product_id
                 where oi.order_id = o.id), '[]'::jsonb)
        ) as x
          from public.orders o
          left join public.stores s on s.id = o.store_id
         where o.id = any(p_ids[1:50])
      ) t;
$$;
