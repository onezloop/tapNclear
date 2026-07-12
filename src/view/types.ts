import type { Arrow } from '../game/types'

/**
 * An arrow the reducer has already removed, still animating its way off the board.
 *
 * The model deletes an arrow the instant it escapes — that is what keeps the rules layer
 * pure and synchronous. The view therefore keeps its own short-lived copy to animate, and
 * reaps it when the animation ends.
 *
 * `armed` is a one-frame delay, and it is load-bearing: an element that mounts already in
 * its final state has nothing to transition FROM, so the ghost renders at rest for one
 * frame, then arms, and the browser animates the difference.
 */
export interface EscapingArrow {
  readonly arrow: Arrow
  readonly armed: boolean
}
