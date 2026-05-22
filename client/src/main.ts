import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { MenuScene } from "./scenes/MenuScene";
import { GameScene } from "./scenes/GameScene";
import { HUDScene } from "./scenes/HUDScene";
import { EndScene } from "./scenes/EndScene";

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
  input: {
    activePointers: 4, // multi-touch support
  },
  render: {
    antialias: true,
    powerPreference: "high-performance",
  },
  scene: [BootScene, MenuScene, GameScene, HUDScene, EndScene],
};

const game = new Phaser.Game(config);
(window as any).__game = game;

// Lock orientation hint on mobile
window.addEventListener("resize", () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});
