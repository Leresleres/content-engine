"""
Worker de animação (image-to-video) — roda em GPU GRÁTIS na nuvem (Kaggle/Colab T4).

Puxa jobs `render_jobs` (kind='animate', status='queued') do Supabase do engine,
baixa a still do mascote do bucket privado 'media', roda LTX image-to-video,
sobe o clipe .mp4 de volta no Storage e marca o job 'done' (criando um asset
tipo 'broll'). Modo LOTE: processa o que estiver na fila e sai — casa com a
cota do Kaggle (30h/semana) e o gate humano (você aprova, depois roda).

Setup (Kaggle, Accelerator = GPU T4):
  1) Add-ons > Secrets:  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
  2) Numa célula:
        import os
        from kaggle_secrets import UserSecretsClient
        s = UserSecretsClient()
        os.environ["SUPABASE_URL"] = s.get_secret("SUPABASE_URL")
        os.environ["SUPABASE_SERVICE_ROLE_KEY"] = s.get_secret("SUPABASE_SERVICE_ROLE_KEY")
        !pip install -q "diffusers>=0.32" transformers accelerate "imageio[ffmpeg]" sentencepiece
        %run ltx2_worker.py

No Colab: defina os dois env vars na célula e rode igual.

Modelo: por padrão usa LTX-Video (leve, cabe em T4 16GB com cpu offload). Pra
qualidade maior, troque por LTX-2 distilled/GGUF via ComfyUI (ver README) — o
engine não muda, só este worker.
"""

import io
import os
import tempfile
import time

import requests

SUPA_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BUCKET = os.environ.get("MEDIA_BUCKET", "media")
MODEL = os.environ.get("LTX_MODEL", "Lightricks/LTX-Video")


def _h(extra=None):
    h = {"apikey": SERVICE, "Authorization": f"Bearer {SERVICE}"}
    if extra:
        h.update(extra)
    return h


def db(path, method="GET", body=None, prefer=None):
    h = _h({"Content-Type": "application/json"})
    if prefer:
        h["Prefer"] = prefer
    r = requests.request(method, f"{SUPA_URL}/rest/v1/{path}", headers=h, json=body, timeout=60)
    r.raise_for_status()
    return r.json() if r.text else None


def storage_get(key: str) -> bytes:
    r = requests.get(f"{SUPA_URL}/storage/v1/object/{BUCKET}/{key}", headers=_h(), timeout=120)
    r.raise_for_status()
    return r.content


def storage_put(key: str, data: bytes, content_type="video/mp4"):
    h = _h({"Content-Type": content_type, "x-upsert": "true"})
    r = requests.post(f"{SUPA_URL}/storage/v1/object/{BUCKET}/{key}", headers=h, data=data, timeout=300)
    r.raise_for_status()


def claim_job():
    rows = db("render_jobs?select=*&kind=eq.animate&status=eq.queued&order=created_at.asc&limit=1")
    if not rows:
        return None
    job = rows[0]
    # marca running só se ainda estiver queued (evita corrida entre runs)
    db(f"render_jobs?id=eq.{job['id']}&status=eq.queued", "PATCH",
       {"status": "running"}, prefer="return=representation")
    return job


def complete(job_id, storage_key, cost_usd=0):
    asset = db("assets", "POST",
               {"tipo": "broll", "storage_key": storage_key, "mime": "video/mp4"},
               prefer="return=representation")[0]
    db(f"render_jobs?id=eq.{job_id}", "PATCH",
       {"status": "done", "output_asset_id": asset["id"], "cost_usd": cost_usd})


def fail(job_id, err):
    db(f"render_jobs?id=eq.{job_id}", "PATCH", {"status": "error", "error": str(err)[:500]})


# ── LTX image-to-video (carregado uma vez) ───────────────────────────────────
_PIPE = None


def get_pipe():
    global _PIPE
    if _PIPE is None:
        import torch
        from diffusers import LTXImageToVideoPipeline
        _PIPE = LTXImageToVideoPipeline.from_pretrained(MODEL, torch_dtype=torch.bfloat16)
        _PIPE.enable_model_cpu_offload()  # cabe em T4 16GB
    return _PIPE


def animate(still_bytes: bytes, prompt: str, num_frames=97, width=704, height=1216, fps=24) -> bytes:
    from diffusers.utils import export_to_video
    from PIL import Image

    img = Image.open(io.BytesIO(still_bytes)).convert("RGB").resize((width, height))
    pipe = get_pipe()
    result = pipe(
        image=img,
        prompt=prompt,
        negative_prompt="texto, letras, distorção, baixa qualidade, watermark",
        num_frames=num_frames,
        width=width,
        height=height,
        guidance_scale=3.0,
    )
    out_path = tempfile.mktemp(suffix=".mp4")
    export_to_video(result.frames[0], out_path, fps=fps)
    with open(out_path, "rb") as f:
        return f.read()


def run_once() -> bool:
    job = claim_job()
    if not job:
        return False
    print(f"→ job {job['id']}")
    try:
        inp = job.get("input") or {}
        still = storage_get(inp["stillStorageKey"])
        clip = animate(
            still,
            inp.get("motionPrompt", "leve balanço idle, partículas de energia, câmera com push-in"),
            num_frames=int(inp.get("numFrames", 97)),
        )
        key = f"clips/job-{job['id']}.mp4"
        storage_put(key, clip)
        complete(job["id"], key)
        print(f"  ✓ done → {key} ({len(clip) // 1024} KB)")
    except Exception as e:  # noqa: BLE001
        fail(job["id"], e)
        print(f"  ✗ erro: {e}")
    return True


if __name__ == "__main__":
    n = 0
    while run_once():
        n += 1
        time.sleep(1)
    print(f"fim — {n} job(s) processado(s).")
