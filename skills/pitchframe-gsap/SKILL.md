---
name: pitchframe-gsap
description: Use when generating Remotion components that need coordinated motion — several properties on overlapping schedules, multi-stage reveals, transition choreography. Do NOT use for single-property animation; Remotion's interpolate is simpler and has no library cost. Loaded by the code-generation step when a beat needs sequenced motion.
---

# GSAP inside Remotion

GSAP is the animation library. Remotion is the render pipeline. They compose
because a GSAP timeline can be **seeked** — set to an absolute position
synchronously — which is what lets Remotion drive it from a frame number
instead of from a clock.

That is the only reason this works. Remotion does not play: it sets the frame,
waits for React, screenshots, and moves on, sometimes out of order across
parallel workers. Any library animating off `requestAnimationFrame` renders its
initial state on every frame. GSAP is one of the few with a real scrubbable
timeline model.

## Use the hook. Do not hand-roll the pattern.

`template/src/lib/useGsapTimeline.ts`:

```tsx
import { useRef } from "react";
import { useGsapTimeline } from "../lib/useGsapTimeline";

export const Sweep: React.FC<{ kind: string }> = ({ kind }) => {
  const bandRef = useRef<HTMLDivElement>(null);

  useGsapTimeline(
    (tl) => {
      if (!bandRef.current) return;
      tl.fromTo(bandRef.current,
        { xPercent: -130, opacity: 0 },
        { xPercent: 430, opacity: 0.85, duration: 0.6, ease: "power2.inOut" }, 0)
        .to(bandRef.current, { opacity: 0, duration: 0.17 }, 0.43);
    },
    [kind],
  );

  return <div ref={bandRef} style={{ opacity: 0 }} />;
};
```

**The obvious way to write this is wrong**, and it fails silently:

```tsx
const tl = useMemo(() => {
  gsap.timeline({ paused: true }).to(ref.current, {...});  // ← ref.current is null
}, [deps]);
tl.seek(frame / fps);                                      // ← side effect during render
```

`useMemo` runs **during render, before refs are attached.** GSAP receives
`null`, tweens nothing, and throws no error — the animation is simply absent.
Seeking during render is also a side effect React 19 may run twice or discard.

The hook uses `useLayoutEffect` for both: refs exist by then, and it runs before
the browser paints, so the seek has landed before Remotion takes the frame.

## When to reach for GSAP

**Use GSAP when** several properties run on overlapping schedules, or a
sequence has stages whose timings must stay in agreement — a multi-stage
reveal, a transition, a camera move coordinated with something else.

**Use Remotion's `interpolate` when** it is one property over one window.

Rule of thumb: if it would be a single CSS transition, use `interpolate`. If it
would be a coordinated sequence, use GSAP.

Applied to this repo: `Transition.tsx` uses GSAP (three properties, overlapping,
inside eighteen frames). `Zoom.tsx` and `FocusOverlay.tsx` do **not** — each is
one property over one window, and GSAP would add a library and remove clarity.
Reach for it when the sequence earns it, not because it is available.

## Ease curves

This is most of what makes motion feel expensive.

| For | Ease |
|---|---|
| Cursor travel | `power3.inOut` |
| Zoom in | `expo.out` |
| Zoom out | `power2.inOut` |
| Focus pull | `power2.out` |
| Typography reveal | `power1.out` |
| Card entrance | `back.out(1.4)` |

**Never `bounce`, `elastic`, or springs.** They read as template rather than
film, and the whole look here comes from restraint. `back.out(1.4)` is the only
sanctioned overshoot and only on a card arriving.

## The cursor is not yours to animate

The hero beat's cursor is **recorded**, not animated. Playwright moves a real
mouse across the real site and the path is saved frame by frame; the
composition draws it from that track. GSAP cannot improve a recording of
reality — animating the cursor means discarding the recording and going back to
a synthetic one, which is what made earlier output look generated.

If you find yourself writing a cursor tween, stop and check whether a recording
exists.

## Anti-patterns

- **No DOM or window events.** Remotion has no scroll, no pointer, no window.
- **No `gsap.delayedCall`, no `repeat: -1`.** Both fight frame-seeking.
- **No `gsap/all`, no ScrollTrigger.** Import from `gsap` only.
- **No standalone tweens.** Timelines seek; loose tweens do not.
- **Do not let GSAP own a property that CSS also sets.** They fight over the
  same transform string. Static transforms stay in CSS; GSAP owns only what it
  animates.
- **`@types/gsap` is not needed.** GSAP has shipped its own types since v3.

## Reference implementation

`template/src/components/Transition.tsx` — read it before writing a new
GSAP-driven component. It is commented with why it qualifies and why its
neighbours do not.
