import { TILE_SIZE } from "@blackout/shared";
import { isSolidTile, isDoorTile } from "./MapGenerator";

export interface TileMap {
  tiles: string[];
  w: number;
  h: number;
}

export interface DoorLookup {
  isOpen(x: number, y: number): boolean;
}

// Circle vs tile collision — returns adjusted x,y
export function moveCircle(
  px: number,
  py: number,
  radius: number,
  vx: number,
  vy: number,
  map: TileMap,
  doors: DoorLookup,
  dt: number,
): { x: number; y: number; hitX: boolean; hitY: boolean } {
  let nx = px + vx * dt;
  let ny = py + vy * dt;
  let hitX = false;
  let hitY = false;

  // Axis-separated resolution
  if (isBlocked(nx, py, radius, map, doors)) {
    nx = px;
    hitX = true;
  }
  if (isBlocked(nx, ny, radius, map, doors)) {
    ny = py;
    hitY = true;
  }
  return { x: nx, y: ny, hitX, hitY };
}

export function isBlocked(
  cx: number,
  cy: number,
  radius: number,
  map: TileMap,
  doors: DoorLookup,
): boolean {
  // Sample 4 cardinal + center for tile collision
  const points = [
    [cx - radius, cy],
    [cx + radius, cy],
    [cx, cy - radius],
    [cx, cy + radius],
  ];
  for (const [x, y] of points) {
    const tx = Math.floor(x / TILE_SIZE);
    const ty = Math.floor(y / TILE_SIZE);
    if (ty < 0 || ty >= map.h || tx < 0 || tx >= map.w) return true;
    const c = map.tiles[ty][tx];
    if (isSolidTile(c)) return true;
    if (isDoorTile(c) && !doors.isOpen(tx, ty)) return true;
  }
  return false;
}

// Bresenham-style line of sight; ignores closed doors
export function hasLineOfSight(
  ax: number, ay: number, bx: number, by: number,
  map: TileMap, doors: DoorLookup,
): boolean {
  let x0 = Math.floor(ax / TILE_SIZE);
  let y0 = Math.floor(ay / TILE_SIZE);
  const x1 = Math.floor(bx / TILE_SIZE);
  const y1 = Math.floor(by / TILE_SIZE);
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let steps = 0;
  while (steps++ < 200) {
    if (x0 === x1 && y0 === y1) return true;
    if (y0 < 0 || y0 >= map.h || x0 < 0 || x0 >= map.w) return false;
    const c = map.tiles[y0][x0];
    if (isSolidTile(c)) return false;
    if (isDoorTile(c) && !doors.isOpen(x0, y0)) return false;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
  return false;
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

export function angleBetween(ax: number, ay: number, bx: number, by: number): number {
  return Math.atan2(by - ay, bx - ax);
}

// Angle delta, normalized to [-PI, PI]
export function angleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
