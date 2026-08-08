import React, { useEffect, useState } from "react";
import { continueRender, delayRender } from "remotion";
import { FONT_REQUESTS } from "../theme";

/**
 * Loads the founder's fonts from Google Fonts before the first frame renders.
 *
 * The hard rule here is that a font problem must never become a render problem.
 * Every path — network down, font name that isn't on Google Fonts, no italic
 * cut available — falls through to the system stack in theme.ts and lets the
 * render continue. A 6s ceiling guarantees we never hang a demo.
 */

const RENDER_TIMEOUT_MS = 6000;

const cssUrl = (family: string, axis: string) =>
  `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(
    /%20/g,
    "+",
  )}${axis}&display=swap`;

const addStylesheet = (href: string, onFail: () => void) => {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.onerror = onFail;
  document.head.appendChild(link);
  return link;
};

export const Fonts: React.FC = () => {
  const [handle] = useState(() => delayRender("Loading fonts"));

  useEffect(() => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      continueRender(handle);
    };

    const timer = setTimeout(finish, RENDER_TIMEOUT_MS);

    for (const req of FONT_REQUESTS) {
      const rich = req.weights.includes(";")
        ? `:wght@${req.weights}`
        : `:ital@0;1`;
      // If the rich request 404s (font has no italic cut, say), retry bare.
      addStylesheet(cssUrl(req.family, rich), () => {
        addStylesheet(cssUrl(req.family, ""), () => undefined);
      });
      // Belt and braces: also request the italic cut for serif families.
      addStylesheet(cssUrl(req.family, ":ital@1"), () => undefined);
    }

    const probes = FONT_REQUESTS.flatMap((req) => [
      document.fonts.load(`700 120px "${req.family}"`),
      document.fonts.load(`italic 400 120px "${req.family}"`),
    ]);

    Promise.allSettled(probes)
      .then(() => document.fonts.ready)
      .then(finish)
      .catch(finish);

    return () => clearTimeout(timer);
  }, [handle]);

  return null;
};
