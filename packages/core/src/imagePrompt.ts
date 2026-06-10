import type { StyleProfile, ThemeConfig } from "./schemas.js";

/**
 * Constrói o prompt de imagem do mascote 3D ON-BRAND.
 *
 * Princípio do dono (2026-06-08): a MARCA (cor/fonte) é FIXA; a referência
 * informa só FORMATO/ENERGIA/MOVIMENTO — cor NUNCA é extraída da referência.
 * Guard-rails ANVISA (RDC 96/2008) embutidos no texto do prompt.
 */
export type MascotBriefInput = {
  /** ThemeConfig com a paleta TRAVADA na marca (verde/laranja/branco, Inter). */
  theme: ThemeConfig;
  /**
   * O que o personagem é/faz, EM INGLÊS (modelos de difusão seguem cores e
   * instruções muito melhor em inglês — validado no klein 2026-06-10).
   * Ex.: "a cute smiling 3D capsule character holding a blank white price tag".
   */
  conceito: string;
  /** descritor de energia/ritmo — idealmente vindo de styleEnergyDescriptor(). */
  energia?: string;
  aspect?: "1:1" | "9:16" | "4:5";
};

// Guard-rails ANVISA + filtro de conteúdo (aprendizados empíricos, 2026-06-10,
// por bissecção contra o NVIDIA klein, que devolve 200 + CONTENT_FILTERED):
// (1) prompt em INGLÊS: aderência de cor muito melhor e moderação menos ruidosa;
// (2) sem vocabulário médico em negação ("sem nome de medicamento", "sem cura") —
//     o classificador lê as palavras sem entender a negação;
// (3) gatilhos surpresa que NÃO usar: a frase PT "tom leve e amigável" (sozinha
//     aciona o filtro) e nomes de IP/estúdio ("estilo Pixar");
// (4) "no text/numbers anywhere" + "no real logos" cobre os mesmos riscos ANVISA.
const COMPLIANCE = "original fictional character, no real logos or packaging; no text, numbers or symbols anywhere in the image";

/**
 * Nome (inglês) aproximado de uma cor hex, por matiz/luminosidade. Modelos de
 * difusão ignoram hex mas seguem NOMES de cor — o prompt usa "green (#16A34A)".
 */
export function colorName(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 510;
  if (max - min < 25) return l > 0.85 ? "white" : l < 0.15 ? "black" : "gray";
  const d = max - min;
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  if (h < 15 || h >= 345) return "red";
  if (h < 45) return "orange";
  if (h < 70) return "yellow";
  if (h < 165) return "green";
  if (h < 200) return "cyan";
  if (h < 255) return "blue";
  if (h < 290) return "purple";
  return "pink";
}

/**
 * (ThemeConfig travado + conceito + energia da referência) → prompt do mascote.
 * Em INGLÊS e com as cores da marca como ATRIBUTO DO SUJEITO (não como bloco
 * "paleta obrigatória" — bloco meta é ignorado; atributo no sujeito é seguido).
 * COMPACTO por contrato: endpoints hospedados de imagem têm limite duro de
 * prompt (NVIDIA /genai/ = 800 chars) — manter o total ≤ 800 com conceito típico.
 */
export function buildMascotPrompt(input: MascotBriefInput): string {
  const { theme, conceito } = input;
  const { bg, fg, accent } = theme.palette;
  const energia = input.energia ?? (theme.music?.mood === "calm" ? "calmo e suave" : "vibrante e energético");
  const aspect = input.aspect ?? (theme.aspectRatio === "1:1" ? "1:1" : "9:16");
  const glow = energia.startsWith("calmo") ? "softly glowing" : "brightly glowing";
  return [
    `3D mascot render: ${conceito}.`,
    `Color scheme on the subject: ${colorName(bg)} (${bg}) body, ${colorName(accent)} (${accent}) accents, ${colorName(fg)} (${fg}) details — only these colors.`,
    "Expressive cheerful character, dynamic pose, studio lighting, 3D cartoon style.",
    `Vibrant ${colorName(bg)} background with ${glow} ${colorName(accent)} rays and particles, centered composition with copy space.`,
    `${aspect} aspect ratio, high quality.`,
    `${COMPLIANCE}.`,
  ].join(" ");
}

/**
 * Descritor de energia/movimento destilado de uma referência (extractStyle),
 * SEM usar a cor dela — só mood + ritmo + nome do estilo.
 */
export function styleEnergyDescriptor(profile: StyleProfile): string {
  const mood = profile.config.music?.mood ?? "upbeat";
  const wpc = profile.config.pacing?.wordsPerCut ?? 6;
  const ritmo = wpc <= 3 ? "cortes rápidos, ritmo acelerado" : "ritmo moderado";
  const map: Record<string, string> = {
    calm: "calmo e suave",
    upbeat: "vibrante e energético",
    tense: "intenso e dramático",
    neutral: "equilibrado",
  };
  return `${map[mood] ?? "vibrante e energético"}, ${ritmo} (ref.: ${profile.nome})`;
}
