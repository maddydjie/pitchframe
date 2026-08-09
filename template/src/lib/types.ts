/**
 * The contract between the agent and the renderer.
 *
 * Pitchframe makes launch videos, not demo videos. A demo answers "what does
 * this product do" and walks through features; a launch answers "why should
 * this product exist" and shows one moment that embodies the answer. Every
 * type below exists to serve that one moment — there is deliberately no beat
 * type for "another feature", because the moment a schema can express a
 * feature list, plans start containing one.
 *
 * The agent writes plan.json; the palette pipeline writes theme.ts. If you
 * change a type here, change skills/pitchframe-launch-video/SKILL.md to match.
 */

export type AccentStyle = "italic_serif" | "bold_sans" | "none";

/**
 * How a beat arrives. Cross-dissolve is the house style — hard cuts read as
 * unfinished, and anything more elaborate competes with the hero moment.
 */
export type TransitionKind = "dissolve" | "sweep" | "flash" | "none";

/**
 * The camera move, by name.
 *
 * A name rather than numbers, and a closed set rather than a free field. The
 * agent choosing between six tuned moves produces a video that looks the same
 * kind of good every run; the agent inventing camera math produces a different
 * video every run, which is the same thing as an unreliable one. Defined in
 * `src/lib/camera.ts` — that file is the documentation.
 */
import type { ShotName } from "./camera";
export type { ShotName };

/** Percentages of the screenshot, so a target survives any panel size. */
export type Point = { x: number; y: number };

/**
 * What the beat sits on. Every beat type accepts this.
 *
 * `dark` is the house default and the composition's own background. `mesh` and
 * `light` are large soft fields in the product's colour — and the *alternation*
 * between them is the point, not any one of them. A video that is uniformly
 * dark has no rhythm; one that alternates gets pacing for free.
 *
 * At most two bright beats in a launch video, and never two in a row.
 */
export type SurfaceKind = "dark" | "mesh" | "light";

/**
 * How the product fills the frame.
 *
 * - `bleed` — oversized, edges run off frame. You are inside the app.
 * - `closeup` — `crop` fills the frame. Still in situ.
 * - `component` — `crop` is **lifted out of the app** and floated on the
 *   video's own surface, with a shadow and rounded corners. No window, no
 *   surrounding UI. This is what the reference launch videos do most: a menu,
 *   a field, a card, alone at huge scale on a gradient.
 * - `contained` — the whole app in a card with margin. The most literal, and
 *   the clearest tell that a video was generated.
 */
export type Framing = "bleed" | "closeup" | "component" | "contained";

/**
 * One shot inside the hero moment.
 *
 * **A hero moment is a sequence of shots, not a single held frame.** The
 * reference videos cut constantly — sixteen samples of a ninety-second film
 * gave sixteen different compositions, and none of them held an entire
 * application in a window for thirty seconds.
 *
 * All shots play from the *same continuous recording*: the footage never
 * restarts, so one take becomes many angles. That is exactly how the
 * references are cut, and it is why a single 34-second recording can carry a
 * six-shot hero.
 *
 * The rhythm that works, and the one to reach for by default:
 *
 *   wide  →  the action  →  punch in on the consequence  →  pull back
 *
 * Cuts are hard. A dissolve between two crops of the same footage reads as a
 * mistake, because the viewer sees the same pixels sliding.
 */
/**
 * A UI moment **drawn rather than photographed**.
 *
 * The reference launch films are mostly not screen recordings — their UI
 * moments are rebuilt as vector and animated a piece at a time. A screenshot
 * cannot do that, and cropping into one magnifies pixels: a lifted toolbar at
 * 30% of a 1920px recording is 576 real pixels stretched to fill the frame.
 *
 * **Labels come from recon, never from you.** A rebuilt component carrying the
 * product's real words is truthful; one carrying invented words is a lie that
 * renders beautifully. That line is why this is allowed to sit beside the
 * recorder rather than replace it — the hero moment stays real footage, and
 * this carries the shots around it.
 */
export type VectorRender = {
  /**
   * A closed set, like the camera shots. Freeform layout at generation time is
   * where inconsistency comes back.
   *
   * - `chips` — a loose cluster of glass action pills, one lit. For "here is
   *   what it can do". Feed it real control labels.
   * - `fan`   — cards receding into depth, one legible at the front. For
   *   "there are many of these" without listing them, which would be a feature
   *   tour. Feed it real headings.
   * - `grid`  — a lattice of tiles lit by a diagonal wave. For *a system*:
   *   parts that get swept, covered or checked. Reads as machinery working.
   *   Feed it real labels; unlabelled tiles stay blank on purpose.
   */
  archetype: "chips" | "fan" | "grid";
  /** Real strings, taken from `.work/recon.json`. Never invented. */
  items: string[];
  /** Which one is held lit. `chips` and `grid`. */
  active?: number;
};

