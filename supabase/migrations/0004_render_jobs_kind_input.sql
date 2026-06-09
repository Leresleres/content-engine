-- Estende render_jobs p/ servir também jobs de animação (LTX I2V no GPU grátis).
-- kind: 'render' (montagem Remotion) | 'animate' (image-to-video) | 'image' (still).
-- input: parâmetros do job (ex.: stillStorageKey, motionPrompt, numFrames).
alter table public.render_jobs
  add column if not exists kind text not null default 'render',
  add column if not exists input jsonb not null default '{}'::jsonb;

create index if not exists render_jobs_kind_status_idx
  on public.render_jobs (kind, status);
