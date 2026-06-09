import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Activity, AlertTriangle, CheckCircle2, CircleHelp, RefreshCw, XCircle } from "lucide-react";
import { act, fetchData, getToken, setToken, type Health, type InboxItem } from "./api";

const STATUS: Record<Health["status"], { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  ok: { label: "OK", cls: "text-green-400 bg-green-950/60 border-green-800", Icon: CheckCircle2 },
  degraded: { label: "Degradado", cls: "text-yellow-400 bg-yellow-950/60 border-yellow-800", Icon: AlertTriangle },
  down: { label: "Caiu", cls: "text-red-400 bg-red-950/60 border-red-800", Icon: XCircle },
  unknown: { label: "Desconhecido", cls: "text-zinc-400 bg-zinc-900 border-zinc-700", Icon: CircleHelp },
};

function TokenGate({ onSave }: { onSave: () => void }) {
  const [v, setV] = useState(getToken());
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-950 p-6">
        <h1 className="text-lg font-semibold mb-1">Content Engine · Studio</h1>
        <p className="text-sm text-zinc-400 mb-4">Cole o token de acesso pra entrar.</p>
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder="studio token"
          className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm mb-3 outline-none focus:border-green-600"
        />
        <button
          onClick={() => {
            setToken(v.trim());
            onSave();
          }}
          className="w-full rounded-lg bg-green-600 hover:bg-green-500 px-3 py-2 text-sm font-medium"
        >
          Entrar
        </button>
      </div>
    </div>
  );
}

function HealthPanel({ health }: { health: Health[] }) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold mb-4">
        <Activity size={16} /> Saúde dos providers
      </h2>
      {health.length === 0 && <p className="text-sm text-zinc-500">Sem providers ainda.</p>}
      <div className="space-y-2">
        {health.map((h) => {
          const m = STATUS[h.status] ?? STATUS.unknown;
          return (
            <div key={h.provider_id} className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium">{h.provider_id}</div>
                <div className="text-xs text-zinc-500 truncate">
                  {h.capability}
                  {h.last_error ? ` · ${h.last_error.slice(0, 60)}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!h.free_ok && <span className="text-xs text-orange-400" title="provider pode ter saído do grátis">$</span>}
                <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md border ${m.cls}`}>
                  <m.Icon size={13} /> {m.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function InboxPanel({ inbox }: { inbox: InboxItem[] }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "approve" | "reject" }) => act(id, action),
    onSuccess: (_data, vars) => {
      toast.success(vars.action === "approve" ? "Aprovado" : "Reprovado");
      qc.invalidateQueries({ queryKey: ["data"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
      <h2 className="text-sm font-semibold mb-4">
        Inbox de aprovação <span className="text-zinc-500">({inbox.length})</span>
      </h2>
      {inbox.length === 0 && <p className="text-sm text-zinc-500">Nada pra aprovar agora. 🎉</p>}
      <div className="space-y-3">
        {inbox.map((it) => {
          const r = it.roteiros?.[0]?.roteiro;
          return (
            <div key={it.id} className="rounded-lg border border-zinc-800 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs px-2 py-0.5 rounded bg-zinc-800">{it.tipo}</span>
                <span className="text-xs text-zinc-500">#{it.id} · {it.status}</span>
              </div>
              {r?.gancho && <p className="text-sm font-medium mb-1">{r.gancho}</p>}
              {r?.cta && <p className="text-xs text-zinc-400 mb-3">{r.cta}</p>}
              {!r && (
                <p className="text-xs text-zinc-500 mb-3">
                  Sem roteiro ainda · {JSON.stringify(it.payload).slice(0, 90)}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  disabled={mut.isPending}
                  onClick={() => mut.mutate({ id: it.id, action: "approve" })}
                  className="rounded-lg bg-green-600 hover:bg-green-500 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  Aprovar
                </button>
                <button
                  disabled={mut.isPending}
                  onClick={() => mut.mutate({ id: it.id, action: "reject" })}
                  className="rounded-lg bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  Reprovar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const q = useQuery({ queryKey: ["data"], queryFn: fetchData, enabled: authed, refetchInterval: 30_000, retry: false });

  const unauthorized = q.error instanceof Error && q.error.message === "unauthorized";
  if (!authed || unauthorized) {
    return (
      <TokenGate
        onSave={() => {
          setAuthed(true);
          q.refetch();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen max-w-3xl mx-auto p-6">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Content Engine · Studio</h1>
        <button onClick={() => q.refetch()} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200">
          <RefreshCw size={14} className={q.isFetching ? "animate-spin" : ""} /> Atualizar
        </button>
      </header>
      {q.isLoading && <p className="text-sm text-zinc-500">Carregando…</p>}
      {q.error && !unauthorized && <p className="text-sm text-red-400">Erro: {(q.error as Error).message}</p>}
      {q.data && (
        <div className="space-y-6">
          <HealthPanel health={q.data.health} />
          <InboxPanel inbox={q.data.inbox} />
        </div>
      )}
    </div>
  );
}