export type HeroShot = {
  /** Length in frames. The last shot absorbs any remainder of the beat. */
  frames: number;
  /**
   * Draw this shot instead of framing the footage. The recording keeps
   * running underneath — cutting to vector and back is a cut, not a stop.
   */
  render?: VectorRender | null;
  framing?: Framing;
  /** Required by `closeup` and `component`. Percentages of the footage. */
  crop?: { x: number; y: number; w: number; h: number } | null;
  /** Camera move for this shot alone. */
  shot?: ShotName;
  /** Lens punch. `1` disables — right for a shot that is already tight. */
  zoom?: number;
  /** Window chrome. Forced off for `closeup` and `component`. */
  chrome?: "macos" | "none";
};

/**
 * The signature 3D moment — a *treatment* on an existing beat, not a beat
 * type of its own.
 *
 * A rotating mark is the logo beat rendered in 3D. A device mockup is the
 * product shot rendered in 3D. A particle field is explicitly not a shot at
 * all — it composes underneath another beat's content. None of the three is a
 * new thing to show, which is the bar a new beat type has to clear, and
 * keeping them as treatments leaves the "exactly one interaction beat, hero
 * ≥30% of frames" arithmetic untouched.
 *
 * **At most one per video, and the critique pass enforces it.** Three.js
 * frames cost multiples of a 2D frame, and a video with two signature moments
 * has none.
 */
export type ThreeDTreatment = {
  template: "rotating_logo" | "device_mockup" | "particle_field";
  /** Template-specific. See src/three/ for what each one reads. */
  props?: Record<string, unknown>;
};

/**
 * The cold open, the payoff, and nothing else.
 *
 * Typography in a launch video is setup and completion around the hero
 * moment. It is not narration and it is not a caption track.
 */
export type TypographyBeatSpec = {
  id: number;
  type: "typography";
  /** [startFrame, endFrame) — end exclusive, matching Remotion Sequence math. */
  frames: [number, number];
  transition?: TransitionKind;
  /** What the beat sits on. See SurfaceKind. */
  surface?: SurfaceKind;
  text: string;
  /** Substring of `text` set in the accent style. Must match exactly, or null. */
  accent_word?: string | null;
  accent_style?: AccentStyle | null;

  /**
   * How the words are arranged. Defaults to `centered`.
   *
   * - `centered` — one measured line. The house default, and right for any
   *   sentence the viewer has to read as a sentence.
   * - `stacked` — each word on its own line, sizes and horizontal offsets
   *   varying. Reads as designed rather than typeset, which is what the
   *   reference launch videos use for a short declarative phrase.
   *
   * - `ghosted` — each word carries copies of itself trailing behind, fading
   *   and softening. Reads as motion frozen mid-travel. For one short phrase
   *   with momentum; on a long line it becomes a smear.
   *
   * **`stacked` needs three or four short words and nothing longer.** Above
   * that it stops being a composition and becomes a list, and the eye has
   * nowhere to start. If the line is a real sentence, it is `centered`.
   */
  layout?: "centered" | "stacked" | "ghosted";
};

/**
 * THE SPINE.
 *
 * One specific action performed on real UI, framed cinematically and held
 * long enough for the viewer to feel the point. This is the beat the whole
 * video is built to deliver; everything else is setup and payoff around it.
 *
 * A launch video has exactly one of these unless the thesis genuinely has
 * multi-beat structure — and that needs justifying, because two hero moments
 * usually means the thesis was really two theses and neither got proven.
 */
