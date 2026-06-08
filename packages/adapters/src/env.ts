import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Carrega o .env da raiz do content-engine sem dependência externa.
 * Sobe a partir do cwd até achar um .env (rode os scripts da raiz do repo).
 * NÃO sobrescreve variáveis já definidas no ambiente.
 */
function findEnv(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const p = join(dir, ".env");
    if (existsSync(p)) return p;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

let loaded = false;
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  const path = findEnv();
  if (!path) return;
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
