import { useSyncExternalStore } from "react";

// Answer sounds, synthesized with the Web Audio API: no audio files, nothing
// to load. Two short, quiet gestures, both described by DEFAULT_SOUNDS:
//
// - correct ("Level up"): a quick rising C, E, G, 60 ms apart, on a
//   bright, slightly woody tone with a light echo behind: the whole run is
//   over as the row finishes filling, and the ring carries the check.
// - wrong ("Triple tap"): the same soft A3 three times, 110 ms apart: on
//   the click, then on the shake's two big rightward swings (measured at
//   ~117 and ~216 ms from the sound; the shake paints a frame after it),
//   fading like the shake does.
//
// The timings were measured against the quiz's own animation (answerRowClass,
// DrawnCheck, quiz-shake in quiz-modal.tsx); retime these if those change.
//
// The sound toggle in the page's top-right corner mutes both; the choice is
// remembered in this browser.
//
// Durations here are sound envelopes, not motion, so they don't follow the
// spring tokens.

export type AnswerSound = "correct" | "wrong";

export interface SoundSettings {
  /** Overall loudness, 0–1. */
  volume: number;
  correct: {
    wave: OscillatorType;
    /** First note, Hz. */
    low: number;
    /** Second note, Hz. */
    high: number;
    /** Delay before the second note, seconds. */
    gap: number;
    /** How long each note rings, seconds. */
    decay: number;
    /** Peak level of each note, 0–1. */
    level: number;
    /** Level of the octave partial above each note, 0–1. */
    shimmer: number;
    /** Optional third note, Hz (0 for none), after another gap. */
    third: number;
    /** Fade-in of each note, seconds: longer is softer, rounder. */
    attack: number;
    /** Lowpass cutoff, Hz: lower is warmer. */
    cutoff: number;
    /** A short echo behind the notes, 0–0.6: gives the sound a room and a
     *  little celebration. */
    echo: number;
  };
  wrong: {
    wave: OscillatorType;
    /** Starting pitch, Hz. */
    from: number;
    /** Pitch it sags to, Hz. */
    to: number;
    /** How long it rings, seconds. */
    decay: number;
    /** Peak level, 0–1. */
    level: number;
    /** Level of the octave partial, 0–1. */
    body: number;
    /** Lowpass cutoff, Hz: lower is rounder. */
    cutoff: number;
    /** How many notes, 1–3. Each is the same gesture, lower by `step`. */
    notes: number;
    /** Delay between notes, seconds. */
    gap: number;
    /** How far each note drops below the last, semitones (0 repeats it). */
    step: number;
  };
}

export const DEFAULT_SOUNDS: SoundSettings = {
  volume: 0.35,
  correct: { wave: "triangle", low: 1046.5, high: 1318.5, gap: 0.06, decay: 0.28, level: 0.45, shimmer: 0.15, third: 1568, attack: 0.003, cutoff: 9000, echo: 0.2 },
  wrong: { wave: "sine", from: 220, to: 220, decay: 0.08, level: 0.65, body: 0.06, cutoff: 1400, notes: 3, gap: 0.11, step: 0 },
};

/** The settings every sound plays with. */
export function currentSoundSettings(): SoundSettings {
  return DEFAULT_SOUNDS;
}

// ── Mute ────────────────────────────────────────────────────

const MUTE_KEY = "flashcards:muted:v1";
const MUTE_EVENT = "flashcards:muted";

/** Whether the visitor turned the sounds off. */
export function isMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean) {
  try {
    if (muted) localStorage.setItem(MUTE_KEY, "1");
    else localStorage.removeItem(MUTE_KEY);
  } catch {}
  window.dispatchEvent(new Event(MUTE_EVENT));
}

