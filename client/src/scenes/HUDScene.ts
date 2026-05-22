import Phaser from "phaser";
import { Room } from "colyseus.js";
import { ALARM_LEVELS, MATCH_DURATION_MS } from "@blackout/shared";

export class HUDScene extends Phaser.Scene {
  private room!: Room;
  private timerText!: Phaser.GameObjects.Text;
  private alarmText!: Phaser.GameObjects.Text;
  private alarmBar!: Phaser.GameObjects.Graphics;
  private heatBar!: Phaser.GameObjects.Graphics;
  private objectiveText!: Phaser.GameObjects.Text;
  private modifierText!: Phaser.GameObjects.Text;
  private rosterTexts: Phaser.GameObjects.Text[] = [];

  constructor() { super("HUD"); }

  init(data: any) { this.room = data.room; }

  create() {
    const w = this.scale.width;
    const top = 10;
    this.timerText = this.add.text(w / 2, top, "12:00", {
      fontFamily: "ui-monospace, SF Mono, monospace", fontSize: "22px", color: "#e2e8f0",
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(2000);
    this.objectiveText = this.add.text(w / 2, top + 30, "STEAL · EXTRACT", {
      fontFamily: "ui-sans-serif, system-ui", fontSize: "11px", color: "#6ee7b7",
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(2000);

    this.alarmText = this.add.text(12, 12, "ALARM 0/" + ALARM_LEVELS, {
      fontFamily: "ui-sans-serif, system-ui", fontSize: "12px", color: "#fbbf24",
    }).setScrollFactor(0).setDepth(2000);
    this.alarmBar = this.add.graphics().setScrollFactor(0).setDepth(2000);
    this.heatBar = this.add.graphics().setScrollFactor(0).setDepth(2000);

    this.modifierText = this.add.text(12, 50, "MOD: --", {
      fontFamily: "ui-sans-serif, system-ui", fontSize: "10px", color: "#a78bfa",
    }).setScrollFactor(0).setDepth(2000);

    this.scale.on("resize", () => { this.timerText.x = this.scale.width / 2; this.objectiveText.x = this.scale.width / 2; });
  }

  update() {
    const s = this.room.state as any;
    const remaining = Math.max(0, (s.tEnd || (Date.now() + MATCH_DURATION_MS)) - (s.tNow || Date.now()));
    const mm = Math.floor(remaining / 60000);
    const ss = Math.floor((remaining % 60000) / 1000);
    this.timerText.setText(`${mm.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`);

    const level = s.alarmLevel ?? 0;
    const heat = s.alarmHeat ?? 0;
    this.alarmText.setText(`ALARM ${level}/${ALARM_LEVELS}` + (s.phase === "lockdown" ? " · LOCKDOWN" : ""));
    this.alarmText.setColor(level >= ALARM_LEVELS ? "#ef4444" : level >= 3 ? "#fb923c" : "#fbbf24");

    this.alarmBar.clear();
    this.alarmBar.fillStyle(0x0a0d12, 0.7);
    this.alarmBar.fillRect(12, 30, 160, 6);
    this.alarmBar.fillStyle(level >= ALARM_LEVELS ? 0xef4444 : 0xfb923c, 1);
    this.alarmBar.fillRect(12, 30, 160 * (level / ALARM_LEVELS), 6);

    this.heatBar.clear();
    this.heatBar.fillStyle(0x0a0d12, 0.5);
    this.heatBar.fillRect(12, 38, 160, 3);
    this.heatBar.fillStyle(0xfacc15, 0.8);
    this.heatBar.fillRect(12, 38, 160 * Math.min(1, heat / 100), 3);

    this.modifierText.setText("MOD: " + (s.modifier ?? "--").toUpperCase() + " · SCORE " + (s.score ?? 0));

    // Roster
    const players = Array.from((s.players as any).values?.() ?? []);
    for (let i = 0; i < this.rosterTexts.length; i++) this.rosterTexts[i].setVisible(false);
    players.forEach((p: any, i: number) => {
      if (!this.rosterTexts[i]) {
        this.rosterTexts[i] = this.add.text(this.scale.width - 12, 14 + i * 16, "", {
          fontFamily: "ui-monospace, monospace", fontSize: "11px", color: "#cbd5e1",
        }).setOrigin(1, 0).setScrollFactor(0).setDepth(2000);
      }
      const status = p.status === "downed" ? "⚠" : p.status === "extracted" ? "✔" : Math.round(p.hp);
      const color = p.status === "extracted" ? "#6ee7b7" : p.status === "downed" ? "#ef4444" : "#cbd5e1";
      this.rosterTexts[i].setText(`${p.name.padEnd(12)} ${p.role.padEnd(8)} ${status}`);
      this.rosterTexts[i].setColor(color);
      this.rosterTexts[i].setVisible(true);
      this.rosterTexts[i].setPosition(this.scale.width - 12, 14 + i * 16);
    });
  }
}
