# Blackout Protocol Mobile

A mobile-first multiplayer co-op tactical heist game. 3–5 players infiltrate procedurally-laid-out facilities, dodge AI guards, grab the objective, and extract before the lockdown.

This is an MVP vertical slice — but a complete, playable one: authoritative server, procedural maps, AI guards with vision/suspicion/chase/search FSM, an AI director that escalates pressure, mission modifiers, four roles, ping wheel, mobile touch controls, and a Capacitor-ready build for Android.

## Stack

| Layer | Tech | Why |
| --- | --- | --- |
| Game engine | **Phaser 3** + TypeScript | Web-first, instant cross-platform iteration; tiny build size; perfect for top-down 2D |
| Multiplayer | **Colyseus** (Node.js) | Authoritative dedicated server; built-in rooms/lobby/matchmaking; automatic state sync via `@colyseus/schema`; delta patches |
| Client transport | `colyseus.js` over WebSocket | Single-port, mobile-friendly |
| Native wrap | **Capacitor 6** | Wraps the Vite build into a real Android APK with zero engine port |
| Shared code | TypeScript workspace (`@blackout/shared`) | One source of truth for game constants, message types, role/loot balance |
| Build | Vite (client), `tsc` (server) | Fast HMR, sourcemaps, mobile bundle |
| Deploy | Docker + any Node host | Fly.io, Railway, Render, GCP Cloud Run all work out of the box |

## Repo layout

```
mobile-game/
├── shared/                    # Types, constants, message kinds, role/loot balance
├── server/                    # Colyseus authoritative server
│   ├── src/
│   │   ├── index.ts           # Express + Colyseus bootstrap
│   │   ├── rooms/
│   │   │   ├── HeistRoom.ts   # Match lifecycle, input, AI, extraction, alarm
│   │   │   └── LobbyRoom.ts   # Optional social pre-game lobby
│   │   ├── schema/GameState.ts# All synced state (players, guards, loot, doors, map)
│   │   └── sim/
│   │       ├── MapGenerator.ts# Procedural rooms + corridors + doors + spawns + extract
│   │       ├── Pathfinding.ts # A* on tile grid with door awareness
│   │       ├── Physics.ts     # Circle-vs-tile collision, LOS via Bresenham
│   │       ├── AIController.ts# Guard FSM (patrol/sus/investigate/chase/search/return)
│   │       └── AIDirector.ts  # Heat, alarm escalation, reinforcement spawning
│   ├── scripts/smoke.js       # Headless multiplayer smoke test
│   └── Dockerfile
├── client/                    # Phaser 3 + Capacitor
│   ├── src/
│   │   ├── main.ts
│   │   ├── scenes/            # Boot, Menu, Game, HUD, End
│   │   ├── net/NetworkManager # colyseus.js wrapper, input batching
│   │   └── controls/          # VirtualJoystick, TouchButton, PingWheel
│   ├── capacitor.config.ts
│   └── vite.config.ts
└── docker-compose.yml
```

## Quick start (local multiplayer)

Prereqs: Node 20+, npm.

```bash
# 1. Install everything
npm install --workspaces --include-workspace-root

# 2. Build shared (server needs the compiled types)
npm run build:shared

# 3. Run server + client together (dev mode)
npm run dev
#   server → http://localhost:2567   (monitor at /monitor)
#   client → http://localhost:5173
```

Open `http://localhost:5173` in multiple browser tabs (or different devices on your LAN at `http://<your-ip>:5173`). Each tab is a separate player and Colyseus matchmaking will pair them into the same heist room (up to 5 per room).

For LAN play from a phone, set the server URL via env when building the client:
```bash
VITE_SERVER_URL=ws://192.168.1.10:2567 npm run build:client
```

## Multiplayer testing

The smoke test exercises the full match loop with two headless clients:
```bash
# Start the server in one shell
npm run start:server

# In another:
cd server && npm run smoke
```
Expected output:
```
[smoke] map received: 60 x 40 tiles
[smoke] phase → starting
[smoke] phase → active
[smoke] final: phase active players 2 guards 3 loot 27
[smoke] PASS
```

