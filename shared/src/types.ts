import type { RoleId, LootTier } from "./constants";

export type Vec2 = { x: number; y: number };

export type TileKind =
  | "floor"
  | "wall"
  | "door"
  | "vent"
  | "extraction"
  | "spawn";

export type MatchPhase =
  | "lobby"
  | "starting"
  | "active"
  | "lockdown"
  | "ended";

export type GuardPhase =
  | "patrol"
  | "suspicious"
  | "investigate"
  | "chase"
  | "search"
  | "return";

export type PlayerStatus = "alive" | "downed" | "extracted" | "dead";

export type PingKind = "look" | "danger" | "loot" | "regroup" | "extract";

export interface ClientInputCmd {
  seq: number;
  dx: number; // -1..1
  dy: number;
  sprint: boolean;
  interact: boolean;
  ability: boolean;
  dt: number; // ms client estimated dt
}

export interface RoleDefinition {
  id: RoleId;
  name: string;
  description: string;
  speedMod: number;
  abilityCooldownMs: number;
  abilityName: string;
}

export interface LootDefinition {
  tier: LootTier;
  value: number;
  pickupTimeMs: number;
}