export type InteractionBeatSpec = {
  id: number;
  type: "interaction";
  frames: [number, number];
  transition?: TransitionKind;
  /** What the beat sits on. See SurfaceKind. */
  surface?: SurfaceKind;

  /**
   * Recorded footage of the action, by name — `assets/<name>/0001.jpg…` plus
   * `assets/<name>.track.json`. Written by a `record` shot in capture.json.
   *
   * This is the preferred source and the reason the beat exists in its current
   * form. Footage carries the product's own motion: its easing, its hover
   * states, its loading spinner. The before/after pair below is the fallback
   * for when a site cannot be driven — and a dissolve between two stills
   * always reads as a slideshow, because that is what it is.
   *
   * Size the beat to `frame_count` from capture-result.json. The composition
   * will stretch footage to fit whatever length it is given, but past about
   * 1.6× the speed change stops reading as pacing.
   */
  recording?: string | null;

  /**
   * Which slice of the recording this beat plays, as fractions 0–1.
   *
   * The script model made this necessary: one spoken line is one beat, but a
   * hero take spans several lines. Without a segment each of those beats would
   * replay the whole recording, so the same click would happen three times.
   *
   * Assigned automatically by `plan-from-script.mjs` — consecutive beats
   * sharing a recording are given consecutive slices in proportion to their
   * lengths, so the footage runs continuously across the cuts.
   */
  segment?: [number, number] | null;

  /** The UI before the action. Fallback when there is no recording. */
  before_screenshot?: string | null;
  /** The UI after it — the state change is the proof. */
  after_screenshot?: string | null;

  /**
   * What the cursor acts on, as percentages of the screenshot.
   *
   * With a recording the real cursor path comes from the track, and this is
   * used only to aim the zoom when `zoom_target` is absent.
   */
  /** Optional: a beat rendering only drawn shots has nothing to point at. */
  target_element?: {
    selector?: string | null;
    coordinates: Point;
  };

  interaction_type: "click" | "type" | "hover" | "drag";
  /** For `type`: what gets typed, revealed a character at a time. */
  type_content?: string | null;
  /** For `drag`: where the cursor releases. */
  drag_target?: Point | null;

  /** Where the cinematic zoom lands. Defaults to the target. */
  zoom_target?: Point | null;

  /**
   * How hard the lens punches in on the consequence. Default 1.3 (1.12 for a
   * `closeup`, which is already inside the subject). Set `1` to disable.
   *
   * **Disable it when the consequence fills the frame.** The punch assumes the
   * change is local — a panel opening, a field updating — so it crops toward
   * one point. When the thing being proven is spread across the whole surface
   * (a diagram forming on a canvas, a page laying itself out), pushing in
   * removes the proof and leaves empty space where the story was.
   *
   * A number between 1.0 and about 1.4. Past that the footage upscales
   * visibly, since the recording is only 1920px wide to begin with.
   */
  zoom?: number;

  /**
   * The camera move under the action. Defaults to `push_in_reveal`.
   *
   * Separate from the zoom on purpose: the shot is the camera finding its
   * subject over the whole beat, the zoom is the lens punching in on the
   * consequence of the click. They run on different clocks — the second is
   * timed to the recorded mouse-down — and collapsing them into one control
   * loses that.
   */
  shot?: ShotName;

  /**
   * How the product fills the frame. Defaults to `bleed`.
   *
   * This is the single clearest tell that a video was generated. Every
   * reference launch video either runs the UI past the edge of the frame or
   * crops hard into one element; none of them centre a whole screenshot inside
   * a rounded card with margin on all four sides. That contained look reads as
   * "a screenshot someone put in a slide", and no amount of camera work fixes
   * it — the composition itself is what's wrong.
   *
   * - `bleed` — oversized, edges run off frame. The default and usually right.
   * - `closeup` — fills the frame with `crop`. The strongest shot available.
   * - `contained` — the old card-with-margin. For an establishing frame where
   *   the viewer genuinely needs to see the whole application at once.
   */
  framing?: Framing;

  /**
   * The hero cut into shots, all from the same continuous recording.
   *
   * **Strongly preferred over a single framing** for any hero over about six
   * seconds. One framing held for thirty seconds is the single biggest reason
   * a generated video reads as generated — the reference films cut every one
   * to three seconds.
   *
   * **`shots` wins over the beat-level `framing` / `crop` / `shot` / `zoom` /
   * `chrome` whenever it is present.** Those fields remain as the shorthand
   * for a one-shot hero, which is a legitimate thing to write; they are
   * normalised into a single-entry array by `resolveShots()` in
   * `lib/heroShots.ts`, which is the only place the rule exists.
   */
  shots?: HeroShot[];

  /**
   * macOS window chrome — the title bar with the red/amber/green lights.
   * Defaults to `macos`.
   *
   * A recorded website with nothing around it is ambiguous: screenshot, mock,
   * or design? The traffic lights resolve it instantly, and the viewer reads a
   * real application on a real machine — which is exactly the claim the hero
   * moment is making.
   *
   * **Chrome and `bleed` are mutually exclusive.** A window whose edges have
   * left the frame is not a window, so turning chrome on sizes the panel to
   * fit with a margin. Choose one look or the other:
   *   - chrome on  → you are looking at the app on a machine
   *   - `bleed`, chrome off → you are inside the app
   *
   * Forced off for `closeup`: the crop magnifies the footage, and the chrome
   * is not part of the footage.
   */
  chrome?: "macos" | "none";

  /** Shown in the window's URL pill. A real domain is evidence; omit to hide. */
  chrome_url?: string | null;

  /**
   * The region of the footage a `closeup` fills, as percentages.
   *
   * Pick the element the moment is about — an input, a button, a single row —
   * not a quadrant. A crop wider than about 45% is a zoom, not a close-up, and
   * loses the thing that makes the shot work.
   */
  crop?: { x: number; y: number; w: number; h: number } | null;

  /** One line, held under the action. Optional and usually unnecessary. */
  caption?: string | null;
};

