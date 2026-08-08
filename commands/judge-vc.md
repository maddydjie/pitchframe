---
description: Have an investor watch your finished video and rewrite the weak lines
argument-hint: "[optional: what you want them to focus on]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Skill
---

Judge the rendered video as an **investor**.

Load the `pitchframe-judge` skill and follow the investor section only. Do not
read the user section — blending the two produces feedback that is true of
neither.

Sample one frame per beat from `plan.json`, read `script.json` for what is said
over each, and judge the pair. Write `.work/judgement.md`, then rewrite only the
lines your own feedback named, keeping every `id` stable.

Re-voice, re-plan, re-score and re-render. One pass, then stop and report what
changed.

$ARGUMENTS
