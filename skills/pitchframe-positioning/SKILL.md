---
name: pitchframe-positioning
description: Read a codebase and research its competitors to produce a launch-video positioning brief — a one-sentence thesis answering why the product should exist, and the single concrete moment that embodies it. Used by Pitchframe for steps 1 and 3.
---

# Positioning research

This is the layer that makes Pitchframe an agent instead of a generator, and
it is where launch videos are won or lost.

You are producing **two** things. Both are mandatory. A brief with one of them
is not a brief.

1. **`video_thesis`** — one sentence, under 20 words, answering *why should this
   product exist?* A claim, not a description.
2. **`hero_moment`** — the single specific action, screen, or interaction that
   best embodies the thesis, written concretely enough to film.

## Launch, not demo

A demo answers *what does this product do?* It walks through features. It reads
as documentation.

A launch answers *why should this product exist?* It shows one moment that
captures the essence of the product, framed cinematically and held with
intention. It reads as a manifesto or a keynote reveal.

Watch what the good ones do — Raycast AI, the original v0.dev launch, Cursor's
early videos, Linear's cycles announcement, Arc Search's reveal. **None of them
list features.** Each shows one specific moment; everything else in the video is
setup and payoff around that moment.

Your brief either gives the planner one such moment, or it gives it a feature
list with extra steps.

## Step 1 — Read the product

Write `pitchframe/.work/product.json`. Read in this order and stop when you have
enough; you are looking for claims and evidence, not completeness.

### URL mode — read the site instead

With no codebase, `.work/recon.json` is the evidence. It carries what a visitor
learns in the first ten seconds, which is exactly the right input for a thesis:

| From recon | Stands in for |
|---|---|
| `identity.h1` | The README's opening line — the intended pitch |
| `identity.description` | The package description |
| `headings` | The section structure: what they think matters, in order |
| `nav` | The surface area, the way a dependency list leaks it |
| `candidates` | What the product actually lets you *do* |

Two cautions specific to reading a site.

**The h1 is marketing copy, not a thesis.** "Build your Enterprise CRM at AI
Speed" is positioning that survived a committee. Your job is a read *on* it,
not a paraphrase of it — the same rule as not copying the README's tagline.

**`candidates` is the strongest signal on the page.** A site can claim
anything; what it lets you click is what it actually is. If the copy promises
AI and the only interactive thing is a contact form, the thesis has to survive
that gap, and the hero moment must come from what exists.

### Codebase mode — read the repo

1. `README.md` — the intended pitch. Note what it leads with.
2. `package.json` — name, description, dependency list. Dependencies leak the
   real architecture.
3. **Landing page copy** — the founder's own words.
4. **Pricing page** — what is metered and what is gated tells you what the
   company believes is valuable.
5. **Route list / app structure** — the set of screens is the set of jobs, and
   it is where the hero moment will come from.
6. **Recent commits** — what is being built now is often what matters most.

## Step 3 — Research and write the brief

### Searching

Target **3 searches, hard maximum 5**. You are finding what the three nearest
competitors put on their homepage, so you can say what this product does that
they don't. Fetch 2–3 competitor homepages and read what they lead with; the
headline and first feature block are the positioning.

If search returns nothing useful, reason from the codebase, set
`competitor_landscape` to `[]`, and log it. Never invent a competitor.

### The thesis

Under 20 words. A claim, not a description.

| Not a thesis | Thesis |
|---|---|
| "An open-source CRM with a flexible data model" | "Your CRM should be software you own, not a subscription you configure" |
| "It uses AI to analyse sales calls" | "Every sales call becomes a CRM update. No rep types anything." |
| "A fast, modern terminal" | "The terminal should have been this good a decade ago" |

Tests it must pass:

- **Falsifiable.** "Every sales call becomes a CRM update" can be checked.
  "Sales intelligence, reimagined" cannot.
- **A claim, not a category.** Categories describe; claims argue.
- **Grounded in something you read.** If you cannot point at the file or the
  pricing line that proves it, you invented it.
- **Could a competitor's founder write this about their own product?** If yes,
  it is worthless. Start again.

### The hero moment

The single action, screen or interaction the thesis is about. **Write it
concretely enough that someone could film it.**

Good — each names an actor, an action, and a visible consequence:

- "User drags a deal card from Discovery to Closed Won, and every downstream
  CRM field updates automatically"
- "User types 'build me a pricing page', and a real component appears in real
  time"
- "User forks the entire product repo in one terminal command"

Not hero moments:

| Not a hero moment | Why |
|---|---|
| "The dashboard" | A screen, not a moment. Nothing happens. |
| "Users can customise their data model" | A capability. Where is the action? |
| "The onboarding experience" | Which second of it? |
| "Fast performance" | Nothing to film. |

**If the research produces a thesis but no single concrete hero moment, discard
the brief and try again with different framing.** That is not a formality. A
thesis without a hero moment is a demo waiting to happen — the planner will
have nothing to build a spine from, so it will reach for features to fill the
runtime, and you will get the exact failure this whole skill exists to prevent.

Reframing usually means: pick a narrower claim. "The product is extensible" has
no hero moment. "Your CRM's data model is a file in your repo" has an obvious
one.

### Output schema

Write `pitchframe/brief.json`:

```json
{
  "product_summary": "Two sentences. What it does and for whom. No adjectives.",
  "competitor_landscape": [
    { "name": "Salesforce", "emphasis": "configured through an admin UI" }
  ],
  "differentiation_thesis": "One sentence naming the thing only this product does.",
  "video_thesis": "Under 20 words. Why this product should exist.",
  "hero_moment": {
    "description": "The action, concretely. Actor, action, visible consequence.",
    "route": "/deals",
    "interaction_type": "drag",
    "target": "the deal card in the Discovery column",
    "expected_change": "the Salesforce field panel updates without anyone typing"
  },
  "thesis_weight": "single | two-part | three-beat",
  "founder_directive": "Verbatim directive, or null.",
  "directive_tension": "Named only if the directive contradicts the codebase, else null."
}
```

**`thesis_weight`** decides the runtime, so choose it honestly:

- `single` — one claim, one moment. Most launches. → 15–25s
- `two-part` — setup then reveal, where the setup genuinely needs establishing. → 25–45s
- `three-beat` — problem, product, ecosystem. Rare, and needs justifying. → 45–90s

Inflating this to buy runtime is the most common way a launch turns back into a
demo. If in doubt, it is `single`.

## Anti-patterns

| Don't | Because |
|---|---|
| "fast, simple, and powerful" | True of every product ever shipped |
| "AI-powered platform for modern teams" | Category, not claim |
| A hero moment that is a screen, not an action | Nothing happens, so nothing lands |
| Two hero moments | Means the thesis was two theses and neither will get proven |
| A thesis over 20 words | It is a paragraph, and paragraphs become feature lists |
| Competitors you did not verify | The brief is the credibility of the whole run |
| Copying the README's tagline | The founder knows their tagline; you were asked for a read on it |

## Handing off

Print the brief in full — thesis and hero moment especially — then continue
straight to planning. No pause, no confirmation.
