import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { UIBeatSpec } from "../lib/types";
import { fadeIn, fadeOut } from "../lib/motion";
import { BORDER, FONT_SANS, alpha, BACKGROUND } from "../theme";
import { surfaceColors } from "../lib/surface";
import { Panel } from "../components/Panel";
import { Device3D } from "../three/Device3D";

/**
 * An establishing shot of the product.
 *
 * Use this to place the viewer, not to show a capability. A UI beat that
 * exists to display a feature is a demo beat wearing a different name — if
 * something needs demonstrating, it belongs in the interaction beat.
 */

const PANEL_W = 1560;
const PANEL_H = 878; // 16:9

export const UIBeat: React.FC<{
  beat: UIBeatSpec;
  durationInFrames: number;
}> = ({ beat, durationInFrames }) => {
  const frame = useCurrentFrame();
  const surface = surfaceColors(beat.surface);

  // Replaces the panel rather than layering over it: a flat screenshot and a
  // 3D device showing the same screenshot is the same shot twice.
  if (beat.three_d?.template === "device_mockup") {
    return (
      <Device3D
        device={(beat.three_d.props?.device as "phone" | "laptop" | undefined) ?? "phone"}
        screenshot={beat.screenshot}
      />
    );
  }

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <Panel
        screenshot={beat.screenshot}
        shot={beat.shot}
        durationInFrames={durationInFrames}
        width={PANEL_W}
        height={PANEL_H}
      />

      {beat.caption ? (
        <div
          style={{
            position: "absolute",
            bottom: 74,
            opacity: fadeIn(frame, 14, 14) * fadeOut(frame, durationInFrames, 10),
            fontFamily: FONT_SANS,
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: "-0.01em",
            color: surface.muted,
            padding: "12px 26px",
            borderRadius: 999,
            background: alpha(BACKGROUND, 0.55),
            border: `1px solid ${BORDER}`,
            backdropFilter: "blur(12px)",
          }}
        >
          {beat.caption}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
