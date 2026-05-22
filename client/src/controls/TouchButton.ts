import Phaser from "phaser";

export interface TouchButtonOpts {
  x: number; y: number; radius: number;
  label: string;
  color?: number;
  onPress: () => void;
}

export class TouchButton {
  private scene: Phaser.Scene;
  private gfx: Phaser.GameObjects.Graphics;
  private text: Phaser.GameObjects.Text;
  private label: Phaser.GameObjects.Text | null = null;
  private opts: TouchButtonOpts;
  private cdEnd = 0;
  pressed = false;

  constructor(scene: Phaser.Scene, opts: TouchButtonOpts) {
    this.scene = scene;
    this.opts = opts;
    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(1000);
    this.text = scene.add.text(opts.x, opts.y, opts.label, {
      fontFamily: "ui-sans-serif, system-ui",
      fontSize: "14px",
      color: "#0a0d12",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
    this.draw();

    const hit = new Phaser.Geom.Circle(opts.x, opts.y, opts.radius);
    this.gfx.setInteractive(hit, Phaser.Geom.Circle.Contains);
    this.gfx.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (Date.now() < this.cdEnd) return;
      this.pressed = true;
      this.draw(true);
      this.opts.onPress();
      // small visual cooldown
      this.scene.time.delayedCall(100, () => { this.pressed = false; this.draw(false); });
    });
  }

  setLabel(s: string) {
    this.text.setText(s);
  }

  setCooldown(untilTs: number) {
    this.cdEnd = untilTs;
  }

  updateCooldown(now: number) {
    if (now < this.cdEnd) {
      const secs = Math.ceil((this.cdEnd - now) / 1000);
      this.text.setText(secs.toString());
      this.draw(false, true);
    } else if (this.text.text !== this.opts.label) {
      this.text.setText(this.opts.label);
      this.draw(false);
    }
  }

  setPosition(x: number, y: number) {
    this.opts.x = x; this.opts.y = y;
    this.text.setPosition(x, y);
    const hit = new Phaser.Geom.Circle(x, y, this.opts.radius);
    this.gfx.setInteractive(hit, Phaser.Geom.Circle.Contains);
    this.draw();
  }

  private draw(pressed = false, cd = false) {
    this.gfx.clear();
    const c = cd ? 0x475569 : (this.opts.color ?? 0x6ee7b7);
    this.gfx.fillStyle(c, pressed ? 1.0 : 0.7);
    this.gfx.fillCircle(this.opts.x, this.opts.y, this.opts.radius);
    this.gfx.lineStyle(2, 0x0a0d12, 0.6);
    this.gfx.strokeCircle(this.opts.x, this.opts.y, this.opts.radius);
  }

  destroy() {
    this.gfx.destroy();
    this.text.destroy();
    this.label?.destroy();
  }
}
