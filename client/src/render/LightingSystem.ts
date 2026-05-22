import Phaser from "phaser";
import { PALETTE } from "./Palette";
import { TILE_SIZE, GUARD_VIEW_RANGE, GUARD_VIEW_ANGLE_DEG } from "@blackout/shared";

// Fog-of-war lighting.
//
// Implementation:
//   - darkness layer: full-world graphics with a dark fill
//   - light mask:    geometry graphics drawing the cumulative lit shapes (player vision + guard cones + ambient lamps)
//   - we apply the light mask as an INVERTED geometry mask to the darkness, so darkness shows everywhere EXCEPT lit areas.
//   - guard cones are also drawn directly (colored, semi-transparent) so they remain visually distinct from clean light.
//
// Cost: one Graphics clear+redraw per frame, plus the cone re-render that already exists.

export interface AmbientLight {
  x: number; y: number; r: number; flickerSpeed: number; phase: number;
}

export class LightingSystem {
  private scene: Phaser.Scene;
  private darkness!: Phaser.GameObjects.Graphics;
  private lightMask!: Phaser.GameObjects.Graphics;
  private cones!: Phaser.GameObjects.Graphics;
  private vignette!: Phaser.GameObjects.Graphics;
  private mask!: Phaser.Display.Masks.GeometryMask;
  private worldW = 0;
  private worldH = 0;
  private ambientLights: AmbientLight[] = [];
  private alarmIntensity = 0; // 0..1

  // Player vision radius (px). Tighter in "blackout" modifier.
  private playerVisionR = 220;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  init(worldW: number, worldH: number, modifier: string) {
    this.worldW = worldW;
    this.worldH = worldH;
    if (modifier === "blackout") this.playerVisionR = 150;

    // Darkness layer (world-space, depth above floor/walls but below entities? — we want fog over everything except UI)
    this.darkness = this.scene.add.graphics().setDepth(45);
    // Light mask is a separate graphics — NOT added to scene (we use it as a mask source)
    this.lightMask = this.scene.make.graphics({ x: 0, y: 0 }, false);
    // Cones — visible colored overlay on top of darkness
    this.cones = this.scene.add.graphics().setDepth(46).setAlpha(0.35);
    // Screen vignette for alarm pulse — screen-space (scrollFactor 0)
    this.vignette = this.scene.add.graphics().setDepth(2500).setScrollFactor(0);

    this.mask = this.lightMask.createGeometryMask();
    this.mask.invertAlpha = true;
    this.darkness.setMask(this.mask);

    // Seed a few flickering ambient lights
    this.seedAmbient(8);
  }

  private seedAmbient(n: number) {
    this.ambientLights = [];
    for (let i = 0; i < n; i++) {
      this.ambientLights.push({
        x: Math.random() * this.worldW,
        y: Math.random() * this.worldH,
        r: 60 + Math.random() * 60,
        flickerSpeed: 1 + Math.random() * 3,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  update(
    playerX: number, playerY: number, sprinting: boolean,
    guards: { x: number; y: number; facing: number; phase: string }[],
    alarmLevel01: number,
    deltaMs: number,
  ) {
    if (!this.darkness) return;

    // Darkness fill — slightly darker on higher alarm
    const baseDarkness = 0.78 + alarmLevel01 * 0.1;
    this.darkness.clear();
    this.darkness.fillStyle(PALETTE.darkness, baseDarkness);
    this.darkness.fillRect(0, 0, this.worldW, this.worldH);

    // Light mask — punch out lit areas (white = visible through the inverted mask)
    const lm = this.lightMask;
    lm.clear();
    lm.fillStyle(0xffffff, 1);

    // Player vision: bigger when sprinting (you're loud, but you also see more)
    const pr = this.playerVisionR * (sprinting ? 1.15 : 1.0);
    lm.fillCircle(playerX, playerY, pr);
    // Soft edge: a couple of inner circles to ramp the gradient
    lm.fillCircle(playerX, playerY, pr * 0.7);

    // Ambient lights with flicker
    for (const a of this.ambientLights) {
      a.phase += deltaMs * 0.001 * a.flickerSpeed;
      const flick = 0.85 + 0.15 * Math.sin(a.phase * 4);
      lm.fillCircle(a.x, a.y, a.r * flick);
    }

    // Guard cones contribute to the lit area
    const half = (GUARD_VIEW_ANGLE_DEG * Math.PI) / 180 / 2;
    for (const g of guards) {
      lm.beginPath();
      lm.moveTo(g.x, g.y);
      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        const a = g.facing - half + (i / steps) * (half * 2);
        lm.lineTo(g.x + Math.cos(a) * GUARD_VIEW_RANGE, g.y + Math.sin(a) * GUARD_VIEW_RANGE);
      }
      lm.closePath();
      lm.fillPath();
    }

    // Colored cone overlay (the visible "what is this guard looking at" shape)
    this.cones.clear();
    for (const g of guards) {
      let color: number = PALETTE.guardLightCalm;
      if (g.phase === "chase") color = PALETTE.guardLightChase;
      else if (g.phase === "investigate" || g.phase === "search" || g.phase === "suspicious") color = PALETTE.guardLightSus;
      this.cones.fillStyle(color, 0.22);
      this.cones.beginPath();
      this.cones.moveTo(g.x, g.y);
      const steps = 12;
      for (let i = 0; i <= steps; i++) {
        const a = g.facing - half + (i / steps) * (half * 2);
        this.cones.lineTo(g.x + Math.cos(a) * GUARD_VIEW_RANGE, g.y + Math.sin(a) * GUARD_VIEW_RANGE);
      }
      this.cones.closePath();
      this.cones.fillPath();
    }

    // Alarm vignette pulse on top of everything
    this.updateAlarmVignette(alarmLevel01, deltaMs);
  }

  private updateAlarmVignette(level: number, deltaMs: number) {
    // Target intensity scales with alarm; smoothly lerp current intensity toward it.
    const target = Math.min(1, level * 1.2);
    const lerp = 1 - Math.pow(0.001, deltaMs / 1000);
    this.alarmIntensity += (target - this.alarmIntensity) * lerp;

    this.vignette.clear();
    if (this.alarmIntensity < 0.02) return;
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    // Pulse
    const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(Date.now() / 250));
    const alpha = this.alarmIntensity * pulse * 0.45;
    // Draw layered radial-ish ring using concentric rectangles
    const layers = 6;
    for (let i = 0; i < layers; i++) {
      const t = i / layers;
      const a = alpha * (1 - t * t);
      this.vignette.fillStyle(PALETTE.alarmTint, a * 0.4);
      this.vignette.fillRect(0, 0, w, h * (1 - t * 0.9));
      this.vignette.fillRect(0, h * (t * 0.9), w, h * (1 - t * 0.9));
      this.vignette.fillRect(0, 0, w * (1 - t * 0.9), h);
      this.vignette.fillRect(w * (t * 0.9), 0, w * (1 - t * 0.9), h);
    }
  }

  flash() {
    if (!this.vignette) return;
    this.scene.cameras.main.flash(220, 220, 60, 60);
  }

  destroy() {
    this.darkness?.destroy();
    this.lightMask?.destroy();
    this.cones?.destroy();
    this.vignette?.destroy();
  }
}
