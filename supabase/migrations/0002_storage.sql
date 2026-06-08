-- ============================================================================
-- content-engine — 0002: storage (Supabase Storage no lugar do R2 por enquanto)
-- ----------------------------------------------------------------------------
-- Supabase Storage é free e já vem no projeto (sem cartão, sem conta nova).
-- R2 fica para quando o volume justificar (10 GB free + sem egress) — aí a
-- Cloudflare pede cartão pra ativar, por isso adiamos.
-- ============================================================================

-- agnóstico de provider: serve Supabase Storage agora e R2 depois
alter table public.assets rename column r2_key to storage_key;

-- bucket privado único; organiza por prefixo de chave (renders/, references/, ...)
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;
