import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont();

type Roteiro = {
  gancho: string;
  desenvolvimento: string;
  demonstracao: string;
  cta: string;
  legenda: string;
  hashtags: string[];
};
type ThemeConfig = {
  durationSec: number;
  palette: { bg: string; fg: string; accent: string };
  font: { family: string; headlineWeight: number };
  caption: { style: string; position: "top" | "center" | "bottom"; uppercase: boolean };
  intro: boolean;
  outro: boolean;
};
type Caption = { text: string; startMs: number; endMs: number };
export type ShortProps = {
  roteiro: Roteiro;
  themeConfig: ThemeConfig;
  audio?: { src: string; durationMs: number } | null;
  captions?: Caption[] | null;
  broll?: { src: string; startMs: number; endMs: number; width: number; height: number } | null;
  hook?: { kind: "image" | "clip"; src: string; startMs: number; endMs: number } | null;
};

// ── helpers de cor ───────────────────────────────────────────────────────────
function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function shade(hex: string, amt: number) {
  const { r, g, b } = hexToRgb(hex);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + amt * 255)));
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}
function rgba(hex: string, a: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

const Sparkles: React.FC<{ frame: number; w: number; h: number; color: string }> = ({
  frame,
  w,
  h,
  color,
}) => (
  <>
    {Array.from({ length: 16 }).map((_, i) => {
      const x = (Math.sin(i * 97.13) * 0.5 + 0.5) * w;
      const speed = 0.7 + (i % 5) * 0.25;
      const y = h - ((frame * speed + i * 71) % (h + 120));
      const size = 7 + (i % 4) * 6;
      const op = 0.08 + (i % 3) * 0.05;
      return (
        <div
          key={i}
          style={{
            position: "absolute",
            left: x,
            top: y,
            width: size,
            height: size,
            borderRadius: "50%",
            background: rgba(color, op),
            filter: "blur(1px)",
          }}
        />
      );
    })}
  </>
);

const CaptionView: React.FC<{
  words: string[];
  activeIdx: number;
  activeStartFrame: number;
  frame: number;
  fps: number;
  fg: string;
  accent: string;
  weight: number;
  show: (w: string) => string;
}> = ({ words, activeIdx, activeStartFrame, frame, fps, fg, accent, weight, show }) => {
  const start = Math.max(0, activeIdx - 1);
  const win = words.slice(start, activeIdx + 2);
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "center",
        gap: "10px 18px",
        maxWidth: 940,
        textAlign: "center",
      }}
    >
      {win.map((w, i) => {
        const g = start + i;
        const active = g === activeIdx;
        const enter = active
          ? spring({ frame: frame - activeStartFrame, fps, config: { damping: 11, mass: 0.6, stiffness: 150 } })
          : 1;
        const scale = active
          ? interpolate(enter, [0, 1], [0.5, 1], { extrapolateLeft: "clamp", extrapolateRight: "extend" })
          : 0.8;
        const ty = active ? interpolate(enter, [0, 1], [46, 0], { extrapolateRight: "extend" }) : 0;
        return (
          <span
            key={g}
            style={{
              display: "inline-block",
              transform: `translateY(${ty}px) scale(${scale})`,
              color: active ? accent : fg,
              opacity: active ? 1 : 0.38,
              fontWeight: weight,
              fontSize: active ? 104 : 62,
              lineHeight: 1.04,
              textShadow: "0 6px 26px rgba(0,0,0,0.35)",
            }}
          >
            {show(w)}
          </span>
        );
      })}
    </div>
  );
};

const Outro: React.FC<{ cta: string; accent: string; fg: string; startFrame: number }> = ({
  cta,
  accent,
  fg,
  startFrame,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame: frame - startFrame, fps, config: { damping: 12, mass: 0.7 } });
  const scale = interpolate(t, [0, 1], [0.7, 1], { extrapolateRight: "extend" });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 90 }}>
      <div style={{ transform: `scale(${scale})`, textAlign: "center" }}>
        <div
          style={{
            color: fg,
            fontWeight: 900,
            fontSize: 92,
            lineHeight: 1.05,
            textShadow: "0 6px 26px rgba(0,0,0,0.35)",
          }}
        >
          {cta}
        </div>
        <div
          style={{
            marginTop: 30,
            display: "inline-block",
            background: accent,
            color: "#fff",
            fontWeight: 800,
            fontSize: 40,
            padding: "14px 34px",
            borderRadius: 999,
          }}
        >
          precoremedio.com.br
        </div>
      </div>
    </AbsoluteFill>
  );
};

// "demonstração": screenshot dos resultados com pan vertical suave (sempre mostra preços).
const DemoBroll: React.FC<{ src: string; imgH: number; durF: number }> = ({ src, imgH, durF }) => {
  const f = useCurrentFrame();
  const { height } = useVideoConfig();
  // a imagem tem 1080 de largura = largura da composição → altura exibida = imgH
  const maxPan = Math.max(0, imgH - height);
  const panY = -interpolate(f, [0, Math.max(1, durF)], [0, maxPan], { extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#fff" }}>
      <Img src={staticFile(src)} style={{ position: "absolute", top: panY, left: 0, width: "100%" }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0) 24%)",
        }}
      />
    </div>
  );
};

