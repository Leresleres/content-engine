import { pathToFileURL } from "node:url";
import { loadEnv } from "./env.js";
import { getProviders, setHealth, type Capability } from "./registry.js";
import { registerImageProviders } from "./image.js";
import { enableHealthPersistence, loadHealth } from "./health-store.js";

loadEnv();

/** Capacidades cobertas pelo heartbeat (animate entra com o adapter de animação). */
const CAPS: Capability[] = ["image"];

/**
 * Probe de saúde de todos os providers conhecidos → atualiza + persiste
 * `provider_health`. Roda barato (metadados, sem gastar cota de geração).
 * Agendado no GitHub Actions cron; o worker hidrata isto no boot via loadHealth.
 */
export async function runHeartbeat(): Promise<void> {
  registerImageProviders();
  enableHealthPersistence();
  await loadHealth();

  for (const cap of CAPS) {
    for (const p of getProviders(cap)) {
      let ok = false;
      try {
        ok = p.health ? await p.health() : true;
      } catch {
        ok = false;
      }
      setHealth(
        p.id,
        ok
          ? { status: "ok", freeOk: true, lastOkAt: Date.now(), lastError: undefined }
          : { status: "down", lastError: "health probe falhou" }
      );
      console.log(`  ${ok ? "✓" : "✗"} ${cap}/${p.id}`);
    }
  }
}

// roda quando invocado direto (npx tsx packages/adapters/src/heartbeat.ts)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runHeartbeat()
    .then(() => console.log("heartbeat ok"))
    .catch((e) => {
      console.error("heartbeat falhou:", e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