function subscribeMuted(callback: () => void) {
  window.addEventListener(MUTE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(MUTE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/** The mute setting, kept in step across components and tabs. */
export function useMuted(): boolean {
  return useSyncExternalStore(subscribeMuted, isMuted, () => false);
}

interface Tone {
  freq: number;
  to?: number;
  type?: OscillatorType;
  at?: number;
  level: number;
  attack?: number;
  decay: number;
}

/** One enveloped oscillator: a fast rise, then an exponential fall to
 *  silence, so nothing clicks at either end. */
function tone(ctx: BaseAudioContext, out: AudioNode, t0: number, t: Tone) {
  if (t.level <= 0) return;
  const start = t0 + (t.at ?? 0);
  const attack = t.attack ?? 0.005;
  const osc = ctx.createOscillator();
  osc.type = t.type ?? "sine";
  osc.frequency.setValueAtTime(t.freq, start);
  if (t.to && t.to !== t.freq) osc.frequency.exponentialRampToValueAtTime(t.to, start + attack + t.decay * 0.8);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(t.level, start + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, start + attack + t.decay);
  osc.connect(env).connect(out);
  osc.start(start);
  osc.stop(start + attack + t.decay + 0.02);
}

/** How long a sound lasts with these settings, seconds. */
export function soundLength(kind: AnswerSound, s: SoundSettings = DEFAULT_SOUNDS): number {
  return kind === "correct"
    ? s.correct.gap * (s.correct.third > 0 ? 2 : 1) + s.correct.attack + s.correct.decay + 0.02 + (s.correct.echo > 0 ? 0.3 : 0)
    : (Math.max(1, Math.round(s.wrong.notes)) - 1) * s.wrong.gap + 0.008 + s.wrong.decay + 0.02;
}

/** Schedule a sound on any context — the live one, or an offline one to
 *  render a preview — starting at `t0`. */
export function scheduleAnswerSound(
  ctx: BaseAudioContext,
  destination: AudioNode,
  kind: AnswerSound,
  t0: number = ctx.currentTime,
  settings: SoundSettings = currentSoundSettings()
) {
  const master = ctx.createGain();
  master.gain.value = settings.volume;
  master.connect(destination);

  if (kind === "correct") {
    const c = settings.correct;
    // A lowpass takes the edge off; wide open (20 kHz) it does nothing.
    const warmth = ctx.createBiquadFilter();
    warmth.type = "lowpass";
    warmth.frequency.value = c.cutoff;
    warmth.Q.value = 0.5;
    warmth.connect(master);
    if (c.echo > 0) {
      // A 110ms slapback that repeats a few times, quieter each time.
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.11;
      const feedback = ctx.createGain();
      feedback.gain.value = Math.min(0.6, c.echo * 1.2);
      const wet = ctx.createGain();
      wet.gain.value = c.echo;
      warmth.connect(delay);
      delay.connect(feedback).connect(delay);
      delay.connect(wet).connect(master);
    }
    const notes: [number, number, number][] = [
      [c.low, 0, 1],
      [c.high, c.gap, 1],
    ];
    if (c.third > 0) notes.push([c.third, c.gap * 2, 0.85]);
    for (const [freq, at, scale] of notes) {
      tone(ctx, warmth, t0, { freq, at, type: c.wave, level: c.level * scale, attack: c.attack, decay: c.decay });
      tone(ctx, warmth, t0, { freq: freq * 2, at, level: c.shimmer * scale, attack: c.attack, decay: c.decay * 0.55 });
    }
    return;
  }

  const w = settings.wrong;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = w.cutoff;
  filter.Q.value = 0.7;
  filter.connect(master);
  const notes = Math.min(3, Math.max(1, Math.round(w.notes)));
  for (let i = 0; i < notes; i++) {
    // Each note repeats the gesture `step` semitones lower, a little softer.
    const drop = Math.pow(2, (-w.step * i) / 12);
    const at = w.gap * i;
    const level = w.level * Math.pow(0.85, i);
    tone(ctx, filter, t0, { freq: w.from * drop, to: w.to * drop, at, type: w.wave, level, attack: 0.008, decay: w.decay });
    tone(ctx, filter, t0, { freq: w.from * 2 * drop, to: w.to * 2 * drop, at, level: w.body * Math.pow(0.85, i), attack: 0.008, decay: w.decay * 0.6 });
  }
}

let live: AudioContext | null = null;

/** The page's audio context, created on first use and resumed if the
 *  browser suspended it. Null where there is no Web Audio. */
export function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    live ??= new Ctor();
  } catch {
    return null;
  }
  if (live.state === "suspended") void live.resume().catch(() => {});
  return live;
}

/** Play one of the sounds now, with the given settings or the current ones.
 *  Silent where there is no Web Audio, and never throws. */
export function playSound(kind: AnswerSound, settings?: SoundSettings) {
  if (isMuted()) return;
  const ctx = audioContext();
  if (!ctx) return;
  try {
    scheduleAnswerSound(ctx, ctx.destination, kind, ctx.currentTime, settings ?? currentSoundSettings());
  } catch {
    // A sound is never worth breaking the quiz over.
  }
}

/** Play the sound for an answer. */
export function playAnswerSound(correct: boolean) {
  playSound(correct ? "correct" : "wrong");
}
