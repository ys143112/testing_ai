export class Audio {
  constructor() {
    this.enabled = false;
    this.context = null;
  }
  unlock() {
    if (!this.enabled) return;
    try {
      this.context ??= new (window.AudioContext || window.webkitAudioContext)();
      if (this.context.state === "suspended")
        this.context.resume().catch(() => {});
    } catch {
      this.enabled = false;
    }
  }
  play(event) {
    if (!this.enabled || !this.context || this.context.state !== "running")
      return;
    const notes = {
      start: [440, 660],
      stage: [540, 810],
      over: [180, 90],
      graze: [900],
      resume: [550],
    };
    const n = notes[event];
    if (!n) return;
    n.forEach((freq, i) => {
      const t = this.context.currentTime + i * 0.09;
      const osc = this.context.createOscillator(),
        gain = this.context.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.045, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      osc.connect(gain);
      gain.connect(this.context.destination);
      osc.start(t);
      osc.stop(t + 0.15);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    });
  }
}
