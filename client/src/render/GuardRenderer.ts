import Phaser from "phaser";

export interface GuardVisualState {
  phase: string;
  facing: number;
  suspicion: number;
}

const TWO_PI = Math.PI * 2;

export class GuardRenderer {
  private scene: Phaser.Scene;
  private root: Phaser.GameObjects.Container;
  private shadow: Phaser.GameObjects.Graphics;
  private body: Phaser.GameObjects.Graphics;
  private overlay: Phaser.GameObjects.Graphics;
  private alertText: Phaser.GameObjects.Text;
  private walkPhase = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.root = scene.add.container(0, 0).setDepth(15);
    this.shadow = scene.add.graphics();
    this.body = scene.add.graphics();
    this.overlay = scene.add.graphics();
    this.root.add([this.shadow, this.body, this.overlay]);

    this.alertText = scene.add.text(0, -22, "", {
      fontFamily: "ui-monospace, monospace", fontSize: "14px", color: "#fbbf24",
      stroke: "#0a0d12", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(16);

    this.drawShadow();
  }

  update(x: number, y: number, state: GuardVisualState, deltaMs: number) {
    this.root.setPosition(x, y);
    this.alertText.setPosition(x, y - 22);

    // Walk anim: simple body sway when moving
    const moving = state.phase !== "search";
    if (moving) this.walkPhase = (this.walkPhase + deltaMs * 0.008) % TWO_PI;
    const bob = Math.sin(this.walkPhase * 2) * 0.8;

    // Color by state
    const color = this.colorForPhase(state.phase);
    const accent = this.accentForPhase(state.phase);

    const b = this.body;
    b.clear();
    b.fillStyle(color, 1);
    b.fillRect(-10, -10 + bob, 20, 20);
    b.lineStyle(2, 0x0a0d12, 1);
    b.strokeRect(-10, -10 + bob, 20, 20);
    // Shoulder accent
    b.fillStyle(accent, 1);
    b.fillRect(-10, -10 + bob, 20, 3);
    // Helmet/visor stripe
    b.fillStyle(0x0a0d12, 1);
    b.fillRect(-6, -6 + bob, 12, 2);

    // Facing tick
    const o = this.overlay;
    o.clear();
    o.lineStyle(2, 0x0a0d12, 1);
    o.beginPath();
    o.moveTo(0, 0);
    o.lineTo(Math.cos(state.facing) * 14, Math.sin(state.facing) * 14);
    o.strokePath();

    // Suspicion indicator bar (mini)
    if (state.suspicion > 5 && state.phase !== "patrol") {
      o.fillStyle(0x0a0d12, 0.6);
      o.fillRect(-10, -16, 20, 2);
      o.fillStyle(state.phase === "chase" ? 0xef4444 : 0xfbbf24, 1);
      o.fillRect(-10, -16, 20 * Math.min(1, state.suspicion / 100), 2);
    }

    // Alert text — "?" while investigating, "!" when chasing
    if (state.phase === "chase") {
      this.alertText.setText("!").setColor("#ef4444");
      this.alertText.setVisible(true);
    } else if (state.phase === "investigate" || state.phase === "search" || state.phase === "suspicious") {
      this.alertText.setText("?").setColor("#fbbf24");
      this.alertText.setVisible(true);
    } else {
      this.alertText.setVisible(false);
    }
  }

  private colorForPhase(phase: string): number {
    switch (phase) {
      case "patrol": return 0xcbd5e1;
      case "suspicious": return 0xfbbf24;
      case "investigate": return 0xfbbf24;
      case "search": return 0xf97316;
      case "chase": return 0xef4444;
      case "return": return 0x94a3b8;
      default: return 0xcbd5e1;
    }
  }

  private accentForPhase(phase: string): number {
    switch (phase) {
      case "chase": return 0x7f1d1d;
      case "investigate":
      case "suspicious": return 0x854d09;
      case "search": return 0x7c2d12;
      default: return 0x475569;
    }
  }

  private drawShadow() {
    this.shadow.clear();
    this.shadow.fillStyle(0x000000, 0.35);
    this.shadow.fillEllipse(0, 9, 20, 5);
  }

  destroy() {
    this.root.destroy(true);
    this.alertText.destroy();
  }
}
