# tapNclear

The board is a tangle of arrows. Pull every one of them off it, in an order that never causes a
collision.

### ▶ [Play it](https://onezloop.github.io/tapNclear/)

Plays offline. No timers, no ads, no accounts, and no network calls of any kind.

## How to play

**Clear every arrow off the board.** Tap one and it pulls itself out head-first, threading along its
own body and off the edge.

**An arrow can only leave if the lane in front of its head is clear** — the straight line running
from its head cell to the edge of the board. Nothing else about the arrow matters: another arrow
sitting on its tail, beside a bend, or in front of its *other* prong does not stop it. Working out
which arrows can move is the whole game, so free arrows are drawn exactly like stuck ones.

**Tap a blocked arrow and it lurches**, whatever stopped it flashes red, and you lose a heart. The
board is answering "why not?" rather than just refusing you. Three collisions ends the run — the
level simply waits for you to try again.

**You cannot get stuck.** Clearing an arrow only ever empties cells, so a free arrow stays free and
no sequence of good moves can dead-end you. The only way to lose is to tap something blocked.

**Stars.** Three for clearing a board with no collisions *and* no hints; two if you lost at most one
heart; one otherwise.

**100 levels**, unlocked in order. The first five are hand-authored to teach the rule; by the tricky
tier, only two or three arrows out of thirty can be tapped on turn one.

**Keyboard.** Arrows are focusable — `Enter` or `Space` taps the one in focus. `H` hints, `R`
restarts, `N` goes to the next level. Honours `prefers-reduced-motion` and `prefers-color-scheme`.

## Dev setup

Node 18 or newer, and npm.

```bash
npm install
npm run dev          # play it, on localhost:5173/tapNclear/
npm test             # rules, geometry, engine, generator, and all 100 shipped levels
npm run build        # production bundle into docs/, which is what GitHub Pages serves
npm run preview      # serve the built bundle
npm run gen:levels   # re-bake src/levels/levels.json — review the diff
npm run gen:icons    # re-render the PNG icons from public/icon.svg — review the diff
```

React 18 + TypeScript + Vite 5, and nothing else: no state library, no UI kit, no analytics.

The last two scripts write files that are **committed, not built**. The levels and the icons are
baked once and reviewed as a diff, so neither can change silently underneath a release; `npm run
build` does not regenerate them. Run them only when you mean to change what ships.

The app is served from the `/tapNclear/` **sub-path**, not the domain root — it lives at
<https://onezloop.github.io/tapNclear/>, a GitHub Pages project site. That is what `base` in
`vite.config.ts` sets, and why the dev server mounts at `/tapNclear/` too: dev and prod should not
disagree about where the app lives. Assets in `index.html` are referenced as `./thing` rather than
`/thing` for the same reason — a leading slash resolves to `onezloop.github.io`, which is not this
app, and 404s.

## Design

Why the game is built the way it is — the rule the engine turns on, how the levels are generated, and
what breaks if you change them — is in [DESIGN.md](DESIGN.md). Read it before changing anything in
`src/game/`.

## License

MIT — see [LICENSE](LICENSE).
