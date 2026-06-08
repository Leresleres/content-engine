import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

// Tipos locais (estruturais — espelham @content-engine/core sem acoplar o bundler do M1).
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

export const Short: React.FC<ShortProps> = ({ roteiro, themeConfig }) => {
  const { palette, font, caption } = themeConfig;
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const words = [roteiro.gancho, roteiro.desenvolvimento, roteiro.cta]
    .join(" ")
    .split(/\s+/)
    .filter(Boolean);

  const outroFrames = themeConfig.outro ? Math.round(fps * 2) : 0;
  const captionFrames = Math.max(1, durationInFrames - outroFrames);
  const perWord = captionFrames / words.length;
  const idx = Math.min(words.length - 1, Math.floor(frame / perWord));
  const inOutro = frame >= captionFrames;

  const show = (w: string) => (caption.uppercase ? w.toUpperCase() : w);
  const justify =
    caption.position === "top" ? "flex-start" : caption.position === "bottom" ? "flex-end" : "center";

  return (
    <AbsoluteFill style={{ backgroundColor: palette.bg, fontFamily: font.family }}>
      {!inOutro ? (
        <AbsoluteFill style={{ justifyContent: justify, alignItems: "center", padding: 90 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              alignItems: "center",
              gap: "6px 20px",
              maxWidth: 900,
              color: palette.fg,
              fontWeight: font.headlineWeight,
              fontSize: 84,
              lineHeight: 1.1,
              textAlign: "center",
              textShadow: "0 4px 24px rgba(0,0,0,0.35)",
            }}
          >
            {words.slice(Math.max(0, idx - 2), idx + 3).map((w, i) => {
              const g = Math.max(0, idx - 2) + i;
              const active = g === idx;
              return (
                <span
                  key={g}
                  style={{
                    color: active ? palette.accent : palette.fg,
                    transform: active ? "scale(1.06)" : "none",
                    display: "inline-block",
                  }}
                >
                  {show(w)}
                </span>
              );
            })}
          </div>
        </AbsoluteFill>
      ) : (
        <Outro cta={roteiro.cta} accent={palette.accent} startFrame={captionFrames} />
      )}
    </AbsoluteFill>
  );
};

const Outro: React.FC<{ cta: string; accent: string; startFrame: number }> = ({
  cta,
  accent,
  startFrame,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame: frame - startFrame, fps, config: { damping: 200 } });
  const scale = interpolate(t, [0, 1], [0.82, 1]);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 90 }}>
      <div
        style={{
          transform: `scale(${scale})`,
          color: accent,
          fontWeight: 800,
          fontSize: 104,
          textAlign: "center",
          textShadow: "0 4px 24px rgba(0,0,0,0.35)",
        }}
      >
        {cta.toUpperCase()}
      </div>
    </AbsoluteFill>
  );
};
