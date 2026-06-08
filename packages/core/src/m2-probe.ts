/** Sonda quais modelos Gemini a chave atual consegue chamar (free tier). */
import { loadEnv } from "@content-engine/adapters";

loadEnv();
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  console.error("Sem GEMINI_API_KEY");
  process.exit(1);
}
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const models = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
];

for (const m of models) {
  try {
    const res = await fetch(`${BASE}/${m}:generateContent?key=${KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: "responda só: ok" }] }] }),
    });
    const t = await res.text();
    const note = res.ok
      ? "OK ✓"
      : (t.match(/limit: \d+/)?.[0] ?? t.slice(0, 90).replace(/\s+/g, " "));
    console.log(`${m.padEnd(24)} HTTP ${res.status}  ${note}`);
  } catch (e) {
    console.log(`${m.padEnd(24)} ERRO ${(e as Error).message}`);
  }
}
