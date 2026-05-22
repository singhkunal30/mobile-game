import { TILE_SIZE } from "@blackout/shared";
import { isSolidTile, isDoorTile } from "./MapGenerator";

export interface PathfindMap {
  tiles: string[];
  w: number;
  h: number;
}

interface Node {
  x: number; y: number;
  g: number; h: number; f: number;
  parent: Node | null;
}

function key(x: number, y: number): number { return y * 1024 + x; }

function walkable(map: PathfindMap, x: number, y: number, doorOpen: (x: number, y: number) => boolean): boolean {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
  const c = map.tiles[y][x];
  if (isSolidTile(c)) return false;
  if (isDoorTile(c) && !doorOpen(x, y)) return false;
  return true;
}

// A* on tile grid; returns world-coordinate waypoints (excluding start tile center).
// Limit search budget to avoid hangs.
export function findPath(
  map: PathfindMap,
  sxPx: number, syPx: number,
  txPx: number, tyPx: number,
  doorOpen: (x: number, y: number) => boolean,
  budget: number = 1500,
): { x: number; y: number }[] {
  const sx = Math.floor(sxPx / TILE_SIZE);
  const sy = Math.floor(syPx / TILE_SIZE);
  const tx = Math.floor(txPx / TILE_SIZE);
  const ty = Math.floor(tyPx / TILE_SIZE);
  if (!walkable(map, tx, ty, doorOpen)) return [];
  if (sx === tx && sy === ty) return [{ x: txPx, y: tyPx }];

  const open: Node[] = [];
  const visited = new Map<number, Node>();
  const start: Node = { x: sx, y: sy, g: 0, h: 0, f: 0, parent: null };
  open.push(start);
  visited.set(key(sx, sy), start);

  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];

  let iter = 0;
  while (open.length && iter++ < budget) {
    // Pop lowest f (linear scan — fine for small maps)
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bestIdx].f) bestIdx = i;
    const cur = open.splice(bestIdx, 1)[0];

    if (cur.x === tx && cur.y === ty) {
      // Reconstruct
      const path: { x: number; y: number }[] = [];
      let n: Node | null = cur;
      while (n && n.parent) {
        path.push({ x: n.x * TILE_SIZE + TILE_SIZE / 2, y: n.y * TILE_SIZE + TILE_SIZE / 2 });
        n = n.parent;
      }
      path.reverse();
      return path;
    }

    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!walkable(map, nx, ny, doorOpen)) continue;
      // Prevent diagonal cutting corners
      if (dx !== 0 && dy !== 0) {
        if (!walkable(map, cur.x + dx, cur.y, doorOpen)) continue;
        if (!walkable(map, cur.x, cur.y + dy, doorOpen)) continue;
      }
      const stepCost = (dx !== 0 && dy !== 0) ? 1.414 : 1;
      const g = cur.g + stepCost;
      const k = key(nx, ny);
      const existing = visited.get(k);
      if (existing && existing.g <= g) continue;
      const h = Math.abs(nx - tx) + Math.abs(ny - ty);
      const node: Node = { x: nx, y: ny, g, h, f: g + h, parent: cur };
      visited.set(k, node);
      open.push(node);
    }
  }
  return [];
}
