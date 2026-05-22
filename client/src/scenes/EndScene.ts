import Phaser from "phaser";
import { NetworkManager } from "../net/NetworkManager";

export class EndScene extends Phaser.Scene {
  constructor() { super("End"); }

  init(_data: any) {}

  create(data: any) {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor("#0a0d12");
    const overlay = document.getElementById("overlay")!;
    overlay.innerHTML = "";
    const panel = document.createElement("div");
    panel.className = "panel";
    const success = !!data.success;
    panel.innerHTML = `
      <h1 style="color:${success ? "#6ee7b7" : "#ef4444"}">${success ? "EXTRACTION SUCCESS" : "RUN ENDED"}</h1>
      <p>Score: <b>${data.score ?? 0}</b></p>
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
