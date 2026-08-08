# Music

Drop `.mp3`, `.m4a`, `.wav` or `.ogg` files in this folder and Pitchframe will
score your video with one of them. Nothing else is required — the next run
picks a track, records the choice in `.work/direction.json`, and mixes it under
the voice-over automatically.

**With no tracks here, videos are still scored.** `scripts/gen-audio.mjs`
synthesizes a pad and a set of cues from your plan — whooshes on the cuts,
impacts on the beat changes, a click on the exact frame the recorded mouse went
down. It is deterministic and it is generated, so it ships with the plugin and
costs nothing.

Adding real music is an upgrade, not a requirement.

## What ships

Three tracks are bundled and one is chosen per product automatically, so a
fresh install is scored without any setup.

They are licensed, and they are included on the project owner's confirmation
that the licence permits redistribution. **If you fork this and swap in your
own music, check that first.** Most stock-music licences — Artlist, Epidemic
Sound, Musicbed, Soundstripe — let a subscriber use a track *inside* their own
videos but forbid redistributing the file, and a plugin hands every byte to
everyone who installs it. Redistributable options are public domain (CC0),
Creative Commons BY, or a bought-out licence that names redistribution
explicitly; "royalty-free" alone does not mean redistributable.

Adding your own tracks alongside these works — drop them in and they join the
rotation.

## Choosing a specific track

The art direction picks one per product so two videos do not sound alike. To
override, name the file in `script.json`:

```json
{ "music_file": "your-track.mp3" }
```

To render with no music at all, set `"music": false` in the plan.
