import { afterEach, describe, expect, it, vi } from "vitest";
import { playAnswerSound, scheduleAnswerSound } from "@/lib/sounds";

// A stand-in for the Web Audio graph that records what gets scheduled.
function fakeContext() {
  const log = { oscillators: [] as { type: string; freq: number; start: number; stop: number }[], filters: 0 };
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  const node = () => ({ connect: vi.fn((n: unknown) => n) });
  const ctx = {
    currentTime: 10,
    state: "running",
    destination: node(),
    resume: vi.fn(async () => {}),
    createGain: () => ({ ...node(), gain: param() }),
    createDelay: () => ({ ...node(), delayTime: param() }),
    createBiquadFilter: () => {
      log.filters++;
      return { ...node(), type: "", frequency: param(), Q: param() };
    },
    createOscillator: () => {
      const entry = { type: "", freq: 0, start: 0, stop: 0 };
      log.oscillators.push(entry);
      const frequency = param();
      frequency.setValueAtTime = vi.fn((v: number) => {
        entry.freq = v;
      });
      return {
        ...node(),
        frequency,
        set type(t: string) {
          entry.type = t;
        },
        start: (t: number) => {
          entry.start = t;
        },
        stop: (t: number) => {
          entry.stop = t;
        },
      };
    },
  };
  return { ctx: ctx as unknown as BaseAudioContext, log };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("scheduleAnswerSound", () => {
  it("plays a quick rising arpeggio for a right answer, short and from now", () => {
    const { ctx, log } = fakeContext();
    scheduleAnswerSound(ctx, (ctx as unknown as { destination: AudioNode }).destination, "correct");
    // Each note is scheduled as its fundamental, then its octave sparkle.
    const fundamentals = log.oscillators.filter((_, i) => i % 2 === 0);
    expect(fundamentals.map((o) => o.freq)).toEqual([1046.5, 1318.5, 1568]);
    expect(fundamentals.every((o) => o.type === "triangle")).toBe(true);
    // A quick run: three notes 60 ms apart.
    expect(fundamentals.map((o) => Math.round((o.start - 10) * 1000))).toEqual([0, 60, 120]);
    expect(fundamentals[1].start).toBeGreaterThan(fundamentals[0].start);
    expect(fundamentals[2].start).toBeGreaterThan(fundamentals[1].start);
    expect(Math.max(...log.oscillators.map((o) => o.stop)) - 10).toBeLessThan(0.75);
    expect(log.filters).toBe(1);
  });

  it("taps three times for a wrong answer, on the shake's beats", () => {
    const { ctx, log } = fakeContext();
    scheduleAnswerSound(ctx, (ctx as unknown as { destination: AudioNode }).destination, "wrong");
    const taps = log.oscillators.filter((_, i) => i % 2 === 0);
    expect(taps.map((o) => o.freq)).toEqual([220, 220, 220]);
    expect(taps.map((o) => Math.round((o.start - 10) * 1000))).toEqual([0, 110, 220]);
    expect(log.filters).toBe(1);
    expect(Math.max(...log.oscillators.map((o) => o.stop)) - 10).toBeLessThan(0.4);
  });
});

describe("multi-note wrong answers", () => {
  it("repeats the gesture lower and later for each extra note", () => {
    const { ctx, log } = fakeContext();
    const settings = {
      volume: 0.35,
      correct: { wave: "sine" as const, low: 1046.5, high: 1568, gap: 0.07, decay: 0.22, level: 0.5, shimmer: 0.08, third: 0, attack: 0.005, cutoff: 20000, echo: 0 },
      wrong: { wave: "triangle" as const, from: 262, to: 247, decay: 0.16, level: 0.55, body: 0, cutoff: 1100, notes: 3, gap: 0.1, step: 2 },
    };
    scheduleAnswerSound(ctx, (ctx as unknown as { destination: AudioNode }).destination, "wrong", 10, settings);
    expect(log.oscillators).toHaveLength(3);
    const [a, b, c] = log.oscillators;
    expect(b.freq).toBeLessThan(a.freq);
    expect(c.freq).toBeLessThan(b.freq);
    expect(b.start - a.start).toBeCloseTo(0.1);
    expect(c.start - a.start).toBeCloseTo(0.2);
  });
});

describe("mute", () => {
  it("is off by default and remembered once set", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    vi.stubGlobal("window", { dispatchEvent: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const { isMuted, setMuted } = await import("@/lib/sounds");
    expect(isMuted()).toBe(false);
    setMuted(true);
    expect(isMuted()).toBe(true);
    setMuted(false);
    expect(isMuted()).toBe(false);
  });
});

describe("playAnswerSound", () => {
  it("is silent and harmless where there is no Web Audio", () => {
    expect(() => playAnswerSound(true)).not.toThrow();
    vi.stubGlobal("window", {});
    expect(() => playAnswerSound(false)).not.toThrow();
  });
});
