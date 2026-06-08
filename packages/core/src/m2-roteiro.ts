/**
 * Teste M2 (texto): valida a chave Gemini gerando um Roteiro a partir de uma pauta.
 * Rodar da raiz do repo:  npx tsx packages/core/src/m2-roteiro.ts
 */
import { roteirista, type Pauta } from "./conselho.js";
import { geminiModel } from "@content-engine/adapters";

const pauta: Pauta = {
  tipo: "queda",
  principioAtivo: "losartana potássica",
  payload: {
    produto: "Losartana Potássica 50mg 30 comprimidos (genérico)",
    loja: "Drogasil",
    preco: 29.9,
    preco_ant: 48.0,
    queda_pct: 37.7,
    n_lojas_comparadas: 9,
  },
};

console.log(`> Gerando roteiro com ${geminiModel}...\n`);
roteirista(pauta)
  .then((r) => {
    console.log("✓ ROTEIRO GERADO:\n");
    console.log(JSON.stringify(r, null, 2));
  })
  .catch((e: unknown) => {
    console.error("✗ ERRO:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