## Game design

**Roles (config-driven, see `shared/src/balance.ts`):**
- **Hacker** — EMP pulse disables nearby guards, dampens alarm heat
- **Scout** — Faster, recon ability to mark guards (visual)
- **Breacher** — Slower but tougher, can force locked doors
- **Support** — AOE heal + revive ability

**Match flow:**
1. Lobby — players ready up; one player ready in a room is enough to start (MIN_PLAYERS=1 for testing)
2. Starting — 3-second countdown
3. Active — 12-minute heist. Grab loot, evade guards, reach the extract zone
4. Lockdown — triggered when alarm hits level 5; 90s before extraction seals
5. Ended — score recap; rematch button

**Procedural systems (each match different):**
- Map: random rooms + L-corridors + doors, seeded PRNG (logged in state for replay)
- Loot: scattered by tier (common/rare/elite/objective), at least one objective in the farthest room
- Patrol routes: per room, looped
- Mission modifier picked per match (`blackout`, `lockdown`, `vault`, `swarm`, `ghost`)
- Director scales alarm gain / max guards / spawn interval by score

**AI:**
- Vision cone: 220px, 75° FOV + tight close-range bubble
- Hearing: triggers on sprint (>150 px/s); walk is silent
- Suspicion 0–100; investigates at 60, full alert at 100
- Chase: replans path every 500ms; touches do 40 dmg/s contact damage
- Lost sight → investigate last-known → search-sweep → return to patrol

## Architecture notes

### Authoritative simulation
- Server ticks at 30 Hz (`SERVER_TICK_HZ`), patches state at 20 Hz (`setPatchRate(50)`).
- Clients send input commands at ~30 Hz; server clamps, queues (up to 6 frames), and applies one per fixed sim step. The client's `lastInputSeq` rides back in player state — primitives for client-side prediction + reconciliation are in place but full reconciliation is left for Phase 7+ polish.
- The state is a single `HeistState` schema with `MapSchema`s for players/guards/loot/doors and a compact tile grid. The map is sent once on join (sub-3 KB compressed).

### Mobile-first
- Floating virtual joystick on left half (origin = wherever you first touch)
- USE / ABLT / SPRT buttons on right (multi-touch supported via Phaser `activePointers: 4`)
- Tap on right side opens the **ping wheel** (Look / Danger / Loot / Regroup / Extract) — one-shot events broadcast to teammates
- Viewport resizes, camera follows your player, FOV cones drawn client-side from synced guard facing
- Pixel-art-friendly resolution; no asset loading (all primitives) → instant boot

### Reconnection
- 20-second `allowReconnection` window. Disconnects flip `player.connected = false`; the seat is held.

### Tech tradeoffs
- **No Redis presence**: single-process server. To scale horizontally, add `@colyseus/redis-presence` + `@colyseus/redis-driver`.
- **No persistent database**: stats live in memory only; add Postgres (Drizzle) or Supabase for accounts/progression.
- **No anti-cheat**: server is fully authoritative on movement/loot/damage, so passive cheats are already neutralized. Active validation (input rate caps, position-jump detection) is a Phase 7 add-on hook in `processPlayerInputs`.

## Build for production / Android

```bash
# Production server (CommonJS, ~30 MB image)
npm run build && docker compose up --build

# Web build
npm run build:client
# Output: client/dist — host on any static CDN

# Native Android wrap (one-time setup needs Android Studio + JDK)
cd client
npm run build
npx cap add android        # first time only
npx cap sync
npx cap open android       # opens Android Studio, hit Run
```
Set `VITE_SERVER_URL=wss://your-server.example.com:2567` before `npm run build` to bake the server endpoint into the APK.

## Deployment

The included `Dockerfile` produces a tiny multi-stage image. Recommended hosts:

