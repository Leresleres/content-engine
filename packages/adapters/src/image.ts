import { loadEnv } from "./env.js";
import { AdapterError, classifyHttp, isStructuralQuota } from "./errors.js";
import { alertSink } from "./alerts.js";
import { registerProvider, runWithFailover, type FailoverOptions } from "./registry.js";

loadEnv();

export type ImageInput = {
  prompt: string;
  /** referência de estilo (ex.: ref.png em base64) — habilita style transfer. */
  refImageB64?: string;
  refMime?: string;
  aspect?: "1:1" | "9:16" | "4:5" | "16:9";
};
export type ImageResult = { bytes: Buffer; mime: string; provider: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST JSON com retry de 5xx/rede; erro definitivo vira AdapterError classificado. */
async function fetchJson(
  provider: string,
  url: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<Record<string, unknown>> {
  const maxAttempts = 3;
  let lastErr = "";
  for (let i = 0; i < maxAttempts; i++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
    } catch (e) {
      lastErr = (e as Error).message;
      if (i < maxAttempts - 1) {
        await sleep(1200 * 2 ** i);
        continue;
      }
      throw new AdapterError({ kind: "transient", provider, message: `rede: ${lastErr}` });
    }
    if (res.ok) return (await res.json()) as Record<string, unknown>;
    const detail = await res.text().catch(() => "");
    if (res.status >= 500 && i < maxAttempts - 1) {
      await sleep(1200 * 2 ** i);
      continue;
    }
    const kind = classifyHttp(res.status, detail);
    throw new AdapterError({ kind, provider, status: res.status, message: detail.slice(0, 300), structural: isStructuralQuota(detail) });
  }
  throw new AdapterError({ kind: "transient", provider, message: lastErr || "falhou" });
}

// ── Gemini "Nano Banana" (gemini-2.5-flash-image) — aceita imagem de referência ──

const geminiImageModel = () => process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

async function geminiNanoBanana(input: ImageInput): Promise<ImageResult> {
  const id = "gemini-nano-banana";
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AdapterError({ kind: "auth", provider: id, message: "GEMINI_API_KEY ausente" });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiImageModel()}:generateContent?key=${key}`;
  const parts: unknown[] = [{ text: input.prompt }];
  if (input.refImageB64) parts.push({ inlineData: { mimeType: input.refMime || "image/png", data: input.refImageB64 } });

  const json = await fetchJson(id, url, { contents: [{ parts }], generationConfig: { responseModalities: ["IMAGE"] } });
  const candidates = (json.candidates ?? []) as Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }>;
  const part = candidates[0]?.content?.parts?.find((p) => p?.inlineData?.data);
  if (!part?.inlineData?.data) throw new AdapterError({ kind: "transient", provider: id, message: "resposta sem imagem" });
  return { bytes: Buffer.from(part.inlineData.data, "base64"), mime: part.inlineData.mimeType || "image/png", provider: id };
}

/** Probe barato: valida key + existência do modelo SEM gastar cota de geração. */
async function geminiHealth(): Promise<boolean> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiImageModel()}?key=${key}`);
    return res.ok;
  } catch {
    return false;
  }
}

// ── Cloudflare Workers AI — FLUX.1 [schnell]. Text-to-image puro (sem referência) ──

async function cloudflareFlux(input: ImageInput): Promise<ImageResult> {
  const id = "cloudflare-flux";
  const acct = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!acct || !token) throw new AdapterError({ kind: "auth", provider: id, message: "CLOUDFLARE_ACCOUNT_ID/_API_TOKEN ausentes" });
  const model = process.env.CLOUDFLARE_IMAGE_MODEL || "@cf/black-forest-labs/flux-1-schnell";
  const url = `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/${model}`;

  const json = await fetchJson(id, url, { prompt: input.prompt }, { Authorization: `Bearer ${token}` });
  const result = (json.result ?? {}) as { image?: string };
  if (!result.image) throw new AdapterError({ kind: "transient", provider: id, message: "resposta sem imagem" });
  return { bytes: Buffer.from(result.image, "base64"), mime: "image/jpeg", provider: id };
}

/** Probe barato: valida token consultando o catálogo de modelos (sem gastar neurons). */
async function cloudflareHealth(): Promise<boolean> {
  const acct = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!acct || !token) return false;
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/ai/models/search?per_page=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

let registered = false;
/** Registra os providers de imagem (idempotente). Nano Banana primeiro, Flux de fallback. */
export function registerImageProviders(): void {
  if (registered) return;
  registered = true;
  registerProvider({
    id: "gemini-nano-banana",
    capability: "image",
    priority: 10,
    free: true,
    requiresCard: false,
    call: (i) => geminiNanoBanana(i as ImageInput),
    health: geminiHealth,
  });
  registerProvider({
    id: "cloudflare-flux",
    capability: "image",
    priority: 20,
    free: true,
    requiresCard: false,
    call: (i) => cloudflareFlux(i as ImageInput),
    health: cloudflareHealth,
  });
}

/** Fachada: gera imagem com failover automático entre os providers grátis. */
export async function generateImage(input: ImageInput, opts: FailoverOptions = {}): Promise<ImageResult> {
  registerImageProviders();
  return runWithFailover<ImageResult>("image", input, { onEvent: alertSink("image"), ...opts });
}
