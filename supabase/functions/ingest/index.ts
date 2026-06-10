import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// ingest: contrato de ingestão detector→engine. Valida o ingest_token do projeto
// e insere uma pauta (status 'nova'). Dedupe por external_ref. service_role só aqui.

const URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-ingest-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function db(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

Deno.serve(async (req) => {
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const token = req.headers.get('x-ingest-token');
  if (!token) return json({ error: 'missing x-ingest-token' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const projectSlug = body.projectSlug as string;
  const tipo = body.tipo as string;
  const externalRef = body.externalRef as string | undefined;
  const payload = body.payload;
  const score = body.score as number | undefined;
  if (!projectSlug || !tipo || typeof payload !== 'object' || payload === null) {
    return json({ error: 'campos obrigatorios: projectSlug, tipo, payload' }, 400);
  }

  const projRes = await db(`projects?select=id,ingest_token,ativo&slug=eq.${encodeURIComponent(projectSlug)}`);
  if (!projRes.ok) return json({ error: 'erro lookup projeto' }, 500);
  const proj = ((await projRes.json()) as Array<{ id: string; ingest_token: string; ativo: boolean }>)[0];
  if (!proj || proj.ingest_token !== token) return json({ error: 'unauthorized' }, 401);
  if (!proj.ativo) return json({ error: 'projeto inativo' }, 403);

  if (externalRef) {
    const dupRes = await db(`pautas?select=id&project_id=eq.${proj.id}&external_ref=eq.${encodeURIComponent(externalRef)}`);
    const dup = dupRes.ok ? ((await dupRes.json()) as Array<{ id: number }>)[0] : null;
    if (dup) return json({ ok: true, deduped: true, pautaId: dup.id });
  }

  const insRes = await db('pautas', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      project_id: proj.id,
      tipo,
      external_ref: externalRef ?? null,
      payload,
      score: score ?? null,
      status: 'nova',
    }),
  });
  if (!insRes.ok) return json({ error: await insRes.text() }, 500);
  const pauta = ((await insRes.json()) as Array<{ id: number }>)[0];
  return json({ ok: true, pautaId: pauta?.id });
});
