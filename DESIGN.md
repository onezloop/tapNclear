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
head** can never move at all, and a single one makes a board unsolvable. `rules.ts` refuses to call
such an arrow free, and there are tests for it.

The baker cannot produce one at all, and gets that for free rather than by checking: a body is grown
only through *unclaimed* cells while its lane runs only over *claimed* ones, and those two sets are
disjoint by definition. The body can never reach its own lane. (Bodies with plenty of folds are very
much wanted — see the fold budget — so this mattering is not hypothetical.)

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

The baker builds each board in **escape order** — the order the arrows will leave — and obeys exactly
one rule:

> A new arrow's exit lane may pass only over cells belonging to arrows that have **already escaped**
> (or off the board entirely). It may never cross a cell that is still unclaimed.

Everything else follows from that one line.

**Why it is a valid puzzle.** Arrow `i`'s lane contains cells of arrows `1..i-1` and nothing else. By
the time it is arrow `i`'s turn to leave, arrows `1..i-1` are gone, so its lane is empty and it can
go. The order the baker built the arrows in **is a solution, by construction** — no solver, no
backtracking — which is also where the hint system comes from for free.

**Why the board can always be filled.** The baker can never paint itself into a corner, and this is
the part worth seeing. Take the topmost unclaimed cell and point an arrow *up* out of it: every cell
above it is, by the definition of "topmost", already claimed — so that lane is legal. A legal move
therefore always exists, whatever the board looks like, right down to the last empty cell. The grid
fills completely, every time.

### Why the boards are FULL

Every board from level 11 to 100 is **completely full**. Not one empty cell.

This is not decoration, and it is not (only) about looking dense. On a board with no gaps, an arrow
is free **if and only if its lane is empty** — that is, its head sits on the rim pointing outward.
Any other arrow's lane has to run into *somebody*, because every cell belongs to someone. So:

> On a full board, the arrows you can tap on turn one are exactly the arrows with a head on the rim.

And the baker chooses those. `freeAllowance` stops being a ratio the generator chases and becomes a
number it simply *decides*. Set it to 1 and there is precisely **one arrow on the entire board you
may tap**, with fifty-odd others waiting behind it — and the whole thing unwinds from the single move
you have to find.

**This is why the old generator was rewritten.** It worked the other way round — placing arrows
wherever a lane happened to be clear already — and it could *never* fill a board. As the board
crowds, almost no cell has a clear ray to an edge left, so placement starved at around half full and
no amount of raising the arrow ceiling moved it. The fix was not a bigger budget. It was building the
board in the other direction.

The old approach also had a floor it could not get under, for a reason that is worth recording
because it is genuinely counter-intuitive: dropping a blocker in front of a free arrow *does not
reduce the number of free arrows*. The blocker was only legal because its own lane was clear, so the
instant it lands, it is free itself. Block one, create one. The free count only fell when a single
body crossed two lanes at once, which is rare — so the curve sat pinned around 8% however hard the
target was pushed. On a full board the question does not arise: freeness is a property of the rim,
and the rim is finite.

### The curve is per LEVEL, not per tier

Difficulty used to be a lookup of four tier configs, so **every level inside a tier was built from
identical numbers** — the same grid, the same fold budget, the same target. Levels 51 and 100 were
the same board. The campaign had *four* steps in it, not a hundred, and the back half was fifty
levels of no progression whatever. It felt flat because it was flat.

So `configFor(level)` in `tiers.ts` now interpolates between anchors, level by level. Level 73 is
built to be a shade harder than level 72. **The tiers survive only as labels** — a name in the HUD
and a heading in the picker — and decide nothing about how a board is built.

Three dials ramp together, because no one of them is a strong enough lever on its own:

|                          | Level 11 | → | Level 100 |
| ------------------------ | -------- | - | --------- |
| Grid                     | 11×11    | → | 16×16     |
| Body length              | 1–4 cells | → | 3–10 cells |
| Folds (bends per body)   | 2        | → | 8         |
| Board fill               | 100%     | → | 100%      |
| **Arrows you may tap**   | **7**    | → | **1**     |

