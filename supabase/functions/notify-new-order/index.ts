// Envia notificação push para os aparelhos inscritos da loja quando entra um pedido novo.
// Chamada pelo gatilho orders_notify_new (pg_net) com o cabeçalho x-push-secret.
// Chaves VAPID e segredo ficam no vault do banco (lidos por push_payload_for_order).
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const brl = (v: number) => "R$ " + Number(v || 0).toFixed(2).replace(".", ",");

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("método não permitido", { status: 405 });
  let orderId: string | undefined;
  try {
    ({ order_id: orderId } = await req.json());
  } catch {
    return new Response("json inválido", { status: 400 });
  }
  if (!orderId) return new Response("order_id obrigatório", { status: 400 });

  const { data: p, error } = await supabase.rpc("push_payload_for_order", { p_order_id: orderId });
  if (error || !p) return new Response("pedido não encontrado", { status: 404 });
  if (!p.trigger_secret || req.headers.get("x-push-secret") !== p.trigger_secret) {
    return new Response("não autorizado", { status: 401 });
  }

  webpush.setVapidDetails("mailto:contato@tipuanas.online", p.vapid_public_key, p.vapid_private_key);

  const first = (p.order.client_name || "").split(" ")[0];
  const payload = JSON.stringify({
    title: `🛎️ Novo pedido — ${p.store.name}`,
    body: `${first ? first + " • " : ""}${brl(p.order.total)} • ${p.order.is_takeout ? "Retirada" : "Entrega"}`,
    url: `04_merchant_portal.html?store=${p.store.id}`,
    tag: `pedido-${p.order.id}`,
  });

  let sent = 0;
  const gone: string[] = [];
  await Promise.all((p.subscriptions || []).map(async (sub: { id: string; endpoint: string; keys: unknown }) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys } as never, payload, { TTL: 3600, urgency: "high" });
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) gone.push(sub.id); // inscrição expirada
      else console.error("push falhou", status, (e as Error).message);
    }
  }));
  if (gone.length) await supabase.from("push_subscriptions").delete().in("id", gone);

  return new Response(JSON.stringify({ sent, removed: gone.length }), { headers: { "Content-Type": "application/json" } });
});
