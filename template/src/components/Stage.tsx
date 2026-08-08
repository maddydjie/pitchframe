import React from "react";
import { useCurrentFrame } from "remotion";
import { SHOTS, poseAt, transformOf, type ShotName } from "../lib/camera";
import { heldDrift } from "../lib/motion";

/**
 * The 3D stage every framed shot sits on.
 *
 * Sets `perspective` and applies the beat's camera pose. Anything inside is
 * in a real 3D space, so `<Depth>` layers parallax against each other during a
 * move without any per-layer animation — the browser does it, because the
 * camera is actually moving rather than the picture being scaled.
 *
 * One caveat worth knowing before debugging a flattened shot: **`filter` and
 * `backdrop-filter` collapse 3D on the element that carries them.** A blur
 * applied to a `<Depth>` wrapper silently flattens everything below it. Put
 * effects on leaves, or on a wrapper outside the stage.
 */
export const Stage: React.FC<{
  shot?: ShotName;
  durationInFrames: number;
  /**
   * The 2–3px of vertical breathing that keeps a held shot alive. Off for
   * beats that do their own drifting, or the two fight.
   */
  drift?: boolean;
  /**
   * Overrides the clock. A hero cut into shots needs each shot's camera to run
   * on that shot's own timeline — otherwise every cut inherits the camera
   * mid-move and none of them resolve.
   */
  frame?: number;
  children: React.ReactNode;
}> = ({ shot = "push_in_reveal", durationInFrames, drift = true, frame: override, children }) => {
  const current = useCurrentFrame();
  const frame = override ?? current;
  const spec = SHOTS[shot];
  const camera = poseAt(spec, frame, durationInFrames);
  const breathe = drift ? heldDrift(frame, durationInFrames, 3) : 0;

  return (
    <div
      style={{
        perspective: spec.perspective,
        perspectiveOrigin: "50% 50%",
        transformStyle: "preserve-3d",
      }}
    >
      <div
        style={{
          transform: transformOf({ ...camera, y: camera.y + breathe }),
          transformStyle: "preserve-3d",
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
};

/**
 * Places a layer at a depth inside a `<Stage>`.
 *
 * The whole reason to have this: a glow at z=-300 behind a panel at z=0 will
 * separate on its own during any camera move. Faking the same effect with
 * keyframes means re-tuning it for every shot, and it will still be wrong,
 * because the correct amount of parallax depends on the perspective distance.
 */
export const Depth: React.FC<{ z: number; children: React.ReactNode }> = ({
  z,
  children,
}) => (
  <div
    style={{
      transform: `translateZ(${z}px)`,
      transformStyle: "preserve-3d",
    }}
  >
    {children}
  </div>
);