The **grid grows** so a later board is more to take in. The **bodies lengthen and fold**, so a late
arrow is a nested serpent where an early one is a stub — harder to trace by eye, and crossing far
more of everyone else's lanes. And the **tappable arrows are rationed down to one**.

Levels 6–10 are the ramp in: they fill from about three-quarters up to whole, so the step out of the
hand-authored tutorial is not a cliff.

### Three findings, all of which cost real time

- **Arrows nothing can ever block.** An arrow whose head sits on the rim pointing outward has a lane
  of zero cells — free on turn one, free forever. In the old generator these were poison, and it was
  worth a hard floor under the whole difficulty curve to allow even two of them. In *this* generator
  they are the entire mechanism: they are the only free arrows a full board can have, so they are
  rationed rather than banned. Same fact, opposite conclusion — which is why it is written down.
- **Warnsdorff's rule, and it is backwards from what you would guess.** When a body grows, it steps
  into the *most constrained* neighbouring cell — the one with the fewest ways on from it — not the
  roomiest. Grabbing the roomiest cell instead leaves the awkward ones stranded, and a cell with no
  free neighbours is a cell no body can ever be grown through: it can only become a one-cell arrow.
  Half of every board came out as single-cell stubs that way (143 of 301), the fold budget went
  unspent, and the "serpents" were nubs. Eating the awkward cells while they are still reachable
  strands far fewer of them.
- **A head with a claimed cell behind it can only ever be a one-cell arrow.** There is nowhere for a
  body to go. The baker prefers heads that can actually grow one and leaves the stubs for last, which
  is exactly when they are unavoidable anyway. This took the single-cell arrows from 90 to 36.

Run `npx tsx scripts/measure-curve.ts` to print the curve the baker actually produces. It samples
levels, not tiers, and what to look for is `fill` hitting 1.00 by level 11 and staying there, `free`
falling to 1, and `folds` climbing.

### The hand-authored opening

Levels 1–5 are **hand-authored** (`src/levels/tutorial.json`) rather than generated, so the first
five boards teach the rule on purpose. Each adds exactly one idea, and each is verified by
`levels.test.ts` like any other level:

| # | Teaches                                                                    | Free at start |
| - | -------------------------------------------------------------------------- | ------------- |
| 1 | Tap an arrow and it leaves. Nothing is in anyone's way.                     | 5 of 5        |
| 2 | An arrow can be **blocked**, so a pair has an order.                        | 3 of 5        |
| 3 | An arrow has a **body**, and the body blocks other arrows.                  | 4 of 5        |
| 4 | **Only the head's lane counts** — the bent arrow is free despite the arrow sitting in front of its tail. | 5 of 6 |
| 5 | A **chain**: exactly one arrow can move, and the board unwinds from it.     | 1 of 8        |

Level 4 is the one that matters. It is the rule people get wrong, so the board is built to be
actively misleading: `a1`'s tail runs along row 3 with another arrow squarely in front of it, and
`a1` is free anyway, because its *head* is in row 4 and row 4 is clear. Sitting right beside it is
`a3`, which really is blocked — by `a1`'s body. Same board, both halves of the rule.

These five are deliberately **not** full boards — a full board is exactly the wrong thing to hand
someone who does not yet know the rule. They are sparse on purpose, and what makes them gentle is how
few arrows are on them, not a smaller grid: they sit on the same 11×11 the campaign opens at.

The generator cannot reach these five, so when the campaign's difficulty is raised, they have to be
rebuilt **by hand** — otherwise the game still opens with five boards that fall over on their own.
Raising the *grid* means re-authoring them too, not just retuning a number.

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
    tiers.ts                 THE CURVE. configFor(level) - difficulty per level, not per tier
    generator.ts             escape-order baker: builds FULL boards (build-time only)
    engine.ts                the state machine, as a pure reducer
    hint.ts                  next safe move, computed from the live board
  view/arrowPath.ts          arrow -> SVG geometry, including the escape path
  components/                presentation only
  hooks/                     React wiring: timers and localStorage live here, not in game/
```

The split is the point: `game/` is pure and fully tested, and the reducer owns no timers — the hooks
schedule animation clean-up and hand it back as an explicit action. That is what lets the entire
rules layer be tested without a browser.
