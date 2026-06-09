import { loadEnv } from "./env.js";
import type { FailoverEvent } from "./registry.js";

loadEnv();

/**
 * Canal de alerta do dono. Hoje: console sempre + Resend (e-mail) se
 * RESEND_API_KEY + ALERT_EMAIL estiverem no .env. WhatsApp Cloud API depois.
 * Nunca lança — alerta não pode derrubar o pipeline.
 */
export async function notifyOwner(subject: string, body: string): Promise<void> {
  console.warn(`[ALERTA] ${subject} — ${body}`);
  const key = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL;
  if (!key || !to) return; // sem canal configurado → só log
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.ALERT_FROM || "content-engine <onboarding@resend.dev>",
        to: [to],
        subject,
        text: body,
      }),
    });
  } catch (e) {
    console.warn("[ALERTA] falha ao enviar e-mail:", e instanceof Error ? e.message : e);
  }
}

/**
 * Sink padrão de eventos de failover → alerta o dono no que for estrutural
 * (auth/deprecated/payment/quota-zero) e loga o resto. É o `onEvent` default
 * das fachadas (generateImage etc.).
 */
export function alertSink(capability: string): (e: FailoverEvent) => Promise<void> {
  return async (e) => {
    if (e.type === "provider_failed" && e.alert) {
      await notifyOwner(
        `Provider "${e.provider}" caiu (${e.kind})`,
        `Capacidade: ${capability}. ${e.message}. Failover automático em curso — verifique se precisa criar nova key/provider.`
      );
    } else if (e.type === "fallback_success") {
      console.info(`[failover] ${capability}: rodando em fallback "${e.provider}" (primário "${e.primary}").`);
    } else if (e.type === "all_down") {
      await notifyOwner(
        `TODOS os providers de "${capability}" caíram`,
        `Tentados: ${e.tried.join(", ")}. A máquina parou nessa capacidade — ação necessária.`
      );
    }
  };
}
