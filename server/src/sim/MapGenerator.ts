import { MAP_WIDTH, MAP_HEIGHT, TILE_SIZE } from "@blackout/shared";

// Tile codes (single char each for compact sync)
// . = floor
// # = wall
// D = door (horizontal)
// d = door (vertical)
// V = vent
// E = extraction zone
// S = spawn

export type GeneratedMap = {
  w: number;
  h: number;
  tiles: string[]; // length h, each string length w
  spawns: { x: number; y: number }[];
  lootSpots: { x: number; y: number; tier: string }[];
  patrolRoutes: { x: number; y: number }[][];
  doors: { x: number; y: number; horizontal: boolean }[];
  extract: { x: number; y: number; w: number; h: number };
  seed: number;
};

// Mulberry32 — deterministic PRNG
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Room {
  x: number; y: number; w: number; h: number;
  cx: number; cy: number;
}

export function generateMap(seed: number = Math.floor(Math.random() * 1e9)): GeneratedMap {
  const rand = mulberry32(seed);
  const W = MAP_WIDTH;
  const H = MAP_HEIGHT;
  const grid: string[][] = Array.from({ length: H }, () => Array(W).fill("#"));

  // Generate rooms
  const rooms: Room[] = [];
  const attempts = 40;
  const minRoom = 5;
  const maxRoom = 10;
  for (let i = 0; i < attempts; i++) {
    const w = minRoom + Math.floor(rand() * (maxRoom - minRoom));
    const h = minRoom + Math.floor(rand() * (maxRoom - minRoom));
    const x = 1 + Math.floor(rand() * (W - w - 2));
    const y = 1 + Math.floor(rand() * (H - h - 2));
    const overlaps = rooms.some(r =>
      x < r.x + r.w + 1 && x + w + 1 > r.x &&
      y < r.y + r.h + 1 && y + h + 1 > r.y
    );
    if (overlaps) continue;
    rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) grid[yy][xx] = ".";
    }
  }

  // Connect rooms with L-shaped corridors
  const doors: { x: number; y: number; horizontal: boolean }[] = [];
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1];
    const b = rooms[i];
    let x = a.cx, y = a.cy;
    while (x !== b.cx) {
      grid[y][x] = grid[y][x] === "#" ? "." : grid[y][x];
      x += x < b.cx ? 1 : -1;
    }
    while (y !== b.cy) {
      grid[y][x] = grid[y][x] === "#" ? "." : grid[y][x];
      y += y < b.cy ? 1 : -1;
    }
  }

  // Place doors on room boundaries where corridor meets room
  for (const r of rooms) {
    for (let xx = r.x; xx < r.x + r.w; xx++) {
      if (r.y > 0 && grid[r.y - 1][xx] === "." && rand() < 0.4) {
        grid[r.y - 1][xx] = "D"; doors.push({ x: xx, y: r.y - 1, horizontal: true });
      }
      const by = r.y + r.h;
      if (by < H && grid[by][xx] === "." && rand() < 0.4) {
        grid[by][xx] = "D"; doors.push({ x: xx, y: by, horizontal: true });
      }
    }
    for (let yy = r.y; yy < r.y + r.h; yy++) {
      if (r.x > 0 && grid[yy][r.x - 1] === "." && rand() < 0.4) {
        grid[yy][r.x - 1] = "d"; doors.push({ x: r.x - 1, y: yy, horizontal: false });
      }
      const bx = r.x + r.w;
      if (bx < W && grid[yy][bx] === "." && rand() < 0.4) {
        grid[yy][bx] = "d"; doors.push({ x: bx, y: yy, horizontal: false });
      }
    }
  }

  // Spawns: pick edge room
  const spawnRoom = rooms[0];
  const spawns = Array.from({ length: 5 }, (_, i) => ({
    x: (spawnRoom.x + 1 + (i % 3)) * TILE_SIZE + TILE_SIZE / 2,
    y: (spawnRoom.y + 1 + Math.floor(i / 3)) * TILE_SIZE + TILE_SIZE / 2,
  }));
  for (let i = spawnRoom.x; i < spawnRoom.x + spawnRoom.w; i++)
    for (let j = spawnRoom.y; j < spawnRoom.y + spawnRoom.h; j++)
      if (grid[j][i] === ".") grid[j][i] = "."; // mark unchanged but logical spawn

  // Extraction: pick farthest room
  let extractRoom = rooms[rooms.length - 1];
  let bestDist = 0;
  for (const r of rooms) {
    const dx = r.cx - spawnRoom.cx;
    const dy = r.cy - spawnRoom.cy;
    const d = dx * dx + dy * dy;
    if (d > bestDist) { bestDist = d; extractRoom = r; }
  }
  const extract = {
    x: extractRoom.cx * TILE_SIZE - TILE_SIZE,
    y: extractRoom.cy * TILE_SIZE - TILE_SIZE,
    w: TILE_SIZE * 3,
    h: TILE_SIZE * 3,
  };
  for (let yy = extractRoom.cy - 1; yy <= extractRoom.cy + 1; yy++)
    for (let xx = extractRoom.cx - 1; xx <= extractRoom.cx + 1; xx++)
      if (grid[yy]?.[xx] === ".") grid[yy][xx] = "E";

  // Loot placement — scattered through non-spawn, non-extract rooms
  const lootSpots: { x: number; y: number; tier: string }[] = [];
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    if (r === spawnRoom) continue;
    const count = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < count; k++) {
      const lx = r.x + 1 + Math.floor(rand() * Math.max(1, r.w - 2));
      const ly = r.y + 1 + Math.floor(rand() * Math.max(1, r.h - 2));
      if (grid[ly][lx] !== ".") continue;
      const roll = rand();
      let tier = "common";
      if (r === extractRoom) tier = "objective";
      else if (roll > 0.92) tier = "elite";
      else if (roll > 0.7) tier = "rare";
      lootSpots.push({
        x: lx * TILE_SIZE + TILE_SIZE / 2,
        y: ly * TILE_SIZE + TILE_SIZE / 2,
        tier,
      });
    }
  }
  // Guarantee at least one objective
  if (!lootSpots.some(l => l.tier === "objective")) {
    lootSpots.push({
      x: extractRoom.cx * TILE_SIZE,
      y: extractRoom.cy * TILE_SIZE,
      tier: "objective",
    });
  }

  // Patrol routes: each non-spawn room gets a loop
  const patrolRoutes: { x: number; y: number }[][] = [];
  for (const r of rooms) {
    if (r === spawnRoom) continue;
    const px = (x: number) => x * TILE_SIZE + TILE_SIZE / 2;
    const py = (y: number) => y * TILE_SIZE + TILE_SIZE / 2;
    patrolRoutes.push([
      { x: px(r.x + 1), y: py(r.y + 1) },
      { x: px(r.x + r.w - 2), y: py(r.y + 1) },
      { x: px(r.x + r.w - 2), y: py(r.y + r.h - 2) },
      { x: px(r.x + 1), y: py(r.y + r.h - 2) },
    ]);
  }

  return {
    w: W,
    h: H,
    tiles: grid.map(row => row.join("")),
    spawns,
    lootSpots,
    patrolRoutes,
    doors,
    extract,
    seed,
  };
}

// Helper: is the tile at world (px,py) walkable?
export function tileAt(map: GeneratedMap | { tiles: string[] }, tx: number, ty: number): string {
  if (ty < 0 || ty >= map.tiles.length) return "#";
  const row = map.tiles[ty];
  if (tx < 0 || tx >= row.length) return "#";
  return row[tx];
}

export function isSolidTile(c: string): boolean {
  // Walls and closed doors are solid; doors handled separately when open
  return c === "#";
}

export function isDoorTile(c: string): boolean {
  return c === "D" || c === "d";
}
