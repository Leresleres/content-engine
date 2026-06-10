/**
 * Worker M3: pega pautas 'nova' do engine → conselho roteirista (LLM com failover
 * best-first) → grava roteiro + marca a pauta 'roteirizada' (vira card no inbox do Studio).
 * Rodar da raiz:  npx tsx packages/core/src/m3-worker.ts
 */
import { roteirista, type Pauta } from "./conselho.js";
import { pullNovasPautas, saveRoteiro, setPautaStatus } from "./engine-db.js";

function principioAtivo(payload: Record<string, unknown>): string | undefined {
  const v = payload.principio_ativo ?? payload.principioAtivo ?? payload.produto;
  return typeof v === "string" ? v : undefined;
}

(async () => {
  try {
    const novas = await pullNovasPautas(5);
    if (!novas.length) {
      console.log("Nenhuma pauta 'nova' pra processar.");
      return;
    }
    console.log(`> ${novas.length} pauta(s) nova(s).`);
    for (const p of novas) {
      try {
        const pauta: Pauta = { tipo: p.tipo, principioAtivo: principioAtivo(p.payload), payload: p.payload };
        const roteiro = await roteirista(pauta);
        await saveRoteiro(p.id, roteiro);
        await setPautaStatus(p.id, "roteirizada");
        console.log(`  ✓ #${p.id}: "${roteiro.gancho}"`);
      } catch (e) {
        console.error(`  ✗ #${p.id}:`, e instanceof Error ? e.message : String(e));
      }
    }
    console.log("worker ok");
  } catch (e) {
    console.error("✗ worker falhou:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
})();
