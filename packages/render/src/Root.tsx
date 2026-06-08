import React from "react";
import { Composition } from "remotion";
import { Short } from "./Short";
import sample from "./sample-input.json";

const FPS = 30;
const TAIL_SEC = 1.5; // segundos de CTA depois que a fala termina

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Short"
      component={Short as React.ComponentType<Record<string, unknown>>}
      durationInFrames={Math.round((sample.themeConfig.durationSec ?? 12) * FPS)}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={sample as unknown as Record<string, unknown>}
      calculateMetadata={({ props }) => {
        const p = props as {
          audio?: { durationMs?: number };
          themeConfig?: { durationSec?: number };
        };
        const durMs = p?.audio?.durationMs;
        const durationInFrames = durMs
          ? Math.ceil((durMs / 1000 + TAIL_SEC) * FPS)
          : Math.round((p?.themeConfig?.durationSec ?? 12) * FPS);
        return { durationInFrames };
      }}
    />
  );
};
