const API_URL = import.meta.env.VITE_STUDIO_API_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const getToken = (): string =>
  localStorage.getItem("studio_token") ?? (import.meta.env.VITE_STUDIO_TOKEN as string | undefined) ?? "";
export const setToken = (t: string): void => localStorage.setItem("studio_token", t);

function headers(): Record<string, string> {
  return { apikey: ANON, "x-studio-token": getToken(), "Content-Type": "application/json" };
}

export type Health = {
  provider_id: string;
  capability: string;
  status: "ok" | "degraded" | "down" | "unknown";
  free_ok: boolean;
  last_ok_at: string | null;
  last_error: string | null;
  checked_at: string;
};

export type Roteiro = { gancho?: string; cta?: string; legenda?: string } | null;
export type InboxItem = {
  id: number;
  tipo: string;
  status: string;
  payload: Record<string, unknown>;
  score: number | null;
  created_at: string;
  roteiros: Array<{ roteiro: Roteiro; compliance: unknown; status: string }>;
};

export async function fetchData(): Promise<{ health: Health[]; inbox: InboxItem[] }> {
  const res = await fetch(API_URL, { headers: headers() });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function act(pautaId: number, action: "approve" | "reject"): Promise<{ ok: boolean }> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ pautaId, action }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
