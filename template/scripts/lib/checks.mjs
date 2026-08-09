/**
 * Deterministic checks on a scene plan.
 *
 * Every gotcha in CLAUDE.md is described as a bug that "rendered without error
 * and only showed up in the output". Most of them never needed a rendered
 * frame to catch — they needed two numbers compared. This file is that
 * comparison, kept pure so it is testable without mounting Remotion.
 *
 * A finding carries a `target` because a check that only says "something is
 * wrong" costs a full re-reason; one that names the field costs an edit.
 */

/** @typedef {{check: string, severity: "fail"|"warn", message: string, target: string}} Finding */

export const heroBeats = (plan) => plan.beats.filter((b) => b.type === "interaction");

export const checkContiguity = (plan) => {
  const out = [];
  let prev = 0;
  plan.beats.forEach((b, i) => {
    const [from, to] = b.frames;
    if (from !== prev) {
      out.push({
        check: "contiguity",
        severity: "fail",
        message: `beat ${b.id} (${b.type}) starts at ${from}, but the previous ended at ${prev}`,
        target: `beats[${i}].frames`,
      });
    }
    prev = to;
  });
  if (plan.beats.length && prev !== plan.total_frames) {
    const i = plan.beats.length - 1;
    out.push({
      check: "contiguity",
      severity: "fail",
      message: `the last beat ends at ${prev}, but total_frames is ${plan.total_frames}`,
      target: `beats[${i}].frames`,
    });
  }
  return out;
};

/**
 * One hero moment means one *recording*, not one beat.
 *
 * A hero take spans several spoken lines, and one line is one beat, so several
 * interaction beats legitimately share a recording and are given consecutive
 * `segment` slices by plan-from-script.mjs. Counting beats instead of
 * recordings would fail every real plan — the shipped reference plan has five.
 */
export const checkOneHeroRecording = (plan) => {
  const names = [...new Set(heroBeats(plan).map((b) => b.recording).filter(Boolean))];
  if (names.length <= 1) return [];
  return [
    {
      check: "one_hero",
      severity: "fail",
      message: `${names.length} hero recordings (${names.join(", ")}) — two hero moments means neither gets proven`,
      target: "beats[].recording",
    },
  ];
};

/** Below 30% the hero is a feature the video mentions, not the spine it is built on. */
export const checkHeroShare = (plan) => {
  const frames = heroBeats(plan).reduce((a, b) => a + (b.frames[1] - b.frames[0]), 0);
  const share = plan.total_frames ? frames / plan.total_frames : 0;
  if (share >= 0.3) return [];
  return [
    {
      check: "hero_share",
      severity: "fail",
      message: `the hero is ${Math.round(share * 100)}% of the runtime; below 30% it reads as a feature, not a spine`,
      target: "beats[].frames",
    },
  ];
};

/**
 * The payoff is a typography beat *after* the hero.
 *
 * Without one the hero is a screenshot rather than a claim: the viewer is shown
 * a thing happening and never told what it meant. The CTA does not count — a
 * URL is an instruction, not a completion.
 */
export const checkPayoff = (plan) => {
  const hero = heroBeats(plan);
  if (!hero.length) return [];
  const heroEnd = Math.max(...hero.map((b) => b.frames[1]));
  const payoff = plan.beats.some((b) => b.type === "typography" && b.frames[0] >= heroEnd);
  if (payoff) return [];
  return [
    {
      check: "payoff",
      severity: "fail",
      message:
        "no typography beat after the hero — without a payoff the hero is a screenshot, not a claim",
      target: "beats",
    },
  ];
};
