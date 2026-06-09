import { loadEnv } from "./env.js";
import { hydrateHealth, setHealthSink, type Capability, type ProviderHealth } from "./registry.js";

loadEnv();

/**
 * Persistência da saúde dos providers em `provider_health` (Supabase, via
 * PostgREST). Sem dependência nova — fetch puro com a service_role key
 * (server-side: heartbeat / worker). No-op gracioso se a env não estiver setada,
 * pra dev local seguir funcionando (só não persiste entre runs).
 */
function creds(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

type Row = {
  provider_id: string;
  capability: string;
  status: string;
  free_ok: boolean;
  last_ok_at: string | null;
  last_error: string | null;
  checked_at: string;
};

/** Upsert da saúde de 1 provider. No-op sem service_role. */
export async function persistHealth(id: string, capability: Capability | undefined, h: ProviderHealth): Promise<void> {
  const c = creds();
  if (!c) return;
  const row: Row = {
    provider_id: id,
    capability: capability ?? "unknown",
    status: h.status,
    free_ok: h.freeOk,
    last_ok_at: h.lastOkAt ? new Date(h.lastOkAt).toISOString() : null,
    last_error: h.lastError ?? null,
    checked_at: new Date(h.checkedAt || Date.now()).toISOString(),
  };
  try {
    const res = await fetch(`${c.url}/rest/v1/provider_health`, {
      method: "POST",
      headers: {
        apikey: c.key,
        Authorization: `Bearer ${c.key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(row),
    });
    if (!res.ok) console.warn(`[health-store] persist ${id}: HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
  } catch (e) {
    console.warn("[health-store] persist falhou:", e instanceof Error ? e.message : e);
  }
}

/** Lê toda a saúde persistida e hidrata o registry em memória. No-op sem service_role. */
export async function loadHealth(): Promise<void> {
  const c = creds();
  if (!c) return;
  try {
    const res = await fetch(`${c.url}/rest/v1/provider_health?select=*`, {
      headers: { apikey: c.key, Authorization: `Bearer ${c.key}` },
    });
    if (!res.ok) return;
    const rows = (await res.json()) as Row[];
    hydrateHealth(
      rows.map((r) => ({
        id: r.provider_id,
        health: {
          status: r.status as ProviderHealth["status"],
          freeOk: r.free_ok,
          lastOkAt: r.last_ok_at ? Date.parse(r.last_ok_at) : undefined,
          lastError: r.last_error ?? undefined,
          checkedAt: Date.parse(r.checked_at),
        },
      }))
    );
  } catch (e) {
    console.warn("[health-store] load falhou:", e instanceof Error ? e.message : e);
  }
}

/** Liga a persistência automática: toda mudança de saúde faz upsert (fire-and-forget). */
export function enableHealthPersistence(): void {
  setHealthSink((id, capability, h) => {
    void persistHealth(id, capability, h);
  });
}
