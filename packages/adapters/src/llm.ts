import { loadEnv } from "./env.js";
import { AdapterError, classifyHttp, isStructuralQuota } from "./errors.js";
import { alertSink } from "./alerts.js";
import { geminiText } from "./gemini.js";
import { registerProvider, runWithFailover, type FailoverOptions } from "./registry.js";

loadEnv();

export type LlmInput = { prompt: string; schema?: unknown };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Chat completions OpenAI-compatible (NIM / OpenRouter) → texto da resposta. */
async function openaiChat(
  provider: string,
  baseUrl: string,
  key: string,
  model: string,
  prompt: string,
  extraHeaders: Record<string, string> = {}
): Promise<string> {
  const maxAttempts = 3;
  let lastErr = "";
  for (let i = 0; i < maxAttempts; i++) {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, ...extraHeaders },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          response_format: { type: "json_object" },
        }),
      });
    } catch (e) {
      lastErr = (e as Error).message;
      if (i < maxAttempts - 1) {
        await sleep(1200 * 2 ** i);
        continue;
      }
      throw new AdapterError({ kind: "transient", provider, message: `rede: ${lastErr}` });
    }
    if (res.ok) {
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const text = json.choices?.[0]?.message?.content ?? "";
      if (!text) throw new AdapterError({ kind: "transient", provider, message: "resposta vazia" });
      return text;
    }
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

// ── Providers (melhor grátis → inferior) ────────────────────────────────────

async function nvidiaLlm(input: LlmInput): Promise<string> {
  const id = "nvidia-llm";
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new AdapterError({ kind: "auth", provider: id, message: "NVIDIA_API_KEY ausente" });
  const base = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
  const model = process.env.NVIDIA_LLM_MODEL || "meta/llama-3.3-70b-instruct";
  return openaiChat(id, base, key, model, input.prompt);
}

async function openrouterLlm(input: LlmInput): Promise<string> {
  const id = "openrouter-llm";
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new AdapterError({ kind: "auth", provider: id, message: "OPENROUTER_API_KEY ausente" });
  const model = process.env.OPENROUTER_LLM_MODEL || "deepseek/deepseek-chat-v3.1:free";
  return openaiChat(id, "https://openrouter.ai/api/v1", key, model, input.prompt, {
    "HTTP-Referer": "https://precoremedio.com.br",
    "X-Title": "content-engine",
  });
}

async function geminiLlm(input: LlmInput): Promise<string> {
  return geminiText(input.prompt, input.schema);
}

async function nvidiaLlmHealth(): Promise<boolean> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return false;
  try {
    const r = await fetch(`${process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1"}/models`, { headers: { Authorization: `Bearer ${key}` } });
    return r.ok;
  } catch {
    return false;
  }
}
async function openrouterHealth(): Promise<boolean> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return false;
  try {
    const r = await fetch("https://openrouter.ai/api/v1/models", { headers: { Authorization: `Bearer ${key}` } });
    return r.ok;
  } catch {
    return false;
  }
}
async function geminiLlmHealth(): Promise<boolean> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return false;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${key}`);
    return r.ok;
  } catch {
    return false;
  }
}

let registered = false;
/** Registra os providers de LLM (idempotente), do melhor grátis ao inferior. */
export function registerLlmProviders(): void {
  if (registered) return;
  registered = true;
  registerProvider({ id: "nvidia-llm", capability: "llm", priority: 5, free: true, requiresCard: false, call: (i) => nvidiaLlm(i as LlmInput), health: nvidiaLlmHealth });
  registerProvider({ id: "openrouter-llm", capability: "llm", priority: 10, free: true, requiresCard: false, call: (i) => openrouterLlm(i as LlmInput), health: openrouterHealth });
  registerProvider({ id: "gemini-llm", capability: "llm", priority: 20, free: true, requiresCard: false, call: (i) => geminiLlm(i as LlmInput), health: geminiLlmHealth });
}

/** Alguns modelos embrulham o JSON em cercas ``` ou prosa — extrai o objeto. */
function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

/** Gera JSON estruturado com failover best-first (NIM → OpenRouter → Gemini). */
export async function generateJSON<T>(prompt: string, schema?: unknown, opts: FailoverOptions = {}): Promise<T> {
  registerLlmProviders();
  const text = await runWithFailover<string>("llm", { prompt, schema } as LlmInput, { onEvent: alertSink("llm"), ...opts });
  return JSON.parse(extractJson(text)) as T;
}
