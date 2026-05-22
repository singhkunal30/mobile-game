import Phaser from "phaser";
import { rolePalette } from "./Palette";

// Per-player container with role-specific silhouette + walk animation.
//
// Layers (back-to-front):
//   - drop shadow
//   - cape / trail (scout)
//   - body
//   - shoulder pads (breacher) / hood (hacker)
//   - head
//   - visor / cross / EMP ring overlay
//   - facing indicator
//   - HP bar
//   - name tag

export interface PlayerVisualState {
  role: string;
  facing: number;
  status: string; // alive | downed | extracted
  hp: number;
  vx: number;
  vy: number;
  name: string;
  abilityCdUntil: number;
  isLocal: boolean;
}

const TWO_PI = Math.PI * 2;

export class PlayerRenderer {
  private scene: Phaser.Scene;
  private root: Phaser.GameObjects.Container;
  private shadow: Phaser.GameObjects.Graphics;
  private cape: Phaser.GameObjects.Graphics;
  private body: Phaser.GameObjects.Graphics;
  private accessory: Phaser.GameObjects.Graphics;
  private head: Phaser.GameObjects.Graphics;
  private overlay: Phaser.GameObjects.Graphics;
  private hpBar: Phaser.GameObjects.Graphics;
  private nameTag: Phaser.GameObjects.Text;
  private walkPhase = 0;
  private lastDrawnRole = "";
  private lastFacing = 0;

  constructor(scene: Phaser.Scene, initial: PlayerVisualState) {
    this.scene = scene;
    this.root = scene.add.container(0, 0).setDepth(20);
    this.shadow = scene.add.graphics();
    this.cape = scene.add.graphics();
    this.body = scene.add.graphics();
    this.accessory = scene.add.graphics();
    this.head = scene.add.graphics();
    this.overlay = scene.add.graphics();
    this.hpBar = scene.add.graphics();
    this.root.add([this.shadow, this.cape, this.body, this.accessory, this.head, this.overlay, this.hpBar]);

    this.nameTag = scene.add.text(0, 0, initial.name, {
      fontFamily: "ui-sans-serif, system-ui", fontSize: "10px", color: "#cbd5e1",
    }).setOrigin(0.5).setDepth(21);

    this.drawBaseShape(initial.role);
    this.lastDrawnRole = initial.role;
    this.lastFacing = initial.facing;
  }

  update(x: number, y: number, state: PlayerVisualState, deltaMs: number) {
    this.root.setPosition(x, y);
    this.nameTag.setPosition(x, y - 24);

    // Walk anim phase advances by speed
    const speed = Math.hypot(state.vx, state.vy);
    if (speed > 5) this.walkPhase = (this.walkPhase + deltaMs * 0.012 * Math.min(2, speed / 130)) % TWO_PI;
    else this.walkPhase = 0;

    // Re-render body if role changed
    if (state.role !== this.lastDrawnRole) {
      this.drawBaseShape(state.role);
      this.lastDrawnRole = state.role;
    }

    // Body bob (sin walkPhase) — only Y
    const bob = Math.sin(this.walkPhase * 2) * 1.2;
    this.body.y = bob;
    this.head.y = bob;
    this.accessory.y = bob;

    // Cape sway for scout
    if (state.role === "scout") {
      this.cape.setRotation(state.facing + Math.PI + Math.sin(this.walkPhase) * 0.25);
      this.cape.setVisible(speed > 80);
    } else {
      this.cape.setVisible(false);
    }

    // Facing — rotate accessory/head to face direction
    this.head.setRotation(state.facing + Math.PI / 2);
    this.accessory.setRotation(state.facing + Math.PI / 2);
    this.lastFacing = state.facing;

    // Status-based tint
    if (state.status === "downed") {
      this.body.alpha = 0.55;
      this.head.alpha = 0.55;
      this.accessory.alpha = 0.55;
    } else if (state.status === "extracted") {
      this.root.setVisible(false);
      return;
    } else {
      this.body.alpha = 1;
      this.head.alpha = 1;
      this.accessory.alpha = 1;
    }
    this.root.setVisible(true);

    // Overlay: facing tick + ability ring + role glow
    this.drawOverlay(state);
    this.drawHpBar(state.hp);
    this.nameTag.setText(state.name + (state.status === "downed" ? " ⚠" : ""));
  }

  // ----- Drawing primitives -----

