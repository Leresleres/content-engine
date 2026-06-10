import { generateJSON } from "@content-engine/adapters";
import { RoteiroSchema, type Roteiro } from "./schemas.js";

/** Pauta normalizada (subconjunto do que o engine guarda em `pautas`). */
export type Pauta = {
  tipo: string;
  principioAtivo?: string;
  payload: Record<string, unknown>;
};

/** Schema de saída no formato do Gemini (subset OpenAPI). zod valida/coage depois. */
const ROTEIRO_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    gancho: { type: "string" },
    desenvolvimento: { type: "string" },
    demonstracao: { type: "string" },
    cta: { type: "string" },
    legenda: { type: "string" },
    hashtags: { type: "array", items: { type: "string" } },
  },
  required: ["gancho", "desenvolvimento", "demonstracao", "cta", "legenda", "hashtags"],
} as const;

const SISTEMA = `Você é roteirista de vídeos curtos verticais (faceless, 9:16) para o "Preço Remédio",
um comparador gratuito de preços de medicamentos no Brasil.

OBJETIVO: transformar uma pauta de variação de preço num roteiro curto que prende nos
3 primeiros segundos e termina com CTA.

LIMITE DE TAMANHO (RÍGIDO): gancho + desenvolvimento + cta somados ≤ 40 palavras (~15s falados).
Desenvolvimento em 1 frase curta e direta. Corte tudo que não for essencial — short curto converte mais.

COMPLIANCE (ANVISA/CFF) — INEGOCIÁVEL:
- Fale SOMENTE de preço, economia e comparação entre farmácias.
- NUNCA recomende uso, dose, indicação terapêutica, nem prometa efeito de saúde.
- Não diga que o remédio "é bom", "funciona" ou "trata" algo. Apenas preço.
- Sem sensacionalismo médico. Pode citar o nome do medicamento e os valores.

ESTILO: português do Brasil, direto, conversa de gente real. Frases curtas.
- "demonstracao": descreva o que aparece na TELA DO APP (vira screen-capture no render).
- "cta": comparar de graça no site do Preço Remédio + entrar na lista do WhatsApp.
- "hashtags": 5 a 8, sem o caractere #.`;

/** Estágio "roteirista": pauta → Roteiro. (Conselho completo — verificador/compliance/editor — vem no próximo passo.) */
export async function roteirista(pauta: Pauta): Promise<Roteiro> {
  const prompt = `${SISTEMA}

PAUTA (tipo: ${pauta.tipo}${pauta.principioAtivo ? `, princípio ativo: ${pauta.principioAtivo}` : ""}):
${JSON.stringify(pauta.payload, null, 2)}

Gere o roteiro. Responda APENAS com o JSON com as chaves: gancho, desenvolvimento, demonstracao, cta, legenda, hashtags.`;

  // generateJSON = failover best-first de LLM (NIM → OpenRouter → Gemini).
  const raw = await generateJSON<unknown>(prompt, ROTEIRO_RESPONSE_SCHEMA);
  return RoteiroSchema.parse(raw);
}

/** Ponto de entrada do conselho. Hoje = roteirista; evolui para a cadeia completa. */
export const gerarRoteiro = roteirista;
