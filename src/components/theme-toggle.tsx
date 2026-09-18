"use client";

import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/components/theme-provider";
import { surfaceClasses } from "@/lib/surface-classes";
import { cn } from "@/lib/utils";

/**
 * Bottom-right dark-mode toggle: the @fluid Switch seated on a Fluid
 * Functionalism surface pill (surfaceClasses(4), matching the scale control).
 * The surface gives the switch contrast against the near-white canvas — the
 * bare track is otherwise near-invisible in light mode. The label stays for
 * screen readers but is hidden visually (the @fluid Switch always renders its
 * label span[id]).
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <div
      className={cn(
        "rounded-full",
        surfaceClasses(4),
        // Hide only the screen-reader label. `:not([role])` excludes Base UI's
        // switch root (span[role="switch"][id]); the bare `span[id]` selector
        // would otherwise clip the whole control away with the label.
        "[&_span[id]:not([role])]:sr-only"
      )}
    >
      <Switch
        label="Toggle dark mode"
        checked={theme === "dark"}
        onToggle={toggle}
        // No padding: the surface pill hugs the switch. The hover feedback then
        // lives on the track itself (it darkens toward the foreground).
        className="p-0"
        // The default accent off-track matches the surface-4 pill it now sits
        // on, so it disappears. Push the off-track a fixed step toward the
        // foreground from the surface — visible in both light and dark.
        offTrackColor="color-mix(in oklab, var(--foreground) 22%, var(--surface-4))"
      />
    </div>
  );
}
