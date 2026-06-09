/**
 * M2 end-to-end com VOZ: pauta → roteiro (Gemini) → narração (Edge TTS) →
 * áudio em public/vo.mp3 + legenda sincronizada → input do render.
 * Rodar da raiz:  npx tsx packages/core/src/m2-voice.ts
 * Depois:        cd packages/render && npx remotion render src/index.ts Short out/voice-short.mp4 --props=out/voice-input.json
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { roteirista, type Pauta } from "./conselho.js";
import { captureScreenshot } from "./capture.js";
import { synthesize } from "@content-engine/adapters";

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

// Marca fixa (cor/fonte). A energia/ritmo viriam da referência.
const themeConfig = {
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

(async () => {
  try {
    console.log("> Roteiro (Gemini)...");
    const roteiro = await roteirista(pauta);
    const narration = [roteiro.gancho, roteiro.desenvolvimento, roteiro.cta].join(" ");

    const outDir = join(process.cwd(), "packages", "render", "out");
    const publicDir = join(process.cwd(), "packages", "render", "public");
    mkdirSync(outDir, { recursive: true });
    mkdirSync(publicDir, { recursive: true });

    console.log("> Voz (Edge TTS) + timings...");
    const { audioFilePath, words, durationMs } = await synthesize(narration, outDir);
    copyFileSync(audioFilePath, join(publicDir, "vo.mp3"));

    console.log("> B-roll (Playwright: screenshot dos resultados)...");
    const brollPath = join(publicDir, "broll.png");
    let brollSize: { width: number; height: number } | null = null;
    try {
      brollSize = await captureScreenshot(brollPath, "losartana");
    } catch (e) {
      console.warn("  b-roll falhou (segue sem):", e instanceof Error ? e.message : e);
    }
    // janela da "demonstração" = trecho do desenvolvimento na narração
    const ganchoN = roteiro.gancho.trim().split(/\s+/).filter(Boolean).length;
    const devN = roteiro.desenvolvimento.trim().split(/\s+/).filter(Boolean).length;
    const demoStartMs = words[Math.min(ganchoN, words.length - 1)]?.startMs ?? 0;
    const demoEndMs = words[Math.min(ganchoN + devN - 1, words.length - 1)]?.endMs ?? demoStartMs;
    const broll =
      brollSize && existsSync(brollPath)
        ? { src: "broll.png", width: brollSize.width, height: brollSize.height, startMs: demoStartMs, endMs: demoEndMs }
        : null;

    const input = { roteiro, themeConfig, audio: { src: "vo.mp3", durationMs }, captions: words, broll };
    const inputPath = join(outDir, "voice-input.json");
    writeFileSync(inputPath, JSON.stringify(input, null, 2), "utf8");

    console.log(`\n✓ "${roteiro.gancho}"`);
    console.log(`✓ Voz: ${Math.round(durationMs)} ms · ${words.length} palavras sincronizadas → public/vo.mp3`);
    console.log(`✓ B-roll: ${broll ? `${Math.round(demoStartMs)}–${Math.round(demoEndMs)} ms · ${broll.width}x${broll.height} → public/broll.png` : "(sem)"}`);
    console.log(`✓ Input: ${inputPath}`);
  } catch (e: unknown) {
    console.error("✗ ERRO:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
})();
