import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { ACCENT } from "../theme";

/**
 * Ambient particles, composed *underneath* another beat.
 *
 * Not a beat of its own — it has nothing to say. Its job is to put something
 * at a different depth from the type so that the camera has something to
 * parallax against, which is what stops a typography beat reading as a flat
 * card.
 *
 * The cheapest of the three templates by a wide margin: one draw call, no
 * lighting, no materials to speak of.
 */

/**
 * Positions are generated once from a seeded PRNG, never from `Math.random()`.
 *
 * Random placement would give a different starfield on every render of the
 * same plan — and because Remotion renders frames across parallel workers,
 * potentially a different one *per frame*, which strobes.
 */
const seeded = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const DENSITY = { low: 90, medium: 220, high: 480 } as const;

export const ParticleField: React.FC<{
  density?: keyof typeof DENSITY;
  /** Drift in world units across the whole beat. Small — this is ambience. */
  travel?: number;
}> = ({ density = "low", travel = 0.9 }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();

  const positions = useMemo(() => {
    const count = DENSITY[density];
    const rand = seeded(0x5eed);
    const array = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      array[i * 3] = (rand() - 0.5) * 14;
      array[i * 3 + 1] = (rand() - 0.5) * 8;
      // Spread in depth, biased away from the camera so nothing sits on the
      // lens. Depth is the entire reason this component exists.
      array[i * 3 + 2] = -1 - rand() * 7;
    }
    return array;
  }, [density]);

  const t = frame / Math.max(1, durationInFrames);

  return (
    <ThreeCanvas
      width={width}
      height={height}
      gl={{ alpha: true, antialias: true }}
      style={{ background: "transparent" }}
      camera={{ fov: 45, position: [0, 0, 6] }}
    >
      {/* One slow lateral pass. The parallax between near and far particles
          is produced by the perspective camera, not by animating them apart. */}
      <group position={[t * travel - travel / 2, 0, 0]}>
        <points>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[positions, 3]}
            />
          </bufferGeometry>
          <pointsMaterial
            color={ACCENT}
            size={0.045}
            sizeAttenuation
            transparent
            opacity={0.55}
            // Additive so particles brighten where they overlap and vanish
            // against the background rather than reading as grey dots.
            blending={2 /* THREE.AdditiveBlending */}
            depthWrite={false}
          />
        </points>
      </group>
    </ThreeCanvas>
  );
};
