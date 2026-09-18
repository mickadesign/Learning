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
import { ClaudeMark, CodexMark, CursorMark } from "@/components/agent-marks";
import { useIcon } from "@/lib/icon-context";
import type { IconComponentProps } from "@/lib/icon-map";
import { agentPrompt } from "@/lib/agent-prompt";
import { spring } from "@/lib/springs";
import { cn } from "@/lib/utils";

// The pill: a "Copy agent prompt" button, then one mark per agent that
// copies the prompt and opens the agent — with the prompt prefilled where
// the agent has a URL for that. The copy feedback is the Fluid
// Functionalism Copy-prompt button's: the label never changes, only the
// leading icon turns into a check for 2s.

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
function CopyPromptIcon({ size = 16, strokeWidth, className }: IconComponentProps) {
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

interface Agent {
  name: string;
  Mark: typeof ClaudeMark;
  /** Where the mark goes. Claude and Cursor take the prompt in the URL;
   *  Codex has no prefill, so the copy the click just made is the way in. */
  href: (prompt: string) => string;
  prefills: boolean;
}

const AGENTS: Agent[] = [
  {
    name: "Claude",
    Mark: ClaudeMark,
    href: (p) => `https://claude.ai/new?q=${encodeURIComponent(p)}`,
    prefills: true,
  },
  {
    name: "Codex",
    Mark: CodexMark,
    href: () => "https://chatgpt.com/codex",
    prefills: false,
  },
  {
    name: "Cursor",
    Mark: CursorMark,
    href: (p) => `cursor://anysphere.cursor-deeplink/prompt?text=${encodeURIComponent(p)}`,
    prefills: true,
  },
];

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

export function AgentPromptButton({ className }: { className?: string }) {
  // The prompt names this site's URL, so it can only be built in the
  // browser; on the server (and the hydrating render) the marks are plain
  // and the copy button waits for the real origin.
  const origin = useSyncExternalStore(subscribeNever, readOrigin, readNothing);
  const prompt = origin ? agentPrompt(origin) : null;

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
      <div
        className={cn(
          // One step above the page, like the level cards, so the pill reads
          // as a control in both themes.
          "inline-flex h-11 items-center gap-0.5 rounded-full border border-border bg-surface-5 p-1",
          className
        )}
      >
        <Button
          variant="ghost"
          size="lg"
          leadingIcon={CopyPromptIcon}
          onClick={copy}
          disabled={!prompt}
          className="rounded-full text-foreground"
          aria-live="polite"
        >
          Copy agent prompt
          {copied && <span className="sr-only">Copied</span>}
        </Button>
        <span aria-hidden className="mx-1 h-5 w-px bg-border" />
        {AGENTS.map(({ name, Mark, href, prefills }) => {
          const url = prompt ? href(prompt) : undefined;
          const external = url?.startsWith("http");
          return (
            <Button
              key={name}
              asChild
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={() => void copy()}
            >
              <a
                href={url}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener noreferrer" : undefined}
                aria-label={prefills ? `Open in ${name}` : `Copy and open ${name}`}
                title={prefills ? `Open in ${name}` : `Copy, then open ${name}`}
              >
                <Mark size={18} />
              </a>
            </Button>
          );
        })}
      </div>
    </CopiedContext.Provider>
  );
}
