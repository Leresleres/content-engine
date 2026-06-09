-- provider_health: estado de saúde dos providers de IA (failover + heartbeat).
-- Infra GLOBAL (não é por nicho) → sem project_id.
-- Escrita só via service_role (heartbeat/worker, que bypassa RLS);
-- leitura liberada p/ authenticated (painel de saúde do Studio).

create table if not exists public.provider_health (
  provider_id text primary key,
  capability  text not null default 'unknown',
  status      text not null default 'unknown'
              check (status in ('ok', 'degraded', 'down', 'unknown')),
  free_ok     boolean not null default true,
  last_ok_at  timestamptz,
  last_error  text,
  checked_at  timestamptz not null default now()
);

alter table public.provider_health enable row level security;

drop policy if exists "provider_health_read_authenticated" on public.provider_health;
create policy "provider_health_read_authenticated"
  on public.provider_health
  for select
  to authenticated
  using (true);
