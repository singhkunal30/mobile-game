import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { MenuScene } from "./scenes/MenuScene";
import { GameScene } from "./scenes/GameScene";
import { HUDScene } from "./scenes/HUDScene";
import { EndScene } from "./scenes/EndScene";
import { initNative, hideSplash, isNative } from "./native/Native";

// Init Capacitor native bits BEFORE Phaser boots (orientation lock, status bar).
initNative();

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#0a0d12",
  pixelArt: false,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  fps: { target: 60, min: 30 },
  input: { activePointers: 4 },
  render: {
    antialias: true,
    powerPreference: "high-performance",
  },
  scene: [BootScene, MenuScene, GameScene, HUDScene, EndScene],
};

const game = new Phaser.Game(config);
(window as any).__game = game;
(window as any).__isNative = isNative;

window.addEventListener("resize", () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});

// Hide splash once Phaser has booted
game.events.once(Phaser.Core.Events.READY, () => {
  setTimeout(() => hideSplash().catch(() => {}), 200);
});

// Prevent rubber-band scroll on iOS Safari / WKWebView
document.addEventListener("touchmove", (e) => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });
document.addEventListener("gesturestart", (e) => e.preventDefault());
