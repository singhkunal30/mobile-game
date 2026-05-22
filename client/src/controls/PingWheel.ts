import Phaser from "phaser";
import { NetworkManager } from "../net/NetworkManager";

const PINGS: { kind: "look" | "danger" | "loot" | "regroup" | "extract"; label: string; color: number }[] = [
  { kind: "look", label: "LOOK", color: 0xfbbf24 },
  { kind: "danger", label: "DANGER", color: 0xef4444 },
  { kind: "loot", label: "LOOT", color: 0x6ee7b7 },
  { kind: "regroup", label: "REGROUP", color: 0x60a5fa },
  { kind: "extract", label: "EXTRACT", color: 0xa78bfa },
];

export class PingWheel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container | null = null;
  private targetWorld: { x: number; y: number } = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  open(screenX: number, screenY: number, worldX: number, worldY: number) {
    this.close();
    this.targetWorld = { x: worldX, y: worldY };
    const radius = 80;
    const c = this.scene.add.container(screenX, screenY).setScrollFactor(0).setDepth(2000);
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x0a0d12, 0.7);
    bg.fillCircle(0, 0, radius + 24);
    c.add(bg);
    PINGS.forEach((p, i) => {
      const a = (i / PINGS.length) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * radius;
      const y = Math.sin(a) * radius;
      const g = this.scene.add.graphics();
      g.fillStyle(p.color, 0.85);
      g.fillCircle(x, y, 26);
      const t = this.scene.add.text(x, y, p.label, {
        fontFamily: "ui-sans-serif, system-ui",
        fontSize: "10px",
        color: "#0a0d12",
      }).setOrigin(0.5);
      const hit = new Phaser.Geom.Circle(x, y, 28);
      g.setInteractive(hit, Phaser.Geom.Circle.Contains);
      g.on("pointerdown", () => {
        NetworkManager.instance.sendPing(p.kind, this.targetWorld.x, this.targetWorld.y);
        this.close();
      });
      c.add(g);
      c.add(t);
    });
    this.container = c;
    // Close on background tap
    this.scene.time.delayedCall(50, () => {
      const onDown = (pt: Phaser.Input.Pointer) => {
        const dx = pt.x - screenX, dy = pt.y - screenY;
        if (Math.hypot(dx, dy) > radius + 30) {
          this.close();
          this.scene.input.off("pointerdown", onDown);
        }
      };
      this.scene.input.on("pointerdown", onDown);
    });
  }

  close() {
    this.container?.destroy(true);
    this.container = null;
  }

  isOpen() { return !!this.container; }
}
