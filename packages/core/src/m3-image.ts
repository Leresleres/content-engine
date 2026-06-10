/**
 * Smoke M3 — gera 1 post-mascote ON-BRAND no estilo do ref.png (R$0, com failover).
 * Rodar da raiz:  npx tsx packages/core/src/m3-image.ts
 *
 * Precisa de chave de PELO MENOS 1 provider de imagem grátis no .env:
 *   GEMINI_API_KEY                              → Nano Banana (aceita ref.png)
 *   CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN → Flux (fallback, text-to-image)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateImage } from "@content-engine/adapters";
import { buildMascotPrompt, styleEnergyDescriptor } from "./imagePrompt.js";
import { extractStyle } from "./style.js";
import type { ThemeConfig } from "./schemas.js";

// Marca FIXA (cor/fonte). A referência só informa energia/movimento.
const theme: ThemeConfig = {
  aspectRatio: "9:16",
  durationSec: 12,
  palette: { bg: "#16A34A", fg: "#FFFFFF", accent: "#F97316" },
  font: { family: "Inter", headlineWeight: 800 },
  caption: { style: "word-by-word", position: "bottom", uppercase: true },
  pacing: { wordsPerCut: 3 },
  music: { mood: "upbeat" },
  intro: false,
  outro: true,
};

// Em inglês: difusão segue cor/instrução muito melhor (ver imagePrompt.ts).
const conceito =
  "a cute smiling 3D capsule character with little arms and white gloves, holding a blank white price tag";

(async () => {
  try {
    const root = process.cwd();
    const refPath = join(root, "ref.png");
    let energia: string | undefined;
    let refImageB64: string | undefined;

    if (existsSync(refPath)) {
      refImageB64 = readFileSync(refPath).toString("base64");
      try {
        const profile = await extractStyle(refPath); // só movimento/energia, NÃO cor
        energia = styleEnergyDescriptor(profile);
        console.log(`> Energia da referência: ${energia}`);
      } catch (e) {
        console.warn("  extractStyle falhou (segue com energia default):", e instanceof Error ? e.message : e);
      }
    }

    const prompt = buildMascotPrompt({ theme, conceito, energia, aspect: "9:16" });
    console.log("> Prompt:\n", prompt, "\n");

    console.log("> Gerando imagem (failover entre providers grátis)...");
    const img = await generateImage({ prompt, refImageB64, refMime: "image/png", aspect: "9:16" });

    const outDir = join(root, "packages", "render", "out");
    mkdirSync(outDir, { recursive: true });
    const ext = img.mime.includes("png") ? "png" : "jpg";
    const outPath = join(outDir, `mascote.${ext}`);
    writeFileSync(outPath, img.bytes);
    console.log(`\n✓ Imagem gerada por "${img.provider}" (${Math.round(img.bytes.length / 1024)} KB) → ${outPath}`);
  } catch (e) {
    console.error("✗ ERRO:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
})();
