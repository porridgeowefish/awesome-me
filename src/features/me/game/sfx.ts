/** Tiny synthesized 8-bit sound effects (WebAudio, created lazily after a user gesture). */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(freq: number, duration: number, type: OscillatorType = 'square', volume = 0.04, slide = 0) {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, a.currentTime);
  if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, a.currentTime + duration);
  gain.gain.setValueAtTime(volume, a.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + duration);
  osc.connect(gain).connect(a.destination);
  osc.start();
  osc.stop(a.currentTime + duration);
}

export const sfx = {
  jump: () => blip(520, 0.12, 'square', 0.035, 380),
  milestone: () => [784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.09, 'square', 0.03), i * 90)),
  over: () => blip(330, 0.45, 'sawtooth', 0.045, -240),
  start: () => blip(440, 0.08, 'square', 0.03),
};
