"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { motion, useReducedMotion, type Transition } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useIcon } from "@/lib/icon-context";
import type { IconComponentProps } from "@/lib/icon-map";
import { agentPrompt, anotherDeckPrompt } from "@/lib/agent-prompt";
import { spring } from "@/lib/springs";
import { cn } from "@/lib/utils";

// One "Copy prompt" button. The visitor pastes the prompt into whichever
// agent they use. The copy feedback is the Fluid Functionalism
// Copy-prompt button's: the label never changes, only the leading icon
// turns into a check for 2s.

/** Whether the prompt was just copied — read by the leading icon, which the
 *  Button renders from a component type, so the state can't ride a prop. */
const CopiedContext = createContext(false);

const SHOWN = { opacity: 1, scale: 1, filter: "blur(0px)" };
const HIDDEN = { opacity: 0, scale: 0.6, filter: "blur(4px)" };

/** The copy glyph, crossfading to a check while the prompt was just copied.
 *  Both glyphs share one cell the size of the icon, so the slot the Button
 *  lays out never changes. The glyph leaving fades, blurs to 4px, and scales
 *  to 0.6 over the tier's exit token, eased in; the one arriving does the
 *  reverse over the tier's full duration, eased out, so an appear always
 *  outlasts a disappear (0.08s vs 0.06s). Both are tweens: a spring settles
 *  visibly sooner than its nominal duration, which would invert that order.
 *  Reduced motion swaps in place. */
function CopyPromptIcon({ strokeWidth, className }: IconComponentProps) {
  const size = 16;
  const copied = useContext(CopiedContext);
  const CopyIcon = useIcon("copy");
  const CheckIcon = useIcon("check");
  const reduced = useReducedMotion();
  const enter: Transition = reduced
    ? { duration: 0 }
    : { type: "tween", duration: spring.fast.duration, ease: "easeOut" };
  const leave: Transition = reduced
    ? { duration: 0 }
    : { type: "tween", ...spring.fast.exit, ease: "easeIn" };
  return (
    <span className="grid shrink-0" style={{ width: size, height: size }}>
      <motion.span
        className="col-start-1 row-start-1 flex"
        initial={false}
        animate={copied ? HIDDEN : SHOWN}
        transition={copied ? leave : enter}
      >
        <CopyIcon size={size} strokeWidth={strokeWidth} className={className} />
      </motion.span>
      <motion.span
        className="col-start-1 row-start-1 flex"
        initial={false}
        animate={copied ? SHOWN : HIDDEN}
        transition={copied ? enter : leave}
      >
        <CheckIcon size={size} strokeWidth={strokeWidth} className={className} />
      </motion.span>
    </span>
  );
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API unavailable or denied: fall back to execCommand on an
    // off-screen textarea, same as InputCopy.
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    document.body.removeChild(textarea);
    return ok;
  }
}

// The origin never changes for a loaded page: nothing to subscribe to.
const subscribeNever = () => () => {};
const readOrigin = () => window.location.origin;
const readNothing = () => null;

export function AgentPromptButton({
  className,
  another = false,
}: {
  className?: string;
  /** Copy the short follow-up for a next deck instead of the full brief. */
  another?: boolean;
}) {
  // The prompt names this site's URL, so it can only be built in the
  // browser; on the server (and the hydrating render) the button waits
  // for the real origin.
  const origin = useSyncExternalStore(subscribeNever, readOrigin, readNothing);
  const prompt = origin ? (another ? anotherDeckPrompt(origin) : agentPrompt(origin)) : null;

  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const copy = useCallback(async () => {
    if (!prompt) return;
    if (!(await writeClipboard(prompt))) return;
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }, [prompt]);

  return (
    <CopiedContext.Provider value={copied}>
      <Button
        variant="ghost"
        size="lg"
        leadingIcon={CopyPromptIcon}
        onClick={copy}
        disabled={!prompt}
        // The button is the pill: one step above the page, like the level
        // cards, so it reads as a control in both themes. 44px tall, with a
        // 15px label; 16px in front of the icon, 2px more than the Button gives.
        // On press the whole pill scales, border included, instead of the
        // Button's fill layer alone — that would leave the border standing
        // around a shrunken fill, reading as a second, inner border.
        className={cn(
          "h-11 rounded-full border border-border bg-surface-5 pl-4 text-[15px] text-foreground",
          "transition-transform duration-80 active:scale-[0.98] [&>span[aria-hidden]]:group-active:scale-100",
          className
        )}
        aria-live="polite"
      >
        Copy prompt
        {copied && <span className="sr-only">Copied</span>}
      </Button>
    </CopiedContext.Provider>
  );
}
