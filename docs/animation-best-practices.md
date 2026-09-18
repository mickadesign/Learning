# Animation Best Practices

Motion in this project follows [Fluid Functionalism — Motion](https://www.fluidfunctionalism.com/docs/motion).
The tokens live in [`src/lib/springs.ts`](../src/lib/springs.ts); every animation derives its timing
from them — no component invents its own duration.

## Spring tokens

| Tier | Token | Duration | Bounce | Exit | Use for |
| --- | --- | --- | --- | --- | --- |
| Fast | `spring.fast` | 0.08s | 0 | 0.06s | Hover states, fades, small toggles |
| Moderate | `spring.moderate` | 0.16s | 0 | 0.12s | Dropdowns, tabs, panels that must settle precisely |
| Slow | `spring.slow` | 0.24s | 0.12 | 0.16s | Dialogs, drawers, modals |

## Core principles

1. **Unified timing** — all animations derive from one of the three springs; components never
   create custom timing values.
2. **Directional asymmetry** — exits always move a little faster than entrances (each tier
   carries its own `exit.duration`).
3. **Moderate is critically damped** — zero bounce, lands exactly with no overshoot; use it for
   short travel and panels/sheets that must settle precisely.
4. **Centralized tokens** — duration values belong in `lib/springs`, not scattered through
   component code.

## CSS equivalents

When motion is expressed in CSS (transitions on `grid-template-rows`, colors, transforms), use
the same numbers via Tailwind:

- Fast tier → `duration-80`
- Moderate tier → `duration-[160ms]`
- Slow-tier exit → `duration-[160ms]`; slow-tier enter → `duration-[240ms]`
- Constant-rate motion (progress rings, marquees) stays `linear` and is exempt from the tiers.

Prefer CSS transitions for state changes that must survive throttled/background tabs (JS-driven
exit animations can stall mid-flight when `requestAnimationFrame` is paused — see the enter-only
card swap in the quiz modal, and the `exitFallbackMs` helper in `springs.ts`).

## Reduced motion

Respect `prefers-reduced-motion`: remove position/transform travel, keep opacity fades that aid
comprehension. In framer-motion, either check `useReducedMotion()` per component (the pattern
used across this codebase) or wrap the app in `<MotionConfig reducedMotion="user">`.

## Component application map (from the Fluid Functionalism docs)

- **Fast (0.08s → 0.06s exit):** checkbox, radio, tooltip, table rows, card proximity, input
  copy, slider, select, color picker, accordion
- **Moderate (0.16s → 0.12s exit):** dropdown, tabs indicator, switch thumb, chat bubbles,
  mobile drawer, sidebar, selection merging
- **Slow (0.24s → 0.16s exit):** dialog, ask-user questions, thinking steps

## House rules distilled

- Only animate `transform` and `opacity` where possible (GPU-friendly); grid-track collapses are
  the sanctioned exception for content that must yield its space.
- Never animate from `scale(0)`; enter from `scale(0.96)` + `opacity: 0`.
- Exits faster than entrances, always.
- Keyboard-initiated actions get no animation delay.
- Stagger grouped entrances subtly; never block interaction while a stagger plays.
