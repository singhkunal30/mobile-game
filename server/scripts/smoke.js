// Headless smoke test — connects two simulated clients to the heist room
// and exercises join, ready, input, and one match step.

const { Client } = require("colyseus.js");

async function run() {
  const client = new Client("ws://localhost:2567");
  console.log("[smoke] connecting client A...");
  const roomA = await client.joinOrCreate("heist", { name: "Alpha" });
  console.log("[smoke] A joined", roomA.sessionId);

  const roomB = await client.joinOrCreate("heist", { name: "Bravo" });
  console.log("[smoke] B joined", roomB.sessionId);

  let gotMap = false;
  let gotPhase = "";
  let serverEvents = 0;
  roomA.onStateChange((state) => {
    if (state.map?.tiles?.length && !gotMap) {
      gotMap = true;
      console.log("[smoke] map received:", state.map.width, "x", state.map.height, "tiles");
    }
    if (state.phase !== gotPhase) {
      gotPhase = state.phase;
      console.log("[smoke] phase →", state.phase, "score", state.score, "alarm", state.alarmLevel);
    }
  });
  roomA.onMessage("e", () => serverEvents++);

  // Send ready
  roomA.send("rd", { ready: true });
  roomB.send("rd", { ready: true });
  console.log("[smoke] sent ready");

  // Wiggle inputs for 4s
  let i = 0;
  const t = setInterval(() => {
    i++;
    roomA.send("i", { seq: i, dx: Math.sin(i / 5), dy: Math.cos(i / 5), sprint: false, interact: i % 30 === 0, ability: i === 60 });
    roomB.send("i", { seq: i, dx: -Math.sin(i / 7), dy: Math.cos(i / 11), sprint: i > 40, interact: false, ability: false });
  }, 33);

  await new Promise(r => setTimeout(r, 6000));
  clearInterval(t);

  console.log("[smoke] events received:", serverEvents);
  const roomState = roomA.state;
  console.log("[smoke] final: phase", roomState.phase, "players", roomState.players.size, "guards", roomState.guards.size, "loot", roomState.loot.size);
  if (!gotMap) { console.error("FAIL: no map"); process.exit(1); }
  if (roomState.guards.size === 0) { console.error("FAIL: no guards spawned"); process.exit(1); }
  console.log("[smoke] PASS");
  await roomA.leave();
  await roomB.leave();
  process.exit(0);
}

run().catch(e => { console.error("[smoke] error", e); process.exit(1); });
