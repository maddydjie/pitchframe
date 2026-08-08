import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThreeTexture } from "./useThreeTexture";
import { ACCENT, BACKGROUND, SURFACE, SURFACE_ALT } from "../theme";
import { EASE } from "../lib/motion";

/**
 * A product screenshot on a physical device, with a slow dolly in.
 *
 * The one template that competes with the hero beat, so it needs a reason:
 * use it when the product *is* the device — a mobile app, a hardware
 * product — where seeing the UI in a hand-held object says something a flat
 * screenshot cannot. For desktop software the window chrome on the
 * interaction beat already does this job, more honestly and much cheaper.
 *
 * Built from primitives rather than a loaded model. A `.glb` would look
 * better and would also mean a runtime download, which breaks offline
 * rendering — and the whole object is on screen for six seconds at an angle.
 */

const SPECS = {
  phone: { w: 2.0, h: 4.1, d: 0.22, bezel: 0.09, radiusHint: 0.28 },
  laptop: { w: 5.4, h: 3.4, d: 0.18, bezel: 0.12, radiusHint: 0.08 },
} as const;

export const Device3D: React.FC<{
  device?: keyof typeof SPECS;
  /** Filename in public/assets/ — the UI mapped onto the screen. */
  screenshot?: string | null;
}> = ({ device = "phone", screenshot }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const texture = useThreeTexture(screenshot);
  const spec = SPECS[device];

  const t = frame / Math.max(1, durationInFrames);

  // The dolly. Runs the whole beat and never settles, because the object is
  // being presented rather than read — the same reasoning as `orbit_hold`.
  const z = interpolate(t, [0, 1], [8.2, 6.1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
  // Turns through square rather than starting there, so the screen catches a
  // highlight on the way past instead of sitting flat and dead.
  const yaw = interpolate(t, [0, 1], [0.42, -0.16], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });

  const screenW = spec.w - spec.bezel * 2;
  const screenH = spec.h - spec.bezel * 2;

  return (
    <ThreeCanvas
      width={width}
      height={height}
      gl={{ alpha: true, antialias: true }}
      style={{ background: "transparent" }}
      camera={{ fov: 38, position: [0, 0, z] }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 6, 7]} intensity={1.4} />
      <directionalLight position={[-6, -1, -3]} intensity={0.8} color={ACCENT} />

      <group rotation={[0.06, yaw, 0]}>
        {/* Body */}
        <mesh>
          <boxGeometry args={[spec.w, spec.h, spec.d]} />
          <meshStandardMaterial color={SURFACE_ALT} metalness={0.55} roughness={0.34} />
        </mesh>

        {/* Screen, proud of the body so it never z-fights the bezel. */}
        <mesh position={[0, 0, spec.d / 2 + 0.006]}>
          <planeGeometry args={[screenW, screenH]} />
          {texture ? (
            <meshBasicMaterial map={texture} toneMapped={false} />
          ) : (
            // No screenshot captured — a lit blank screen, not a hole.
            <meshBasicMaterial color={SURFACE} toneMapped={false} />
          )}
        </mesh>

        {/* Laptops need something under them or they float. */}
        {device === "laptop" ? (
          <mesh position={[0, -spec.h / 2 - 0.06, 0.9]} rotation={[-Math.PI / 2, 0, 0]}>
            <boxGeometry args={[spec.w, 1.9, 0.12]} />
            <meshStandardMaterial color={SURFACE_ALT} metalness={0.6} roughness={0.3} />
          </mesh>
        ) : null}
      </group>

      <mesh position={[0, 0, -4]}>
        <planeGeometry args={[20, 12]} />
        <meshStandardMaterial color={BACKGROUND} roughness={1} metalness={0} />
      </mesh>
    </ThreeCanvas>
  );
};
