import Phaser from "phaser";
import { Room } from "colyseus.js";
import { NetworkManager } from "../net/NetworkManager";
import { VirtualJoystick } from "../controls/VirtualJoystick";
import { TouchButton } from "../controls/TouchButton";
import { PingWheel } from "../controls/PingWheel";
import { SfxManager } from "../audio/SfxManager";
import { PlayerRenderer } from "../render/PlayerRenderer";
import { GuardRenderer } from "../render/GuardRenderer";
import { LightingSystem } from "../render/LightingSystem";
import { ParticleSystem } from "../render/ParticleSystem";
import { PALETTE } from "../render/Palette";
import { TILE_SIZE, ALARM_LEVELS } from "@blackout/shared";

interface PlayerEntity {
  renderer: PlayerRenderer;
  prevX: number; prevY: number;
  serverX: number; serverY: number;
  lerpT: number;
  lastFootstepAt: number;
}

interface GuardEntity {
  renderer: GuardRenderer;
  prevX: number; prevY: number;
  serverX: number; serverY: number;
  lerpT: number;
  lastPhase: string;
}

export class GameScene extends Phaser.Scene {
  private room!: Room;
  private joystick!: VirtualJoystick;
  private interactBtn!: TouchButton;
  private abilityBtn!: TouchButton;
  private sprintBtn!: TouchButton;
  private pingWheel!: PingWheel;
  private sfx!: SfxManager;
  private lighting!: LightingSystem;
  private particles!: ParticleSystem;

  private mapLayer!: Phaser.GameObjects.Graphics;
  private extractGfx!: Phaser.GameObjects.Graphics;
  private extractProgressGfx!: Phaser.GameObjects.Graphics;
  private interactingArc!: Phaser.GameObjects.Graphics;

  private players = new Map<string, PlayerEntity>();
  private guards = new Map<string, GuardEntity>();
  private loot = new Map<string, Phaser.GameObjects.Container>();
  private doors = new Map<string, Phaser.GameObjects.Graphics>();
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
    this.cameras.main.setBackgroundColor("#070a0e");

    this.mapLayer = this.add.graphics().setDepth(0);
    this.extractGfx = this.add.graphics().setDepth(2);
    this.extractProgressGfx = this.add.graphics().setDepth(3);
    this.interactingArc = this.add.graphics().setDepth(60);

    this.sfx = new SfxManager(this);
    this.lighting = new LightingSystem(this);
    this.particles = new ParticleSystem(this);
    this.particles.init();

    this.pingWheel = new PingWheel(this);
    this.setupTouchUI();

    this.scene.launch("HUD", { room: this.room });

    const s = this.room.state as any;
    if (s.map?.tiles?.length) this.applyMap();

    s.listen?.("phase", (v: string) => {
      if (v === "ended") this.handleEnd();
      if (v === "lockdown") this.cameras.main.flash(400, 220, 60, 60);
    });

    this.time.delayedCall(120, () => this.applyMap());

    s.players.onAdd((p: any, id: string) => this.addPlayer(p, id));
    s.players.onRemove((_p: any, id: string) => this.removePlayer(id));
    s.players.forEach((p: any, id: string) => this.addPlayer(p, id));

    s.guards.onAdd((g: any, id: string) => this.addGuard(g, id));
    s.guards.onRemove((_g: any, id: string) => this.removeGuard(id));
    s.guards.forEach((g: any, id: string) => this.addGuard(g, id));

    s.loot.onAdd((l: any, id: string) => this.addLoot(l, id));
    s.loot.onRemove((_l: any, id: string) => { this.loot.get(id)?.destroy(); this.loot.delete(id); });
    s.loot.forEach((l: any, id: string) => this.addLoot(l, id));

    s.doors.onAdd((d: any, id: string) => this.addDoor(d, id));
    s.doors.onRemove((_d: any, id: string) => { this.doors.get(id)?.destroy(); this.doors.delete(id); });
    s.doors.forEach((d: any, id: string) => this.addDoor(d, id));

    NetworkManager.instance.sendReady(true);
    NetworkManager.instance.onEvent = (ev) => this.handleEvent(ev);