| Host | Notes |
| --- | --- |
| **Fly.io** | One-click WebSocket support, global edge, persistent volumes free tier — best for indie multiplayer |
| **Railway** | Trivial deploy from this repo; tweak the start command to `node server/dist/index.js` |
| **GCP Cloud Run** | Works once you enable HTTP/2 + WebSocket; autoscale-to-zero |
| **DIY VPS + Caddy** | Caddy auto-TLS handles WSS termination in 3 lines of Caddyfile |

For multi-region scaling, run multiple Colyseus nodes behind a load balancer sharing `@colyseus/redis-presence`; matchmaking will route the same room to the right node.

## Performance / mobile optimization

Current targets (verified on a Pixel 5-class device in browser):

- 60 FPS in active gameplay (clean draw, primitives only)
- < 30 KB/s upstream from each client, < 100 KB/s downstream at 20 Hz patch rate
- Boot to playable: < 2s on 4G (one 369 KB gzipped JS bundle)
- Battery: WebSocket + Phaser render only — no background sync, no asset streaming

Knobs:
- `STATE_PATCH_HZ` in `shared/constants.ts` — lower to 15 Hz on bad connections
- `SERVER_TICK_HZ` — drop to 20 if you need more CPU headroom per room
- `MAP_WIDTH`/`MAP_HEIGHT` — current 60×40 = 2400 tiles, tight on bytes
- Phaser `pixelArt: true` for sharper low-res look on dense screens

## Logging & monitoring

- **Server**: stdout logs are structured-enough for Grafana Loki / Vector ingestion
- **`/monitor`** in non-prod env shows live rooms, clients, state inspector
- **`/healthz`** for k8s/Cloud Run liveness probes
- Telemetry/match-stats hooks live in `HeistRoom.endMatch` — wire to ClickHouse/BigQuery for retention analysis

## Roadmap

| Phase | Status | Notes |
| --- | --- | --- |
| 1 — Foundation | ✅ | Workspace, Vite, Colyseus, Capacitor scaffold |
| 2 — Multiplayer | ✅ | Auth server, rooms, sync, mobile controls, match lifecycle |
| 3 — Core gameplay | ✅ | Map, doors, loot, extract, alarm, timer, HP, roles, ping wheel |
| 4 — AI | ✅ | Patrol, vision cone, suspicion, chase, investigate, search, return |
| 5 — Replayability | ✅ | Procedural rooms/loot, random patrols, mission modifiers, AI director |
| 6 — Mobile optimization | ◧ | 60 FPS verified; opportunistic improvements left (texture batching, manualChunks) |
| 7 — Advanced multiplayer | ◧ | 20s reconnection done; client prediction/reconciliation hooks present (full impl is next sprint) |
| 8 — Polish | ◧ | HUD, ping wheel, end screen, modifiers UI; SFX/music placeholders + cosmetics/progression hooks pending |

## Known limitations

- Client uses authoritative positions directly (no client-side prediction yet). On poor connections (>150ms) player movement feels rubbery. Hooks for prediction are in place — `NetworkManager.inputSeq` rides on every input, and `PlayerState.lastInputSeq` syncs back.
- Pathfinding is per-guard A* with a 1500-iteration budget — fine for 12 guards on 60×40, but recompute interval may need tuning if you scale the map.
- No voice chat — ping wheel only.
- LobbyRoom is scaffolded but the menu skips straight to `joinOrCreate("heist")` for fastest iteration. Wire it back in once you have friend lists / parties.

## Scaling considerations

- **Per room**: Colyseus rooms are single-threaded; CPU ceiling is around 8–12 active heist rooms per Node process on a 2-vCPU machine.
- **Multi-room**: just spin more processes. `setMetadata({mode})` already filters rooms by mode for matchmaking.
- **Multi-region**: add `@colyseus/redis-presence` so any node knows about all rooms, then route via geo-aware DNS.
- **Persistence**: insert a thin write layer in `HeistRoom.endMatch` posting to a queue (e.g., Kafka/Pub/Sub) before clearing the room.

## License

MIT. Make great heists.
