import Phaser from "phaser";
import { NetworkManager } from "../net/NetworkManager";
import { recordMatch, loadProgression } from "../util/Progression";
import { Telemetry } from "../util/Telemetry";

export class EndScene extends Phaser.Scene {
  constructor() { super("End"); }

  create(data: any) {
    this.cameras.main.setBackgroundColor("#0a0d12");
    const overlay = document.getElementById("overlay")!;
    overlay.innerHTML = "";
    const panel = document.createElement("div");
    panel.className = "panel";
    const success = !!data.success;
    const score = data.score ?? 0;
    const p = recordMatch(score, success);
    Telemetry.log("match_end", { success, score, totalMatches: p.matchesPlayed });
    Telemetry.flush();

    const unlockBadge = p.unlocks.length
      ? `<p style="color:#fbbf24;margin-top:6px">UNLOCKED: ${p.unlocks.join(", ")}</p>`
      : "";

    panel.innerHTML = `
      <h1 style="color:${success ? "#6ee7b7" : "#ef4444"}">${success ? "EXTRACTION SUCCESS" : "RUN ENDED"}</h1>
      <p>Score this run: <b style="color:#fbbf24">${score}</b></p>
      <p style="font-size:11px;color:#94a3b8">
        Matches played: ${p.matchesPlayed} · Extracted: ${p.matchesExtracted} · Best: ${p.bestScore}
      </p>
      ${unlockBadge}
      <div class="row" style="margin-top:14px">
        <button id="again" class="primary" style="flex:1">NEW HEIST</button>
      </div>
    `;
    overlay.appendChild(panel);
    (panel.querySelector("#again") as HTMLButtonElement).onclick = () => {
      NetworkManager.instance.leave();
      overlay.innerHTML = "";
      this.scene.stop("Game");
      this.scene.stop("HUD");
      this.scene.start("Menu");
    };
  }
}