    this.time.delayedCall(300, () => this.attachCamera());

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.x > this.scale.width * 0.55 && p.y < this.scale.height * 0.5) {
        this.pingWheel.open(p.x, p.y, p.worldX, p.worldY);
      }
    });
    this.input.once("pointerdown", () => this.sfx.unlock());
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

    this.input.keyboard?.on("keydown-E", () => this.queueInteract());
    this.input.keyboard?.on("keydown-Q", () => this.queueAbility());
    this.input.keyboard?.on("keydown-SHIFT", () => { this.sprintHold = true; this.sprintBtn.setLabel("SPRT*"); });
    this.input.keyboard?.on("keyup-SHIFT", () => { this.sprintHold = false; this.sprintBtn.setLabel("SPRT"); });
  }

  private kbVec(): { dx: number; dy: number } {
    const k = this.input.keyboard;
    if (!k) return { dx: 0, dy: 0 };
    let dx = 0, dy = 0;
    if (k.checkDown(k.addKey("A"), 0) || k.checkDown(k.addKey("LEFT"), 0)) dx -= 1;
    if (k.checkDown(k.addKey("D"), 0) || k.checkDown(k.addKey("RIGHT"), 0)) dx += 1;
    if (k.checkDown(k.addKey("W"), 0) || k.checkDown(k.addKey("UP"), 0)) dy -= 1;
    if (k.checkDown(k.addKey("S"), 0) || k.checkDown(k.addKey("DOWN"), 0)) dy += 1;
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    return { dx, dy };
  }

  private pendingInteract = false;
  private pendingAbility = false;
  private queueInteract() { this.pendingInteract = true; }
  private queueAbility() { this.pendingAbility = true; }

  update(_time: number, deltaMs: number) {
    this.sendInput();
    this.updateEntities(deltaMs);
    this.updateLighting(deltaMs);
    this.drawExtractionProgress();
    this.drawInteractionProgress();
    this.spawnFootsteps();
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
    this.inputSendAccum += this.game.loop.delta;
    if (this.inputSendAccum < 33) return;
    this.inputSendAccum = 0;
    let dx = this.joystick.vx;
    let dy = this.joystick.vy;
    if (Math.hypot(dx, dy) < 0.05) {
      const k = this.kbVec();
      dx = k.dx; dy = k.dy;
    }
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
    if (this.mapW !== 0) return;
    this.mapW = s.map.width;
    this.mapH = s.map.height;
    this.mapTiles = s.map.tiles.map((r: any) => r.row);
    this.drawMap();

    const worldW = this.mapW * TILE_SIZE;
    const worldH = this.mapH * TILE_SIZE;
    this.lighting.init(worldW, worldH, s.modifier ?? "");

    this.extractGfx.clear();
    this.extractGfx.fillStyle(PALETTE.extract, 0.22);
    this.extractGfx.fillRect(s.map.extractX, s.map.extractY, s.map.extractW * TILE_SIZE, s.map.extractH * TILE_SIZE);
    this.extractGfx.lineStyle(2, PALETTE.extract, 0.8);
    this.extractGfx.strokeRect(s.map.extractX, s.map.extractY, s.map.extractW * TILE_SIZE, s.map.extractH * TILE_SIZE);
    // Extract glow corners
    const ex = s.map.extractX, ey = s.map.extractY;
    const ew = s.map.extractW * TILE_SIZE, eh = s.map.extractH * TILE_SIZE;
    this.extractGfx.fillStyle(PALETTE.extractGlow, 0.5);
    [[ex, ey], [ex + ew, ey], [ex, ey + eh], [ex + ew, ey + eh]].forEach(([cx, cy]) => {
      this.extractGfx.fillCircle(cx, cy, 6);
    });

    this.cameras.main.setBounds(0, 0, worldW, worldH);
  }

  private drawMap() {
    this.mapLayer.clear();
    for (let y = 0; y < this.mapH; y++) {
      for (let x = 0; x < this.mapW; x++) {
        const c = this.mapTiles[y][x];
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        if (c === "#") {
          this.mapLayer.fillStyle(PALETTE.wall, 1);
          this.mapLayer.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          this.mapLayer.fillStyle(PALETTE.wallTop, 1);
          this.mapLayer.fillRect(px, py, TILE_SIZE, 5);
          // Side shadow
          this.mapLayer.fillStyle(PALETTE.wallShadow, 0.7);
          this.mapLayer.fillRect(px, py + TILE_SIZE - 3, TILE_SIZE, 3);
        } else {
          const alt = (x + y) % 2 === 0;
          this.mapLayer.fillStyle(alt ? PALETTE.floor : PALETTE.floorAlt, 1);
          this.mapLayer.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          this.mapLayer.lineStyle(1, 0x0a0d12, 0.15);
          this.mapLayer.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }

  // ===== Player / guard / loot / door =====

  private addPlayer(p: any, id: string) {
    const renderer = new PlayerRenderer(this, {
      role: p.role, facing: p.facing, status: p.status, hp: p.hp,
      vx: p.vx, vy: p.vy, name: p.name, abilityCdUntil: p.abilityCdUntil,
      isLocal: id === this.myId,
    });
    const ent: PlayerEntity = {
      renderer,
      prevX: p.x, prevY: p.y,
      serverX: p.x, serverY: p.y,
      lerpT: 1,
      lastFootstepAt: 0,
    };
    this.players.set(id, ent);
    p.onChange(() => {
      ent.prevX = ent.serverX;
      ent.prevY = ent.serverY;
      ent.serverX = p.x;
      ent.serverY = p.y;
      ent.lerpT = 0;
    });
  }

  private removePlayer(id: string) {
    const e = this.players.get(id);
    e?.renderer.destroy();
    this.players.delete(id);
  }

  private addGuard(g: any, id: string) {
    const renderer = new GuardRenderer(this);
    const ent: GuardEntity = {
      renderer,
      prevX: g.x, prevY: g.y,
      serverX: g.x, serverY: g.y,
      lerpT: 1,
      lastPhase: g.phase,
    };
    this.guards.set(id, ent);
    g.onChange(() => {
      ent.prevX = ent.serverX;
      ent.prevY = ent.serverY;
      ent.serverX = g.x;
      ent.serverY = g.y;
      // Phase change FX
      if (g.phase !== ent.lastPhase) {
        if (g.phase === "chase" && ent.lastPhase !== "chase") {
          this.particles.alarmSparks(g.x, g.y - 20);
        }
        ent.lastPhase = g.phase;
      }
      ent.lerpT = 0;
    });
  }

  private removeGuard(id: string) {
    const e = this.guards.get(id);
    e?.renderer.destroy();
    this.guards.delete(id);
  }

  private addLoot(l: any, id: string) {
    const c = this.add.container(l.x, l.y).setDepth(10);
    const g = this.add.graphics();
    const colors: Record<string, number> = {
      common: 0x94a3b8, rare: 0x60a5fa, elite: 0xa78bfa, objective: 0xfbbf24,
    };
    const color = colors[l.tier] ?? 0xcbd5e1;
    const r = l.tier === "objective" ? 9 : 6;
    // Outer ring
    g.lineStyle(2, color, 0.9);
    g.strokeCircle(0, 0, r + 4);
    g.fillStyle(color, 1);
    g.fillCircle(0, 0, r);
    g.lineStyle(2, 0x0a0d12, 1);
    g.strokeCircle(0, 0, r);
    c.add(g);
    // Pulse + spin glints around objectives
    this.tweens.add({ targets: c, scale: { from: 1.0, to: 1.2 }, yoyo: true, repeat: -1, duration: 800 });
    if (l.tier === "objective" || l.tier === "elite") {
      this.tweens.add({ targets: c, rotation: Math.PI * 2, duration: 6000, repeat: -1 });
    }
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
      const color = d.open ? PALETTE.doorOpen : (d.locked ? PALETTE.doorLocked : PALETTE.door);
      g.fillStyle(color, d.open ? 0.4 : 0.95);
      if (d.horizontal) {
        g.fillRect(d.x - TILE_SIZE / 2, d.y - 4, TILE_SIZE, 8);
        g.lineStyle(1, 0x0a0d12, 0.7);
        g.strokeRect(d.x - TILE_SIZE / 2, d.y - 4, TILE_SIZE, 8);
      } else {
        g.fillRect(d.x - 4, d.y - TILE_SIZE / 2, 8, TILE_SIZE);
        g.lineStyle(1, 0x0a0d12, 0.7);
        g.strokeRect(d.x - 4, d.y - TILE_SIZE / 2, 8, TILE_SIZE);
      }
      if (d.locked && !d.open) {
        g.fillStyle(0xfbbf24, 1);
        g.fillCircle(d.x, d.y, 2);
      }
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
    const follow = this.add.rectangle(me.serverX, me.serverY, 1, 1, 0xffffff, 0).setVisible(false);
    (this as any)._cameraTarget = follow;
    this.cameras.main.startFollow(follow, true, 0.18, 0.18);
    this.cameras.main.setZoom(1.0);
  }

  // ===== Update =====

  private updateEntities(deltaMs: number) {
    const dt = Math.min(deltaMs / 100, 1);
    const s = this.room.state as any;
    this.players.forEach((e, id) => {
      e.lerpT = Math.min(1, e.lerpT + dt);
      const x = e.prevX + (e.serverX - e.prevX) * e.lerpT;
      const y = e.prevY + (e.serverY - e.prevY) * e.lerpT;
      const pState = s.players.get(id);
      if (!pState) return;
      e.renderer.update(x, y, {
        role: pState.role,
        facing: pState.facing,
        status: pState.status,
        hp: pState.hp,
        vx: pState.vx,
        vy: pState.vy,
        name: pState.name,
        abilityCdUntil: pState.abilityCdUntil,
        isLocal: id === this.myId,
      }, deltaMs);
      if (id === this.myId) {
        const target: any = (this as any)._cameraTarget;
        if (target) { target.x = x; target.y = y; }
      }
    });
    this.guards.forEach((e, id) => {
      e.lerpT = Math.min(1, e.lerpT + dt);
      const x = e.prevX + (e.serverX - e.prevX) * e.lerpT;
      const y = e.prevY + (e.serverY - e.prevY) * e.lerpT;
      const g = s.guards.get(id);
      if (!g) return;
      e.renderer.update(x, y, {
        phase: g.phase,
        facing: g.facing,
        suspicion: g.suspicion,
      }, deltaMs);
    });
  }

  private updateLighting(deltaMs: number) {
    if (!this.lighting || this.mapW === 0) return;
    const s = this.room.state as any;
    const me = this.players.get(this.myId);
    if (!me) return;
    const lerpedX = me.prevX + (me.serverX - me.prevX) * me.lerpT;
    const lerpedY = me.prevY + (me.serverY - me.prevY) * me.lerpT;
    const myState = s.players.get(this.myId);
    const sprinting = myState ? Math.hypot(myState.vx, myState.vy) > 150 : false;
    const guards: { x: number; y: number; facing: number; phase: string }[] = [];
    this.guards.forEach((e, id) => {
      const g = s.guards.get(id);
      if (!g) return;
      const gx = e.prevX + (e.serverX - e.prevX) * e.lerpT;
      const gy = e.prevY + (e.serverY - e.prevY) * e.lerpT;
      guards.push({ x: gx, y: gy, facing: g.facing, phase: g.phase });
    });
    const alarmLevel01 = (s.alarmLevel ?? 0) / ALARM_LEVELS;
    this.lighting.update(lerpedX, lerpedY, sprinting, guards, alarmLevel01, deltaMs);
  }

  private spawnFootsteps() {
    const now = Date.now();
    const s = this.room.state as any;
    this.players.forEach((e, id) => {
      const p = s.players.get(id);
      if (!p || p.status !== "alive") return;
      const speed = Math.hypot(p.vx, p.vy);
      if (speed < 60) return;
      const interval = speed > 160 ? 220 : 360;
      if (now - e.lastFootstepAt < interval) return;
      const x = e.prevX + (e.serverX - e.prevX) * e.lerpT;
      const y = e.prevY + (e.serverY - e.prevY) * e.lerpT;
      this.particles.footstep(x, y + 8);
      e.lastFootstepAt = now;
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

  private drawInteractionProgress() {
    this.interactingArc.clear();
    const me = (this.room.state as any).players?.get?.(this.myId);
    if (!me) return;
    const now = Date.now();
    if (me.interactingUntil <= now) return;
    const total = 1500;
    const remaining = me.interactingUntil - now;
    const t = 1 - Math.min(1, remaining / total);
    const r = 22;
    const ent = this.players.get(this.myId);
    if (!ent) return;
    const x = ent.prevX + (ent.serverX - ent.prevX) * ent.lerpT;
    const y = ent.prevY + (ent.serverY - ent.prevY) * ent.lerpT;
    this.interactingArc.lineStyle(3, 0x6ee7b7, 0.9);
    this.interactingArc.beginPath();
    this.interactingArc.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t, false);
    this.interactingArc.strokePath();
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
      this.sfx.play("ping");
      this.particles.pingPop(ev.x, ev.y, color);
    } else if (ev.t === "spotted") {
      this.cameras.main.shake(120, 0.005);
      this.sfx.play("alert");
    } else if (ev.t === "alarm_raised") {
      this.cameras.main.flash(180, 220, 60, 60);
      this.sfx.play("alarm");
    } else if (ev.t === "loot_picked") {
      const ent = this.players.get(ev.playerId);
      if (ent) {
        const x = ent.serverX, y = ent.serverY;
        const txt = this.add.text(x, y - 30, "+" + ev.value, {
          fontFamily: "ui-sans-serif, system-ui", fontSize: "12px", color: "#fbbf24",
          stroke: "#0a0d12", strokeThickness: 3,
        }).setOrigin(0.5).setDepth(60);
        this.tweens.add({ targets: txt, y: txt.y - 30, alpha: 0, duration: 1000, onComplete: () => txt.destroy() });
        this.particles.lootPickup(x, y);
      }
      this.sfx.play("loot");
    } else if (ev.t === "ability_used") {
      this.sfx.play("ability");
      const ent = this.players.get(ev.playerId);
      if (ent) this.particles.empBurst(ent.serverX, ent.serverY);
    } else if (ev.t === "door_breached") {
      this.sfx.play("breach");
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
    this.scene.launch("End", { success: s.extractedCount > 0, score: s.score });
  }
}
