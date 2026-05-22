import {
  GUARD_VIEW_RANGE, GUARD_VIEW_ANGLE_DEG, GUARD_HEARING_RANGE,
  GUARD_PATROL_SPEED, GUARD_CHASE_SPEED, GUARD_INVESTIGATE_SPEED,
  SUSPICION_DETECT, SUSPICION_ALERT_DECAY_DELAY_MS,
  TILE_SIZE,
} from "@blackout/shared";
import { GuardState, PlayerState, HeistState } from "../schema/GameState";
import { findPath } from "./Pathfinding";
import { moveCircle, hasLineOfSight, dist, angleBetween, angleDelta, dist2 } from "./Physics";

interface GuardMemory {
  path: { x: number; y: number }[];
  pathIdx: number;
  patrolRoute: { x: number; y: number }[];
  patrolIdx: number;
  lastAlertTs: number;
  searchUntil: number;
  recomputePathAt: number;
}

export class AIController {
  private memory = new Map<string, GuardMemory>();

  ensureMemory(id: string, patrolRoute: { x: number; y: number }[]): GuardMemory {
    let m = this.memory.get(id);
    if (!m) {
      m = {
        path: [],
        pathIdx: 0,
        patrolRoute,
        patrolIdx: 0,
        lastAlertTs: 0,
        searchUntil: 0,
        recomputePathAt: 0,
      };
      this.memory.set(id, m);
    }
    return m;
  }

  forget(id: string) { this.memory.delete(id); }

  tick(state: HeistState, dt: number, now: number, doorOpen: (x: number, y: number) => boolean, onEvent: (e: string, payload: any) => void) {
    const map = { tiles: state.map.tiles.map(t => t.row), w: state.map.width, h: state.map.height };
    const players = Array.from(state.players.values());
    const doorAdapter = { isOpen: doorOpen };

    state.guards.forEach((g, gid) => {
      const mem = this.memory.get(gid);
      if (!mem) return;

      // Sensing
      const seen = this.scanVision(g, players, map, doorAdapter);
      const heard = this.scanHearing(g, players);

      if (seen) {
        g.targetPlayerId = seen.id;
        g.lastSeenX = seen.x;
        g.lastSeenY = seen.y;
        g.suspicion = SUSPICION_DETECT;
        mem.lastAlertTs = now;
        if (g.phase !== "chase") {
          g.phase = "chase";
          onEvent("spotted", { playerId: seen.id, guardId: g.id });
        }
      } else if (heard && g.phase === "patrol") {
        g.suspicion = Math.min(SUSPICION_DETECT, g.suspicion + 30 * dt);
        g.lastSeenX = heard.x;
        g.lastSeenY = heard.y;
        if (g.suspicion >= 60) {
          g.phase = "investigate";
          mem.recomputePathAt = 0;
        }
      } else {
        // Decay suspicion outside alert delay
        if (now - mem.lastAlertTs > SUSPICION_ALERT_DECAY_DELAY_MS) {
          g.suspicion = Math.max(0, g.suspicion - 12 * dt);
        }
      }

      // FSM
      switch (g.phase) {
        case "patrol": this.tickPatrol(g, mem, map, doorAdapter, dt, now); break;
        case "investigate": this.tickInvestigate(g, mem, map, doorAdapter, dt, now); break;
        case "chase": this.tickChase(g, mem, map, doorAdapter, dt, now, onEvent, state); break;
        case "search": this.tickSearch(g, mem, map, doorAdapter, dt, now); break;
        case "return": this.tickReturn(g, mem, map, doorAdapter, dt, now); break;
        case "suspicious": this.tickInvestigate(g, mem, map, doorAdapter, dt, now); break;
      }
    });
  }

