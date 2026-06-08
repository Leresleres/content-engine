/**
 * M2 — extração de estilo: ref.png → ThemeConfig → input do render.
 * Roteiro FIXO de propósito, p/ a comparação isolar só o ESTILO.
 * Rodar da raiz:  npx tsx packages/core/src/m2-style.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractStyle } from "./style.js";

const FIXED_ROTEIRO = {
  gancho: "Losartana 50mg? Olha essa economia!",
  desenvolvimento: "O genérico de 30 comprimidos caiu de R$48 para R$29,90 — quase 38% off.",
  demonstracao: "tela do Preço Remédio comparando o preço por farmácia",
  cta: "Compara de graça no Preço Remédio",
  legenda: "Vale conferir antes de comprar.",
  hashtags: ["precoremedio", "economia", "farmacia", "losartana"],
};

(async () => {
  try {
    const refPath = join(process.cwd(), "ref.png");
    console.log("> Extraindo estilo de:", refPath, "\n");
    const style = await extractStyle(refPath);
    console.log("✓ Estilo:", style.nome, "\n");
    console.log(JSON.stringify(style.config, null, 2));

    const outDir = join(process.cwd(), "packages", "render", "out");
    mkdirSync(outDir, { recursive: true });
    const path = join(outDir, "styled-input.json");
    writeFileSync(path, JSON.stringify({ roteiro: FIXED_ROTEIRO, themeConfig: style.config }, null, 2), "utf8");
    console.log("\n✓ Input do render:", path);
  } catch (e: unknown) {
    console.error("✗ ERRO:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
})();
