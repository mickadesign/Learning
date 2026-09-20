# Fluid Functionalism — project audit
<!-- Written by the fluid-functionalism skill. Edit freely; delete to force a re-audit. -->

- audited: 2026-09-17 (carried over from the Art Timeline project this quiz was extracted from)
- package.json: react 19.2.4, tailwindcss 4, framer-motion 12.42, next 16.2.10

## Verdicts
- flavor: **base** — @base-ui/react 1.6 present and switch already imports
  it. Radix-flavored @fluid items break on @radix-ui v1 (no `render` prop) —
  always use `base/` flavors. Note: base items may need fetching from the
  repo (`registry/base/<name>.tsx`) — /r/<name>-base.json 404s.
- framework: Next.js 16 app router; root layout at src/app/layout.tsx
- stock-named shadcn files in components/ui → always pass --overwrite

## Ready
- shadcn wired (components.json has @fluid registry, @/ aliases), theme +
  `--hover`/`--active` tokens in src/app/globals.css
- `MotionConfig reducedMotion="user"` in layout.tsx
- Inter Variable self-hosted with the `opsz` axis (src/app/fonts.ts)
- installed @fluid items: button, switch (base), combobox (base, with
  scroll-area, fluid-hover-highlight, use-fluid-hover, use-merge-split,
  use-keyboard-nav-gate, elevated, popup, size-context), springs,
  font-weight, icon-context, surface-context/surface-classes,
  use-touch-primary. (input-copy + tooltip were installed for the share
  link and removed again the same day: the link is a ghost icon button
  beside Play, `src/components/share-link-button.tsx`. thinking-indicator
  was installed and then removed
  again: the landing page shimmers its headline instead, via
  `.shimmer-heading` in globals.css on the `shimmer` keyframes that install
  left behind. The install had also tried to rewrite utils.ts to the `cn`
  package and retune font-weight's semibold opsz — both reverted.)
- icon-context + shape-context are the Art Timeline versions (icon-map with
  five libraries, pill default); the combobox install's newer copies were
  reverted, keeping only the `variant` field and `--shape-input-radius`
- local `use-proximity-hover` hook is an older copy of the fluid-hover system
  (kept as-is: the quiz's answer-row glide is tuned against it)

## Advice (open)
- [ ] Quiz answer lists hand-roll `HoverGlideBg` animating `top`/`height` —
      migrate to `use-fluid-hover` + `FluidHoverHighlight` (transform-based,
      reduced-motion aware, pointer-session fade-in), wired 3× in quiz-modal.
- [ ] Unused deps: @radix-ui/react-dialog, react-scroll-area, react-switch,
      react-tooltip (kept for parity with Art Timeline; safe to drop).

## Advice (done / declined)
- MotionConfig reducedMotion="user" — done (layout.tsx).
- Inter opsz axis — done (InterVariable.woff2, weight 100–900).
