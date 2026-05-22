import { Room, Client } from "colyseus";
import { Schema, type, MapSchema } from "@colyseus/schema";

class LobbyPlayer extends Schema {
  @type("string") id: string = "";
  @type("string") name: string = "";
  @type("boolean") ready: boolean = false;
}

class LobbyState extends Schema {
  @type({ map: LobbyPlayer }) players = new MapSchema<LobbyPlayer>();
  @type("string") status: string = "open";
}

// Lightweight lobby that lists open heists.
// In MVP we mainly use Colyseus matchmaking on the heist room itself,
// but this room provides an alternative pre-game social room.
export class LobbyRoom extends Room<LobbyState> {
  maxClients = 32;

  onCreate() {
    this.setState(new LobbyState());
    this.onMessage("ready", (client, msg: { ready: boolean }) => {
      const p = this.state.players.get(client.sessionId);
      if (p) p.ready = !!msg.ready;
    });
  }

  onJoin(client: Client, options: any) {
    const p = new LobbyPlayer();
    p.id = client.sessionId;
    p.name = (options?.name || "Agent").slice(0, 16);
    this.state.players.set(client.sessionId, p);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }
}
