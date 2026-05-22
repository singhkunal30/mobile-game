import Phaser from "phaser";

// Floating virtual joystick that activates on left-half touch.
// Supplies a normalized vector (-1..1).

export class VirtualJoystick {
  private scene: Phaser.Scene;
  private base: Phaser.GameObjects.Graphics;
  private thumb: Phaser.GameObjects.Graphics;
  private pointerId: number = -1;
  private originX = 0;
  private originY = 0;
  private maxRadius = 60;
  public vx = 0;
  public vy = 0;
  public active = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.base = scene.add.graphics().setScrollFactor(0).setDepth(1000).setAlpha(0);
    this.thumb = scene.add.graphics().setScrollFactor(0).setDepth(1001).setAlpha(0);

    scene.input.on("pointerdown", this.onDown, this);
    scene.input.on("pointermove", this.onMove, this);
    scene.input.on("pointerup", this.onUp, this);
    scene.input.on("pointerupoutside", this.onUp, this);
  }

  private inJoyZone(p: Phaser.Input.Pointer): boolean {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    return p.x < w * 0.55 && p.y > h * 0.25; // left 55%, below top strip
  }

  private onDown(p: Phaser.Input.Pointer) {
    if (this.active) return;
    if (!this.inJoyZone(p)) return;
    this.pointerId = p.id;
    this.originX = p.x;
    this.originY = p.y;
    this.active = true;
    this.drawBase();
    this.drawThumb(p.x, p.y);
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (!this.active || p.id !== this.pointerId) return;
    let dx = p.x - this.originX;
    let dy = p.y - this.originY;
    const mag = Math.hypot(dx, dy);
    if (mag > this.maxRadius) {
      dx = (dx / mag) * this.maxRadius;
      dy = (dy / mag) * this.maxRadius;
    }
    this.vx = dx / this.maxRadius;
    this.vy = dy / this.maxRadius;
    this.drawThumb(this.originX + dx, this.originY + dy);
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (p.id !== this.pointerId) return;
    this.active = false;
    this.pointerId = -1;
    this.vx = 0; this.vy = 0;
    this.base.setAlpha(0);
    this.thumb.setAlpha(0);
  }

  private drawBase() {
    this.base.clear();
    this.base.lineStyle(2, 0x6ee7b7, 0.6);
    this.base.strokeCircle(this.originX, this.originY, this.maxRadius);
    this.base.lineStyle(1, 0x6ee7b7, 0.25);
    this.base.strokeCircle(this.originX, this.originY, this.maxRadius * 0.5);
    this.base.setAlpha(1);
  }

  private drawThumb(x: number, y: number) {
    this.thumb.clear();
    this.thumb.fillStyle(0x6ee7b7, 0.85);
    this.thumb.fillCircle(x, y, 22);
    this.thumb.setAlpha(1);
  }

  destroy() {
    this.scene.input.off("pointerdown", this.onDown, this);
    this.scene.input.off("pointermove", this.onMove, this);
    this.scene.input.off("pointerup", this.onUp, this);
    this.scene.input.off("pointerupoutside", this.onUp, this);
    this.base.destroy();
    this.thumb.destroy();
  }
}
