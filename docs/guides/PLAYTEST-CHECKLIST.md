# Attended playtest checklist — #7/#27 (event sounds) and #15 (stomp feel)

Two feedback items cannot be closed by the test suite. They need a person with
working speakers and an opinion. Everything else about them is already done and
automated; this is the last mile.

**Why they're stuck:** the suite can prove the event-SFX code is *linked*
(`sfx-events.mjs` compares an events-ON build against events-OFF and asserts the
ROMs differ) but it cannot prove the sounds are *audible or right* — jsnes APU
inspection is too fragile to trust for that. And no test can tell you whether a
bounce feels good.

---

## Before you start

```
node scripts/make-playtest-roms.mjs
```

Writes three ROMs to `playtest-roms/` (gitignored — regenerate any time; do it
again after any engine change). Open them in **anything with sound**: fceux,
Mesen, or the Studio's own in-browser player.

> ⚠️ Not in the dev container. It has fceux but no display and no audio device.
> Copy the ROMs to a machine with speakers.

The level is deliberately tiny: a floor, one walking enemy to your right, a
pickup between you and it, and a trigger tile at the far right that wins the
game. Everything you need is reachable in a few seconds.

**Controls:** arrows move · `F` = jump (A) · `D` = B · `Enter` = Start.

---

## Test 1 — #7 / #27: do the event sounds play?

**ROM:** `01-sfx-events.nes`
**Shipped in:** engine v74. **Confirmed linked:** yes (ROM differs from an
events-off build). **Unconfirmed:** whether you can actually hear it.

Four events should each fire a distinct sound from the starter pack. Tick what
you hear:

| # | Do this | Should hear | Heard it? |
| - | ------- | ----------- | --------- |
| 1 | Press `F` to jump | jump blip | ☐ |
| 2 | Walk right onto the small pickup | pickup chime | ☐ |
| 3 | Walk into the enemy from the **side** | hurt sound (and a heart goes) | ☐ |
| 4 | Reach the far-right trigger tile | win sound | ☐ |

Background music should be playing throughout (the cheerful starter loop). If
you hear **music but no effects**, the events aren't reaching the APU. If you
hear **nothing at all**, check the emulator's own volume first.

Also worth judging while you're there:

- Does an effect ever **cut off the music** unpleasantly? (Jump uses APU channel
  0, the other three share channel 1 — a clash would show up as the music
  ducking or stuttering.)
- Is anything **too loud, too quiet, or just wrong** for the event?

**To close #7/#27:** all four heard, no unpleasant music interaction.
If something's off, note *which* event and *what* it did — that's enough to fix.

---

## Test 2 — #15: does the stomp bounce feel right?

**ROMs:** `01-sfx-events.nes` is the **current shipped tuning** (it's
byte-identical to the "a" variant, so it isn't written twice), plus two
alternatives to compare against.

| ROM | `BW_STOMP_MARGIN` | `BW_STOMP_BOUNCE` | What changes |
| --- | ----------------- | ----------------- | ------------ |
| `01-sfx-events.nes` | 8 | 12 | **Current.** The baseline you're judging. |
| `02-stomp-b-bouncier-m8-b18.nes` | 8 | 18 | Same hit window, **much springier** bounce off the enemy. |
| `02-stomp-c-forgiving-m12-b12.nes` | 12 | 12 | Same bounce, **more forgiving** about counting a landing as a stomp. |

What the two knobs mean:

- **MARGIN** — how far below the enemy's top your feet can be and still count as
  a stomp rather than a hit. Bigger = easier to stomp, but at some point you
  "stomp" things you clearly walked into.
- **BOUNCE** — how hard you're launched upward after a successful stomp. Bigger
  = springier, more Mario-like.

Jump on the enemy a few times in each ROM and judge:

- ☐ Does a **clean landing on its head** reliably count as a stomp?
- ☐ Does walking into its **side** reliably count as a hit (not a stomp)?
- ☐ Does the bounce feel **satisfying** — not a dead stop, not a rocket?
- ☐ Which of the three feels best? `______`

**To close #15:** name the winning combination. If none of the three is right,
say which direction to go (springier/deader, more/less forgiving) and I'll build
another set — it's a one-line change in `scripts/make-playtest-roms.mjs`.

Values live in the **Damage** module (`stompBounce`, 4–30, default 12);
`BW_STOMP_MARGIN` is currently a fixed 8 in `builder-modules.js` behind an
`#ifndef`, so making it pupil-tunable would be a small follow-up if the
forgiving variant wins.

---

## Reporting back

For each item, one line is enough:

```
#7/#27: all four sounds heard, music fine            -> CLOSE
#15:    variant b (bounce 18) feels best             -> ship stompBounce 18
```

Then update [`docs/STATUS.md`](../STATUS.md) and the item's entry in
[`docs/feedback/recently-observed-bugs.md`](../feedback/recently-observed-bugs.md).
Changing the shipped stomp default is a ROM-output change, so it needs the
engine-versioning ritual (bump both constants, `CHANGELOG.md` entry,
`node scripts/snapshot-engine.mjs`).
