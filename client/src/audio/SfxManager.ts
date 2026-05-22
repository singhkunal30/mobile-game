import Phaser from "phaser";

type SfxKind = "ping" | "alert" | "alarm" | "loot" | "ability" | "breach" | "click";

// Procedural SFX via Web Audio — no asset files needed for MVP.
// Each cue is a short synth blip with a recognizable timbre.
export class SfxManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private unlocked = false;
  private enabled = true;

  constructor(_scene: Phaser.Scene) {
    this.enabled = localStorage.getItem("sfxEnabled") !== "0";
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    localStorage.setItem("sfxEnabled", on ? "1" : "0");
  }

  unlock() {
    if (this.unlocked) return;
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.18;
      this.master.connect(ctx.destination);
      this.unlocked = true;
    } catch {}
  }

  play(kind: SfxKind) {
    if (!this.enabled) return;
    if (!this.unlocked) this.unlock();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    switch (kind) {
      case "ping": return this.blip(t, 880, 0.08, "sine", 0.4);
      case "alert": return this.sweep(t, 880, 220, 0.25, "sawtooth", 0.6);
      case "alarm": return this.alarm(t);
      case "loot": return this.chime(t);
      case "ability": return this.sweep(t, 220, 880, 0.18, "triangle", 0.4);
      case "breach": return this.thud(t);
      case "click": return this.blip(t, 600, 0.04, "square", 0.3);
    }
  }

  private blip(start: number, freq: number, dur: number, type: OscillatorType, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    o.connect(g).connect(this.master);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  private sweep(start: number, f0: number, f1: number, dur: number, type: OscillatorType, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, start);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), start + dur);
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    o.connect(g).connect(this.master);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  private chime(start: number) {
    const ctx = this.ctx!;
    [880, 1320, 1760].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(f, start + i * 0.04);
      g.gain.setValueAtTime(0.0, start + i * 0.04);
      g.gain.linearRampToValueAtTime(0.3, start + i * 0.04 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, start + i * 0.04 + 0.25);
      o.connect(g).connect(this.master);
      o.start(start + i * 0.04);
      o.stop(start + i * 0.04 + 0.3);
    });
  }

  private alarm(start: number) {
    const ctx = this.ctx!;
    for (let i = 0; i < 3; i++) {
      this.sweep(start + i * 0.18, 700, 350, 0.16, "square", 0.45);
    }
  }

  private thud(start: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(140, start);
    o.frequency.exponentialRampToValueAtTime(50, start + 0.18);
    g.gain.setValueAtTime(0.5, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
    o.connect(g).connect(this.master);
    o.start(start);
    o.stop(start + 0.25);
  }
}
