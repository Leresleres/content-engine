/** Teste isolado do TTS: gera 1 MP3 + imprime timings por palavra. */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { synthesize } from "@content-engine/adapters";

const outDir = join(process.cwd(), "packages", "render", "out");
mkdirSync(outDir, { recursive: true });

const text =
  "Losartana cinquenta miligramas? Olha essa economia. O genérico de trinta comprimidos caiu de quarenta e oito para vinte e nove e noventa.";

console.log("> Sintetizando voz PT-BR (Edge TTS)...\n");
synthesize(text, outDir)
  .then((r) => {
    console.log(`✓ MP3: ${r.audioFilePath}`);
    console.log(`✓ Duração: ${Math.round(r.durationMs)} ms · ${r.words.length} palavras com timing\n`);
    console.log(r.words.slice(0, 10).map((w) => `${w.text}@${Math.round(w.startMs)}ms`).join("  "));
  })
  .catch((e: unknown) => {
    console.error("✗ ERRO:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
