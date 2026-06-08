/**
 * B-roll: grava a tela do Preço Remédio (Playwright) pra entrar como
 * "demonstração" no vídeo. Valida a captura + tira screenshot de QA.
 * Rodar da raiz:  npx tsx packages/core/src/capture.ts
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const SITE = process.env.BROLL_URL || "https://precoremedio.com.br";
const TERMO = process.env.BROLL_TERMO || "losartana";

const outDir = join(process.cwd(), "packages", "render", "out", "broll");
mkdirSync(outDir, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 540, height: 960 },
    deviceScaleFactor: 2, // renderiza nativo 1080x1920
    recordVideo: { dir: outDir, size: { width: 1080, height: 1920 } },
  });
  const page = await context.newPage();

  console.log("> abrindo", SITE);
  await page.goto(SITE, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2000);

  // dispensa o banner de cookies (LGPD) pra não cobrir o conteúdo
  for (const name of [/rejeitar opcionais/i, /aceitar todos/i]) {
    try {
      await page.getByRole("button", { name }).click({ timeout: 3000 });
      await page.waitForTimeout(500);
      break;
    } catch {
      /* tenta o próximo rótulo */
    }
  }

  // tenta buscar (tolerante a seletor — só pra ter conteúdo na tela)
  try {
    const input = page
      .locator('input[type="search"], input[placeholder*="rem" i], input[placeholder*="med" i], input[type="text"]')
      .first();
    await input.fill(TERMO, { timeout: 5000 });
    await input.press("Enter");
    // espera os preços renderizarem (sai do skeleton)
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForSelector("text=/R\\$\\s*\\d/", { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1200);
    console.log("> busca por", TERMO, "ok");
  } catch {
    console.log("> sem caixa de busca detectada — gravando home");
  }

  // scroll suave pra dar movimento
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 380);
    await page.waitForTimeout(550);
  }
  await page.waitForTimeout(600);

  await page.screenshot({ path: join(outDir, "broll-shot.png") });
  await context.close(); // finaliza e salva o vídeo
  await browser.close();
  console.log("✓ b-roll + screenshot em", outDir);
})().catch((e: unknown) => {
  console.error("✗ ERRO:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
