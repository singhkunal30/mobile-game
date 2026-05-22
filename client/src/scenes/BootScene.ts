import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() { super("Boot"); }

  preload() {
    // No external assets — everything is drawn with primitives for fast iteration.
    // Generate procedural textures so we can use particles/sprites cheaply.
    this.makePixelTexture("px", 0xffffff);
  }

  create() {
    this.scene.start("Menu");
  }

  private makePixelTexture(key: string, color: number) {
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillRect(0, 0, 2, 2);
    g.generateTexture(key, 2, 2);
    g.destroy();
  }
}
