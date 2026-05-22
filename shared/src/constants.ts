// Tile/world units
export const TILE_SIZE = 32;

// Map dimensions (tiles)
export const MAP_WIDTH = 60;
export const MAP_HEIGHT = 40;

// Server simulation rate
export const SERVER_TICK_HZ = 30;
export const SERVER_TICK_MS = 1000 / SERVER_TICK_HZ;

// Networking
export const STATE_PATCH_HZ = 20;
export const STATE_PATCH_MS = 1000 / STATE_PATCH_HZ;

// Match parameters
export const MATCH_DURATION_MS = 12 * 60 * 1000; // 12 minute heist
export const EXTRACT_HOLD_MS = 6_000;
export const ALARM_LOCKDOWN_MS = 90_000;

// Players
export const MIN_PLAYERS = 1; // allow solo testing
export const MAX_PLAYERS = 5;
export const PLAYER_RADIUS = 12;
export const PLAYER_SPEED_BASE = 130; // px/sec
export const PLAYER_MAX_HEALTH = 100;

// Guards
export const GUARD_RADIUS = 12;
export const GUARD_VIEW_RANGE = 220;
export const GUARD_VIEW_ANGLE_DEG = 75;
export const GUARD_HEARING_RANGE = 140;
export const GUARD_PATROL_SPEED = 60;
export const GUARD_CHASE_SPEED = 110;
export const GUARD_INVESTIGATE_SPEED = 80;

// Suspicion thresholds (0..100)
export const SUSPICION_DETECT = 100;
export const SUSPICION_ALERT_DECAY_DELAY_MS = 2_500;

// Alarm levels
export const ALARM_LEVELS = 5;

// Roles
export const ROLES = ["hacker", "scout", "breacher", "support"] as const;
export type RoleId = typeof ROLES[number];

// Loot tiers
export const LOOT_TIERS = ["common", "rare", "elite", "objective"] as const;
export type LootTier = typeof LOOT_TIERS[number];

// Net protocol version (bump on breaking schema changes)
export const PROTOCOL_VERSION = 1;
