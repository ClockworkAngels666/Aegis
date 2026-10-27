/** Canvas textures shared by the 3D views: generated company marks, flags and person icons. */
import * as THREE from "three";
import { markStyle } from "@/components/visuals";
import { canvasTexture, flagSrc, loadImage, pageFont } from "@/lib/three-stage";

/** The generated company monogram (same design as <CompanyMark>) as a square texture. */
export function markTexture(name: string, flagged: boolean, px = 256): THREE.CanvasTexture {
  const { color, shape, text } = markStyle(name);
  const c = document.createElement("canvas");
  c.width = c.height = px;
  const ctx = c.getContext("2d")!;
  ctx.scale(px / 40, px / 40);
  const grad = ctx.createLinearGradient(0, 0, 40, 40);
  grad.addColorStop(0, color);
  grad.addColorStop(1, `${color}b8`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  if (shape === 0) ctx.roundRect(2, 2, 36, 36, 8);
  else if (shape === 1) ctx.arc(20, 20, 18, 0, Math.PI * 2);
  else {
    ctx.moveTo(20, 2);
    ctx.lineTo(37, 8);
    ctx.lineTo(37, 20);
    ctx.bezierCurveTo(37, 30, 29, 36, 20, 38);
    ctx.bezierCurveTo(11, 36, 3, 30, 3, 20);
    ctx.lineTo(3, 8);
    ctx.closePath();
  }
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(8, 31);
  ctx.lineTo(32, 9);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${text.length > 1 ? 14 : 17}px ${pageFont()}`;
  ctx.textAlign = "center";
  ctx.fillText(text, 20, 25.5);
  if (flagged) {
    ctx.strokeStyle = "#d03b3b";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(20, 20, 18.6, 0, Math.PI * 2);
    ctx.stroke();
  }
  return canvasTexture(c);
}

/** A country flag (4:3) with a thin frame; drawn when the SVG has loaded. */
export function flagTexture(code: string, onLoad: () => void, alive: () => boolean = () => true): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 160;
  c.height = 120;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 160, 120);
  const tex = canvasTexture(c);
  void loadImage(flagSrc(code)).then((img) => {
    if (!img || !alive()) return;
    ctx.drawImage(img, 0, 0, 160, 120);
    ctx.strokeStyle = "rgba(17,19,24,0.3)";
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, 157, 117);
    tex.needsUpdate = true;
    onLoad();
  });
  return tex;
}

/** A round person icon for owners, directors and listed individuals. */
export function personTexture(flagged: boolean, px = 192): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = px;
  const ctx = c.getContext("2d")!;
  ctx.scale(px / 40, px / 40);
  ctx.fillStyle = "#5b6573";
  ctx.beginPath();
  ctx.arc(20, 20, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e7ebf0";
  ctx.beginPath();
  ctx.arc(20, 15.5, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(20, 32, 11, 8, 0, Math.PI, 0);
  ctx.fill();
  if (flagged) {
    ctx.strokeStyle = "#d03b3b";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(20, 20, 18.6, 0, Math.PI * 2);
    ctx.stroke();
  }
  return canvasTexture(c);
}