// "gancho": mídia generativa do mascote — still (Img c/ ken-burns) ou clipe animado (OffthreadVideo).
const HookMedia: React.FC<{ kind: "image" | "clip"; src: string; durF: number }> = ({ kind, src, durF }) => {
  const f = useCurrentFrame();
  const zoom = interpolate(f, [0, Math.max(1, durF)], [1.06, 1.14], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "#000" }}>
      {kind === "clip" ? (
        <OffthreadVideo src={staticFile(src)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <Img
          src={staticFile(src)}
          style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})` }}
        />
      )}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.32) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

export const Short: React.FC<ShortProps> = ({ roteiro, themeConfig, audio, captions, broll, hook }) => {
  const { palette, caption } = themeConfig;
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const ms = (frame / fps) * 1000;

  const hasVoice = !!(captions && captions.length);

  let words: string[];
  let activeIdx: number;
  let activeStartFrame: number;
  let speechEndFrame: number;

  if (hasVoice) {
    const caps = captions!;
    words = caps.map((c) => c.text);
    let ai = 0;
    for (let i = 0; i < caps.length; i++) {
      if (caps[i].startMs <= ms) ai = i;
      else break;
    }
    activeIdx = ai;
    activeStartFrame = (caps[ai].startMs / 1000) * fps;
    speechEndFrame = Math.round((caps[caps.length - 1].endMs / 1000) * fps);
  } else {
    words = [roteiro.gancho, roteiro.desenvolvimento, roteiro.cta].join(" ").split(/\s+/).filter(Boolean);
    const outroFrames = themeConfig.outro ? Math.round(fps * 2) : 0;
    const cf = Math.max(1, durationInFrames - outroFrames);
    const perWord = cf / words.length;
    activeIdx = Math.min(words.length - 1, Math.floor(frame / perWord));
    activeStartFrame = activeIdx * perWord;
    speechEndFrame = cf;
  }

  const inOutro = frame >= speechEndFrame;
  const angle = 135 + Math.sin(frame / 40) * 18;
  const c1 = shade(palette.bg, 0.07);
  const c2 = shade(palette.bg, -0.16);
  const show = (w: string) => (caption.uppercase ? w.toUpperCase() : w);
  const justify =
    caption.position === "top" ? "flex-start" : caption.position === "bottom" ? "flex-end" : "center";

  return (
    <AbsoluteFill style={{ background: `linear-gradient(${angle}deg, ${c1}, ${c2})`, fontFamily }}>
      {audio ? <Audio src={staticFile(audio.src)} /> : null}
      <Sparkles frame={frame} w={width} h={height} color={palette.accent} />

      {hook ? (
        <Sequence
          from={Math.round((hook.startMs / 1000) * fps)}
          durationInFrames={Math.max(1, Math.round(((hook.endMs - hook.startMs) / 1000) * fps))}
        >
          <HookMedia
            kind={hook.kind}
            src={hook.src}
            durF={Math.max(1, Math.round(((hook.endMs - hook.startMs) / 1000) * fps))}
          />
        </Sequence>
      ) : null}

      {broll ? (
        <Sequence
          from={Math.round((broll.startMs / 1000) * fps)}
          durationInFrames={Math.max(1, Math.round(((broll.endMs - broll.startMs) / 1000) * fps))}
        >
          <DemoBroll
            src={broll.src}
            imgH={broll.height}
            durF={Math.max(1, Math.round(((broll.endMs - broll.startMs) / 1000) * fps))}
          />
        </Sequence>
      ) : null}

      <div
        style={{
          position: "absolute",
          top: 54,
          width: "100%",
          textAlign: "center",
          color: rgba(palette.fg, 0.9),
          fontWeight: 800,
          fontSize: 30,
          letterSpacing: 1,
          textShadow: "0 2px 14px rgba(0,0,0,0.55)",
        }}
      >
        Preço<span style={{ color: palette.accent }}> Remédio</span>
      </div>

      {!inOutro ? (
        <AbsoluteFill style={{ justifyContent: justify, alignItems: "center", padding: "0 70px 150px" }}>
          <CaptionView
            words={words}
            activeIdx={activeIdx}
            activeStartFrame={activeStartFrame}
            frame={frame}
            fps={fps}
            fg={palette.fg}
            accent={palette.accent}
            weight={themeConfig.font.headlineWeight}
            show={show}
          />
        </AbsoluteFill>
      ) : (
        <Outro cta={show(roteiro.cta)} accent={palette.accent} fg={palette.fg} startFrame={speechEndFrame} />
      )}
    </AbsoluteFill>
  );
};
