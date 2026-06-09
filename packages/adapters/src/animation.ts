import { loadEnv } from "./env.js";

loadEnv();

/**
 * Fila de animação (image-to-video). O engine ENFILEIRA o job aqui (render_jobs
 * kind='animate'); um worker GPU grátis (notebook Kaggle/Colab, ver
 * tools/animation) CONSOME, roda LTX I2V na still do mascote, sobe o clipe no
 * Storage e marca done. Backend de render-farm plugável: trocar LTX por outro
 * modelo é só mudar o notebook, sem tocar no engine.
 */

export type AnimationInput = {
  /** id da pauta dona da peça (render_jobs.pauta_id é obrigatório). */
  pautaId: number;
  /** chave da still no bucket privado 'media' (o worker baixa via service_role). */
  stillStorageKey: string;
  /** descrição do movimento desejado (idle/energia/câmera). */
  motionPrompt?: string;
  /** nº de frames (LTX gosta de 8n+1; 97 ≈ 4s @24fps). */
  numFrames?: number;
  aspect?: "9:16" | "1:1" | "16:9";
  styleProfileId?: string;
};

export type RenderJob = {
  id: number;
  kind: string;
  status: "queued" | "running" | "done" | "error";
  input: Record<string, unknown>;
  output_asset_id: string | null;
  cost_usd: number | null;
  error: string | null;
};

function creds(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes (uso server-side).");
  return { url, key };
}

async function rest(path: string, init: RequestInit = {}): Promise<unknown> {
  const c = creds();
  const res = await fetch(`${c.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: c.key,
      Authorization: `Bearer ${c.key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase REST ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  return res.status === 204 ? null : res.json();
}

/** Descritor de movimento on-brand p/ o I2V (não-factual, sem texto na arte). */
export function buildMotionPrompt(energia = "vibrante e energético"): string {
  const intensidade = energia.startsWith("calmo") ? "suaves" : "fortes";
  return [
    "Sutil animação do personagem-mascote: leve balanço idle, expressão viva,",
    `partículas de energia ${intensidade} ao fundo, câmera com leve push-in.`,
    "Movimento natural e fluido, sem texto, sem distorcer o personagem.",
  ].join(" ");
}

/** Enfileira um job de animação. Devolve o id do render_job. */
export async function enqueueAnimation(input: AnimationInput): Promise<number> {
  const row = {
    kind: "animate",
    status: "queued",
    pauta_id: input.pautaId,
    style_profile_id: input.styleProfileId ?? null,
    input: {
      stillStorageKey: input.stillStorageKey,
      motionPrompt: input.motionPrompt ?? buildMotionPrompt(),
      numFrames: input.numFrames ?? 97,
      aspect: input.aspect ?? "9:16",
    },
  };
  const out = (await rest("render_jobs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  })) as Array<{ id: number }>;
  return out[0].id;
}

/** Estado de um job (p/ o orquestrador/Studio acompanharem o progresso). */
export async function getRenderJob(jobId: number): Promise<RenderJob | null> {
  const rows = (await rest(`render_jobs?id=eq.${jobId}&select=*`)) as RenderJob[];
  return rows[0] ?? null;
}
