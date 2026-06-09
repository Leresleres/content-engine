/**
 * Self-test da camada de resiliência (sem chave/rede — mocks puros).
 * Rodar da raiz do content-engine:  npx tsx packages/adapters/src/failover.selftest.ts
 */
import assert from "node:assert/strict";
import { AdapterError, type ErrorKind } from "./errors.js";
import {
  clearRegistry,
  registerProvider,
  runWithFailover,
  type Capability,
  type FailoverEvent,
} from "./registry.js";

const CAP: Capability = "image";
let passed = 0;

function add(
  id: string,
  call: () => Promise<unknown>,
  o: { priority?: number; free?: boolean; requiresCard?: boolean } = {}
): void {
  registerProvider({
    id,
    capability: CAP,
    priority: o.priority ?? 10,
    free: o.free ?? true,
    requiresCard: o.requiresCard ?? false,
    call,
  });
}
const ok = (id: string) => async () => `ok:${id}`;
const boom = (id: string, kind: ErrorKind, structural = false) => async () => {
  throw new AdapterError({ kind, provider: id, message: `boom ${id}`, structural });
};
const failed = (e: FailoverEvent, provider: string) =>
  e.type === "provider_failed" && e.provider === provider ? e : undefined;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  clearRegistry();
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}\n    ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}

(async () => {
  console.log("failover.selftest:");

  await test("primário com quota cai pro secundário (+ fallback_success)", async () => {
    add("p1", boom("p1", "quota"), { priority: 10 });
    add("p2", ok("p2"), { priority: 20 });
    const events: FailoverEvent[] = [];
    const out = await runWithFailover(CAP, {}, { onEvent: (e) => void events.push(e) });
    assert.equal(out, "ok:p2");
    assert.ok(events.some((e) => e.type === "fallback_success" && e.provider === "p2"));
    assert.ok(events.some((e) => failed(e, "p1")?.kind === "quota"));
  });

  await test("fatal aborta sem tentar o próximo", async () => {
    let p2tried = false;
    add("p1", boom("p1", "fatal"), { priority: 10 });
    add("p2", async () => ((p2tried = true), "ok:p2"), { priority: 20 });
    await assert.rejects(runWithFailover(CAP, {}));
    assert.equal(p2tried, false);
  });

  await test("todos caídos → all_down + rejeita", async () => {
    add("p1", boom("p1", "quota"), { priority: 10 });
    add("p2", boom("p2", "deprecated"), { priority: 20 });
    const events: FailoverEvent[] = [];
    await assert.rejects(runWithFailover(CAP, {}, { onEvent: (e) => void events.push(e) }));
    assert.ok(events.some((e) => e.type === "all_down"));
  });

  await test("guarda anti-cobrança: requiresCard recusado com ALLOW_PAID off", async () => {
    add("paid", ok("paid"), { priority: 10, requiresCard: true });
    await assert.rejects(runWithFailover(CAP, {}, { allowPaid: false }), /Sem provider eleg/);
  });

  await test("guarda anti-cobrança: requiresCard aceito com allowPaid on", async () => {
    add("paid", ok("paid"), { priority: 10, requiresCard: true });
    assert.equal(await runWithFailover(CAP, {}, { allowPaid: true }), "ok:paid");
  });

  await test("ordem via env IMAGE_PROVIDER_ORDER", async () => {
    process.env.IMAGE_PROVIDER_ORDER = "b,a";
    add("a", ok("a"), { priority: 10 });
    add("b", ok("b"), { priority: 20 });
    assert.equal(await runWithFailover(CAP, {}), "ok:b");
    delete process.env.IMAGE_PROVIDER_ORDER;
  });

  await test("alerta: auth → alert=true; quota não-estrutural → alert=false", async () => {
    add("p1", boom("p1", "auth"), { priority: 10 });
    add("p2", boom("p2", "quota"), { priority: 20 });
    add("p3", ok("p3"), { priority: 30 });
    const events: FailoverEvent[] = [];
    await runWithFailover(CAP, {}, { onEvent: (e) => void events.push(e) });
    assert.equal(failed(events.find((e) => failed(e, "p1")) as FailoverEvent, "p1")?.alert, true);
    assert.equal(failed(events.find((e) => failed(e, "p2")) as FailoverEvent, "p2")?.alert, false);
  });

  await test("cooldown: provider down é pulado na 2ª chamada", async () => {
    let p1calls = 0;
    add("p1", async () => {
      p1calls++;
      throw new AdapterError({ kind: "auth", provider: "p1", message: "x" });
    }, { priority: 10 });
    add("p2", ok("p2"), { priority: 20 });
    await runWithFailover(CAP, {}); // p1 falha (auth→down), p2 ok
    await runWithFailover(CAP, {}); // p1 em cooldown → pulado
    assert.equal(p1calls, 1);
  });

  if (process.exitCode === 1) console.error("\n✗ Self-test falhou.");
  else console.log(`\n✓ ${passed} testes passaram.`);
})();
