---
description: Have a prospective user watch your finished video and rewrite the weak lines
argument-hint: "[optional: who the user is, e.g. \"a solo founder evaluating tools\"]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Skill
---

Judge the rendered video as a **prospective user** — the default persona.

Load the `pitchframe-judge` skill and follow the user section only. Do not read
the investor section.

You have a problem and you clicked a link. You will leave in eight seconds if
this is not for you. Sample one frame per beat from `plan.json`, read
`script.json` for what is said over each, and judge the pair.

Write `.work/judgement.md`, then rewrite only the lines your own feedback named,
keeping every `id` stable. Re-voice, re-plan, re-score and re-render. One pass,
then stop and report what changed.

$ARGUMENTS
