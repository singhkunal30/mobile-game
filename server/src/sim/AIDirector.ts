import { ALARM_LEVELS, GUARD_VIEW_RANGE } from "@blackout/shared";
import { DIRECTOR_BANDS } from "@blackout/shared";
import { HeistState, GuardState } from "../schema/GameState";

export interface DirectorParams {
  alarmGain: number;
  spawnInterval: number;
  maxGuards: number;
}

export class AIDirector {
  private nextSpawnAt: number = 0;
  private lastAlarmHeatTick: number = 0;

  getParams(state: HeistState): DirectorParams {
    let band = DIRECTOR_BANDS[0];
    for (const b of DIRECTOR_BANDS) {
      if (state.score >= b.score) band = b;
    }
    // Modifier influences
    if (state.modifier === "swarm") {
      return { ...band, maxGuards: band.maxGuards + 4, spawnInterval: Math.max(8000, band.spawnInterval * 0.6) };
    }
    if (state.modifier === "lockdown") {
      return { ...band, alarmGain: band.alarmGain * 1.5 };
    }
    return band;
  }

  tickHeat(state: HeistState, dt: number, now: number) {
    // Heat slowly rises if any guard is alert / chasing
    let pressure = 0;
    state.guards.forEach(g => {
      if (g.phase === "chase") pressure += 18;
      else if (g.phase === "investigate" || g.phase === "search") pressure += 6;
      else if (g.suspicion > 30) pressure += 2;
    });

    const params = this.getParams(state);
    state.alarmHeat = Math.min(100, state.alarmHeat + pressure * dt * 0.1 * params.alarmGain);
    if (state.alarmHeat >= 100 && state.alarmLevel < ALARM_LEVELS) {
      state.alarmLevel++;
      state.alarmHeat = 0;
    }
    // Decay heat when calm
    if (pressure === 0) {
      state.alarmHeat = Math.max(0, state.alarmHeat - 5 * dt);
    }
  }

  shouldSpawnGuard(state: HeistState, now: number): boolean {
    if (state.guards.size >= this.getParams(state).maxGuards) return false;
    if (state.alarmLevel === 0) return false;
    if (now < this.nextSpawnAt) return false;
    const interval = this.getParams(state).spawnInterval / Math.max(1, state.alarmLevel);
    this.nextSpawnAt = now + interval;
    return true;
  }
}
