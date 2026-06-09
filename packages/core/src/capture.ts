/**
 * B-roll: tira um screenshot da página de RESULTADOS do Preço Remédio (com preços)
 * pra um pan/scroll suave dentro do Remotion. Mais confiável que gravar vídeo
 * (sem sorte de timing de carregamento). Exporta captureScreenshot() + standalone.
 *   standalone:  npx tsx packages/core/src/capture.ts
 */
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { chromium } from "playwright";

/** Lê largura/altura de um PNG pelo cabeçalho IHDR. */
function pngSize(path: string): { width: number; height: number } {
  const b = readFileSync(path);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

/** Captura a página de resultados (busca) e devolve as dimensões do PNG (1080 de largura @2x). */
export async function captureScreenshot(
  destPng: string,
  termo = "losartana",
  url = "https://precoremedio.com.br"
): Promise<{ width: number; height: number }> {
  mkdirSync(dirname(destPng), { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 540, height: 960 },
    deviceScaleFactor: 2, // screenshot 1080 de largura (nítido; sem o problema de DPR do vídeo)
  });
  const page = await context.newPage();

  // navega DIRETO pros resultados (o Index lê ?q= da URL) — bem mais confiável que UI
  await page.goto(`${url}/?q=${encodeURIComponent(termo)}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1500);

  // dispensa o banner de cookies (LGPD)
  for (const name of [/rejeitar opcionais/i, /aceitar todos/i]) {
    try {
      await page.getByRole("button", { name }).click({ timeout: 3000 });
      await page.waitForTimeout(400);
      break;
    } catch {
      /* próximo rótulo */
    }
  }

  // espera os PRODUTOS carregarem (o site mostra "Carregando produtos...")
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page
    .waitForSelector("text=/Carregando produtos/i", { state: "detached", timeout: 20000 })
    .catch(() => {});
  await page.waitForSelector("text=/R\\$\\s*\\d/", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2500);

  // recorta uma faixa com os resultados (evita o rodapé) → espaço pro pan vertical
  await page.screenshot({ path: destPng, clip: { x: 0, y: 0, width: 540, height: 3200 } });
  await context.close();
  await browser.close();
  return pngSize(destPng);
}

// standalone
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("/capture.ts")) {
  const dest = join(process.cwd(), "packages", "render", "public", "broll.png");
  captureScreenshot(dest)
    .then((d) => console.log(`✓ b-roll → ${dest} (${d.width}x${d.height})`))
    .catch((e: unknown) => {
      console.error("✗ ERRO:", e instanceof Error ? e.message : String(e));
      process.exit(1);
    });
}
