import { readFileSync } from "node:fs";
import { geminiVisionJSON } from "@content-engine/adapters";
import { ThemeConfigSchema, type StyleProfile } from "./schemas.js";

/** Schema de saída (subset OpenAPI p/ Gemini). zod valida/aplica defaults depois. */
const THEME_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    nome: { type: "string" },
    aspectRatio: { type: "string", enum: ["9:16", "1:1", "16:9"] },
    durationSec: { type: "number" },
    palette: {
      type: "object",
      properties: { bg: { type: "string" }, fg: { type: "string" }, accent: { type: "string" } },
      required: ["bg", "fg", "accent"],
    },
    font: {
      type: "object",
      properties: { family: { type: "string" }, headlineWeight: { type: "number" } },
      required: ["family", "headlineWeight"],
    },
    caption: {
      type: "object",
      properties: {
        style: { type: "string", enum: ["word-by-word", "line", "karaoke"] },
        position: { type: "string", enum: ["top", "center", "bottom"] },
        uppercase: { type: "boolean" },
      },
      required: ["style", "position", "uppercase"],
    },
    pacing: {
      type: "object",
      properties: { wordsPerCut: { type: "number" } },
      required: ["wordsPerCut"],
    },
    music: {
      type: "object",
      properties: { mood: { type: "string", enum: ["calm", "upbeat", "tense", "neutral"] } },
      required: ["mood"],
    },
    intro: { type: "boolean" },
    outro: { type: "boolean" },
  },
  required: ["nome", "palette", "font", "caption", "pacing", "music"],
} as const;

const PROMPT = `Você analisa uma REFERÊNCIA visual para destilar o ESTILO de um vídeo curto vertical (faceless).
A imagem pode ser um print que inclui interface de app (Instagram/TikTok: nome de usuário, curtidas,
ícones, caixa de comentário). IGNORE toda a interface — analise SOMENTE a arte do conteúdo principal.

Extraia um ThemeConfig reutilizável (aprenda o ESTILO, não copie o ativo):
- palette.bg: cor de fundo dominante da arte (hex #RRGGBB).
- palette.fg: cor de texto de ALTO contraste e legível sobre esse fundo (hex).
- palette.accent: a cor de destaque mais marcante/energética da arte (hex).
- font.family: palavra-chave da vibe tipográfica (ex.: "sans-serif", "Poppins", "Montserrat", "Anton").
- font.headlineWeight: 400 a 900 conforme o peso visual.
- caption: estilo (word-by-word/line/karaoke), posição (top/center/bottom) e uppercase típicos dessa estética.
- pacing.wordsPerCut, music.mood e intro/outro coerentes com a energia da referência.
- nome: um nome curto e descritivo pro estilo.

Responda APENAS com o JSON.`;

/** extractStyle: 1 referência (imagem) → ThemeConfig reutilizável (o "pulo do gato"). */
export async function extractStyle(imagePath: string): Promise<StyleProfile> {
  const lower = imagePath.toLowerCase();
  const mime = lower.endsWith(".png")
    ? "image/png"
    : lower.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";
  const b64 = readFileSync(imagePath).toString("base64");
  const raw = await geminiVisionJSON<Record<string, unknown>>(
    PROMPT,
    b64,
    mime,
    THEME_RESPONSE_SCHEMA
  );
  const nome = typeof raw.nome === "string" && raw.nome.trim() ? raw.nome.trim() : "estilo-ref";
  const config = ThemeConfigSchema.parse(raw); // zod descarta 'nome' extra e aplica defaults
  return { nome, config };
}
