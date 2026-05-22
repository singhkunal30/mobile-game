import Phaser from "phaser";
import { NetworkManager } from "../net/NetworkManager";
import { ROLES, ROLE_DEFS, MISSION_MODIFIERS } from "@blackout/shared";

export class MenuScene extends Phaser.Scene {
  private titleText!: Phaser.GameObjects.Text;
  private subText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  constructor() { super("Menu"); }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor("#0a0d12");

    this.titleText = this.add.text(width / 2, 60, "BLACKOUT PROTOCOL", {
      fontFamily: "ui-sans-serif, system-ui",
      fontSize: "28px",
      color: "#6ee7b7",
    }).setOrigin(0.5);
    this.add.text(width / 2, 92, "co-op tactical heist · MVP build", {
      fontFamily: "ui-sans-serif, system-ui",
      fontSize: "12px",
      color: "#64748b",
    }).setOrigin(0.5);

    const name = localStorage.getItem("agentName") || ("Agent" + Math.floor(Math.random() * 900 + 100));
    let chosenRole = (localStorage.getItem("role") as any) || "scout";

    // DOM-based overlay panel for input — easier than Phaser text input
    const overlay = document.getElementById("overlay")!;
    overlay.innerHTML = "";
    const panel = document.createElement("div");
    panel.className = "panel";
    const sfxOn = localStorage.getItem("sfxEnabled") !== "0";
    panel.innerHTML = `
      <h1>BLACKOUT PROTOCOL</h1>
      <p>Infiltrate. Loot. Extract. Don't get caught.</p>
      <div class="row" style="margin-top:14px">
        <label style="align-self:center;min-width:60px">Name</label>
        <input id="nm" value="${escapeHTML(name)}" maxlength="16" style="flex:1" />
      </div>
      <label>Role</label>
      <div class="role-pick" id="roles"></div>
      <p id="modline" style="margin-top:8px;color:#a78bfa"></p>
      <div class="row" style="margin-top:14px">
        <button id="join" class="primary" style="flex:1">JOIN HEIST</button>
        <button id="settings" title="Settings">⚙</button>
      </div>
      <div id="settings-panel" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid #334155">
        <label style="display:flex;align-items:center;gap:8px;color:#cbd5e1;text-transform:none;letter-spacing:0">
          <input type="checkbox" id="sfx" ${sfxOn ? "checked" : ""} /> Sound effects
        </label>
        <p style="font-size:10px;color:#475569;margin-top:6px">v0.1.0 · Build ${(new Date()).toISOString().slice(0,10)}</p>
      </div>
      <p style="margin-top:14px;font-size:11px;color:#475569">
        Test multiplayer: open multiple browser tabs to this URL.<br/>
        Server: <code style="color:#94a3b8">${escapeHTML(NetworkManager.instance.endpoint)}</code>
      </p>
      <p id="status" style="color:#fbbf24"></p>
    `;
    overlay.appendChild(panel);

    const rolesDiv = panel.querySelector("#roles") as HTMLElement;
    const refreshRoles = () => {
      rolesDiv.innerHTML = "";
      for (const r of ROLES) {
        const def = ROLE_DEFS[r];
        const b = document.createElement("button");
        b.innerHTML = `<b>${def.name}</b><br/><span style="color:#64748b;font-size:10px">${def.description}</span>`;
        if (chosenRole === r) b.classList.add("sel");
        b.onclick = () => { chosenRole = r; localStorage.setItem("role", r); refreshRoles(); };
        rolesDiv.appendChild(b);
      }
    };
    refreshRoles();

    const mod = MISSION_MODIFIERS[Math.floor(Math.random() * MISSION_MODIFIERS.length)];
    (panel.querySelector("#modline") as HTMLElement).innerText = `Active modifier: ${mod.name} — ${mod.desc} (server picks final)`;

    const settingsBtn = panel.querySelector("#settings") as HTMLButtonElement;
    const settingsPanel = panel.querySelector("#settings-panel") as HTMLElement;
    settingsBtn.onclick = () => {
      settingsPanel.style.display = settingsPanel.style.display === "none" ? "block" : "none";
    };
    const sfxCb = panel.querySelector("#sfx") as HTMLInputElement;
    sfxCb.onchange = () => localStorage.setItem("sfxEnabled", sfxCb.checked ? "1" : "0");

    const statusEl = panel.querySelector("#status") as HTMLElement;
    const joinBtn = panel.querySelector("#join") as HTMLButtonElement;
    joinBtn.onclick = async () => {
      const nameVal = ((panel.querySelector("#nm") as HTMLInputElement).value || "Agent").trim().slice(0, 16);
      localStorage.setItem("agentName", nameVal);
      joinBtn.disabled = true;
      statusEl.innerText = "Connecting…";
      try {
        const room = await NetworkManager.instance.joinHeist(nameVal);
        NetworkManager.instance.sendRolePick(chosenRole);
        statusEl.innerText = "Connected. Loading…";
        // Hand off to game scene
        overlay.innerHTML = "";
        this.scene.start("Game");
      } catch (err: any) {
        console.error(err);
        statusEl.innerText = "Connection failed: " + (err?.message || err);
        joinBtn.disabled = false;
      }
    };
  }
}

function escapeHTML(s: string) {
  return s.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch] as string));
}
