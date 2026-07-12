# tapNclear — design notes

Why the game is built the way it is. None of this is needed to run or play it — see the
[README](README.md) for that. It is here for anyone changing the code, because most of it is the kind
of thing that is invisible until you break it.

## The one rule

> An arrow escapes if — and only if — the straight lane in front of its **head**, from the head cell
> to the edge of the board, holds no cell of any other arrow.

That is the whole game. Everything else is presentation.

The rest of the arrow's body imposes no requirement of its own. It leaves by retracing the route its
head took, over cells the arrow already occupied — like a snake sliding through a tube. So an arrow
with another arrow sitting under its tail, or beside a bend, or in front of its second prong, is
**still free**:

```
  . . . . .        this Π points DOWN; its head is the foot of the right prong
  . █ ▔ █ .
  . █ █ █ .
  . Y . ▒ .   <- the lane is only the cells below the HEAD
  . . . X .   <- X is in the lane, so it blocks
  . . . ▒ .   <- Y sits under the other prong: irrelevant, the lane never touches it
  ---------   edge
```

## Two things worth knowing before you change anything

**1. The shapes matter for what they *block*, not for how they *leave*.**

This is the thing that is easy to get backwards. A long, weaving body occupies eight or ten cells at
once, and every one of them sits in some other arrow's exit lane. That is what tangles the board —
not the arrow's own exit, which only ever needs a one-cell-wide lane in front of its head.

Which means the tempting bug is to treat *anything in front of any body cell* as a blocker. Do that
and half of every board becomes falsely unmovable. `rules.ts` exists to not have that bug, and
`rules.test.ts` pins it down from both sides.

**2. Clearing an arrow can never block another one.**

Removing an arrow only ever *empties* cells. So a free arrow stays free, and the order you clear free
arrows in cannot change whether the board can be finished. Two things fall out of that, and the code
leans on both:

- A player can never dead-end themselves. The only way to lose is to tap a *blocked* arrow — there
  are no hidden traps.
- `isSolvable()` is a greedy peel: take any free arrow, repeat. No search, no backtracking. Hints
  are therefore free, and are computed from the **live** board rather than replayed from the stored
  solution, which goes stale the moment a player deviates from it.

There is one exception to "an arrow can always eventually move", and it is worth knowing about
because it is invisible until it ruins a board: an arrow whose body **spirals in front of its own
head** can never move at all, and a single one makes a board unsolvable. The generator refuses to
build them; `rules.ts` refuses to call them free; there are tests for both.

## Levels are fixed data, not generated at runtime

`src/levels/levels.json` is the source of truth for all 100 levels, and it is committed. The app
ships no generator at all. Level 37 is a list of arrow positions in a file, not "whatever the
generator produces for seed 37".

This matters because a seeded generator is only deterministic while the generator code stands still.
Change one heuristic and every level silently becomes a different board — breaking saved progress,
star records, and any walkthrough anyone wrote. Baking the levels turns *reproducible* into
*immutable*: a puzzle can only change through a reviewed diff to a JSON file.

```bash
npm run gen:levels     # rewrites src/levels/levels.json; review the diff
npm test               # replays every level's solution against the real rules
```

`levels.test.ts` proves each of the 100 shipped boards can actually be cleared, so a broken puzzle
fails the test run instead of stranding a player. If you ever deliberately reshuffle the campaign,
bump `LEVELS_VERSION` — saved progress is then discarded rather than showing stars against boards
they were not earned on.

The same logic applies to the icons: `public/icon.svg` is the source, and the PNGs beside it are
rendered from it by `npm run gen:icons` and committed. The build does not regenerate them, so the
icon can only change through a reviewed diff rather than because a rasteriser's dependency shifted
underneath it. The SVG covers desktop browser tabs; the PNGs exist because iOS ignores an SVG
`apple-touch-icon` (a home-screen install without one falls back to a screenshot of the page) and the
web manifest wants PNGs for the install prompt.

## How the levels are built

A randomly strewn board is essentially never solvable, so the generator never places arrows and
hopes. It builds each board **backwards, in reverse escape order**: every new arrow goes into a spot
whose lane is already clear of every arrow placed before it. That arrow could therefore escape once
the earlier ones are gone — which is exactly what "removed later" means. **Reversing the placement
order is a valid solution, by construction**, which is also where the hint system comes from for free.

Difficulty is then aimed at directly. The dial is `targetFreeRatio`: **how few arrows you can tap on
turn one.** That, not the arrow count, is what makes a board hard — a big board where everything is
already free is easier than a small one where a single arrow can move and the rest must unwind from
it.

| Tier    | Levels | Grid  | Arrows | Body length | Free at start |
| ------- | ------ | ----- | ------ | ----------- | ------------- |
| Warm up | 1–5    | 6×6   | 4–6    | 1–4 cells   | ~30%          |
| Easy    | 6–20   | 9×9   | 20–24  | 1–4         | ~18%          |
| Medium  | 21–50  | 11×11 | 20–26  | 2–5         | ~13%          |
| Tricky  | 51–100 | 14×14 | 23–30  | 2–6         | ~9%           |

At the top of the campaign that means two or three tappable arrows out of thirty.

Four findings from tuning that curve, all of which cost real time:

