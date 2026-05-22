import Phaser from "phaser";
import { TEX } from "./SpriteFactory";

// One-shot particle bursts. We keep one emitter per "kind" so we don't churn GC.

export class ParticleSystem {
  private scene: Phaser.Scene;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private spark!: Phaser.GameObjects.Particles.ParticleEmitter;
  private ember!: Phaser.GameObjects.Particles.ParticleEmitter;
  private glint!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private ring!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  init() {
    this.dust = this.makeEmitter(TEX.particleDust, {
      lifespan: 600, speed: { min: 20, max: 60 },
      scale: { start: 1, end: 0 },
      alpha: { start: 0.7, end: 0 },
      quantity: 0, emitting: false,
    });
    this.spark = this.makeEmitter(TEX.particleSpark, {
      lifespan: 700, speed: { min: 60, max: 160 },
      scale: { start: 1.2, end: 0 },
      alpha: { start: 1, end: 0 },
      quantity: 0, emitting: false,
      gravityY: 200,
    });
    this.ember = this.makeEmitter(TEX.particleEmber, {
      lifespan: 900, speed: { min: 40, max: 140 },
      scale: { start: 1.2, end: 0 },
      alpha: { start: 1, end: 0 },
      quantity: 0, emitting: false,
    });
    this.glint = this.makeEmitter(TEX.particleGlint, {
      lifespan: 800, speed: { min: 20, max: 80 },
      scale: { start: 1.4, end: 0 },
      alpha: { start: 1, end: 0 },
      quantity: 0, emitting: false,
    });
    this.smoke = this.makeEmitter(TEX.particleSmoke, {
      lifespan: 1400, speed: { min: 10, max: 40 },
      scale: { start: 1, end: 2.2 },
      alpha: { start: 0.5, end: 0 },
      quantity: 0, emitting: false,
    });
    this.ring = this.makeEmitter(TEX.particleRing, {
      lifespan: 600, speed: 0,
      scale: { start: 0.3, end: 2.5 },
      alpha: { start: 0.9, end: 0 },
      quantity: 0, emitting: false,
    });
  }

  private makeEmitter(textureKey: string, config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig) {
    const e = this.scene.add.particles(0, 0, textureKey, config);
    e.setDepth(55);
    return e;
  }

  footstep(x: number, y: number) {
    this.dust.explode(2, x, y);
  }

  lootPickup(x: number, y: number) {
    this.glint.explode(12, x, y);
  }

  empBurst(x: number, y: number) {
    this.ring.explode(1, x, y);
    this.glint.explode(20, x, y);
  }

  breach(x: number, y: number) {
    this.spark.explode(18, x, y);
    this.smoke.explode(6, x, y);
    this.ring.explode(1, x, y);
  }

  alarmSparks(x: number, y: number) {
    this.ember.explode(8, x, y);
  }

  hurt(x: number, y: number) {
    this.ember.explode(6, x, y);
  }

  pingPop(x: number, y: number, _color: number) {
    this.glint.explode(8, x, y);
  }

  destroy() {
    [this.dust, this.spark, this.ember, this.glint, this.smoke, this.ring].forEach(e => e?.destroy());
  }
}
