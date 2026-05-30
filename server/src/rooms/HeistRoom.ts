import { Room, Client } from "colyseus";
import {
  PROTOCOL_VERSION, MAX_PLAYERS, MIN_PLAYERS,
  SERVER_TICK_MS, MATCH_DURATION_MS, EXTRACT_HOLD_MS,
  PLAYER_RADIUS, PLAYER_SPEED_BASE, PLAYER_MAX_HEALTH,
  ROLES, ROLE_DEFS, LOOT_DEFS, MISSION_MODIFIERS,
  ALARM_LEVELS, ALARM_LOCKDOWN_MS, TILE_SIZE,
  MSG,
} from "@blackout/shared";
import type { InputMsg, PingMsg, RolePickMsg, ReadyMsg } from "@blackout/shared";

import {
  HeistState, PlayerState, GuardState, LootState, DoorState,
  MapState, MapTileRow,
} from "../schema/GameState";
import { generateMap, GeneratedMap } from "../sim/MapGenerator";
import { moveCircle, dist, angleBetween, dist2 } from "../sim/Physics";
import { AIController } from "../sim/AIController";
import { AIDirector } from "../sim/AIDirector";
import { log } from "../util/Logger";

interface PendingInput {
  seq: number;
  dx: number;
  dy: number;
  sprint: boolean;
  interact: boolean;
  ability: boolean;
}

interface PlayerRuntime {
  inputs: PendingInput[];
  lastInteract: boolean;
  patrolRoutes: { x: number; y: number }[][];
}

// Tunable timings for gameplay polish (kept here, not constants.ts, because
// they're server-internal and don't need to travel to clients).
const DOOR_TOGGLE_COOLDOWN_MS = 600;
const ALL_DOWNED_GRACE_MS = 15_000;

export class HeistRoom extends Room<HeistState> {
  maxClients = MAX_PLAYERS;

  private mapDef!: GeneratedMap;
  private ai = new AIController();
  private director = new AIDirector();
  private playerRT = new Map<string, PlayerRuntime>();
  private doorToggleAt = new Map<string, number>();
  private startCountdownAt: number = 0;
  private allDownedSince: number = 0;
  private accum: number = 0;
  private fixedDt: number = SERVER_TICK_MS / 1000;
  private nextGuardId = 0;
  private nextLootId = 0;

  onCreate(options: any) {
    this.setState(new HeistState());
    this.setMetadata({ protocol: PROTOCOL_VERSION, mode: options?.mode || "default" });
    this.clock.start();
    this.setPatchRate(50); // 20 Hz state patches

    // Choose modifier
    this.state.modifier = MISSION_MODIFIERS[Math.floor(Math.random() * MISSION_MODIFIERS.length)].id;

    this.generateAndApplyMap();

    // Message handlers
    this.onMessage(MSG.INPUT, (client, msg: InputMsg) => {
      const rt = this.playerRT.get(client.sessionId);
      if (!rt) return;
      // Buffer up to a few frames of input
      rt.inputs.push({
        seq: msg.seq | 0,
        dx: clamp(msg.dx ?? 0, -1, 1),
        dy: clamp(msg.dy ?? 0, -1, 1),
        sprint: !!msg.sprint,
        interact: !!msg.interact,
        ability: !!msg.ability,
      });
      if (rt.inputs.length > 6) rt.inputs.splice(0, rt.inputs.length - 6);
    });

    this.onMessage(MSG.READY, (client, msg: ReadyMsg) => {
      const p = this.state.players.get(client.sessionId);
      if (p) p.ready = !!msg.ready;
      this.tryStart();
    });

    this.onMessage(MSG.ROLE_PICK, (client, msg: RolePickMsg) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      if (this.state.phase !== "lobby") return;
      if (ROLES.indexOf(msg.role as any) === -1) return;
      p.role = msg.role;
    });

    this.onMessage(MSG.PING, (client, msg: PingMsg) => {
      this.broadcast(MSG.EVENT, { t: "ping", from: client.sessionId, kind: msg.kind, x: msg.x, y: msg.y });
    });

