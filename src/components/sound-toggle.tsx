"use client";

import { createElement } from "react";
import { Button } from "@/components/ui/button";
import { useIcon } from "@/lib/icon-context";
import { setMuted, useMuted } from "@/lib/sounds";

/** Turns the answer sounds on or off, remembered in this browser. */
export function SoundToggle() {
  const muted = useMuted();
  const VolumeIcon = useIcon("volume");
  const VolumeOffIcon = useIcon("volume-off");
  const label = muted ? "Turn sounds on" : "Turn sounds off";
  return (
    // Secondary: a filled surface of its own, so it reads on the page and
    // on the quiz's dimmed backdrop alike.
    <Button
      variant="secondary"
      size="icon-lg"
      className="rounded-full shadow-sm"
      onClick={() => setMuted(!muted)}
      aria-label={label}
      aria-pressed={muted}
      title={label}
    >
      {/* createElement: the icons come from a hook, which the lint rule
          against components created during render would otherwise flag. */}
      {createElement(muted ? VolumeOffIcon : VolumeIcon, { size: 20 })}
    </Button>
  );
}
