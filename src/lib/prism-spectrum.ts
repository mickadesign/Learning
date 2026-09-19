const HUE_START = 260;
const HUE_RANGE = 232;
const HUE_SPEED = 0.035;

/** The shared animated hue field used by both the Prism wash and its lines. */
export function prismSpectrumHue(progress: number, elapsed: number) {
  const position = Math.min(1, Math.max(0, progress));
  const hue = HUE_START + HUE_RANGE * position + elapsed * HUE_SPEED * 360;
  return ((hue % 360) + 360) % 360;
}

export function prismSpectrumColor(
  progress: number,
  elapsed: number,
  lightness: number,
  chroma: number,
  alpha = 1
) {
  return `oklch(${lightness} ${chroma} ${prismSpectrumHue(progress, elapsed)} / ${alpha})`;
}
