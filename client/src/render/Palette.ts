// Centralized art palette. Tweak here to re-skin the whole game.

export const PALETTE = {
  // Floors / walls
  floor: 0x1a2230,
  floorAlt: 0x131923,
  wall: 0x0a0d12,
  wallTop: 0x2a3a4c,
  wallShadow: 0x050709,

  // Doors
  door: 0xb45309,
  doorOpen: 0x854d09,
  doorLocked: 0x991b1b,

  // Extract
  extract: 0xa78bfa,
  extractGlow: 0xc4b5fd,

  // Alarm tints
  alarmTint: 0xef4444,
  alarmTintSoft: 0xfca5a5,

  // Lighting
  darkness: 0x000000,
  ambientLight: 0xfef3c7,
  playerLight: 0xfffae0,
  guardLightCalm: 0xfacc15,
  guardLightSus: 0xf97316,
  guardLightChase: 0xef4444,
} as const;

export const ROLE_PALETTE = {
  hacker: {
    body: 0x14b8a6,
    accent: 0x0f766e,
    visor: 0x6ee7b7,
    rim: 0x064e3b,
  },
  scout: {
    body: 0x60a5fa,
    accent: 0x2563eb,
    visor: 0xbfdbfe,
    rim: 0x1e3a8a,
  },
  breacher: {
    body: 0xfbbf24,
    accent: 0xb45309,
    visor: 0xfde68a,
    rim: 0x78350f,
  },
  support: {
    body: 0xf472b6,
    accent: 0xdb2777,
    visor: 0xfbcfe8,
    rim: 0x831843,
  },
} as const;

export type RolePaletteKey = keyof typeof ROLE_PALETTE;

export function rolePalette(role: string) {
  return (ROLE_PALETTE as any)[role] || ROLE_PALETTE.scout;
}
