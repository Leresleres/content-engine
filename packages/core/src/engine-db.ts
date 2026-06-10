/**
 * Acesso ao Supabase do PRÓPRIO engine via PostgREST (service_role, server-side).
 * Usado pelo worker. Sem dependência nova — fetch puro. Lê SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY (o .env é carregado pelos adapters no import).
 */
function creds(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes no .env do engine.");
  return { url, key };
}

function db(path: string, init: RequestInit = {}): Promise<Response> {
  const c = creds();
  return fetch(`${c.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: c.key,
      Authorization: `Bearer ${c.key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export type PautaRow = { id: number; tipo: string; payload: Record<string, unknown>; score: number | null };

/** Pega as próximas pautas com status 'nova' (FIFO). */
export async function pullNovasPautas(limit = 5): Promise<PautaRow[]> {
  const res = await db(`pautas?select=id,tipo,payload,score&status=eq.nova&order=created_at.asc&limit=${limit}`);
  if (!res.ok) throw new Error(`pull pautas: HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return (await res.json()) as PautaRow[];
}

/** Grava o roteiro gerado (1 versão) ligado à pauta. */
export async function saveRoteiro(pautaId: number, roteiro: unknown): Promise<void> {
  const res = await db("roteiros", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ pauta_id: pautaId, roteiro, status: "pronto" }),
  });
  if (!res.ok) throw new Error(`save roteiro: HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
}

/** Atualiza o status da pauta (ex.: nova → roteirizada). */
export async function setPautaStatus(id: number, status: string): Promise<void> {
  const res = await db(`pautas?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`set status: HTTP ${res.status}`);
}