  private drawBaseShape(role: string) {
    const pal = rolePalette(role);
    const g = this.body;
    g.clear();

    // Drop shadow (back layer)
    this.shadow.clear();
    this.shadow.fillStyle(0x000000, 0.35);
    this.shadow.fillEllipse(0, 8, 22, 6);

    // Body — circle base, with rim outline
    g.fillStyle(pal.body, 1);
    g.fillCircle(0, 0, 12);
    g.lineStyle(2, pal.rim, 1);
    g.strokeCircle(0, 0, 12);

    // Role accessory layer
    this.accessory.clear();
    this.head.clear();

    switch (role) {
      case "hacker":
        // Hood: arc on the "back" half, slightly larger than body
        this.accessory.fillStyle(pal.accent, 1);
        this.accessory.beginPath();
        this.accessory.arc(0, 0, 14, Math.PI * 0.15, Math.PI * 0.85, false);
        this.accessory.lineTo(0, -3);
        this.accessory.closePath();
        this.accessory.fillPath();
        this.accessory.lineStyle(1.5, pal.rim, 1);
        this.accessory.beginPath();
        this.accessory.arc(0, 0, 14, Math.PI * 0.15, Math.PI * 0.85, false);
        this.accessory.strokePath();
        // Visor: glowing slit
        this.head.fillStyle(pal.visor, 1);
        this.head.fillRect(-6, -8, 12, 3);
        break;

      case "scout":
        // Cape (back layer)
        this.cape.clear();
        this.cape.fillStyle(pal.accent, 0.85);
        this.cape.beginPath();
        this.cape.moveTo(0, -3);
        this.cape.lineTo(-9, 14);
        this.cape.lineTo(0, 11);
        this.cape.lineTo(9, 14);
        this.cape.closePath();
        this.cape.fillPath();
        // Goggles
        this.head.fillStyle(pal.visor, 1);
        this.head.fillCircle(-3, -6, 2);
        this.head.fillCircle(3, -6, 2);
        this.head.lineStyle(1, pal.rim, 1);
        this.head.strokeCircle(-3, -6, 2);
        this.head.strokeCircle(3, -6, 2);
        break;

      case "breacher":
        // Shoulder pads
        this.accessory.fillStyle(pal.accent, 1);
        this.accessory.fillRect(-15, -4, 5, 10);
        this.accessory.fillRect(10, -4, 5, 10);
        this.accessory.lineStyle(1, pal.rim, 1);
        this.accessory.strokeRect(-15, -4, 5, 10);
        this.accessory.strokeRect(10, -4, 5, 10);
        // Helmet visor (front)
        this.head.fillStyle(pal.visor, 1);
        this.head.fillRect(-7, -9, 14, 4);
        this.head.lineStyle(1, pal.rim, 1);
        this.head.strokeRect(-7, -9, 14, 4);
        // Centerline stripe
        this.head.fillStyle(pal.accent, 1);
        this.head.fillRect(-1, -9, 2, 4);
        break;

      case "support":
        // Med cross emblem
        this.accessory.fillStyle(0xffffff, 1);
        this.accessory.fillRect(-2, -6, 4, 12);
        this.accessory.fillRect(-6, -2, 12, 4);
        this.accessory.lineStyle(1, pal.rim, 1);
        this.accessory.strokeRect(-2, -6, 4, 12);
        this.accessory.strokeRect(-6, -2, 12, 4);
        // Visor dot
        this.head.fillStyle(pal.visor, 1);
        this.head.fillCircle(0, -6, 2);
        break;

      default:
        this.head.fillStyle(pal.visor, 1);
        this.head.fillCircle(0, -5, 3);
    }
  }

  private drawOverlay(s: PlayerVisualState) {
    const o = this.overlay;
    o.clear();
    // Facing tick on the front
    o.lineStyle(2, 0x0a0d12, 0.9);
    o.beginPath();
    o.moveTo(0, 0);
    o.lineTo(Math.cos(s.facing) * 16, Math.sin(s.facing) * 16);
    o.strokePath();
    // Ability ready ring (local player only)
    if (s.isLocal) {
      const now = Date.now();
      const ready = now >= s.abilityCdUntil;
      if (ready) {
        o.lineStyle(1.5, rolePalette(s.role).visor, 0.6 + 0.4 * Math.sin(now / 200));
        o.strokeCircle(0, 0, 16);
      }
    }
  }

  private drawHpBar(hp: number) {
    const g = this.hpBar;
    g.clear();
    if (hp >= 100) return;
    const w = 24, h = 3;
    g.fillStyle(0x0a0d12, 0.7);
    g.fillRect(-w / 2, -22, w, h);
    g.fillStyle(hp > 50 ? 0x6ee7b7 : hp > 20 ? 0xfbbf24 : 0xef4444, 1);
    g.fillRect(-w / 2, -22, w * Math.max(0, hp / 100), h);
  }

  destroy() {
    this.root.destroy(true);
    this.nameTag.destroy();
  }
}
