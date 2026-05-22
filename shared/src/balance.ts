import type { RoleDefinition, LootDefinition } from "./types";
import type { LootTier } from "./constants";

export const ROLE_DEFS: Record<string, RoleDefinition> = {
  hacker: {
    id: "hacker",
    name: "Hacker",
    description: "Disables nearby cameras and dampens alarm escalation.",
    speedMod: 0.95,
    abilityCooldownMs: 25_000,
    abilityName: "EMP Pulse",
  },
  scout: {
    id: "scout",
    name: "Scout",
    description: "Faster, can mark guards through walls briefly.",
    speedMod: 1.15,
    abilityCooldownMs: 18_000,
    abilityName: "Recon Drone",
  },
  breacher: {
    id: "breacher",
    name: "Breacher",
    description: "Forces doors instantly; tougher.",
    speedMod: 0.9,
    abilityCooldownMs: 20_000,
    abilityName: "Door Breach",
  },
  support: {
    id: "support",
    name: "Support",
    description: "Revives downed teammates faster; carries med-kit.",
    speedMod: 1.0,
    abilityCooldownMs: 30_000,
    abilityName: "Adrenaline",
  },
};

export const LOOT_DEFS: Record<LootTier, LootDefinition> = {
  common: { tier: "common", value: 100, pickupTimeMs: 400 },
  rare: { tier: "rare", value: 350, pickupTimeMs: 900 },
  elite: { tier: "elite", value: 900, pickupTimeMs: 1600 },
  objective: { tier: "objective", value: 2000, pickupTimeMs: 2400 },
};

// AI Director difficulty scaling
export const DIRECTOR_BANDS = [
  { score: 0, alarmGain: 1.0, spawnInterval: 60_000, maxGuards: 6 },
  { score: 1000, alarmGain: 1.2, spawnInterval: 45_000, maxGuards: 8 },
  { score: 3000, alarmGain: 1.5, spawnInterval: 30_000, maxGuards: 10 },
  { score: 6000, alarmGain: 2.0, spawnInterval: 20_000, maxGuards: 12 },
];

// Mission modifiers — picked at match start for replayability
export const MISSION_MODIFIERS = [
  { id: "blackout", name: "Blackout", desc: "Reduced player vision, slower guards." },
  { id: "lockdown", name: "Hair Trigger", desc: "Alarm escalates faster." },
  { id: "vault", name: "Vault Run", desc: "Single high-value objective." },
  { id: "swarm", name: "Swarm", desc: "More guards, less HP each." },
  { id: "ghost", name: "Ghost Protocol", desc: "Loot 2x value, detection ends run." },
] as const;
