# Launch videos

The doctrine, in full. Everything in the codebase is downstream of this.

## The distinction

A **demo video** answers *what does this product do?* It walks through features.
It reads as documentation. It is a useful artefact — on a docs page, in an
onboarding email, in a sales call. It is not what you launch with.

A **launch video** answers *why should this product exist?* It shows one moment
that captures the essence of the product, framed cinematically and held long
enough for the viewer to feel the point. It reads as a manifesto or a keynote
reveal.

Watch the references and the pattern is unmistakable:

- Raycast AI's landing page video
- The original v0.dev launch
- Cursor's early launch videos
- Linear's cycles announcement
- Arc's Arc Search reveal
- Vercel's v0 launch

**None of them list features.** Each shows one specific moment, cinematically.
Everything else in the video is setup and payoff around that one moment.

## Why the distinction is load-bearing

A demo can be made from a feature list. A launch cannot — it needs a claim, and
a claim can be wrong, which is what makes it worth watching.

The failure mode is always the same and always gradual: you have a good hero
moment, then it seems a shame not to show the other thing, and the other thing
needs a little context, and now there are six beats and the hero has 17% of the
runtime. Nobody decides to make a demo. It happens one reasonable addition at a
time.

That is why the constraints are mechanical rather than tasteful. "Hero ≥ 30% of
frames" is checkable; "keep it focused" is not.

## The two outputs of positioning

Every brief must produce both. One without the other is not a brief.

### `video_thesis`

One sentence, **under 20 words**, answering why the product should exist. A
claim, not a description.

| Not a thesis | Thesis |
|---|---|
| "An open-source CRM with a flexible data model" | "Your CRM should be software you own, not a subscription you rent" |
| "It uses AI to analyse sales calls" | "Every sales call becomes a CRM update. No rep types anything." |
| "A fast, modern terminal" | "The terminal should have been this good a decade ago" |

The test that catches most bad theses: **could a competitor's founder write this
about their own product?** If yes, it is a category description, not a claim.

### `hero_moment`

The single specific action, screen or interaction that embodies the thesis,
written concretely enough that someone could film it.

Good — each names an actor, an action, and a visible consequence:

- "User drags a deal card from Discovery to Closed Won, and every downstream
  CRM field updates automatically"
- "User types 'build me a pricing page', and a real component appears in real
  time"
- "A developer clicks Code on the repo and the whole product is one git clone
  away"

Not hero moments:

| Not a hero moment | Why |
|---|---|
| "The dashboard" | A screen, not a moment. Nothing happens. |
| "Users can customise their data model" | A capability. Where is the action? |
| "The onboarding experience" | Which second of it? |
| "Fast performance" | Nothing to film. |

**If research produces a thesis but no concrete hero moment, the brief is
discarded and reframed.** This is not a formality. Without a spine, the planner
reaches for features to fill the runtime — and that is exactly the failure the
whole system exists to prevent.

Reframing usually means narrowing the claim. "The product is extensible" has no
hero moment. "Your CRM's data model is a file in your repo" has an obvious one.

## Structure

Four parts, in this order, always:

| # | Part | Duration | What it does |
|---|---|---|---|
| 1 | **Cold-open setup** | 2–6s | Why the moment matters. Usually typography. |
| 2 | **Logo** | 1.5–3s | The mark answers the setup. Optional but recommended. |
| 3 | **Hero moment** | 6–15s | The one action. **The spine.** |
| 4 | **Payoff** | 4–10s | What changed. Lets the viewer complete the thought. |
| 5 | **CTA** | 2–4s | URL only. |

For a 20-second launch: **4s setup, 10s hero, 4s payoff, 2s CTA.**
For a 60-second launch: **10s setup, 30s hero, 15s payoff, 5s CTA.**

The logo sits between setup and hero because that is the keynote shape: the
setup states the problem, the mark answers it, the hero proves the answer. A
logo at the end is a watermark; a logo in that slot is a claim.

## Duration follows the thesis

There is no default runtime.

| `thesis_weight` | Runtime | Shape |
|---|---|---|
| `single` | 15–25s | One claim, one hero moment. Most launches. |
| `two-part` | 25–45s | Setup and reveal, each earning its time. |
| `three-beat` | 45–90s | Problem, product, ecosystem. Rare, needs justifying. |

**Under no circumstance is the video longer than the thesis earns.** A
90-second video with a 15-second thesis is a demo.

If you have runtime left over and nothing to put in it, the answer is a shorter
video — never another beat. Shortening is always available and always correct.

Inflating `thesis_weight` to buy runtime is the most common way a launch turns
back into a demo. If in doubt, it is `single`.

## The five critique checks

A plan fails if any of these is true. They run *before* the storytelling checks,
because a genre error is not fixable by beat-level polish.

1. **More than one interaction beat** — unless the thesis genuinely has
   multi-beat structure and the draft names why. Two hero moments almost always
   means the thesis was two theses and neither got proven.
2. **A beat that doesn't visibly serve the thesis or set up the hero moment** —
   feature-list beats that snuck in are the most common failure, and they arrive
   disguised as "context" or "one more thing worth showing".
3. **The hero gets under 30% of total frames** — the video is treating its spine
   as a feature.
4. **No payoff beat** — without it the hero moment is a screenshot, not a claim.
   A CTA is not a payoff.
5. **Runtime beyond what the thesis earns.**

## Worked example — a self-hostable CRM

Hypothetical, to show the shape. Substitute the real product's facts.

**Thesis:** "Your CRM should be software you own, not a subscription you rent."
(11 words, a claim, falsifiable.)

**Hero moment:** "A developer opens the repo, clicks Code, and the entire CRM
is one git clone away."

Chosen because it is the one thing the incumbent SaaS competitors *cannot* show
you — they can't show you their source. And it is literally capturable: the
panel in the video is the real one on the real repo.

**Rejected:** the AI chat scaffolding a workspace (proves "designed for AI", a
different thesis); the records table (a screen, and every CRM has one); the
self-hosting docs (documentation is a claim about ownership, not a
demonstration of it).

**Plan** — 22 seconds, hero at 36.4%:

| Beat | Duration | Content |
|---|---|---|
| typography | 3.0s | "Every company runs on a CRM" |
| typography | 3.0s | "*nobody* owns." |
| logo | 3.0s | The product mark |
| **interaction** | **8.0s** | Click Code → the Clone panel opens with the git URL |
| typography | 3.0s | "Now it's *yours*." |
| cta | 2.0s | example.com |

22 seconds, 660 frames, hero at 36% — comfortably clear of the 30% floor.
