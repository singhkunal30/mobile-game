// Message types sent over Colyseus room channel.
// Colyseus sync handles state. These are for discrete events.

import type { PingKind } from "./types";
import type { RoleId } from "./constants";

export const MSG = {
  INPUT: "i",
  PING: "p",
  ROLE_PICK: "r",
  READY: "rd",
  CHAT_QUICK: "c",
  EVENT: "e",
} as const;

export interface InputMsg {
  seq: number;
  dx: number;
  dy: number;
  sprint: boolean;
  interact: boolean;
  ability: boolean;
}

export interface PingMsg {
  kind: PingKind;
  x: number;
  y: number;
}

export interface RolePickMsg {
  role: RoleId;
}

export interface ReadyMsg {
  ready: boolean;
}

// Server -> client one-shot events (not in synced state)
export type ServerEvent =
  | { t: "spotted"; playerId: string; guardId: string }
  | { t: "loot_picked"; playerId: string; lootId: string; value: number }
  | { t: "alarm_raised"; level: number }
  | { t: "door_breached"; doorId: string; playerId: string }
  | { t: "extract_progress"; pct: number }
  | { t: "match_end"; success: boolean; score: number; reason: string }
  | { t: "ability_used"; playerId: string; ability: string }
  | { t: "ping"; from: string; kind: PingKind; x: number; y: number };
