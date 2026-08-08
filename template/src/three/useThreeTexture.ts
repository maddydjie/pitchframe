import { useEffect, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";
import { CanvasTexture, TextureLoader, SRGBColorSpace, type Texture } from "three";

/**
 * Loads an image into a Three.js texture, blocking the render until it lands.
 *
 * Deliberately not `useLoader` or drei's `useTexture`. Both suspend, and
 * Suspense inside a Remotion render is a way to photograph the fallback: the
 * frame is captured whenever React settles, which may be before the texture
 * resolves. `delayRender` is the mechanism Remotion actually guarantees.
 *
 * Same shape as `useJsonAsset` in lib/asset.ts, for the same reason — the
 * failure path must `continueRender` or a missing logo hangs the render until
 * it times out instead of falling back in milliseconds.
 */
export const useThreeTexture = (src: string | null | undefined): Texture | null => {
  const [texture, setTexture] = useState<Texture | null>(null);
  const [handle] = useState(() => (src ? delayRender(`texture:${src}`) : null));

  useEffect(() => {
    if (!src || handle === null) return;
    let live = true;

    const url = staticFile(`assets/${src}`);
    const done = (t: Texture | null) => {
      if (!live) return;
      if (t) {
        // Without this the texture is treated as linear and the logo renders
        // visibly washed out against everything else in the frame.
        t.colorSpace = SRGBColorSpace;
        t.anisotropy = 8;
      }
      setTexture(t);
      continueRender(handle);
    };

    /**
     * SVG needs rasterising first.
     *
     * `TextureLoader` goes through `ImageLoader`, and an SVG without intrinsic
     * pixel dimensions decodes to a zero-sized image — WebGL then gets an
     * empty texture and reports no error. The mark simply does not appear, and
     * because the material switches to its textured colour the result is a
     * dark slab on a dark background: a black frame with no clue why.
     *
     * This bit only started mattering when logo fetching began preferring
     * inline SVG, which is the *better* asset everywhere except here.
     */
    if (/\.svg($|\?)/i.test(src)) {
      const SIZE = 1024;
      const img = new Image();
      img.crossOrigin = "anonymous";
      // Explicit size is the whole fix: it gives the SVG a raster to fill.
      img.width = SIZE;
      img.height = SIZE;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) return done(null);
        // Fit the mark inside the square without distorting it.
        const ratio = (img.naturalWidth || SIZE) / (img.naturalHeight || SIZE);
        const w = ratio >= 1 ? SIZE : SIZE * ratio;
        const h = ratio >= 1 ? SIZE / ratio : SIZE;
        ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
        done(new CanvasTexture(canvas));
      };
      img.onerror = () => done(null);
      img.src = url;
      return () => {
        live = false;
      };
    }

    new TextureLoader().load(url, (t) => done(t), undefined, () => done(null));

    return () => {
      live = false;
    };
  }, [src, handle]);

  return texture;
};
