import { Client, Room } from "colyseus.js";
import { MSG, PROTOCOL_VERSION } from "@blackout/shared";
import type { InputMsg, PingMsg, RolePickMsg, ReadyMsg, ServerEvent } from "@blackout/shared";

export class NetworkManager {
  private static _instance: NetworkManager;
  static get instance() { return this._instance ??= new NetworkManager(); }

  client!: Client;
  room: Room | null = null;
  endpoint = this.detectEndpoint();
  onEvent: ((e: ServerEvent) => void) | null = null;
  onWelcome: ((msg: any) => void) | null = null;
  inputSeq = 0;

  constructor() {
    this.client = new Client(this.endpoint);
  }

  private detectEndpoint(): string {
    const env = (import.meta as any).env?.VITE_SERVER_URL as string | undefined;
    if (env) return env;
    if (typeof location === "undefined") return "ws://localhost:2567";
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    // Default: same host on port 2567 (dev convention)
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      return `${proto}//${location.hostname}:2567`;
    }
    return `${proto}//${location.hostname}:2567`;
  }

  async joinHeist(name: string, mode: string = "default"): Promise<Room> {
    if (this.room) {
      try { await this.room.leave(); } catch {}
      this.room = null;
    }
    const room = await this.client.joinOrCreate("heist", { name, mode, protocol: PROTOCOL_VERSION });
    this.room = room;
    this.bind(room);
    return room;
  }

  private bind(room: Room) {
    room.onMessage("welcome", (msg) => this.onWelcome?.(msg));
    room.onMessage(MSG.EVENT, (ev: ServerEvent) => this.onEvent?.(ev));
  }

  sendInput(msg: Omit<InputMsg, "seq">) {
    if (!this.room) return;
    this.inputSeq = (this.inputSeq + 1) | 0;
    this.room.send(MSG.INPUT, { seq: this.inputSeq, ...msg });
  }

  sendReady(ready: boolean) {
    this.room?.send(MSG.READY, { ready } as ReadyMsg);
  }

  sendRolePick(role: string) {
    this.room?.send(MSG.ROLE_PICK, { role } as RolePickMsg);
  }

  sendPing(kind: PingMsg["kind"], x: number, y: number) {
    this.room?.send(MSG.PING, { kind, x, y } as PingMsg);
  }

  leave() {
    if (this.room) {
      this.room.leave().catch(() => {});
      this.room = null;
    }
  }

  get sessionId(): string {
    return this.room?.sessionId ?? "";
  }
}
