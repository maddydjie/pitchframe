/**
 * GENERATED FILE — written by pitchframe/scripts/apply-palette.mjs.
 *
 * Every colour the composition renders resolves here, as a literal. Do not
 * hand-edit: change palette.json and re-run the script, or the next generate
 * will overwrite whatever you wrote.
 *
 * Source palette: {"background":"#0a0a0f","text":"#ffffff","primary":"#06b6d4","accent":"#67e8f9","logo_color":null}
 */

/** Deep near-black the whole video sits on. */
export const BACKGROUND = "#0a0a0a";

/** Body and display text. */
export const TEXT = "#ffffff";

/** The product's primary brand colour — CTAs, key marks. */
export const PRIMARY = "#06b6d4";

/** The accent used for payoff words, glows and annotations. */
export const ACCENT = "#f2f2f2";

/** False when extraction found no brand colour and the video stays neutral. */
export const HAS_ACCENT = true;

/** The logo's own colour when the mark declared one. */
export const LOGO = null;

/** Panel and card fill — the surface a screenshot sits on. */
export const SURFACE = "#161616";
export const SURFACE_ALT = "#202020";

export const BORDER = "rgba(255, 255, 255, 0.1)";
export const BORDER_STRONG = "rgba(255, 255, 255, 0.16)";

export const TEXT_MUTED = "rgba(255, 255, 255, 0.66)";
export const TEXT_FAINT = "rgba(255, 255, 255, 0.42)";

/** Shadow tuned to the background rather than assuming black. */
export const SHADOW = "rgba(4, 4, 4, 0.85)";

/** The ambient glow behind type and panels. */
export const GLOW = "rgba(242, 242, 242, 0.1)";

/** The look this theme was generated in. Read by nothing; here to be seen. */
export const STYLE = "mono";

/**
 * Mesh stops — the colours a gradient-mesh surface is built from.
 *
 * Reference launch videos alternate between near-black and a large soft
 * colour field, and that alternation is most of what gives them rhythm. The
 * field has to be the product's own colour or the video stops belonging to
 * the product, so the stops are derived here rather than picked in a
 * component.
 *
 * MESH_DEEP / MESH_MID / MESH_BRIGHT walk from the background toward the
 * accent and past it toward white. MESH_LIGHT_* are the same idea inverted,
 * for the bright beats.
 */
export const MESH_DEEP = "#404040";
export const MESH_MID = "#6c6c6c";
export const MESH_BRIGHT = "#d8d8d8";

export const MESH_LIGHT_BASE = "#f4f4f4";
export const MESH_LIGHT_MID = "#dcdcdc";
export const MESH_LIGHT_DEEP = "#c2c2c2";

/**
 * Text on a light surface. Not the same as inverting TEXT: a bright mesh is
 * mid-tone, not white, so pure black is too harsh and the product's own dark
 * neutral reads better.
 *
 * These exist because adding light surfaces without them produced white type
 * on pale lavender at about 1.6:1 — the same class of bug as the light-theme
 * text flip above, and just as invisible until you look at a frame. Any
 * component that can appear on a light surface must switch to these.
 *
 * Both are darkened until they *measure* clear of MESH_LIGHT_DEEP — 4.5:1 for
 * the text, 3:1 for the accent, which is always display type. They used to be
 * fixed mixes, and the accent's landed at 1.89:1 for a mid-tone brand colour:
 * the very failure the paragraph above describes, reintroduced one line below
 * it, because a ratio cannot know how bright the colour it is handed is.
 */
export const TEXT_ON_LIGHT = "#353535";
export const ACCENT_ON_LIGHT = "#676767";

/**
 * The window traffic lights — and these are deliberately NOT derived.
 *
 * Every other colour in this file comes from the product, because a video that
 * reuses another company's palette stops being that product's video. These
 * three are the exception: red/amber/green in the top-left corner is a
 * recognised OS affordance, and the recognition *is* the effect. Tinted to the
 * brand they stop reading as a window and become three arbitrary dots.
 *
 * They live here rather than in the component so the "no colour literals in
 * components" rule stays absolute and greppable — an exception in the theme is
 * visible, an exception in a component is the start of a second palette.
 */
export const WINDOW_CLOSE = "#ff5f57";
export const WINDOW_MIN = "#febc2e";
export const WINDOW_MAX = "#28c840";

export const FONT_SANS = "\"Inter\", \"Segoe UI\", -apple-system, BlinkMacSystemFont, \"Helvetica Neue\", Arial, sans-serif";
export const FONT_SERIF = "\"Instrument Serif\", \"Times New Roman\", Georgia, serif";

export const FONT_REQUESTS = [
  { family: "Inter", weights: "400;500;600;700;800;900" },
  { family: "Instrument Serif", weights: "400" },
];

/** Converts any theme hex to rgba() so glows can be tinted without a library. */
export const alpha = (hex: string, a: number): string => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
