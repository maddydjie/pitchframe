import { useEffect, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";

/**
 * Loads a JSON sidecar from public/, blocking the render until it resolves.
 *
 * Used for the things the pipeline generates but the plan should not carry:
 * the per-frame cursor track, the audio manifest. Both are written by scripts,
 * both are large or uninteresting to a human reading plan.json, and both must
 * be absent without breaking anything.
 *
 * Two details that are not optional:
 *
 * `delayRender` — without it a headless render photographs the frame before
 * the fetch lands, so every frame renders in its fallback state and the
 * failure is invisible until you watch the output.
 *
 * `continueRender` in the catch — a missing file that never continues hangs
 * the render until it times out, turning "this asset is absent" into "the
 * render is broken".
 */
export type AssetState<T> =
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "missing" };

/**
 * The state is returned rather than `T | null` because callers have to be able
 * to tell "still loading" from "not there". Collapsing the two makes a beat
 * render its fallback during the load — which, for a beat whose fallback wants
 * different files, means 404s on every frame and a flash of the wrong content
 * if the fetch is slow.
 */
export const useJsonAsset = <T,>(
  relativePath: string | null | undefined,
): AssetState<T> => {
  const [state, setState] = useState<AssetState<T>>(
    relativePath ? { status: "loading" } : { status: "missing" },
  );
  const [handle] = useState(() =>
    relativePath ? delayRender(`asset:${relativePath}`) : null,
  );

  useEffect(() => {
    if (!relativePath || handle === null) return;
    let live = true;

    fetch(staticFile(relativePath))
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((json: T) => {
        if (!live) return;
        setState({ status: "ready", value: json });
        continueRender(handle);
      })
      .catch(() => {
        if (!live) return;
        setState({ status: "missing" });
        continueRender(handle);
      });

    return () => {
      live = false;
    };
  }, [relativePath, handle]);

  return state;
};
