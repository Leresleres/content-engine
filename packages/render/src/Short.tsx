import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont();

// Tipos locais (estruturais — espelham @content-engine/core sem acoplar o bundler).
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
export type ShortProps = { roteiro: Roteiro; themeConfig: ThemeConfig };

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

// ── partículas de energia (sobe e faz loop) ──────────────────────────────────
const Sparkles: React.FC<{ frame: number; w: number; h: number; color: string }> = ({
  frame,
  w,
  h,
  color,
}) => {
  const N = 16;
  return (
    <>
      {Array.from({ length: N }).map((_, i) => {
        const x = (Math.sin(i * 97.13) * 0.5 + 0.5) * w;
        const speed = 0.7 + (i % 5) * 0.25;
        const y = h - (((frame * speed + i * 71) % (h + 120)));
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
};

// ── legenda word-by-word com mola/bounce ─────────────────────────────────────
const Caption: React.FC<{
  words: string[];
  idx: number;
  perWord: number;
  frame: number;
  fps: number;
  fg: string;
  accent: string;
  weight: number;
  show: (w: string) => string;
}> = ({ words, idx, perWord, frame, fps, fg, accent, weight, show }) => {
  const start = Math.max(0, idx - 1);
  const win = words.slice(start, idx + 2);
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "center",
        gap: "10px 18px",
        maxWidth: 920,
        textAlign: "center",
      }}
    >
      {win.map((w, i) => {
        const g = start + i;
        const active = g === idx;
        const enter = spring({
          frame: frame - g * perWord,
          fps,
          config: { damping: 11, mass: 0.6, stiffness: 150 },
        });
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
              fontSize: active ? 108 : 64,
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
            fontSize: 96,
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

export const Short: React.FC<ShortProps> = ({ roteiro, themeConfig }) => {
  const { palette, caption } = themeConfig;
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  const words = [roteiro.gancho, roteiro.desenvolvimento, roteiro.cta]
    .join(" ")
    .split(/\s+/)
    .filter(Boolean);

  const outroFrames = themeConfig.outro ? Math.round(fps * 2) : 0;
  const captionFrames = Math.max(1, durationInFrames - outroFrames);
  const perWord = captionFrames / words.length;
  const idx = Math.min(words.length - 1, Math.floor(frame / perWord));
  const inOutro = frame >= captionFrames;

  // fundo da marca que "respira"
  const angle = 135 + Math.sin(frame / 40) * 18;
  const c1 = shade(palette.bg, 0.07);
  const c2 = shade(palette.bg, -0.16);

  const show = (w: string) => (caption.uppercase ? w.toUpperCase() : w);
  const justify =
    caption.position === "top" ? "flex-start" : caption.position === "bottom" ? "flex-end" : "center";

  return (
    <AbsoluteFill style={{ background: `linear-gradient(${angle}deg, ${c1}, ${c2})`, fontFamily }}>
      <Sparkles frame={frame} w={width} h={height} color={palette.accent} />

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
        }}
      >
        Preço<span style={{ color: palette.accent }}> Remédio</span>
      </div>

      {!inOutro ? (
        <AbsoluteFill style={{ justifyContent: justify, alignItems: "center", padding: "0 70px 150px" }}>
          <Caption
            words={words}
            idx={idx}
            perWord={perWord}
            frame={frame}
            fps={fps}
            fg={palette.fg}
            accent={palette.accent}
            weight={themeConfig.font.headlineWeight}
            show={show}
          />
        </AbsoluteFill>
      ) : (
        <Outro cta={show(roteiro.cta)} accent={palette.accent} fg={palette.fg} startFrame={captionFrames} />
      )}
    </AbsoluteFill>
  );
};
