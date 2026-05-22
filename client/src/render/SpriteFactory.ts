import Phaser from "phaser";
import { PALETTE } from "./Palette";

// Generates procedural textures at boot — no asset files needed.
// All keys are stable so other modules can reference them by name.

export const TEX = {
  particleDust: "tex_p_dust",
  particleSpark: "tex_p_spark",
  particleEmber: "tex_p_ember",
  particleGlint: "tex_p_glint",
  particleSmoke: "tex_p_smoke",
  particleRing: "tex_p_ring",
  lightSoft: "tex_light_soft",
  lightSharp: "tex_light_sharp",
  bloodSplat: "tex_blood",
} as const;

export function generateTextures(scene: Phaser.Scene) {
  // Soft radial gradient light (for player + ambient lamps)
  makeRadial(scene, TEX.lightSoft, 64, [
    { offset: 0, color: "rgba(255,255,255,1)" },
    { offset: 0.5, color: "rgba(255,255,255,0.55)" },
    { offset: 1, color: "rgba(255,255,255,0)" },
  ]);

  // Sharper falloff for guard cones
  makeRadial(scene, TEX.lightSharp, 48, [
    { offset: 0, color: "rgba(255,255,255,1)" },
    { offset: 0.3, color: "rgba(255,255,255,0.9)" },
    { offset: 1, color: "rgba(255,255,255,0)" },
  ]);

  // Dust puff — soft gray
  makeRadial(scene, TEX.particleDust, 8, [
    { offset: 0, color: "rgba(200,210,220,0.7)" },
    { offset: 1, color: "rgba(200,210,220,0)" },
  ]);

  // Smoke
  makeRadial(scene, TEX.particleSmoke, 16, [
    { offset: 0, color: "rgba(80,90,110,0.5)" },
    { offset: 1, color: "rgba(80,90,110,0)" },
  ]);

  // Spark (warm yellow)
  makeRadial(scene, TEX.particleSpark, 6, [
    { offset: 0, color: "rgba(254,240,138,1)" },
    { offset: 0.4, color: "rgba(252,211,77,0.8)" },
    { offset: 1, color: "rgba(252,211,77,0)" },
  ]);

  // Ember (red)
  makeRadial(scene, TEX.particleEmber, 6, [
    { offset: 0, color: "rgba(254,202,202,1)" },
    { offset: 0.5, color: "rgba(239,68,68,0.9)" },
    { offset: 1, color: "rgba(127,29,29,0)" },
  ]);

  // Glint (cyan-white)
  makeRadial(scene, TEX.particleGlint, 6, [
    { offset: 0, color: "rgba(255,255,255,1)" },
    { offset: 0.5, color: "rgba(110,231,183,0.7)" },
    { offset: 1, color: "rgba(110,231,183,0)" },
  ]);

  // Ring (EMP / breach shockwave)
  {
    const size = 64;
    const canvas = (scene.textures.createCanvas(TEX.particleRing, size, size))!;
    const ctx = canvas.getContext()!;
    ctx.clearRect(0, 0, size, size);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(110,231,183,1)";
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
    ctx.stroke();
    canvas.refresh();
  }

  // Blood splat
  {
    const size = 20;
    const canvas = (scene.textures.createCanvas(TEX.bloodSplat, size, size))!;
    const ctx = canvas.getContext()!;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "rgba(127,29,29,0.7)";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = 3 + Math.random() * 5;
      ctx.beginPath();
      ctx.arc(size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r, 1.5 + Math.random() * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    canvas.refresh();
  }
}

function makeRadial(scene: Phaser.Scene, key: string, size: number, stops: { offset: number; color: string }[]) {
  const canvas = (scene.textures.createCanvas(key, size, size))!;
  const ctx = canvas.getContext()!;
  ctx.clearRect(0, 0, size, size);
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const s of stops) grad.addColorStop(s.offset, s.color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  canvas.refresh();
}
