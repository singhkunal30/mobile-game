import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { monitor } from "@colyseus/monitor";
import express from "express";
import http from "http";
import cors from "cors";
import { HeistRoom } from "./rooms/HeistRoom";
import { LobbyRoom } from "./rooms/LobbyRoom";
import { log } from "./util/Logger";

const PORT = Number(process.env.PORT) || 2567;

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    name: "Blackout Protocol Server",
    version: "0.1.0",
    status: "ok",
    rooms: ["lobby", "heist"],
  });
});

app.get("/healthz", (_req, res) => res.json({ ok: true, ts: Date.now() }));

const server = http.createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server }),
});

gameServer.define("lobby", LobbyRoom);
gameServer.define("heist", HeistRoom)
  .filterBy(["mode"]); // matchmaking by mode

// Dev monitor — disable in production via env
if (process.env.NODE_ENV !== "production") {
  app.use("/monitor", monitor());
}

gameServer.listen(PORT).then(() => {
  log.info("server_listen", { port: PORT, env: process.env.NODE_ENV || "dev" });
});

process.on("SIGINT", () => {
  log.info("server_shutdown");
  gameServer.gracefullyShutdown().then(() => process.exit(0));
});

process.on("uncaughtException", (e) => log.error("uncaught", { err: String(e?.stack || e) }));
process.on("unhandledRejection", (e: any) => log.error("unhandled", { err: String(e?.stack || e) }));
