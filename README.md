# content-engine

Engine de conteúdo **niche-agnóstico**: transforma eventos noticiáveis de um
nicho em **vídeos curtos faceless** (programáticos), no **estilo** de uma
referência que você carrega. Primeiro nicho: `precoremedio` (comparador de
farmácia). Pensado para servir qualquer nicho.

## Por que existe (separado do precoremedio)

Não é peso de banco — as tabelas de texto são KB. O que justifica projeto
próprio é **mídia** (storage/compute pesados), **ciclo de vida/roadmap
próprios**, **segredos** (LLM/TTS) e **opcionalidade comercial multi-nicho**.
O detector de cada nicho continua colado aos dados daquele nicho e só **emite
pautas** para cá (contrato de ingestão).

## Arquitetura (federada)

```
[ Supabase precoremedio ]                 [ content-engine (este repo) ]
 produtos, historico_precos                Supabase próprio + R2 (storage)
        │ detector (connector)             pautas(project_id) · style_profiles
        ▼                                   roteiros · render_jobs · assets
  detecta → IngestEvent  ──POST(token)──▶  ingest → conselho(LLM) → storyboard
                                                  → APROVAR (Studio)  ◀── gate humano
                                                  → render (Remotion) → R2
[ outro nicho ] ── seu detector ──POST──▶  mesma API
```

**Princípio de custo:** o gate humano (aprovar) fica **antes** do render. Só se
gasta render no que foi aprovado. Programático = sem GPU → custo baixo (TTS
centavos/min + render CPU + storage).

**Estilo:** um modelo de visão destila 1 referência num `ThemeConfig` (pequeno,
reutilizável) que vira props do template. *Aprende o estilo, não copia o ativo.*

## Stack

Tudo em **tier gratuito** (restrição do dono: custo R$0).

| Camada | Escolha (grátis) |
|---|---|
| Render | Remotion¹ (alternativa MIT: Revideo) |
| Voz | Edge TTS (`msedge-tts`, neural PT-BR, sem key) · fallback local: Piper |
| LLM + Visão | Google Gemini free tier (conselho + extração de estilo) |
| B-roll | Playwright grava a tela do app |
| Estilo | Gemini (visão) → `ThemeConfig` |
| Fila | pg-boss (no Supabase do engine) |
| Worker | local (M1) · depois: GitHub Actions / Oracle Free / local |
| Storage | Cloudflare R2 (free: 10 GB, sem egress) |

¹ Remotion é grátis p/ uso individual / empresa ≤3 pessoas. Se virar empresa maior,
precisa licença paga → aí migra p/ Revideo (MIT). Sem custo hoje.

## Estrutura

```
packages/
  core/         # ✅ schemas + contratos (Roteiro, ThemeConfig, Storyboard, IngestEvent)
  render/       # � Remotion: composições + ThemeConfig (M1)
  adapters/     # � roteador de modelos: LLM / TTS / visão, plugável (M1–M2)
  db/           # � client supabase + types gerados (M1)
apps/
  worker/       # ⏳ consome a fila: ingest → roteiro → storyboard → render → R2 (M1/M3)
  studio/       # ⏳ frontend: revisar/aprovar/gerir estilos (semente: ConteudoTab) (M3)
connectors/
  precoremedio/ # ⏳ detector que lê o banco da farmácia e POSTa IngestEvents (M3)
supabase/
  migrations/   # ✅ 0001_init.sql — modelo de dados
```
✅ feito · ⏳ planejado

## Milestones

- **M0 — Fundação** *(atual)*: repo + modelo de dados + contratos. ✅
- **M1 — Render mínimo**: template Remotion + TTS + legenda → 1 MP4 de um roteiro fixo. Valida qualidade/custo.
- **M2 — Estilo**: extrator de `ThemeConfig` a partir de 1 referência.
- **M3 — Loop completo**: connector precoremedio → pauta → conselho → storyboard → aprovar (Studio) → render → R2.
- **M4+**: publicação (TikTok/Reels/WhatsApp), agendamento, analytics.

## Setup (quando for rodar)

1. `npm install`
2. Criar Supabase do engine + aplicar `supabase/migrations/0001_init.sql`.
3. Criar bucket R2 e preencher `.env` (ver `.env.example`).
4. (M1+) deploy do worker no Railway/Render.
