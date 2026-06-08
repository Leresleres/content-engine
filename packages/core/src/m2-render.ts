/**
 * M2 end-to-end (texto→vídeo): pauta → roteiro (Gemini) → input do render.
 * Rodar da raiz:  npx tsx packages/core/src/m2-render.ts
 * Depois:        cd packages/render && npx remotion render src/index.ts Short out/ai-short.mp4 --props=out/ai-input.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { roteirista, type Pauta } from "./conselho.js";

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

// ThemeConfig fixo por enquanto (no próximo passo ele vem da extração de estilo da referência).
const themeConfig = {
  aspectRatio: "9:16",
  durationSec: 12,
  palette: { bg: "#0B7A4B", fg: "#FFFFFF", accent: "#FFD400" },
  font: { family: "sans-serif", headlineWeight: 800 },
  caption: { style: "word-by-word", position: "center", uppercase: true },
  pacing: { wordsPerCut: 6 },
  music: { mood: "upbeat" },
  intro: false,
  outro: true,
};

(async () => {
  try {
    const roteiro = await roteirista(pauta);
    const outDir = join(process.cwd(), "packages", "render", "out");
    mkdirSync(outDir, { recursive: true });
    const path = join(outDir, "ai-input.json");
    writeFileSync(path, JSON.stringify({ roteiro, themeConfig }, null, 2), "utf8");
    console.log("✓ Roteiro:", roteiro.gancho);
    console.log("✓ Input do render:", path);
  } catch (e: unknown) {
    console.error("✗ ERRO:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
})();
