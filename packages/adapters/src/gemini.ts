import { loadEnv } from "./env.js";
import { AdapterError, classifyHttp, isStructuralQuota } from "./errors.js";

loadEnv();

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// Free tier (2026): geração 2.5. Os 2.0-flash estão com cota grátis 0 e os 1.5 foram aposentados.
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function apiKey(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY ausente no .env do content-engine.");
  return k;
}

type TextPart = { text: string };
type ImagePart = { inlineData: { mimeType: string; data: string } };
type Part = TextPart | ImagePart;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function generate(parts: Part[], responseSchema?: unknown): Promise<string> {
  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.7,
      ...(responseSchema ? { responseSchema } : {}),
    },
  };
  const url = `${BASE}/${MODEL}:generateContent?key=${apiKey()}`;

  const maxAttempts = 4;
  let lastErr = "";
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      lastErr = `rede: ${(e as Error).message}`;
      if (attempt < maxAttempts - 1) {
        await sleep(1500 * 2 ** attempt);
        continue;
      }
      throw new AdapterError({ kind: "transient", provider: "gemini", message: `${MODEL} ${lastErr}` });
    }

    if (res.ok) {
      const json = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text =
        json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!text) {
        throw new AdapterError({ kind: "transient", provider: "gemini", message: "resposta sem texto. " + JSON.stringify(json).slice(0, 400) });
      }
      return text;
    }

    const detail = await res.text().catch(() => "");
    lastErr = `HTTP ${res.status}: ${detail.slice(0, 500)}`;
    // 5xx = sobrecarga transitória → backoff e retry. 4xx = definitivo (classificado na taxonomia).
    if (res.status >= 500 && attempt < maxAttempts - 1) {
      await sleep(1500 * 2 ** attempt);
      continue;
    }
    const kind = classifyHttp(res.status, detail);
    throw new AdapterError({ kind, provider: "gemini", status: res.status, message: `${MODEL}: ${detail.slice(0, 400)}`, structural: isStructuralQuota(detail) });
  }
  throw new AdapterError({ kind: "transient", provider: "gemini", message: `${MODEL} falhou após ${maxAttempts} tentativas. ${lastErr}` });
}

/** Gera JSON estruturado a partir de um prompt de texto. */
export async function geminiJSON<T>(prompt: string, responseSchema?: unknown): Promise<T> {
  const text = await generate([{ text: prompt }], responseSchema);
  return JSON.parse(text) as T;
}

/** Gera JSON estruturado a partir de um prompt + 1 imagem (base64). Para extração de estilo. */
export async function geminiVisionJSON<T>(
  prompt: string,
  imageBase64: string,
  mimeType: string,
  responseSchema?: unknown
): Promise<T> {
  const text = await generate(
    [{ text: prompt }, { inlineData: { mimeType, data: imageBase64 } }],
    responseSchema
  );
  return JSON.parse(text) as T;
}

export const geminiModel = MODEL;
