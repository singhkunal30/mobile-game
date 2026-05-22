import Phaser from "phaser";
import { generateTextures } from "../render/SpriteFactory";

export class BootScene extends Phaser.Scene {
  constructor() { super("Boot"); }

  preload() {
    this.makePixelTexture("px", 0xffffff);
  }

  create() {
    generateTextures(this);
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
