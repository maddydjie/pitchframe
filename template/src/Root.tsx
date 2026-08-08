import React from "react";
import { Composition } from "remotion";
import planJson from "../plan.json";
import type { ScenePlan } from "./lib/types";
import { LaunchVideo } from "./LaunchVideo";

const plan = planJson as unknown as ScenePlan;

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="LaunchVideo"
      component={LaunchVideo}
      durationInFrames={plan.total_frames}
      fps={plan.fps}
      width={1920}
      height={1080}
    />
  );
};
