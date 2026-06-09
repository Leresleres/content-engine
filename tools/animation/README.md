# Animação (image-to-video) em GPU grátis

Anima a **still do mascote** (gerada pelos adapters de imagem) num clipe curto,
no mesmo estilo, usando **LTX image-to-video** em GPU gratuita na nuvem. R$0.

## Como o pipeline encaixa

```
still aprovada (Studio)
   └─ engine: enqueueAnimation({ pautaId, stillStorageKey, motionPrompt })
        └─ render_jobs (kind='animate', status='queued')
             └─ [worker GPU grátis: ltx2_worker.py]  ← este diretório
                  ├─ baixa a still do bucket 'media'
                  ├─ roda LTX I2V (T4)
                  ├─ sobe clips/job-<id>.mp4 no 'media'
                  └─ render_jobs.status='done' + asset tipo 'broll'
                       └─ entra na timeline do Remotion como shot kind='clip'
```

O engine **não sabe** qual GPU/modelo rodou — só enfileira e lê o resultado.
Trocar LTX por outro modelo é mudar só este worker.

## Rodar no Kaggle (recomendado — 30h/semana de T4/P100, sem cartão)

1. **New Notebook** → *Settings* → *Accelerator* = **GPU T4 x2** (ou P100).
2. *Add-ons → Secrets*: crie `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`
   (a service_role do projeto `content-engine`).
3. Suba `ltx2_worker.py` (Add Data / Upload) ou cole numa célula. Então:

   ```python
   import os
   from kaggle_secrets import UserSecretsClient
   s = UserSecretsClient()
   os.environ["SUPABASE_URL"] = s.get_secret("SUPABASE_URL")
   os.environ["SUPABASE_SERVICE_ROLE_KEY"] = s.get_secret("SUPABASE_SERVICE_ROLE_KEY")

   !pip install -q "diffusers>=0.32" transformers accelerate "imageio[ffmpeg]" sentencepiece
   %run ltx2_worker.py
   ```

   O worker processa todos os jobs `queued` e sai. Rode quando tiver um lote
   aprovado (= ponto humano: aprovar → rodar).

## Colab (alternativa)

Mesma coisa, mas defina os env vars direto na célula (Runtime = GPU T4):

```python
import os
os.environ["SUPABASE_URL"] = "https://sthtofztcuraaepipzqx.supabase.co"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "..."   # service_role
!pip install -q "diffusers>=0.32" transformers accelerate "imageio[ffmpeg]" sentencepiece
!python ltx2_worker.py
```

## Modelos / qualidade (gatilhos de upgrade)

- **Padrão (`LTX_MODEL=Lightricks/LTX-Video`)**: leve, cabe em T4 16GB com
  `enable_model_cpu_offload()`. Clipes curtos, resolução média — bom p/ shorts.
- **LTX-2 19B (qualidade alta)**: precisa de quantização (FP8/GGUF) — caminho
  ComfyUI: instale ComfyUI + `ComfyUI-LTXVideo`, baixe o GGUF Q4 do LTX-2,
  use o workflow *I2V distilled*. Cabe em T4 quantizado; 1080p só em A100
  (GCP $300, opt-in). Defina `LTX_MODEL` ou troque a célula de inferência.
- **Kandinsky 5.0 Lite I2V (12GB)** e **Qwen-Image** (still premium) são
  alternativas — mesma fila, worker diferente.

## Limites honestos

- Free-tier (T4 + offload) = clipes curtos, resolução média, **minutos por
  clipe**. É peça-herói gated, não volume desassistido (ToS do Kaggle/Colab).
- A primeira execução baixa os pesos do modelo (alguns GB) — demora; depois o
  cache do Kaggle acelera.
- O clipe **não-factual** (mascote/decoração). A demo de preços continua sendo
  screenshot REAL no Remotion.
