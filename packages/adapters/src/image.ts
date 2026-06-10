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
    // 429 NÃO-estrutural = rate-limit passageiro (ex.: klein ~1 gen/min no free):
    // esperar e insistir no MESMO provider preserva qualidade; cair pro fallback
    // trocaria o primário por um modelo pior à toa. Estrutural (cota 0) não re-tenta.
    const rateLimited = res.status === 429 && !isStructuralQuota(detail);
    if ((res.status >= 500 || rateLimited) && i < maxAttempts - 1) {
      const retryAfterMs = Number(res.headers.get("retry-after")) * 1000;
      const backoff = rateLimited ? 25_000 * (i + 1) : 1200 * 2 ** i;
      await sleep(retryAfterMs > 0 ? Math.min(retryAfterMs, 90_000) : backoff);
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
  const dims: Record<string, [number, number]> = {
    "9:16": [768, 1344],
    "1:1": [1024, 1024],
    "4:5": [832, 1040],
    "16:9": [1344, 768],
  };
  const [width, height] = dims[input.aspect ?? "9:16"] ?? [768, 1344];

  const json = await fetchJson(id, url, { prompt: input.prompt, width, height, steps: 6 }, { Authorization: `Bearer ${token}` });
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

// ── NVIDIA NIM (build.nvidia.com) — imagem de alta qualidade, hospedada, grátis (créditos) ──
// API OpenAI-compatible. Modelos: qwen/qwen-image (campeão em "sem texto"/paleta),
// black-forest-labs/flux.2-klein etc. Sem GPU. Créditos FINITOS → failover cobre quando acabam.

const nvidiaBase = () => process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";

async function nvidiaNim(input: ImageInput, id: string, model: string): Promise<ImageResult> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new AdapterError({ kind: "auth", provider: id, message: "NVIDIA_API_KEY ausente" });
  const url = process.env.NVIDIA_IMAGE_URL;
  if (!url) throw new AdapterError({ kind: "auth", provider: id, message: "NVIDIA_IMAGE_URL não configurado (cole o endpoint do model card)" });
  const sizes: Record<string, string> = { "9:16": "768x1344", "1:1": "1024x1024", "4:5": "832x1040", "16:9": "1344x768" };
  const size = sizes[input.aspect ?? "9:16"] ?? "768x1344";

  // Dois dialetos de endpoint hospedado:
  //  • /genai/ (nativo NIM, ex. flux.2-klein-4b): body {prompt,width,height,steps,seed},
  //    SÓ 1024x1024 e steps<=4; o modelo vem do path do URL. Resposta artifacts[].base64.
  //  • OpenAI images (/images/generations): body {model,prompt,size,...}, data[].b64_json.
  const body = url.includes("/genai/")
    ? // limite duro do endpoint: prompt <= 800 chars (422 string_too_long acima disso)
      { prompt: input.prompt.slice(0, 800), width: 1024, height: 1024, steps: 4, seed: 0 }
    : { model, prompt: input.prompt, size, n: 1, response_format: "b64_json" };
  const json = await fetchJson(id, url, body, { Authorization: `Bearer ${key}` });
  // tolera os dois formatos: OpenAI (data[].b64_json) e genai nativo (artifacts[].base64)
  const data = (json.data ?? []) as Array<{ b64_json?: string }>;
  const artifacts = (json.artifacts ?? []) as Array<{ base64?: string; finishReason?: string }>;
  const b64 = data[0]?.b64_json || artifacts[0]?.base64;
  if (!b64) {
    // 200 com base64 vazio = moderação do provider (ex.: finishReason CONTENT_FILTERED).
    // Trocar de provider ajuda (filtros diferem); mensagem explícita p/ diagnóstico.
    const reason = artifacts[0]?.finishReason;
    throw new AdapterError({
      kind: "transient",
      provider: id,
      message: reason === "CONTENT_FILTERED" ? "prompt bloqueado pelo filtro de conteúdo do provider" : "resposta sem imagem",
    });
  }
  return { bytes: Buffer.from(b64, "base64"), mime: "image/png", provider: id };
}

/** Probe barato: lista modelos (não gasta créditos de geração). */
async function nvidiaHealth(): Promise<boolean> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch(`${nvidiaBase()}/models`, { headers: { Authorization: `Bearer ${key}` } });
    return res.ok;
  } catch {
    return false;
  }
}

let registered = false;
/**
 * Registra os providers de imagem (idempotente), do MELHOR grátis ao inferior:
 * NIM Qwen-Image → NIM FLUX.2-klein → Gemini Nano Banana → Cloudflare Flux schnell.
 * O failover só desce de tier quando o de cima falha/esgota.
 */
export function registerImageProviders(): void {
  if (registered) return;
  registered = true;
  // NVIDIA NIM de imagem só entra quando o invoke URL do model card está em
  // NVIDIA_IMAGE_URL. Verificado 2026-06-10: qwen-image NÃO tem endpoint hospedado
  // (model card é self-host; nvcfFunctionId=None) — o melhor hospedado grátis é o
  // FLUX.2-klein-4b via https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b
  if (process.env.NVIDIA_IMAGE_URL) {
    registerProvider({
      id: "nvidia-nim-image",
      capability: "image",
      priority: 5,
      free: true,
      requiresCard: false,
      call: (i) => nvidiaNim(i as ImageInput, "nvidia-nim-image", process.env.NVIDIA_IMAGE_MODEL || "black-forest-labs/flux.2-klein-4b"),
      health: nvidiaHealth,
    });
  }
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