/**
 * The brand mark landing.
 *
 * Placed after the setup, before the hero moment: the setup states the
 * problem, the logo answers it, the hero proves the answer. That is the shape
 * every keynote reveal uses, and it is why the mark reads as a claim rather
 * than a watermark.
 *
 * Short — 1.5 to 3 seconds. Its job is to punctuate, not to hold.
 */
export type LogoBeatSpec = {
  id: number;
  type: "logo";
  frames: [number, number];
  transition?: TransitionKind;
  /** What the beat sits on. See SurfaceKind. */
  surface?: SurfaceKind;

  /** The signature 3D moment, if this beat is carrying it. */
  three_d?: ThreeDTreatment | null;

  /** Filename in public/assets/ — the mark, captured from the real site. */
  source?: string | null;
  /** Rendered as type when there is no image, or set beside the mark. */
  wordmark?: string | null;
  /** One short line under the mark. Usually null. */
  tagline?: string | null;

  /**
   * Dark marks vanish on a dark background. A plate is the light rounded
   * surface brands use to present a dark logo on dark — deliberate, not a
   * workaround. `none` for marks that already read light.
   */
  plate?: "light" | "none";
};

/**
 * A plain product shot. Use for an environment establishing frame, not to
 * show a feature — a UI beat that exists to display a capability is a demo
 * beat wearing a different name.
 */
export type UIBeatSpec = {
  id: number;
  type: "ui";
  frames: [number, number];
  transition?: TransitionKind;
  /** What the beat sits on. See SurfaceKind. */
  surface?: SurfaceKind;
  screenshot?: string | null;
  /** Defaults to `tilt_settle` — an establishing shot presents, it doesn't use. */
  shot?: ShotName;
  /** The signature 3D moment, if this beat is carrying it. */
  three_d?: ThreeDTreatment | null;
  caption?: string | null;
};

export type CTABeatSpec = {
  id: number;
  type: "cta";
  frames: [number, number];
  transition?: TransitionKind;
  /** What the beat sits on. See SurfaceKind. */
  surface?: SurfaceKind;
  /** The signature 3D moment, if this beat is carrying it. */
  three_d?: ThreeDTreatment | null;
  url: string;
};

export type BeatSpec =
  | TypographyBeatSpec
  | LogoBeatSpec
  | InteractionBeatSpec
  | UIBeatSpec
  | CTABeatSpec;

export type ScenePlan = {
  /**
   * Carried into the plan so the critique pass can check the video against
   * the claim it is supposed to be making, without re-reading the brief.
   */
  video_thesis: string;
  hero_moment: string;

  /**
   * Which shape the Director chose — `thesis` builds to one moment, `mosaic`
   * gathers several serving one claim.
   *
   * Carried into the plan so conformance can check the video against the
   * direction the Director was handed, without re-reading
   * `.work/direction.json` at render time. It was written into plan.json
   * before it was declared here, which is precisely the drift the schema test
   * now guards.
   */
  structure?: "thesis" | "mosaic";

  duration_seconds: number;
  fps: number;
  total_frames: number;
  music?: boolean;
  /** Track filename inside public/audio/music/. Chosen by the Director. */
  music_file?: string | null;
  /**
   * Voice-over clips, placed at the frame each beat begins.
   *
   * Written by `plan-from-script.mjs`, never by hand: the beat lengths were
   * *derived* from these clips' measured durations, so authoring one side
   * without the other guarantees drift.
   */
  narration?: { file: string; from: number; frames: number }[];
  /**
   * The film grade — bloom and a tone curve over the finished frame. On by
   * default. Turn it off only for a product whose UI is itself very bright,
   * where lifting the highlights costs legibility.
   */
  grade?: boolean;
  beats: BeatSpec[];
};
