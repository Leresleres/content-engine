/**
 * Taxonomia de erro dos adapters de provider. Normaliza o que cada API devolve
 * num punhado de "kinds" que o runner de failover sabe interpretar:
 * trocar de provider? alertar o dono? ou é bug nosso (não adianta trocar)?
 */
export type ErrorKind =
  | "transient" // 5xx / rede / timeout — já passou pelo retry do adapter; tenta outro provider
  | "quota" // 429 / cota grátis estourada — troca de provider
  | "auth" // 401/403 / chave morta ou cartão exigido — troca + ALERTA
  | "deprecated" // 404 / modelo ou endpoint sumiu — troca + ALERTA
  | "payment" // 402 / deixou de ser grátis — troca + ALERTA
  | "fatal"; // 400 / requisição inválida (bug nosso) — NÃO troca

export class AdapterError extends Error {
  readonly kind: ErrorKind;
  readonly provider: string;
  readonly status?: number;
  /** quota *estrutural* (ex.: Gemini free `limit: 0`) — vale alerta, não é só rate-limit. */
  readonly structural: boolean;

  constructor(opts: {
    kind: ErrorKind;
    provider: string;
    message: string;
    status?: number;
    structural?: boolean;
  }) {
    super(`[${opts.provider}] ${opts.kind}${opts.status ? ` HTTP ${opts.status}` : ""}: ${opts.message}`);
    this.name = "AdapterError";
    this.kind = opts.kind;
    this.provider = opts.provider;
    this.status = opts.status;
    this.structural = opts.structural ?? false;
  }
}

const has = (body: string, ...needles: string[]): boolean => {
  const b = body.toLowerCase();
  return needles.some((n) => b.includes(n));
};

/** Detecta cota *estrutural* zero (modelo sem free tier), não só rate-limit transitório. */
export function isStructuralQuota(body: string): boolean {
  return /["']?limit["']?\s*:\s*["']?0\b/i.test(body) || has(body, "free tier is not", "no free quota", "quota_limit_value\":\"0");
}

/**
 * Classifica (status HTTP + corpo) num ErrorKind. Vale p/ qualquer provider REST —
 * a regra é por status, com o corpo desempatando os 400 ambíguos.
 */
export function classifyHttp(status: number, body: string): ErrorKind {
  if (status >= 500) return "transient";
  if (status === 429) return "quota";
  if (status === 402) return "payment";
  if (status === 404) return "deprecated";
  if (status === 401 || status === 403) return "auth";
  if (status === 400) {
    if (has(body, "api_key", "api key", "permission", "unauthenticated", "invalid authentication")) return "auth";
    if (has(body, "billing", "payment", "card")) return "payment";
    if (has(body, "quota", "exceeded", "exhausted", "limit")) return "quota";
    return "fatal";
  }
  return "fatal";
}

/** Erros estruturais que o dono precisa saber (algo mudou no provider, não só rate-limit). */
export function isAlertKind(kind: ErrorKind, structural = false): boolean {
  return kind === "auth" || kind === "deprecated" || kind === "payment" || (kind === "quota" && structural);
}
