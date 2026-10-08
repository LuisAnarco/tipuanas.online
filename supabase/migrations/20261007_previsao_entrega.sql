-- Previsão de entrega no acompanhamento (item 28a do BACKLOG)
-- get_order_public passa a devolver o tempo médio de preparo da loja (já público na vitrine),
-- para a página do pedido calcular "chega entre 19h40 e 19h55". O resto da função não muda.

create or replace function public.get_order_public(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
    select jsonb_build_object('id', o.id, 'store_id', o.store_id, 'status', o.status, 'total_amount', o.total_amount,
        'delivery_fee', o.delivery_fee, 'is_takeout', o.is_takeout, 'delivery_pin', o.delivery_pin, 'created_at', o.created_at,
        'delivery_address', jsonb_build_object('address', o.delivery_address->>'address'),
        'stores', jsonb_build_object('name', s.name, 'whatsapp_number', s.whatsapp_number, 'address_line', s.address_line,
            'avg_prep_time_minutes', s.avg_prep_time_minutes),
        'courier', case when c.id is not null then jsonb_build_object('name', split_part(trim(c.name), ' ', 1), 'vehicle', c.vehicle) end,
        'order_items', coalesce((select jsonb_agg(jsonb_build_object('quantity', oi.quantity, 'unit_price', oi.unit_price, 'options', oi.options, 'note', oi.note, 'products', jsonb_build_object('name', pr.name)))
              from public.order_items oi left join public.products pr on pr.id = oi.product_id where oi.order_id = o.id), '[]'::jsonb),
        'has_review', exists (select 1 from public.reviews r where r.order_id = o.id))
      from public.orders o left join public.stores s on s.id = o.store_id left join public.couriers c on c.id = o.courier_ref
     where o.id = p_id;
$$;