  private scanVision(g: GuardState, players: PlayerState[], map: any, doors: any): PlayerState | null {
    let best: PlayerState | null = null;
    let bestD = Infinity;
    for (const p of players) {
      if (p.status !== "alive") continue;
      if (!p.connected) continue;
      const d = dist(g.x, g.y, p.x, p.y);
      if (d > GUARD_VIEW_RANGE) continue;
      const a = angleBetween(g.x, g.y, p.x, p.y);
      const da = Math.abs(angleDelta(g.facing, a));
      const halfFov = (GUARD_VIEW_ANGLE_DEG * Math.PI) / 180 / 2;
      if (da > halfFov && d > 28) continue; // close-range omnidirectional bubble
      if (!hasLineOfSight(g.x, g.y, p.x, p.y, map, doors)) continue;
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  private scanHearing(g: GuardState, players: PlayerState[]): { x: number; y: number } | null {
    for (const p of players) {
      if (p.status !== "alive") continue;
      const sp = Math.hypot(p.vx, p.vy);
      if (sp < 80) continue; // walking = silent-ish
      const d = dist(g.x, g.y, p.x, p.y);
      const range = GUARD_HEARING_RANGE * (sp > 150 ? 1.3 : 1.0);
      if (d < range) return { x: p.x, y: p.y };
    }
    return null;
  }

  private moveAlongPath(g: GuardState, mem: GuardMemory, speed: number, map: any, doors: any, dt: number): boolean {
    if (mem.pathIdx >= mem.path.length) return true;
    const wp = mem.path[mem.pathIdx];
    const d = dist(g.x, g.y, wp.x, wp.y);
    if (d < 6) { mem.pathIdx++; return mem.pathIdx >= mem.path.length; }
    const a = angleBetween(g.x, g.y, wp.x, wp.y);
    g.facing = a; // turn toward waypoint
    const vx = Math.cos(a) * speed;
    const vy = Math.sin(a) * speed;
    const m = moveCircle(g.x, g.y, 11, vx, vy, map, doors, dt);
    g.x = m.x; g.y = m.y;
    if (m.hitX || m.hitY) {
      // stuck — replan next tick
      mem.path = [];
    }
    return false;
  }

  private tickPatrol(g: GuardState, mem: GuardMemory, map: any, doors: any, dt: number, now: number) {
    if (!mem.patrolRoute.length) return;
    if (!mem.path.length || mem.pathIdx >= mem.path.length) {
      const wp = mem.patrolRoute[g.patrolIndex % mem.patrolRoute.length];
      mem.path = findPath(map, g.x, g.y, wp.x, wp.y, doors.isOpen);
      mem.pathIdx = 0;
      if (!mem.path.length) {
        g.patrolIndex = (g.patrolIndex + 1) % mem.patrolRoute.length;
        return;
      }
    }
    const arrived = this.moveAlongPath(g, mem, GUARD_PATROL_SPEED, map, doors, dt);
    if (arrived) {
      g.patrolIndex = (g.patrolIndex + 1) % mem.patrolRoute.length;
      mem.path = [];
    }
  }

  private tickInvestigate(g: GuardState, mem: GuardMemory, map: any, doors: any, dt: number, now: number) {
    if (now >= mem.recomputePathAt || !mem.path.length || mem.pathIdx >= mem.path.length) {
      mem.path = findPath(map, g.x, g.y, g.lastSeenX, g.lastSeenY, doors.isOpen);
      mem.pathIdx = 0;
      mem.recomputePathAt = now + 1500;
    }
    const arrived = this.moveAlongPath(g, mem, GUARD_INVESTIGATE_SPEED, map, doors, dt);
    if (arrived) {
      g.phase = "search";
      mem.searchUntil = now + 6000;
    }
  }

  private tickChase(g: GuardState, mem: GuardMemory, map: any, doors: any, dt: number, now: number, onEvent: (e: string, payload: any) => void, state: HeistState) {
    const target = state.players.get(g.targetPlayerId);
    if (!target || target.status !== "alive") {
      g.phase = "investigate";
      mem.recomputePathAt = 0;
      return;
    }
    // Damage on contact
    const d = dist(g.x, g.y, target.x, target.y);
    if (d < 26) {
      target.hp -= 40 * dt;
      if (target.hp <= 0) {
        target.hp = 0;
        target.status = "downed";
        target.downedAt = now;
        onEvent("downed", { playerId: target.id });
      }
    }
    // Recompute path frequently
    if (now >= mem.recomputePathAt || !mem.path.length || mem.pathIdx >= mem.path.length) {
      mem.path = findPath(map, g.x, g.y, target.x, target.y, doors.isOpen, 600);
      mem.pathIdx = 0;
      mem.recomputePathAt = now + 500;
    }
    g.lastSeenX = target.x;
    g.lastSeenY = target.y;
    this.moveAlongPath(g, mem, GUARD_CHASE_SPEED, map, doors, dt);

    // Lost sight check
    if (!hasLineOfSight(g.x, g.y, target.x, target.y, map, doors) && d > GUARD_VIEW_RANGE * 0.9) {
      g.phase = "investigate";
      mem.recomputePathAt = 0;
    }
  }

  private tickSearch(g: GuardState, mem: GuardMemory, map: any, doors: any, dt: number, now: number) {
    // Sweep facing in place; then return to patrol
    g.facing += (Math.PI / 2) * dt;
    if (now > mem.searchUntil) {
      g.phase = "return";
      mem.path = [];
    }
  }

  private tickReturn(g: GuardState, mem: GuardMemory, map: any, doors: any, dt: number, now: number) {
    if (!mem.patrolRoute.length) {
      g.phase = "patrol";
      return;
    }
    if (!mem.path.length || mem.pathIdx >= mem.path.length) {
      const wp = mem.patrolRoute[g.patrolIndex % mem.patrolRoute.length];
      mem.path = findPath(map, g.x, g.y, wp.x, wp.y, doors.isOpen);
      mem.pathIdx = 0;
    }
    const arrived = this.moveAlongPath(g, mem, GUARD_PATROL_SPEED, map, doors, dt);
    if (arrived) g.phase = "patrol";
  }
}
