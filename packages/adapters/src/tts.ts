import { existsSync, readFileSync } from "node:fs";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

export type CaptionWord = { text: string; startMs: number; endMs: number };
export type TtsResult = { audioFilePath: string; words: CaptionWord[]; durationMs: number };

/**
 * Extrai os WordBoundary do metadata do Edge TTS.
 * O `toFile` agrega tudo num único JSON: { "Metadata": [ { Type, Data:{Offset,Duration,text:{Text}} } ] }.
 * Offset/Duration vêm em ticks de 100ns → /10000 = ms.
 */
function parseWordBoundaries(raw: string): CaptionWord[] {
  const out: CaptionWord[] = [];
  const collect = (md: unknown) => {
    if (!Array.isArray(md)) return;
    for (const m of md as Array<Record<string, any>>) {
      if (m?.Type !== "WordBoundary" || !m?.Data) continue;
      const startMs = Number(m.Data.Offset) / 10000;
      const endMs = startMs + Number(m.Data.Duration) / 10000;
      const text = m.Data.text?.Text ?? m.Data.Text ?? "";
      if (text) out.push({ text, startMs, endMs });
    }
  };
  try {
    const doc = JSON.parse(raw) as { Metadata?: unknown };
    collect(Array.isArray(doc) ? doc : doc.Metadata);
    if (out.length) return out;
  } catch {
    /* tenta fallback de objetos concatenados */
  }
  for (const part of raw.replace(/}\s*{/g, "}|SEP|{").split("|SEP|")) {
    try {
      const doc = JSON.parse(part) as { Metadata?: unknown };
      collect(doc.Metadata);
    } catch {
      /* ignora pedaço inválido */
    }
  }
  return out;
}

/**
 * Sintetiza voz PT-BR (Edge TTS, grátis, sem chave). Escreve o MP3 em `outDir`
 * e devolve o caminho + palavras com timing (p/ legenda sincronizada).
 */
export async function synthesize(
  text: string,
  outDir: string,
  voice: string = process.env.TTS_VOICE || "pt-BR-FranciscaNeural"
): Promise<TtsResult> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, {
    wordBoundaryEnabled: true,
  });
  const { audioFilePath, metadataFilePath } = await tts.toFile(outDir, text);
  tts.close();

  const words =
    metadataFilePath && existsSync(metadataFilePath)
      ? parseWordBoundaries(readFileSync(metadataFilePath, "utf8"))
      : [];
  const durationMs = words.length ? words[words.length - 1].endMs : 0;
  return { audioFilePath, words, durationMs };
}
