import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export class Vec2State extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
}

export class PlayerState extends Schema {
  @type("string") id: string = "";
  @type("string") name: string = "Agent";
  @type("string") role: string = "scout";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") vx: number = 0;
  @type("number") vy: number = 0;
  @type("number") facing: number = 0; // radians
  @type("number") hp: number = 100;
  @type("string") status: string = "alive"; // alive | downed | extracted | dead
  @type("boolean") ready: boolean = false;
  @type("boolean") connected: boolean = true;
  @type("number") carriedLoot: number = 0;
  @type("number") abilityCdUntil: number = 0;
  @type("number") interactingUntil: number = 0;
  @type("string") interactingWith: string = "";
  @type("number") lastInputSeq: number = 0;
  @type("number") downedAt: number = 0;
}

export class GuardState extends Schema {
  @type("string") id: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") facing: number = 0;
  @type("string") phase: string = "patrol"; // patrol | suspicious | investigate | chase | search | return
  @type("number") suspicion: number = 0; // 0..100
  @type("string") targetPlayerId: string = "";
  @type("number") lastSeenX: number = 0;
  @type("number") lastSeenY: number = 0;
  @type("number") patrolIndex: number = 0;
}

export class LootState extends Schema {
  @type("string") id: string = "";
  @type("string") tier: string = "common";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("boolean") taken: boolean = false;
  @type("number") value: number = 0;
}

export class DoorState extends Schema {
  @type("string") id: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("boolean") horizontal: boolean = true;
  @type("boolean") open: boolean = false;
  @type("boolean") locked: boolean = false;
  @type("boolean") breached: boolean = false;
}

export class MapTileRow extends Schema {
  @type("string") row: string = ""; // each char represents a tile, length = MAP_WIDTH
}

export class MapState extends Schema {
  @type("number") width: number = 0;
  @type("number") height: number = 0;
  @type([MapTileRow]) tiles = new ArraySchema<MapTileRow>();
  @type("number") extractX: number = 0;
  @type("number") extractY: number = 0;
  @type("number") extractW: number = 4;
  @type("number") extractH: number = 4;
  @type("number") seed: number = 0;
}

export class HeistState extends Schema {
  @type("string") phase: string = "lobby"; // lobby | starting | active | lockdown | ended
  @type("number") tStart: number = 0;
  @type("number") tEnd: number = 0;
  @type("number") tNow: number = 0;
  @type("number") alarmLevel: number = 0; // 0..ALARM_LEVELS
  @type("number") alarmHeat: number = 0; // 0..100 charge to next level
  @type("number") lockdownAt: number = 0;
  @type("number") score: number = 0;
  @type("number") extractedCount: number = 0;
  @type("number") extractProgress: number = 0; // 0..1 while team in extract zone
  @type("string") modifier: string = "";
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: GuardState }) guards = new MapSchema<GuardState>();
  @type({ map: LootState }) loot = new MapSchema<LootState>();
  @type({ map: DoorState }) doors = new MapSchema<DoorState>();
  @type(MapState) map = new MapState();
}
