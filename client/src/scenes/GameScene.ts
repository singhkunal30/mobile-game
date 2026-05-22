import Phaser from "phaser";
import { Room } from "colyseus.js";
import { NetworkManager } from "../net/NetworkManager";
import { VirtualJoystick } from "../controls/VirtualJoystick";
import { TouchButton } from "../controls/TouchButton";
import { PingWheel } from "../controls/PingWheel";
import {
  TILE_SIZE, MAP_WIDTH, MAP_HEIGHT,
  GUARD_VIEW_RANGE, GUARD_VIEW_ANGLE_DEG,
  ROLE_DEFS,
} from "@blackout/shared";

const COLOR_FLOOR = 0x1a2230;
const COLOR_FLOOR_ALT = 0x131923;
const COLOR_WALL = 0x0a0d12;
const COLOR_WALL_TOP = 0x2a3a4c;
const COLOR_DOOR = 0xb45309;
const COLOR_DOOR_OPEN = 0x854d09;
const COLOR_EXTRACT = 0xa78bfa;

interface RenderEntity {
  gfx: Phaser.GameObjects.Graphics;
  nameTag?: Phaser.GameObjects.Text;
  visionCone?: Phaser.GameObjects.Graphics;
  prevX: number; prevY: number;
  serverX: number; serverY: number;
  facing: number;
  lerpT: number;
}

export class GameScene extends Phaser.Scene {
  private room!: Room;
  private joystick!: VirtualJoystick;
  private interactBtn!: TouchButton;
  private abilityBtn!: TouchButton;
  private sprintBtn!: TouchButton;
  private pingWheel!: PingWheel;

  private mapLayer!: Phaser.GameObjects.Graphics;
  private overlayLayer!: Phaser.GameObjects.Graphics;
  private fxLayer!: Phaser.GameObjects.Container;

  private players = new Map<string, RenderEntity>();
  private guards = new Map<string, RenderEntity>();
  private loot = new Map<string, Phaser.GameObjects.Container>();
  private doors = new Map<string, Phaser.GameObjects.Graphics>();
  private extractGfx!: Phaser.GameObjects.Graphics;
  private extractProgressGfx!: Phaser.GameObjects.Graphics;
  private pingMarkers: { gfx: Phaser.GameObjects.Container; until: number }[] = [];

  private mapTiles: string[] = [];
  private mapW = 0;
  private mapH = 0;
  private myId: string = "";
  private sprintHold = false;

  constructor() { super("Game"); }

