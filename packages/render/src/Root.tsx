import React from "react";
import { Composition } from "remotion";
import { Short } from "./Short";
import sample from "./sample-input.json";

const FPS = 30;

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
    />
  );
};
