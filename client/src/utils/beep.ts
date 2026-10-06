let ctx: AudioContext | null = null;

/** Short tone for scanner feedback (error = low double beep). Silently ignored if audio is blocked. */
export function beep(kind: 'ok' | 'error' = 'ok') {
  try {
    ctx ??= new AudioContext();
    const tones = kind === 'ok' ? [[1400, 0]] : [[380, 0], [380, 0.16]];
    for (const [freq, at] of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.11);
    }
  } catch {
    /* audio unavailable */
  }
}