  create() {
    this.room = NetworkManager.instance.room!;
    this.myId = this.room.sessionId;
    this.cameras.main.setBackgroundColor("#0a0d12");
    this.mapLayer = this.add.graphics().setDepth(0);
    this.overlayLayer = this.add.graphics().setDepth(1);
    this.fxLayer = this.add.container(0, 0).setDepth(50);
    this.extractGfx = this.add.graphics().setDepth(2);
    this.extractProgressGfx = this.add.graphics().setDepth(3);

    this.pingWheel = new PingWheel(this);
    this.setupTouchUI();

    // Launch HUD scene
    this.scene.launch("HUD", { room: this.room });

    // Wire networked state listeners
    const s = this.room.state as any;
    if (s.map?.tiles?.length) this.applyMap();
    s.listen?.("phase", (v: string) => {
      if (v === "ended") this.handleEnd();
    });

    // Map may arrive after join — wait one tick
    this.time.delayedCall(200, () => this.applyMap());

    // Players add/remove
    s.players.onAdd((p: any, id: string) => this.addPlayer(p, id));
    s.players.onRemove((_p: any, id: string) => this.removePlayer(id));
    s.players.forEach((p: any, id: string) => this.addPlayer(p, id));

    // Guards
    s.guards.onAdd((g: any, id: string) => this.addGuard(g, id));
    s.guards.onRemove((_g: any, id: string) => this.removeGuard(id));
    s.guards.forEach((g: any, id: string) => this.addGuard(g, id));

    // Loot
    s.loot.onAdd((l: any, id: string) => this.addLoot(l, id));
    s.loot.onRemove((_l: any, id: string) => { this.loot.get(id)?.destroy(); this.loot.delete(id); });
    s.loot.forEach((l: any, id: string) => this.addLoot(l, id));

    // Doors
    s.doors.onAdd((d: any, id: string) => this.addDoor(d, id));
    s.doors.onRemove((_d: any, id: string) => { this.doors.get(id)?.destroy(); this.doors.delete(id); });
    s.doors.forEach((d: any, id: string) => this.addDoor(d, id));

    // Send ready immediately so single player flow works
    NetworkManager.instance.sendReady(true);

    // Events
    NetworkManager.instance.onEvent = (ev) => this.handleEvent(ev);

    // Camera follow my player when it appears
    this.time.delayedCall(300, () => this.attachCamera());

    // Two-finger tap on right side opens ping wheel (long press alt)
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.x > this.scale.width * 0.55 && p.y < this.scale.height * 0.5) {
        const cam = this.cameras.main;
        const wx = p.worldX, wy = p.worldY;
        this.pingWheel.open(p.x, p.y, wx, wy);
      }
    });
  }

  private setupTouchUI() {
    this.joystick = new VirtualJoystick(this);
    const w = this.scale.width;
    const h = this.scale.height;
    this.interactBtn = new TouchButton(this, {
      x: w - 70, y: h - 90, radius: 42, label: "USE",
      color: 0x6ee7b7,
      onPress: () => this.queueInteract(),
    });
    this.abilityBtn = new TouchButton(this, {
      x: w - 150, y: h - 130, radius: 36, label: "ABLT",
      color: 0xa78bfa,
      onPress: () => this.queueAbility(),
    });
    this.sprintBtn = new TouchButton(this, {
      x: w - 70, y: h - 180, radius: 32, label: "SPRT",
      color: 0xfbbf24,
      onPress: () => { this.sprintHold = !this.sprintHold; this.sprintBtn.setLabel(this.sprintHold ? "SPRT*" : "SPRT"); },
    });

    this.scale.on("resize", () => {
      const W = this.scale.width;
      const H = this.scale.height;
      this.interactBtn.setPosition(W - 70, H - 90);
      this.abilityBtn.setPosition(W - 150, H - 130);
      this.sprintBtn.setPosition(W - 70, H - 180);
    });
  }

  private pendingInteract = false;
  private pendingAbility = false;
  private queueInteract() { this.pendingInteract = true; }
  private queueAbility() { this.pendingAbility = true; }

  update(_time: number, deltaMs: number) {
    this.sendInput();
    this.interpolateEntities(deltaMs);
    this.drawGuardVision();
    this.drawExtractionProgress();
    this.cleanupPings(_time);

    const now = Date.now();
    const me = (this.room.state as any).players?.get?.(this.myId);
    if (me) {
      this.abilityBtn.updateCooldown(now);
      this.abilityBtn.setCooldown(me.abilityCdUntil);
    }
  }

  private inputSendAccum = 0;
  private sendInput() {
    // 30 Hz input rate
    this.inputSendAccum += this.game.loop.delta;
    if (this.inputSendAccum < 33) return;
    this.inputSendAccum = 0;
    const dx = this.joystick.vx;
    const dy = this.joystick.vy;
    NetworkManager.instance.sendInput({
      dx, dy,
      sprint: this.sprintHold,
      interact: this.pendingInteract,
      ability: this.pendingAbility,
      dt: 33,
    } as any);
    this.pendingInteract = false;
    this.pendingAbility = false;
  }

  private applyMap() {
    const s = this.room.state as any;
    if (!s.map?.tiles?.length) return;
    if (this.mapW !== 0) return; // already drawn
    this.mapW = s.map.width;
    this.mapH = s.map.height;
    this.mapTiles = s.map.tiles.map((r: any) => r.row);
    this.drawMap();

    // Extraction overlay
    this.extractGfx.clear();
    this.extractGfx.fillStyle(COLOR_EXTRACT, 0.22);
    this.extractGfx.fillRect(s.map.extractX, s.map.extractY, s.map.extractW * TILE_SIZE, s.map.extractH * TILE_SIZE);
    this.extractGfx.lineStyle(2, COLOR_EXTRACT, 0.8);
    this.extractGfx.strokeRect(s.map.extractX, s.map.extractY, s.map.extractW * TILE_SIZE, s.map.extractH * TILE_SIZE);

    // World bounds for camera
    this.cameras.main.setBounds(0, 0, this.mapW * TILE_SIZE, this.mapH * TILE_SIZE);
  }

  private drawMap() {
    this.mapLayer.clear();
    for (let y = 0; y < this.mapH; y++) {
      for (let x = 0; x < this.mapW; x++) {
        const c = this.mapTiles[y][x];
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        if (c === "#") {
          this.mapLayer.fillStyle(COLOR_WALL, 1);
          this.mapLayer.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          this.mapLayer.fillStyle(COLOR_WALL_TOP, 1);
          this.mapLayer.fillRect(px, py, TILE_SIZE, 4);
        } else {
          const alt = (x + y) % 2 === 0;
          this.mapLayer.fillStyle(alt ? COLOR_FLOOR : COLOR_FLOOR_ALT, 1);
          this.mapLayer.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          this.mapLayer.lineStyle(1, 0x0a0d12, 0.15);
          this.mapLayer.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }

  // ===== Entities =====

  private addPlayer(p: any, id: string) {
    const gfx = this.add.graphics().setDepth(20);
    const tag = this.add.text(p.x, p.y - 22, p.name + " (" + p.role + ")", {
      fontFamily: "ui-sans-serif, system-ui", fontSize: "10px", color: "#cbd5e1",
    }).setOrigin(0.5).setDepth(21);
    const ent: RenderEntity = {
      gfx, nameTag: tag,
      prevX: p.x, prevY: p.y,
      serverX: p.x, serverY: p.y,
      facing: p.facing, lerpT: 1,
    };
    this.players.set(id, ent);
    this.drawPlayer(ent, p, id === this.myId);

    p.onChange(() => {
      ent.prevX = ent.serverX;
      ent.prevY = ent.serverY;
      ent.serverX = p.x;
      ent.serverY = p.y;
      ent.facing = p.facing;
      ent.lerpT = 0;
      this.drawPlayer(ent, p, id === this.myId);
      if (tag) tag.setText(p.name + (p.status === "downed" ? " ⚠" : p.status === "extracted" ? " ✔" : ""));
    });
  }

  private drawPlayer(ent: RenderEntity, p: any, isLocal: boolean) {
    const g = ent.gfx;
    g.clear();
    const x = ent.serverX, y = ent.serverY;
    if (p.status === "extracted") return;
    const fill = isLocal ? 0x6ee7b7 : 0x60a5fa;
    g.fillStyle(p.status === "downed" ? 0x64748b : fill, 0.95);
    g.fillCircle(x, y, 12);
    g.lineStyle(2, 0x0a0d12, 1);
    g.strokeCircle(x, y, 12);
    // Facing tick
    g.lineStyle(2, 0x0a0d12, 1);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(p.facing) * 16, y + Math.sin(p.facing) * 16);
    g.strokePath();
    // HP bar
    const w = 24, h = 3;
    g.fillStyle(0x0a0d12, 0.7);
    g.fillRect(x - w / 2, y - 22, w, h);
    g.fillStyle(p.hp > 50 ? 0x6ee7b7 : p.hp > 20 ? 0xfbbf24 : 0xef4444, 1);
    g.fillRect(x - w / 2, y - 22, w * Math.max(0, p.hp / 100), h);
  }

  private removePlayer(id: string) {
    const e = this.players.get(id);
    e?.gfx.destroy();
    e?.nameTag?.destroy();
    this.players.delete(id);
  }

  private addGuard(g: any, id: string) {
    const gfx = this.add.graphics().setDepth(15);
    const cone = this.add.graphics().setDepth(4).setAlpha(0.4);
    const ent: RenderEntity = {
      gfx, visionCone: cone,
      prevX: g.x, prevY: g.y,
      serverX: g.x, serverY: g.y,
      facing: g.facing, lerpT: 1,
    };
    this.guards.set(id, ent);
    this.drawGuard(ent, g);
    g.onChange(() => {
      ent.prevX = ent.serverX;
      ent.prevY = ent.serverY;
      ent.serverX = g.x;
      ent.serverY = g.y;
      ent.facing = g.facing;
      ent.lerpT = 0;
      this.drawGuard(ent, g);
    });
  }

  private drawGuard(ent: RenderEntity, g: any) {
    const gfx = ent.gfx;
    gfx.clear();
    const x = ent.serverX, y = ent.serverY;
    let color = 0xef4444;
    if (g.phase === "patrol") color = 0xcbd5e1;
    else if (g.phase === "suspicious" || g.phase === "investigate") color = 0xfbbf24;
    else if (g.phase === "chase") color = 0xef4444;
    else if (g.phase === "search") color = 0xf97316;
    gfx.fillStyle(color, 1);
    gfx.fillRect(x - 10, y - 10, 20, 20);
    gfx.lineStyle(2, 0x0a0d12, 1);
    gfx.strokeRect(x - 10, y - 10, 20, 20);
    // Facing tick
    gfx.beginPath();
    gfx.moveTo(x, y);
    gfx.lineTo(x + Math.cos(g.facing) * 14, y + Math.sin(g.facing) * 14);
    gfx.strokePath();
  }

  private removeGuard(id: string) {
    const e = this.guards.get(id);
    e?.gfx.destroy();
    e?.visionCone?.destroy();
    this.guards.delete(id);
  }

  private addLoot(l: any, id: string) {
    const c = this.add.container(l.x, l.y).setDepth(10);
    const g = this.add.graphics();
    const colors: Record<string, number> = {
      common: 0x94a3b8, rare: 0x60a5fa, elite: 0xa78bfa, objective: 0xfbbf24,
    };
    const color = colors[l.tier] ?? 0xcbd5e1;
    g.fillStyle(color, 1);
    g.fillCircle(0, 0, 6);
    g.lineStyle(2, 0x0a0d12, 1);
    g.strokeCircle(0, 0, 6);
    c.add(g);
    this.tweens.add({ targets: c, scale: { from: 1.0, to: 1.2 }, yoyo: true, repeat: -1, duration: 800 });
    this.loot.set(id, c);
    l.onChange(() => {
      if (l.taken) c.setAlpha(0.0);
    });
  }

  private addDoor(d: any, id: string) {
    const g = this.add.graphics().setDepth(8);
    this.doors.set(id, g);
    const draw = () => {
      g.clear();
      const color = d.open ? COLOR_DOOR_OPEN : (d.locked ? 0x991b1b : COLOR_DOOR);
      g.fillStyle(color, d.open ? 0.4 : 0.95);
      if (d.horizontal) g.fillRect(d.x - TILE_SIZE / 2, d.y - 4, TILE_SIZE, 8);
      else g.fillRect(d.x - 4, d.y - TILE_SIZE / 2, 8, TILE_SIZE);
    };
    draw();
    d.onChange(() => draw());
  }

  private attachCamera() {
    const me = this.players.get(this.myId);
    if (!me) {
      this.time.delayedCall(150, () => this.attachCamera());
      return;
    }
    // Use a dummy follow object so camera follows lerped position
    const follow = this.add.rectangle(me.serverX, me.serverY, 1, 1, 0xffffff, 0).setVisible(false);
    (this as any)._cameraTarget = follow;
    this.cameras.main.startFollow(follow, true, 0.15, 0.15);
    this.cameras.main.setZoom(1.0);
  }

  private interpolateEntities(deltaMs: number) {
    const dt = Math.min(deltaMs / 100, 1); // ~100ms interp window
    const apply = (e: RenderEntity, drawFn: () => void) => {
      e.lerpT = Math.min(1, e.lerpT + dt);
      const x = e.prevX + (e.serverX - e.prevX) * e.lerpT;
      const y = e.prevY + (e.serverY - e.prevY) * e.lerpT;
      e.gfx.x = x - e.serverX; e.gfx.y = y - e.serverY;
    };
    // Update player nametags
    this.players.forEach((e, id) => {
      e.lerpT = Math.min(1, e.lerpT + dt);
      const x = e.prevX + (e.serverX - e.prevX) * e.lerpT;
      const y = e.prevY + (e.serverY - e.prevY) * e.lerpT;
      if (e.nameTag) { e.nameTag.x = x; e.nameTag.y = y - 24; }
      // For player drawing, redraw at lerped position
      e.gfx.x = (x - e.serverX);
      e.gfx.y = (y - e.serverY);
      if (id === this.myId) {
        const target: any = (this as any)._cameraTarget;
        if (target) { target.x = x; target.y = y; }
      }
    });
    this.guards.forEach((e) => {
      e.lerpT = Math.min(1, e.lerpT + dt);
      const x = e.prevX + (e.serverX - e.prevX) * e.lerpT;
      const y = e.prevY + (e.serverY - e.prevY) * e.lerpT;
      e.gfx.x = (x - e.serverX);
      e.gfx.y = (y - e.serverY);
    });
  }

  private drawGuardVision() {
    const s = this.room.state as any;
    this.guards.forEach((ent, id) => {
      const g = s.guards.get(id);
      if (!g || !ent.visionCone) return;
      const cone = ent.visionCone;
      cone.clear();
      const x = ent.serverX + ent.gfx.x;
      const y = ent.serverY + ent.gfx.y;
      const half = (GUARD_VIEW_ANGLE_DEG * Math.PI) / 180 / 2;
      const r = GUARD_VIEW_RANGE;
      let color = 0xfacc15;
      if (g.phase === "chase") color = 0xef4444;
      else if (g.phase === "investigate" || g.phase === "search") color = 0xf97316;
      cone.fillStyle(color, 0.18);
      cone.beginPath();
      cone.moveTo(x, y);
      const steps = 12;
      for (let i = 0; i <= steps; i++) {
        const a = g.facing - half + (i / steps) * (half * 2);
        cone.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      cone.closePath();
      cone.fillPath();
    });
  }

  private drawExtractionProgress() {
    const s = this.room.state as any;
    if (!s.map) return;
    this.extractProgressGfx.clear();
    const p = s.extractProgress ?? 0;
    if (p > 0) {
      const x = s.map.extractX + (s.map.extractW * TILE_SIZE) / 2;
      const y = s.map.extractY - 10;
      this.extractProgressGfx.fillStyle(0x0a0d12, 0.8);
      this.extractProgressGfx.fillRect(x - 50, y - 4, 100, 8);
      this.extractProgressGfx.fillStyle(0xa78bfa, 1);
      this.extractProgressGfx.fillRect(x - 50, y - 4, 100 * p, 8);
    }
  }

  private handleEvent(ev: any) {
    if (ev.t === "ping") {
      const c = this.add.container(ev.x, ev.y).setDepth(40);
      const colors: Record<string, number> = {
        look: 0xfbbf24, danger: 0xef4444, loot: 0x6ee7b7, regroup: 0x60a5fa, extract: 0xa78bfa,
      };
      const color = colors[ev.kind] ?? 0xffffff;
      const g = this.add.graphics();
      g.lineStyle(3, color, 1);
      g.strokeCircle(0, 0, 18);
      c.add(g);
      this.tweens.add({ targets: c, scale: { from: 0.5, to: 2.5 }, alpha: { from: 1, to: 0 }, duration: 1400, onComplete: () => c.destroy() });
      this.pingMarkers.push({ gfx: c, until: Date.now() + 1500 });
    } else if (ev.t === "spotted") {
      this.cameras.main.shake(120, 0.005);
    } else if (ev.t === "alarm_raised") {
      this.cameras.main.flash(180, 220, 60, 60);
    } else if (ev.t === "loot_picked") {
      const me = this.players.get(ev.playerId);
      if (me) {
        const txt = this.add.text(me.serverX, me.serverY - 30, "+" + ev.value, {
          fontFamily: "ui-sans-serif, system-ui", fontSize: "12px", color: "#fbbf24",
        }).setOrigin(0.5).setDepth(60);
        this.tweens.add({ targets: txt, y: txt.y - 30, alpha: 0, duration: 1000, onComplete: () => txt.destroy() });
      }
    }
  }

  private cleanupPings(now: number) {
    this.pingMarkers = this.pingMarkers.filter(p => {
      if (now > p.until) { p.gfx.destroy(); return false; }
      return true;
    });
  }

  private handleEnd() {
    const s = this.room.state as any;
    this.scene.stop("HUD");
    this.scene.launch("End", { success: s.phase === "ended", score: s.score });
  }
}
