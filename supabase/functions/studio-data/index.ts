import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// studio-data: backend do Studio. service_role fica SÓ aqui (server-side); o SPA
// manda só o token (gate em studio_auth). Devolve saúde dos providers + inbox de
// aprovação e processa aprovar/reprovar.

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-studio-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function db(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function validToken(req: Request): Promise<boolean> {
  const token = req.headers.get("x-studio-token");
  if (!token) return false;
  const res = await db("studio_auth?select=token&id=eq.1");
  if (!res.ok) return false;
  const rows = (await res.json()) as Array<{ token: string }>;
  return rows?.[0]?.token === token;
}

Deno.serve(async (req) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!(await validToken(req))) return json({ error: "unauthorized" }, 401);

  try {
    if (req.method === "GET") {
      const [healthRes, inboxRes] = await Promise.all([
        db("provider_health?select=*&order=capability,provider_id"),
        db(
          "pautas?select=id,tipo,status,payload,score,created_at,roteiros(roteiro,compliance,status)&status=in.(nova,roteirizada,storyboard)&order=created_at.desc"
        ),
      ]);
      return json({
        health: healthRes.ok ? await healthRes.json() : [],
        inbox: inboxRes.ok ? await inboxRes.json() : [],
      });
    }

    if (req.method === "POST") {
      const { action, pautaId } = (await req.json().catch(() => ({}))) as { action?: string; pautaId?: number };
      if (!pautaId || (action !== "approve" && action !== "reject")) return json({ error: "bad request" }, 400);
      const status = action === "approve" ? "aprovada" : "reprovada";
      const res = await db(`pautas?id=eq.${pautaId}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
      });
      if (!res.ok) return json({ error: await res.text() }, 500);
      return json({ ok: true, pauta: (await res.json())[0] });
    }

    return json({ error: "method not allowed" }, 405);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
