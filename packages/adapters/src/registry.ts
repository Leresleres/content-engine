import { AdapterError, isAlertKind, type ErrorKind } from "./errors.js";

/**
 * Registry de providers por capacidade + runner de failover.
 *
 * Cada capacidade (image/animate/llm/...) tem uma lista ordenada de providers
 * grátis. `runWithFailover` tenta em ordem; se um cair com erro "trocável"
 * (quota/auth/deprecated/payment/transient) pula pro próximo SEM derrubar o
 * pipeline. `fatal` (bug nosso) aborta. Esgotou todos → lança + evento all_down.
 *
 * A saúde é em memória, mas com um SINK opcional (health-store.ts) que persiste
 * em `provider_health` no Supabase; `hydrateHealth` recarrega no boot.
 */

export type Capability = "image" | "animate" | "llm" | "vision" | "tts";

export type HealthStatus = "ok" | "degraded" | "down" | "unknown";

export type ProviderHealth = {
  status: HealthStatus;
  /** false quando o erro indica que deixou de ser grátis (payment/auth). */
  freeOk: boolean;
  lastOkAt?: number;
  lastError?: string;
  checkedAt: number;
};

export interface Provider<I = unknown, O = unknown> {
  id: string;
  capability: Capability;
  /** menor tenta primeiro. */
  priority: number;
  free: boolean;
  requiresCard: boolean;
  call(input: I): Promise<O>;
  /** probe barato p/ o heartbeat (true = ok). Opcional. */
  health?(): Promise<boolean>;
}

const registry = new Map<Capability, Provider[]>();
const healthState = new Map<string, ProviderHealth>();

/** Tempo que um provider "down" fica pulado antes de ser re-tentado. */
const DOWN_COOLDOWN_MS = Number(process.env.PROVIDER_COOLDOWN_MS || 60_000);

/** Destino opcional de persistência da saúde (ex.: Supabase). Ver health-store.ts. */
export type HealthSink = (id: string, capability: Capability | undefined, health: ProviderHealth) => void;
let healthSink: HealthSink | undefined;
export function setHealthSink(fn: HealthSink | undefined): void {
  healthSink = fn;
}

export function registerProvider(p: Provider): void {
  const list = registry.get(p.capability) ?? [];
  if (list.some((x) => x.id === p.id)) return; // idempotente
  list.push(p);
  registry.set(p.capability, list);
}

/** Reseta tudo — usado pelos testes. */
export function clearRegistry(): void {
  registry.clear();
  healthState.clear();
}

export function getHealth(id: string): ProviderHealth {
  return healthState.get(id) ?? { status: "unknown", freeOk: true, checkedAt: 0 };
}

export function setHealth(id: string, partial: Partial<ProviderHealth>): void {
  const merged = { ...getHealth(id), ...partial, checkedAt: Date.now() };
  healthState.set(id, merged);
  try {
    healthSink?.(id, providerCapability(id), merged);
  } catch {
    /* persistência nunca derruba o pipeline */
  }
}

/** Snapshot de toda a saúde — o painel do Studio e o heartbeat leem isto. */
export function allHealth(): Record<string, ProviderHealth> {
  return Object.fromEntries(healthState);
}

/** Capacidade de um provider registrado (p/ a persistência saber em qual linha gravar). */
export function providerCapability(id: string): Capability | undefined {
  for (const list of registry.values()) {
    const p = list.find((x) => x.id === id);
    if (p) return p.capability;
  }
  return undefined;
}

/** Hidrata a saúde em memória a partir de registros persistidos (ex.: Supabase no boot). */
export function hydrateHealth(records: Array<{ id: string; health: ProviderHealth }>): void {
  for (const r of records) healthState.set(r.id, r.health);
}

/** Providers de uma capacidade, ordenados (override por env > priority). */
export function getProviders(capability: Capability): Provider[] {
  const list = [...(registry.get(capability) ?? [])];
  const order = process.env[`${capability.toUpperCase()}_PROVIDER_ORDER`]
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (order?.length) {
    const rank = new Map(order.map((id, i) => [id, i]));
    return list.sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999) || a.priority - b.priority);
  }
  return list.sort((a, b) => a.priority - b.priority);
}

export type FailoverEvent =
  | { type: "attempt"; provider: string; capability: Capability }
  | { type: "provider_failed"; provider: string; kind: ErrorKind; structural: boolean; message: string; alert: boolean }
  | { type: "fallback_success"; provider: string; primary: string; capability: Capability }
  | { type: "all_down"; capability: Capability; tried: string[] };

export type FailoverOptions = {
  /** liga providers pagos / com cartão. Default: env ALLOW_PAID === "true". */
  allowPaid?: boolean;
  /** observador de eventos (alertas/log). Não pode derrubar o pipeline. */
  onEvent?: (e: FailoverEvent) => void | Promise<void>;
};

async function emit(opts: FailoverOptions, e: FailoverEvent): Promise<void> {
  try {
    await opts.onEvent?.(e);
  } catch {
    /* alerta nunca derruba o pipeline */
  }
}

/**
 * Executa `input` na capacidade pedida tentando os providers em ordem, com
 * failover automático e imediato. Pula "down" recentes (cooldown), mas nunca
 * esvazia a lista. `fatal` aborta. Esgotou todos → lança + evento all_down.
 */
export async function runWithFailover<O = unknown>(
  capability: Capability,
  input: unknown,
  opts: FailoverOptions = {}
): Promise<O> {
  const allowPaid = opts.allowPaid ?? process.env.ALLOW_PAID === "true";
  const eligible = getProviders(capability).filter(
    (p) => (p.free || allowPaid) && (!p.requiresCard || allowPaid)
  );
  if (!eligible.length) {
    throw new Error(`Sem provider elegível p/ "${capability}" (só grátis; ALLOW_PAID=${allowPaid}).`);
  }

  // pula "down" dentro do cooldown, mas nunca deixa a lista vazia
  const now = Date.now();
  const fresh = eligible.filter((p) => {
    const h = getHealth(p.id);
    return !(h.status === "down" && now - h.checkedAt < DOWN_COOLDOWN_MS);
  });
  const candidates = fresh.length ? fresh : eligible;

  const primaryId = candidates[0].id;
  const tried: string[] = [];
  let lastErr: unknown;

  for (const p of candidates) {
    tried.push(p.id);
    await emit(opts, { type: "attempt", provider: p.id, capability });
    try {
      const out = (await p.call(input)) as O;
      setHealth(p.id, { status: "ok", freeOk: true, lastOkAt: Date.now(), lastError: undefined });
      if (p.id !== primaryId) {
        await emit(opts, { type: "fallback_success", provider: p.id, primary: primaryId, capability });
      }
      return out;
    } catch (e) {
      lastErr = e;
      const kind: ErrorKind = e instanceof AdapterError ? e.kind : "transient";
      const structural = e instanceof AdapterError ? e.structural : false;
      const message = e instanceof Error ? e.message : String(e);
      const down = kind === "auth" || kind === "deprecated" || kind === "payment";
      setHealth(p.id, {
        status: kind === "fatal" ? getHealth(p.id).status : down ? "down" : "degraded",
        freeOk: !(kind === "payment" || kind === "auth"),
        lastError: message,
      });
      await emit(opts, { type: "provider_failed", provider: p.id, kind, structural, message, alert: isAlertKind(kind, structural) });
      if (kind === "fatal") throw e; // não adianta trocar de provider
      // senão: segue pro próximo
    }
  }

  await emit(opts, { type: "all_down", capability, tried });
  throw new Error(
    `Todos os providers de "${capability}" falharam (${tried.join(", ")}). Último: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`
  );
}
