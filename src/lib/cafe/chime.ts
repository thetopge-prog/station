/**
 * WebAudio chimes — no audio asset, no network, so they still sound when the
 * shop internet is down.
 *
 * Extracted from StaffShell so the queue display and the KDS ring the same
 * bell. One shared AudioContext: browsers block a context created before the
 * first user gesture, and a fresh one per chime stays silently blocked forever.
 */

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  audioCtx ??= new Ctx();
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

/** Call once on the first pointerdown so later chimes are allowed to sound. */
export function unlockAudio(): void {
  try {
    getAudioCtx();
  } catch {
    /* no audio device — the screens still work, they just stay quiet */
  }
}

/** Play a sequence of tones. Exported for callers that want a custom pattern. */
export function playTones(freqs: number[], gap = 0.18, gain = 0.25): void {
  try {
    const ctx = getAudioCtx();
    freqs.forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = freq;
      const t = ctx.currentTime + i * gap;
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.start(t);
      o.stop(t + 0.4);
    });
  } catch {
    /* audio blocked before first interaction — fine */
  }
}

/** Two-tone: a new order arrived at the counter. */
export function chimeNewOrder(): void {
  playTones([880, 1175]);
}

/** Rising three-tone: an order just became «جاهز للاستلام» on the queue TV. */
export function chimeReady(): void {
  playTones([784, 988, 1319], 0.14, 0.3);
}

/**
 * Two-tone, like a desk phone: somebody is on the line right now.
 *
 * Deliberately unlike chimeReady — a cashier learns which sound means what
 * within a shift, and two alerts that sound alike are one alert nobody trusts.
 * Repeated twice because the till is the noisiest corner of the shop.
 */
export function chimeCall(): void {
  playTones([880, 660, 880, 660], 0.16, 0.32);
}