    // Simulation loop — fixed-step
    this.setSimulationInterval((delta) => this.update(delta), SERVER_TICK_MS);
  }

  onAuth(client: Client, options: any): boolean {
    if (this.state.phase === "active" || this.state.phase === "lockdown") {
      // Allow reconnection by sessionId only — for now reject mid-game joins
      return false;
    }
    return true;
  }

  onJoin(client: Client, options: any) {
    const p = new PlayerState();
    p.id = client.sessionId;
    p.name = (options?.name || "Agent").toString().slice(0, 16);
    p.role = ROLES[this.state.players.size % ROLES.length];
    p.hp = PLAYER_MAX_HEALTH;
    const spawn = this.mapDef.spawns[this.state.players.size % this.mapDef.spawns.length];
    p.x = spawn.x;
    p.y = spawn.y;
    this.state.players.set(client.sessionId, p);

    this.playerRT.set(client.sessionId, {
      inputs: [],
      lastInteract: false,
      patrolRoutes: this.mapDef.patrolRoutes,
    });

    client.send("welcome", {
      protocol: PROTOCOL_VERSION,
      sessionId: client.sessionId,
      tileSize: TILE_SIZE,
      modifier: this.state.modifier,
    });
  }

  async onLeave(client: Client, consented: boolean) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    p.connected = false;
    if (consented) {
      this.state.players.delete(client.sessionId);
      this.playerRT.delete(client.sessionId);
      return;
    }
    // 20s reconnection window
    try {
      await this.allowReconnection(client, 20);
      p.connected = true;
    } catch {
      this.state.players.delete(client.sessionId);
      this.playerRT.delete(client.sessionId);
    }
  }

  // ===== Match flow =====

  private tryStart() {
    if (this.state.phase !== "lobby") return;
    const players = Array.from(this.state.players.values());
    if (players.length < MIN_PLAYERS) return;
    if (!players.every(p => p.ready)) return;
    this.startCountdownAt = Date.now() + 3000;
    this.state.phase = "starting";
  }

  private beginMatch() {
    this.state.phase = "active";
    this.state.tStart = Date.now();
    this.state.tEnd = this.state.tStart + MATCH_DURATION_MS;
    this.state.alarmLevel = 0;
    this.state.alarmHeat = 0;
    this.state.score = 0;
    this.spawnInitialGuards();
    log.info("match_start", {
      roomId: this.roomId,
      players: this.state.players.size,
      modifier: this.state.modifier,
      seed: this.state.map.seed,
    });
  }

  private endMatch(success: boolean, reason: string) {
    if (this.state.phase === "ended") return;
    this.state.phase = "ended";
    this.broadcast(MSG.EVENT, {
      t: "match_end",
      success,
      score: this.state.score,
      reason,
    });
    log.info("match_end", {
      roomId: this.roomId,
      success,
      reason,
      score: this.state.score,
      extracted: this.state.extractedCount,
      players: this.state.players.size,
      durationMs: Date.now() - this.state.tStart,
      modifier: this.state.modifier,
      alarmLevel: this.state.alarmLevel,
    });
    // Auto-close room after a brief delay
    this.clock.setTimeout(() => this.disconnect(), 6000);
  }

  // ===== Update loop =====

  private update(delta: number) {
    const now = Date.now();
    this.state.tNow = now;

    if (this.state.phase === "lobby") {
      return;
    }
    if (this.state.phase === "starting") {
      if (now >= this.startCountdownAt) this.beginMatch();
      return;
    }
    if (this.state.phase === "ended") return;

    // Step simulation in fixed dt to keep AI deterministic
    this.accum += delta / 1000;
    let safety = 6;
    while (this.accum >= this.fixedDt && safety-- > 0) {
      this.step(this.fixedDt, now);
      this.accum -= this.fixedDt;
    }
  }

  private step(dt: number, now: number) {
    this.processPlayerInputs(dt, now);
    this.tickInteractions(dt, now);
    this.tickAI(dt, now);
    this.tickAlarm(dt, now);
    this.tickExtraction(dt, now);
    this.checkMatchEnd(now);
  }

  // ===== Player input → movement =====

  private processPlayerInputs(dt: number, now: number) {
    const tileMap = this.tileMapAdapter();
    const doors = this.doorAdapter();
    this.state.players.forEach((p, id) => {
      const rt = this.playerRT.get(id);
      if (!rt) return;
      if (!p.connected) return;
      if (p.status !== "alive") return;

      // Use latest queued input (server-authoritative position)
      const cmd = rt.inputs.shift();
      if (!cmd) {
        p.vx = 0; p.vy = 0;
        return;
      }
      p.lastInputSeq = cmd.seq;
      const def = ROLE_DEFS[p.role] || ROLE_DEFS.scout;
      const speed = PLAYER_SPEED_BASE * def.speedMod * (cmd.sprint ? 1.35 : 1.0);
      let dx = cmd.dx;
      let dy = cmd.dy;
      const mag = Math.hypot(dx, dy);
      if (mag > 1) { dx /= mag; dy /= mag; }
      // If interacting, no movement
      if (p.interactingUntil > now) {
        dx = 0; dy = 0;
      }
      const vx = dx * speed;
      const vy = dy * speed;
      const m = moveCircle(p.x, p.y, PLAYER_RADIUS, vx, vy, tileMap, doors, dt);
      p.x = m.x; p.y = m.y;
      p.vx = vx; p.vy = vy;
      if (mag > 0.05) p.facing = Math.atan2(dy, dx);

      // Interact intent (edge-triggered)
      if (cmd.interact && !rt.lastInteract) this.tryInteract(p, now);
      rt.lastInteract = cmd.interact;

      // Ability
      if (cmd.ability && now >= p.abilityCdUntil) this.useAbility(p, now);
    });
  }

  private tryInteract(p: PlayerState, now: number) {
    // Already interacting? Cancel.
    if (p.interactingUntil > now) {
      p.interactingUntil = 0;
      p.interactingWith = "";
      return;
    }
    // 1) Loot near?
    let bestLoot: LootState | null = null;
    let bestD = Infinity;
    this.state.loot.forEach((l) => {
      if (l.taken) return;
      const d = dist2(p.x, p.y, l.x, l.y);
      if (d < 32 * 32 && d < bestD) { bestD = d; bestLoot = l; }
    });
    if (bestLoot) {
      const def = LOOT_DEFS[(bestLoot as LootState).tier as keyof typeof LOOT_DEFS] || LOOT_DEFS.common;
      p.interactingUntil = now + def.pickupTimeMs;
      p.interactingWith = (bestLoot as LootState).id;
      return;
    }
    // 2) Door near?
    let bestDoor: DoorState | null = null;
    bestD = Infinity;
    this.state.doors.forEach((d) => {
      const dd = dist2(p.x, p.y, d.x, d.y);
      if (dd < 36 * 36 && dd < bestD) { bestD = dd; bestDoor = d; }
    });
    if (bestDoor) {
      const door = bestDoor as DoorState;
      const lastToggle = this.doorToggleAt.get(door.id) ?? 0;
      if (now - lastToggle < DOOR_TOGGLE_COOLDOWN_MS) return; // anti-spam
      if (door.locked && p.role !== "breacher") return; // can't open locked door without breacher
      door.open = !door.open;
      this.doorToggleAt.set(door.id, now);
      if (door.locked && p.role === "breacher") {
        door.locked = false;
        door.breached = true;
        door.open = true;
        this.broadcast(MSG.EVENT, { t: "door_breached", doorId: door.id, playerId: p.id });
      }
    }
  }

  private tickInteractions(dt: number, now: number) {
    this.state.players.forEach((p) => {
      // A downed player can't complete a pickup that was in flight when they went down.
      if (p.status !== "alive" && p.interactingUntil > 0) {
        p.interactingUntil = 0;
        p.interactingWith = "";
        return;
      }
      if (p.interactingUntil > 0 && now >= p.interactingUntil && p.interactingWith) {
        const l = this.state.loot.get(p.interactingWith);
        if (l && !l.taken) {
          l.taken = true;
          const def = LOOT_DEFS[l.tier as keyof typeof LOOT_DEFS] || LOOT_DEFS.common;
          const mult = this.state.modifier === "ghost" ? 2 : 1;
          // Score is now banked on EXTRACT, not on pickup — the heist gameplay loop
          // depends on the player actually getting out alive with what they took.
          p.carriedLoot += def.value * mult;
          this.broadcast(MSG.EVENT, { t: "loot_picked", playerId: p.id, lootId: l.id, value: def.value * mult });
          this.state.alarmHeat = Math.min(100, this.state.alarmHeat + 5);
        }
        p.interactingUntil = 0;
        p.interactingWith = "";
      }
    });
  }

  private useAbility(p: PlayerState, now: number) {
    const def = ROLE_DEFS[p.role] || ROLE_DEFS.scout;
    p.abilityCdUntil = now + def.abilityCooldownMs;
    this.broadcast(MSG.EVENT, { t: "ability_used", playerId: p.id, ability: def.abilityName });
    switch (p.role) {
      case "hacker":
        // EMP pulse: stun nearby guards (set to investigate at their pos)
        this.state.guards.forEach(g => {
          if (dist2(g.x, g.y, p.x, p.y) < 220 * 220) {
            g.phase = "investigate";
            g.lastSeenX = g.x; g.lastSeenY = g.y;
            g.suspicion = 0;
            g.targetPlayerId = "";
          }
        });
        // Reduce heat
        this.state.alarmHeat = Math.max(0, this.state.alarmHeat - 35);
        break;
      case "scout":
        // Recon: temporary all-guard reveal (purely visual on client via state phase). No server effect.
        break;
      case "breacher":
        // Force-open nearest door
        let best: DoorState | null = null;
        let bestD = Infinity;
        this.state.doors.forEach((d) => {
          const dd = dist2(d.x, d.y, p.x, p.y);
          if (dd < bestD) { bestD = dd; best = d; }
        });
        if (best && bestD < 80 * 80) {
          (best as DoorState).open = true;
          (best as DoorState).breached = true;
          (best as DoorState).locked = false;
        }
        break;
      case "support":
        // Adrenaline: small AOE heal & revive nearby downed
        this.state.players.forEach((q) => {
          const dd = dist2(q.x, q.y, p.x, p.y);
          if (dd < 80 * 80) {
            if (q.status === "downed") { q.status = "alive"; q.hp = 35; q.downedAt = 0; }
            else if (q.status === "alive") q.hp = Math.min(PLAYER_MAX_HEALTH, q.hp + 30);
          }
        });
        break;
    }
  }

  // ===== AI =====

  private tickAI(dt: number, now: number) {
    const doorOpen = (tx: number, ty: number) => {
      let open = true;
      this.state.doors.forEach(d => {
        const dtx = Math.floor(d.x / TILE_SIZE);
        const dty = Math.floor(d.y / TILE_SIZE);
        if (dtx === tx && dty === ty) open = d.open || d.breached;
      });
      return open;
    };
    this.ai.tick(this.state, dt, now, doorOpen, (e, payload) => {
      if (e === "downed") {
        this.broadcast(MSG.EVENT, { t: "spotted", playerId: payload.playerId, guardId: "x" });
      } else if (e === "spotted") {
        this.broadcast(MSG.EVENT, payload);
        this.state.alarmHeat = Math.min(100, this.state.alarmHeat + 20);
      }
    });

    // Director: maybe spawn new guard from random patrol route
    this.director.tickHeat(this.state, dt, now);
    if (this.director.shouldSpawnGuard(this.state, now)) {
      this.spawnGuard();
    }
  }

  // ===== Alarm/Extraction/End =====

  private tickAlarm(dt: number, now: number) {
    if (this.state.alarmLevel >= ALARM_LEVELS && this.state.phase !== "lockdown") {
      this.state.phase = "lockdown";
      this.state.lockdownAt = now;
      this.broadcast(MSG.EVENT, { t: "alarm_raised", level: ALARM_LEVELS });
    }
    if (this.state.phase === "lockdown" && now > this.state.lockdownAt + ALARM_LOCKDOWN_MS) {
      this.endMatch(false, "Lockdown — extraction sealed");
    }
  }

  private tickExtraction(dt: number, now: number) {
    const ex = this.state.map.extractX;
    const ey = this.state.map.extractY;
    const ew = this.state.map.extractW * TILE_SIZE;
    const eh = this.state.map.extractH * TILE_SIZE;
    let aliveOrDowned = 0;
    let aliveCount = 0;
    let inZone = 0;
    this.state.players.forEach((p) => {
      if (p.status === "extracted") return;
      if (p.status === "alive") { aliveOrDowned++; aliveCount++; }
      else if (p.status === "downed") aliveOrDowned++;
      const inside = p.x >= ex && p.x <= ex + ew && p.y >= ey && p.y <= ey + eh;
      if (inside && p.status === "alive") inZone++;
    });

    // Hard wipe: nobody alive or downed left in the field.
    if (aliveOrDowned === 0 && this.state.phase !== "ended") {
      this.endMatch(false, "Team wiped");
      return;
    }

    // Soft wipe: everyone downed for ALL_DOWNED_GRACE_MS without revive.
    if (aliveCount === 0 && aliveOrDowned > 0) {
      if (this.allDownedSince === 0) this.allDownedSince = now;
      else if (now - this.allDownedSince > ALL_DOWNED_GRACE_MS && this.state.phase !== "ended") {
        this.endMatch(false, "Team incapacitated");
        return;
      }
    } else {
      this.allDownedSince = 0;
    }

    // Extraction requires at least one player in the zone, and progress fills to 1.
    if (inZone > 0 && this.state.phase === "active") {
      this.state.extractProgress = Math.min(1, this.state.extractProgress + dt * (1000 / EXTRACT_HOLD_MS));
      if (this.state.extractProgress >= 1) {
        // Bank carried loot + extraction bonus per player who makes it out.
        this.state.players.forEach((p) => {
          const inside = p.x >= ex && p.x <= ex + ew && p.y >= ey && p.y <= ey + eh;
          if (inside && p.status === "alive") {
            p.status = "extracted";
            this.state.extractedCount++;
            this.state.score += p.carriedLoot + 500;
            p.carriedLoot = 0;
          }
        });
        // Reset progress for any teammates still inbound.
        this.state.extractProgress = 0;
        let anyRemaining = false;
        this.state.players.forEach(p => { if (p.status === "alive" || p.status === "downed") anyRemaining = true; });
        if (!anyRemaining) this.endMatch(true, "Team extracted");
      }
    } else {
      this.state.extractProgress = Math.max(0, this.state.extractProgress - dt * 0.4);
    }
  }

  private checkMatchEnd(now: number) {
    if (this.state.phase === "active" && now > this.state.tEnd) {
      this.endMatch(false, "Time expired");
    }
  }

  // ===== Helpers =====

  private generateAndApplyMap() {
    const m = generateMap();
    this.mapDef = m;
    const ms = new MapState();
    ms.width = m.w; ms.height = m.h;
    ms.extractX = m.extract.x;
    ms.extractY = m.extract.y;
    ms.extractW = Math.floor(m.extract.w / TILE_SIZE);
    ms.extractH = Math.floor(m.extract.h / TILE_SIZE);
    ms.seed = m.seed;
    for (const row of m.tiles) {
      const r = new MapTileRow(); r.row = row; ms.tiles.push(r);
    }
    this.state.map = ms;

    // Doors
    for (const d of m.doors) {
      const id = "door_" + d.x + "_" + d.y;
      const ds = new DoorState();
      ds.id = id;
      ds.x = d.x * TILE_SIZE + TILE_SIZE / 2;
      ds.y = d.y * TILE_SIZE + TILE_SIZE / 2;
      ds.horizontal = d.horizontal;
      ds.open = false;
      ds.locked = Math.random() < 0.18;
      this.state.doors.set(id, ds);
    }

    // Loot
    for (const l of m.lootSpots) {
      const id = "loot_" + this.nextLootId++;
      const ls = new LootState();
      ls.id = id; ls.tier = l.tier; ls.x = l.x; ls.y = l.y;
      ls.value = LOOT_DEFS[l.tier as keyof typeof LOOT_DEFS].value;
      this.state.loot.set(id, ls);
    }
  }

  private spawnInitialGuards() {
    const params = this.director.getParams(this.state);
    const initialCount = Math.max(3, Math.min(this.mapDef.patrolRoutes.length, params.maxGuards >> 1));
    for (let i = 0; i < initialCount; i++) {
      this.spawnGuard(i);
    }
  }

  private spawnGuard(routeIdx?: number) {
    const routes = this.mapDef.patrolRoutes;
    if (!routes.length) return;
    const idx = routeIdx ?? Math.floor(Math.random() * routes.length);
    const route = routes[idx % routes.length];
    const wp = route[0];
    const g = new GuardState();
    g.id = "guard_" + this.nextGuardId++;
    g.x = wp.x;
    g.y = wp.y;
    g.facing = Math.random() * Math.PI * 2;
    g.phase = "patrol";
    this.state.guards.set(g.id, g);
    this.ai.ensureMemory(g.id, route);
  }

  private tileMapAdapter() {
    return {
      tiles: this.state.map.tiles.map(t => t.row),
      w: this.state.map.width,
      h: this.state.map.height,
    };
  }

  private doorAdapter() {
    const m = this.state.doors;
    return {
      isOpen: (tx: number, ty: number) => {
        let open = true;
        m.forEach(d => {
          const dtx = Math.floor(d.x / TILE_SIZE);
          const dty = Math.floor(d.y / TILE_SIZE);
          if (dtx === tx && dty === ty) open = d.open || d.breached;
        });
        return open;
      },
    };
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