- **Arrows nothing can ever block.** An arrow whose head sits on the rim pointing outward has a lane
  of zero cells — free on turn one, free forever, no matter how the board is tuned. The generator
  refuses them.
- **Blockability is not the same as tangle.** Scoring candidates only on how many arrows they *block*
  left the hard tier flatlined at 31% free — barely different from medium — because nothing stopped
  the generator filling the board with arrows that no *later* arrow could ever get in front of. The
  score also has to reward a candidate for having a lane with room in it.
- **More arrows is not more difficulty.** The main placement loop has a floor: an arrow can only be
  blocked by one placed *after* it, so whatever is still free when the loop runs out of arrows stays
  free forever. Cranking the count backfires — past a point a denser board has *less* room to choose
  placements in, so late arrows land wherever they fit rather than where they would do damage. Going
  from 30 to 34 arrows on a 12×12 made the tricky tier **easier** (20% free → 27%). What fixed it was
  a **tightening pass** (`tighten()` in `generator.ts`) that places extra arrows for one reason only:
  each must block something that is currently free. It stops as soon as the board hits its target, so
  it adds exactly as much as the difficulty needs and no filler.
- **A lower base arrow count makes a HARDER board**, which is the least intuitive line in the whole
  project. `arrows` is where the random pass stops; `maxArrows` is where tightening may go. The
  random pass scatters arrows wherever they legally fit, so every one it lays down is a cell that
  tightening — which only places arrows that *block* something — can no longer use. Pack the board up
  front and tightening finds no legal home, gives up early, and the free arrows stay free. Dropping
  the tricky tier's base from 30 arrows to 22, on the same 14×14 board with the same ceiling, took it
  from 15% free to **9%**. The gap between `arrows` and `maxArrows` is where the difficulty lives.
  Tightening also deliberately builds *short* bodies whatever the tier's usual length: by then the
  only cells left are scraps, and the gap in front of a still-free arrow is exactly what a six-cell
  serpent cannot fit into.

Run `npx tsx scripts/measure-curve.ts` to print the curve the baker actually produces.

Levels 1–5 are **hand-authored** (`src/levels/tutorial.json`) rather than generated, so the first
five boards teach the rule on purpose: tap a free arrow; meet a blocker; discover that an arrow's
*body* blocks other arrows; discover that only the *head's* lane blocks the arrow itself; then a
six-arrow chain where exactly one arrow can move and the whole board unwinds from it, one at a time.

The generator cannot reach these five, so when the campaign's difficulty is raised, they have to be
tightened **by hand** — otherwise the game still opens with five boards that fall over on their own.

## Design notes

- **Nothing moves unless the player did something.** No idle bounce, no shimmer, no countdown. The
  board is completely still while someone is thinking.
- **One ink colour.** The reference boards are monochrome for a reason: on a 12×12 board with thirty
  interlocking arrows, colour-coding the directions would turn the board into confetti. Direction is
  already unambiguous from the arrowhead. So colour here means exactly one thing — *something just
  happened* — and the board is otherwise calm.
- **Free arrows look exactly like stuck ones.** Marking the tappable ones would hand over the answer;
  working out which arrows can move *is* the game. The only arrow that ever stands out is one the
  player asked for a hint about.
- **The red flash teaches.** A blocked tap lights up the arrow *and whatever stopped it*, so the
  board answers "why not?" rather than merely refusing the move.
- **The escape animation is the rule.** The arrow threads itself out along its own path, through its
  own bends — so the motion shows how the rule works instead of the game having to explain it.
- **Losing is gentle.** Running out of hearts says the board is still waiting for you and suggests
  where to look. No lives timer, nothing to buy.
- Honours `prefers-reduced-motion` (feedback stays, travel goes) and `prefers-color-scheme`.
- Arrows are focusable and operable by keyboard. `H` hints, `R` restarts, `N` goes to the next level.
- **The only way to a level is through the campaign.** There is no `?level=` parameter and no other
  back door: which board is open comes from saved progress, and `goTo` refuses a locked level rather
  than trusting the picker to have disabled it. A URL that skips every lock would make the
  progression, and the stars measured against it, mean nothing.

## Layout

```
scripts/generate-levels.ts   offline level baker - the ONLY thing that generates puzzles
scripts/measure-curve.ts     tuning aid: prints the difficulty curve the baker produces
scripts/generate-icons.ts    renders the PNG icons from public/icon.svg
src/
  levels/levels.json         committed source of truth: 100 levels + a solution for each
  levels/tutorial.json       hand-authored levels 1-5
  game/                      pure domain layer: no React, no DOM
    geometry.ts              cells, shapes, exit lanes, self-blocking
    rules.ts                 THE RULE. Shared by the app, the tests and the baker.
    generator.ts             reverse-placement baker (build-time only)
    engine.ts                the state machine, as a pure reducer
    hint.ts                  next safe move, computed from the live board
  view/arrowPath.ts          arrow -> SVG geometry, including the escape path
  components/                presentation only
  hooks/                     React wiring: timers and localStorage live here, not in game/
```

The split is the point: `game/` is pure and fully tested, and the reducer owns no timers — the hooks
schedule animation clean-up and hand it back as an explicit action. That is what lets the entire
rules layer be tested without a browser.
