import { WIDTH, HEIGHT } from "./patterns.js";
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.resize();
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect(),
      dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
  }
  viewport() {
    const r = this.canvas.getBoundingClientRect();
    return { scale: Math.min(r.width / WIDTH, r.height / HEIGHT) };
  }
  draw(game, clock) {
    const c = this.ctx,
      scale = Math.min(this.canvas.width / WIDTH, this.canvas.height / HEIGHT);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(
      scale,
      0,
      0,
      scale,
      (this.canvas.width - WIDTH * scale) / 2,
      (this.canvas.height - HEIGHT * scale) / 2,
    );
    c.save();
    c.beginPath();
    c.rect(0, 0, WIDTH, HEIGHT);
    c.clip();
    c.fillStyle = "#0a121e";
    c.fillRect(0, 0, WIDTH, HEIGHT);
    c.strokeStyle = "#253d4e";
    c.strokeRect(0.5, 0.5, WIDTH - 1, HEIGHT - 1);
    c.strokeStyle = "#1d2d3b55";
    c.lineWidth = 1;
    for (let x = 0; x <= WIDTH; x += 40) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, HEIGHT);
      c.stroke();
    }
    for (let y = 0; y <= HEIGHT; y += 40) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(WIDTH, y);
      c.stroke();
    }
    c.fillStyle = "#56718444";
    for (let x = 40; x < WIDTH; x += 80)
      for (let y = 40; y < HEIGHT; y += 80) c.fillRect(x - 1, y - 1, 2, 2);
    const glow = c.createRadialGradient(300, 320, 0, 300, 320, 360);
    glow.addColorStop(0, "#66dda908");
    glow.addColorStop(1, "#66dda900");
    c.fillStyle = glow;
    c.fillRect(0, 0, WIDTH, HEIGHT);
    for (const h of game.hazards) {
      const warning = h.age < h.warning;
      c.save();
      c.strokeStyle = h.color;
      c.fillStyle = h.color;
      if (warning) {
        c.globalAlpha = 0.35 + (0.35 * h.age) / h.warning;
        c.setLineDash([5, 6]);
        c.lineWidth = 1.5;
        if (h.kind === "laser") {
          c.fillStyle = h.color + "10";
          c.fillRect(h.x, h.y, h.w, h.h);
          c.strokeRect(h.x, h.y, h.w, h.h);
          c.setLineDash([]);
          c.fillStyle = h.color;
          c.font = "10px monospace";
          c.textAlign = "center";
          c.fillText("!", h.x + h.w / 2, Math.max(25, h.y + h.h / 2));
        } else if (h.kind === "circle") {
          const x = Math.max(14, Math.min(WIDTH - 14, h.x)),
            y = Math.max(14, Math.min(HEIGHT - 14, h.y));
          c.beginPath();
          c.arc(x, y, 15, 0, Math.PI * 2);
          c.stroke();
        } else {
          if (h.vy) {
            c.beginPath();
            c.moveTo(h.x, 14);
            c.lineTo(h.x + h.w, 14);
            c.stroke();
          } else {
            c.beginPath();
            c.moveTo(14, h.y);
            c.lineTo(14, h.y + h.h);
            c.stroke();
          }
        }
      } else {
        c.shadowColor = h.color;
        c.shadowBlur = this.reduced ? 0 : 12;
        if (h.kind === "circle") {
          c.globalAlpha = 0.22;
          c.beginPath();
          c.moveTo(h.x, h.y);
          c.lineTo(h.x - h.vx * 0.15, h.y - h.vy * 0.15);
          c.lineWidth = h.r;
          c.stroke();
          c.globalAlpha = 1;
          c.beginPath();
          c.arc(h.x, h.y, h.r, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = "#fff6";
          c.beginPath();
          c.arc(h.x - 2, h.y - 2, h.r * 0.35, 0, Math.PI * 2);
          c.fill();
        } else {
          c.globalAlpha = h.kind === "laser" ? 0.75 : 1;
          c.fillRect(h.x, h.y, h.w, h.h);
          c.shadowBlur = 0;
          c.fillStyle = "#fff7";
          if (h.kind === "laser") {
            if (h.w < h.h) c.fillRect(h.x + h.w / 2 - 1, h.y, 2, h.h);
            else c.fillRect(h.x, h.y + h.h / 2 - 1, h.w, 2);
          } else c.fillRect(h.x, h.y, h.w, 2);
        }
      }
      c.restore();
    }
    if (!this.reduced)
      for (let i = 0; i < game.trail.length; i += 2) {
        const p = game.trail[i];
        c.globalAlpha = (i / game.trail.length) * 0.16;
        c.fillStyle = "#89f9c4";
        c.beginPath();
        c.arc(p.x, p.y, 4, 0, Math.PI * 2);
        c.fill();
      }
    c.globalAlpha = 1;
    if (game.state !== "over") {
      const p = game.player;
      c.save();
      c.translate(p.x, p.y);
      c.rotate(Math.PI / 4);
      c.shadowColor = "#89f9c4";
      c.shadowBlur = this.reduced ? 0 : 20;
      c.fillStyle = "#89f9c4";
      c.fillRect(-8, -8, 16, 16);
      c.shadowBlur = 0;
      c.fillStyle = "#effff5";
      c.fillRect(-3, -3, 6, 6);
      c.restore();
      c.strokeStyle = "#89f9c42a";
      c.beginPath();
      c.arc(
        p.x,
        p.y,
        20 + (this.reduced ? 0 : Math.sin(clock * 2) * 2),
        0,
        Math.PI * 2,
      );
      c.stroke();
    }
    for (const p of game.particles) {
      c.globalAlpha = Math.max(0, p.life / p.maxLife);
      c.fillStyle = p.color;
      c.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    c.globalAlpha = 1;
    if (game.flash > 0 && !this.reduced) {
      c.fillStyle = `rgba(137,249,196,${game.flash * 0.13})`;
      c.fillRect(0, 0, WIDTH, HEIGHT);
    }
    c.restore();
  }
}
