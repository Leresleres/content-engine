-- ============================================================================
-- content-engine — schema inicial (M0)
-- ----------------------------------------------------------------------------
-- Engine de conteúdo niche-agnóstico. Detectores por nicho (federados) emitem
-- pautas via contrato de ingestão; o engine roteiriza, renderiza (programático)
-- e publica. Multi-projeto via projects.id.
-- RLS habilitado em tudo: o worker usa service_role (bypassa RLS); o Studio
-- acessa via RPCs admin (auth própria — a definir num milestone futuro).
-- ============================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid(), gen_random_bytes()

-- util: updated_at automático
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- 1. PROJECTS (nichos) --------------------------------------------------------
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  nome         text not null,
  ingest_token text not null default encode(gen_random_bytes(24), 'hex'),
  ativo        boolean not null default true,
  created_at   timestamptz not null default now()
);

-- 2. ASSETS (arquivos no R2) --------------------------------------------------
create table if not exists public.assets (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  tipo       text not null check (tipo in
               ('reference','broll','music','voice','caption','render','thumbnail')),
  r2_key     text not null,
  mime       text,
  meta       jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- 3. STYLE PROFILES (estilo reutilizável -> ThemeConfig) ----------------------
create table if not exists public.style_profiles (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid references public.projects(id) on delete cascade,
  nome         text not null,
  config       jsonb not null,            -- ThemeConfig (ver packages/core/src/schemas.ts)
  ref_asset_id uuid references public.assets(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- 4. PAUTAS (eventos noticiáveis, vindos do detector do nicho) ----------------
create table if not exists public.pautas (
  id               bigint generated always as identity primary key,
  project_id       uuid not null references public.projects(id) on delete cascade,
  tipo             text not null,
  external_ref     text,                  -- id da entidade no nicho (ex.: ia_id)
  payload          jsonb not null,
  score            numeric,
  style_profile_id uuid references public.style_profiles(id) on delete set null,
  status           text not null default 'nova'
    check (status in ('nova','roteirizada','aprovada','reprovada',
                      'storyboard','render_queued','rendered','publicada','descartada')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_pautas_project_status on public.pautas(project_id, status);
create trigger trg_pautas_updated before update on public.pautas
  for each row execute function public.set_updated_at();

-- 5. ROTEIROS (saída do conselho + storyboard) -------------------------------
create table if not exists public.roteiros (
  id          uuid primary key default gen_random_uuid(),
  pauta_id    bigint not null references public.pautas(id) on delete cascade,
  versao      int not null default 1,
  roteiro     jsonb,        -- {gancho, desenvolvimento, demonstracao, cta, legenda, hashtags}
  storyboard  jsonb,        -- shotlist (ver Storyboard schema)
  verificacao jsonb,        -- saída do verificador factual
  compliance  jsonb,        -- saída do gate de compliance
  status      text not null default 'rascunho',
  created_at  timestamptz not null default now(),
  unique (pauta_id, versao)
);

-- 6. RENDER JOBS (mídia — pipeline programático) -----------------------------
create table if not exists public.render_jobs (
  id               uuid primary key default gen_random_uuid(),
  pauta_id         bigint not null references public.pautas(id) on delete cascade,
  roteiro_id       uuid references public.roteiros(id) on delete set null,
  style_profile_id uuid references public.style_profiles(id) on delete set null,
  status           text not null default 'queued'
    check (status in ('queued','running','done','error')),
  output_asset_id  uuid references public.assets(id) on delete set null,
  cost_usd         numeric,
  error            text,
  logs             jsonb not null default '[]',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_render_jobs_status on public.render_jobs(status);
create trigger trg_render_jobs_updated before update on public.render_jobs
  for each row execute function public.set_updated_at();

-- RLS: tranca por padrão. Worker = service_role (bypassa). Studio = RPCs admin (a definir).
alter table public.projects       enable row level security;
alter table public.assets         enable row level security;
alter table public.style_profiles enable row level security;
alter table public.pautas         enable row level security;
alter table public.roteiros       enable row level security;
alter table public.render_jobs    enable row level security;

-- seed: o primeiro nicho
insert into public.projects (slug, nome)
values ('precoremedio', 'Preço Remédio')
on conflict (slug) do nothing;
