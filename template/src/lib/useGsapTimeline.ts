import { useLayoutEffect, useRef, type DependencyList } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { gsap } from "gsap";

/**
 * Drives a GSAP timeline from Remotion's frame number.
 *
 * GSAP animates off its own ticker; Remotion does not play, it renders frame N
 * and screenshots. The bridge is a *paused* timeline that gets seeked to
 * `frame / fps` — GSAP is one of very few libraries with a genuinely
 * scrubbable timeline, and that is the entire reason it can be used here at
 * all.
 *
 * This hook exists because the obvious way to write that is wrong:
 *
 * ```tsx
 * const tl = useMemo(() => {
 *   gsap.timeline({paused: true}).to(ref.current, {...})   // ← null
 * }, [deps]);
 * tl.seek(frame / fps);                                    // ← during render
 * ```
 *
 * `useMemo` runs **during render, before refs are attached**, so GSAP is
 * handed `null`, tweens nothing, and reports no error — the animation is
 * simply absent. And seeking during render is a side effect React may run
 * twice or discard.
 *
 * `useLayoutEffect` fixes both: refs exist by then, and it runs before the
 * browser paints, so the seek has landed before Remotion takes the frame.
 */
export const useGsapTimeline = (
  build: (tl: gsap.core.Timeline) => void,
  deps: DependencyList,
) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeline = useRef<gsap.core.Timeline | null>(null);

  useLayoutEffect(() => {
    const tl = gsap.timeline({ paused: true });
    build(tl);
    timeline.current = tl;
    return () => {
      // Timelines hold references to DOM nodes. Remotion mounts and unmounts
      // the tree constantly across a render; without this they accumulate.
      tl.kill();
      timeline.current = null;
    };
    // `build` is intentionally not a dependency — it is a fresh closure every
    // render, and including it would rebuild the timeline on every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useLayoutEffect(() => {
    // `true` suppresses callbacks. A seek that fires onComplete handlers would
    // run them once per frame, and out of order when frames render in
    // parallel across workers.
    timeline.current?.seek(frame / fps, true);
  });
};
