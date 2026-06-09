// zod/v4: usamos o subpath v4 (o zod 3.25.x expõe a API v4 aqui). Mesmo padrão
// dos scripts de automação do precoremedio, p/ structured outputs do Claude.
import { z } from "zod/v4";

// ── Conselho de personas (texto) ────────────────────────────────────────────

/** Roteiro do vídeo (saída do roteirista/editor). */
export const RoteiroSchema = z.object({
  gancho: z.string().describe("Primeiros 3 segundos — fisga a atenção"),
  desenvolvimento: z.string().describe("O miolo do vídeo, 1-3 frases"),
  demonstracao: z.string().describe("O que mostrar na tela do app (vira screencap no render)"),
  cta: z.string().describe("Chamada para ação"),
  legenda: z.string().describe("Legenda do post"),
  hashtags: z.array(z.string()).describe("5 a 8 hashtags sem o #"),
});
export type Roteiro = z.infer<typeof RoteiroSchema>;

/** Saída do verificador factual. */
export const VerificacaoSchema = z.object({
  numeros_conferem: z.boolean(),
  problemas: z.array(z.string()),
});
export type Verificacao = z.infer<typeof VerificacaoSchema>;

/** Saída do gate de compliance (genérico — a regra do nicho entra via prompt). */
export const ComplianceSchema = z.object({
  aprovado: z.boolean(),
  violacoes: z.array(z.string()),
  correcoes_sugeridas: z.string(),
});
export type Compliance = z.infer<typeof ComplianceSchema>;

// ── Estilo (o pulo do gato: destilado de 1 referência, reaplicado N vezes) ───

/**
 * ThemeConfig — o "estilo" extraído de uma referência por um modelo de visão.
 * Vira *props* do template de render. Pequeno e reutilizável (KB), por isso
 * "aprende o estilo, não copia o ativo".
 */
export const ThemeConfigSchema = z.object({
  aspectRatio: z.enum(["9:16", "1:1", "16:9"]).default("9:16"),
  durationSec: z.number().default(30),
  palette: z.object({ bg: z.string(), fg: z.string(), accent: z.string() }),
  font: z.object({ family: z.string(), headlineWeight: z.number().default(800) }),
  caption: z.object({
    style: z.enum(["word-by-word", "line", "karaoke"]).default("word-by-word"),
    position: z.enum(["top", "center", "bottom"]).default("bottom"),
    uppercase: z.boolean().default(true),
  }),
  pacing: z.object({ wordsPerCut: z.number().default(6) }),
  music: z.object({ mood: z.enum(["calm", "upbeat", "tense", "neutral"]).default("upbeat") }),
  intro: z.boolean().default(false),
  outro: z.boolean().default(true),
});
export type ThemeConfig = z.infer<typeof ThemeConfigSchema>;

export const StyleProfileSchema = z.object({
  nome: z.string(),
  config: ThemeConfigSchema,
});
export type StyleProfile = z.infer<typeof StyleProfileSchema>;

// ── Storyboard (o que o render consome) ──────────────────────────────────────

export const ShotSchema = z.object({
  durationSec: z.number(),
  kind: z.enum(["screencap", "image", "text", "clip"]),
  /** screencap: Playwright · image: still gerada/asset · text: card · clip: vídeo gerado (I2V) */
  source: z.string(),
  captionText: z.string().default(""),
});
export const StoryboardSchema = z.object({ shots: z.array(ShotSchema) });
export type Shot = z.infer<typeof ShotSchema>;
export type Storyboard = z.infer<typeof StoryboardSchema>;

// ── Contrato de ingestão (o ÚNICO acoplamento detector de nicho ↔ engine) ────

/**
 * O detector de cada nicho normaliza seus eventos para este formato e faz POST
 * no engine (com o ingest_token do projeto). Mude isto com versionamento.
 */
export const IngestEventSchema = z.object({
  projectSlug: z.string(),
  tipo: z.string(),
  externalRef: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
  score: z.number().optional(),
});
export type IngestEvent = z.infer<typeof IngestEventSchema>;
