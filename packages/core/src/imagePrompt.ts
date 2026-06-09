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
  /** o que o personagem é/faz (ex.: "uma cápsula sorridente segurando uma etiqueta de desconto"). */
  conceito: string;
  /** descritor de energia/ritmo — idealmente vindo de styleEnergyDescriptor(). */
  energia?: string;
  aspect?: "1:1" | "9:16" | "4:5";
};

const COMPLIANCE = [
  "personagem genérico e original (NÃO reproduza embalagem, logo ou marca real de remédio)",
  "sem qualquer texto de preço, porcentagem ou nome de medicamento na arte",
  "sem alegação de cura/tratamento; tom leve e amigável",
].join("; ");

/** (ThemeConfig travado + conceito + energia da referência) → prompt do mascote. */
export function buildMascotPrompt(input: MascotBriefInput): string {
  const { theme, conceito } = input;
  const { bg, fg, accent } = theme.palette;
  const energia = input.energia ?? (theme.music?.mood === "calm" ? "calmo e suave" : "vibrante e energético");
  const aspect = input.aspect ?? (theme.aspectRatio === "1:1" ? "1:1" : "9:16");
  const intensidade = energia.startsWith("calmo") ? "leve" : "forte";
  return [
    `Ilustração 3D render estilo personagem-mascote: ${conceito}.`,
    "Estética de post viral de rede social: personagem expressivo e carismático, pose dinâmica, iluminação de estúdio, profundidade e brilho.",
    `Fundo energético com ${intensidade} sensação de movimento (raios e partículas de energia), composição centralizada com respiro para sobreposição de texto depois.`,
    `PALETA DA MARCA (obrigatória e fixa): fundo dominante ${bg}, energia/destaques em ${accent}, elementos de alto contraste em ${fg}. Use SOMENTE essa paleta.`,
    `Coerente com a vibe da fonte ${theme.font.family} — mas NÃO escreva nenhum texto na imagem.`,
    `Proporção ${aspect}, altíssima qualidade, sem watermark.`,
    `Restrições: ${COMPLIANCE}.`,
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
