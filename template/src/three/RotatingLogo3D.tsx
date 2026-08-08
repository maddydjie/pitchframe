import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { DoubleSide } from "three";
import { useThreeTexture } from "./useThreeTexture";
import { ACCENT, BACKGROUND, SURFACE_ALT } from "../theme";
import { EASE } from "../lib/motion";
import { interpolate } from "remotion";

/**
 * The signature 3D moment: the brand mark as a physical object.
 *
 * A slab rather than a plane, and an oscillation rather than a spin. Both
 * choices are about the same failure: a flat plane rotating on Y passes
 * through edge-on and vanishes for several frames, which reads as a glitch.
 * Thickness gives it something to catch light on, and turning ±38° means it
 * never presents its edge at all — the mark stays readable through the whole
 * beat, which is the only reason to show a mark.
 *
 * Everything derives from `useCurrentFrame()`. No clock, no delta time, no
 * `requestAnimationFrame` — a render can compute frames out of order across
 * parallel workers, and anything stateful produces a different video every
 * time it runs.
 */

/** Half-angle of the turn. Past ~45° the face foreshortens badly. */
const SWING_DEG = 38;

export const RotatingLogo3D: React.FC<{
  /** Filename in public/assets/. Falls back to a plain brand-coloured slab. */
  logo?: string | null;
  /** Turns per beat. Below 1 the object reads as still; above 2 it spins. */
  turns?: number;
}> = ({ logo, turns = 1 }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const texture = useThreeTexture(logo);

  const t = frame / Math.max(1, durationInFrames);
  const yaw = Math.sin(t * Math.PI * 2 * turns) * (SWING_DEG * (Math.PI / 180));

  // A little settle on entry so the object arrives rather than appearing.
  const scale = interpolate(frame, [0, Math.round(fps * 0.6)], [0.82, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });

  return (
    <ThreeCanvas
      width={width}
      height={height}
      // Transparent so the beat's own surface and the video's grade show
      // through. An opaque canvas would punch a rectangle in the composition.
      gl={{ alpha: true, antialias: true }}
      style={{ background: "transparent" }}
      camera={{ fov: 40, position: [0, 0, 6] }}
    >
      {/* Three lights, which is the whole lighting rig. A key to model the
          form, a dim fill so the dark side is not black, and a rim from
          behind to separate the slab from the background. */}
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 5, 6]} intensity={1.5} />
      <directionalLight position={[-5, -2, -4]} intensity={0.7} color={ACCENT} />

      <group rotation={[0.12, yaw, 0]} scale={scale}>
        {/* The slab. 0.14 deep — enough to catch the key light on its edge,
            thin enough to still read as a card rather than a block. */}
        <mesh>
          <boxGeometry args={[2.6, 2.6, 0.14]} />
          <meshStandardMaterial
            color={texture ? SURFACE_ALT : ACCENT}
            metalness={0.25}
            roughness={0.38}
          />
        </mesh>

        {/* The mark, floated just proud of the front face so it never
            z-fights with it. Unlit, so the logo keeps its own colour instead
            of being tinted by the rig. */}
        {texture ? (
          <mesh position={[0, 0, 0.072]}>
            <planeGeometry args={[1.85, 1.85]} />
            <meshBasicMaterial
              map={texture}
              transparent
              toneMapped={false}
              side={DoubleSide}
            />
          </mesh>
        ) : null}
      </group>

      {/* A dark plane well behind everything, catching the rim light. Gives
          the object something to sit against without adding a real
          environment map. */}
      <mesh position={[0, 0, -3]}>
        <planeGeometry args={[16, 10]} />
        <meshStandardMaterial color={BACKGROUND} roughness={1} metalness={0} />
      </mesh>
    </ThreeCanvas>
  );
};
