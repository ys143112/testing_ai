import { tangent, support } from "./geometry.js";
import { WIDTH, HEIGHT, PATTERNS, PATTERN_TEMPO } from "./patterns.js";
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.tint = [137, 249, 196];
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
    const scale = Math.min(r.width / WIDTH, r.height / HEIGHT);
    return {
      scale,
      offsetX: (r.width - WIDTH * scale) / 2,
      offsetY: (r.height - HEIGHT * scale) / 2,
    };
  }
  drawLaser(c, h, warning) {
    c.save();
    c.translate(h.x, h.y);
    c.rotate(h.angle);
    c.fillStyle = h.color;
    c.strokeStyle = h.color;
    if (warning) {
      const progress = Math.max(0, Math.min(1, h.age / h.warning)),
        filled = h.halfH * progress;
      c.globalAlpha = 0.16;
      c.fillRect(-h.halfW, -h.halfH, h.halfW * 2, h.halfH * 2);
      c.globalAlpha = 0.42;
      c.fillRect(-h.halfW, -h.halfH, h.halfW * 2, filled);
      c.fillRect(-h.halfW, h.halfH - filled, h.halfW * 2, filled);
      c.globalAlpha = 0.9;
      c.lineWidth = 2;
      c.setLineDash([10, 7]);
      c.strokeRect(-h.halfW, -h.halfH, h.halfW * 2, h.halfH * 2);
      c.setLineDash([]);
      c.strokeStyle = "#eadcff";
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(-h.halfW, -h.halfH + filled);
      c.lineTo(h.halfW, -h.halfH + filled);
      c.moveTo(-h.halfW, h.halfH - filled);
      c.lineTo(h.halfW, h.halfH - filled);
      c.stroke();
      c.restore();
      c.save();
      c.strokeStyle = h.color;
      c.lineWidth = 3;
      c.globalAlpha = 0.9;
      c.beginPath();
      c.arc(h.x, h.y, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      c.stroke();
      c.restore();
    } else {
      c.globalAlpha = 0.88;
      c.shadowColor = h.color;
      c.shadowBlur = this.reduced ? 0 : 14;
      c.fillRect(-h.halfW, -h.halfH, h.halfW * 2, h.halfH * 2);
      c.shadowBlur = 0;
      c.fillStyle = "#f6eeff";
      c.fillRect(-h.halfW, -1.5, h.halfW * 2, 3);
      c.restore();
    }
  }
  drawWall(c, h, warning) {
    if (warning) {
      if (!h.cue) return;
      const n = h.gateNormal,
        t = h.gateTangent,
        S = support(n),
        progress = h.age / h.warning;
      c.strokeStyle = h.color;
      c.fillStyle = h.color;
      c.globalAlpha = 0.16 + progress * 0.12;
      c.lineWidth = 2;
      c.setLineDash([8, 7]);
      for (const s of [h.openLo, h.openHi]) {
        c.beginPath();
        c.moveTo(WIDTH / 2 + t.x * s - n.x * S, HEIGHT / 2 + t.y * s - n.y * S);
        c.lineTo(WIDTH / 2 + t.x * s + n.x * S, HEIGHT / 2 + t.y * s + n.y * S);
        c.stroke();
      }
      c.setLineDash([]);
      const x = WIDTH / 2 - n.x * (S - 30),
        y = HEIGHT / 2 - n.y * (S - 30);
      c.globalAlpha = 0.65 + progress * 0.35;
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(x - n.x * 12, y - n.y * 12);
      c.lineTo(x + n.x * 12, y + n.y * 12);
      c.moveTo(
        x + n.x * 12 - t.x * 8 - n.x * 8,
        y + n.y * 12 - t.y * 8 - n.y * 8,
      );
      c.lineTo(x + n.x * 12, y + n.y * 12);
      c.lineTo(
        x + n.x * 12 + t.x * 8 - n.x * 8,
        y + n.y * 12 + t.y * 8 - n.y * 8,
      );
      c.stroke();
    } else {
      c.translate(h.x, h.y);
      c.rotate(h.angle);
      c.fillStyle = h.color;
      c.shadowColor = h.color;
      c.shadowBlur = this.reduced ? 0 : 10;
      c.fillRect(-h.halfW, -h.halfH, h.halfW * 2, h.halfH * 2);
      c.shadowBlur = 0;
      c.fillStyle = "#fff6";
      c.fillRect(-h.halfW, -h.halfH, h.halfW * 2, 2);
    }
  }
  drawCircle(c, h, warning) {
    c.strokeStyle = h.color;
    c.fillStyle = h.color;
    if (warning) {
      const x = Math.max(16, Math.min(WIDTH - 16, h.x)),
        y = Math.max(16, Math.min(HEIGHT - 16, h.y)),
        len = Math.hypot(h.vx, h.vy) || 1,
        n = { x: h.vx / len, y: h.vy / len },
        t = tangent(n);
      if (h.aimed && h.target) {
        c.strokeStyle = h.color;
        c.globalAlpha = 0.18;
        c.lineWidth = 1;
        c.setLineDash([5, 8]);
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(h.target.x, h.target.y);
        c.stroke();
        c.setLineDash([]);
        c.beginPath();
        c.arc(h.target.x, h.target.y, 12, 0, Math.PI * 2);
        c.stroke();
      }
      if (h.orbit && h.cue) {
        c.globalAlpha = 0.14;
        c.beginPath();
        c.arc(h.orbit.cx, h.orbit.cy, h.orbit.radius, 0, Math.PI * 2);
        c.stroke();
      }
      c.globalAlpha = 0.45 + (0.45 * h.age) / h.warning;
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(x, y, 15, 0, Math.PI * 2);
      c.stroke();
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x - n.x * 7, y - n.y * 7);
      c.lineTo(x + n.x * 8, y + n.y * 8);
      c.moveTo(x + n.x * 3 - t.x * 5, y + n.y * 3 - t.y * 5);
      c.lineTo(x + n.x * 8, y + n.y * 8);
      c.lineTo(x + n.x * 3 + t.x * 5, y + n.y * 3 + t.y * 5);
      c.stroke();
    } else {
      c.shadowColor = h.color;
      c.shadowBlur = this.reduced ? 0 : 12;
      c.globalAlpha = 0.22;
      c.beginPath();
      c.moveTo(h.x, h.y);
      c.lineTo(h.x - h.vx * 0.15, h.y - h.vy * 0.15);
      c.lineWidth = h.r;
      c.stroke();
      c.globalAlpha = h.boundedLifetime
        ? Math.min(1, (h.life - h.age) / (0.25 * PATTERN_TEMPO))
        : 1;
      c.beginPath();
      c.arc(h.x, h.y, h.r, 0, Math.PI * 2);
      c.fill();
      c.shadowBlur = 0;
      c.fillStyle = "#fff6";
      c.beginPath();
      c.arc(h.x - 2, h.y - 2, h.r * 0.35, 0, Math.PI * 2);
      c.fill();
    }
  }
  drawZone(c, h, warning) {
    const p = warning ? h.age / h.warning : 1,
      fade = Math.min(1, (h.life - h.age) / (0.25 * PATTERN_TEMPO));
    c.fillStyle = h.color;
    c.strokeStyle = h.color;
    c.lineWidth = 2;
    c.globalAlpha = (warning ? 0.1 : 0.6) * fade;
    c.beginPath();
    c.arc(h.x, h.y, h.r, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 0.9 * fade;
    c.setLineDash(warning ? [7, 6] : []);
    c.stroke();
    c.setLineDash([]);
    if (warning) {
      c.lineWidth = 4;
      c.beginPath();
      c.arc(h.x, h.y, h.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
      c.stroke();
      c.globalAlpha = 0.25;
      c.beginPath();
      c.arc(h.x, h.y, h.r * p, 0, Math.PI * 2);
      c.fill();
    }
  }
  drawCrusher(c, h, warning) {
    const fade = Math.min(1, (h.life - h.age) / (0.25 * PATTERN_TEMPO));
    c.save();
    c.translate(h.x, h.y);
    c.rotate(h.angle);
    c.fillStyle = h.color;
    c.strokeStyle = h.color;
    c.globalAlpha = (warning ? 0.35 : 0.9) * fade;
    c.lineWidth = 2;
    c.setLineDash(warning ? [7, 5] : []);
    c.fillRect(-h.halfW, -h.halfH, h.halfW * 2, h.halfH * 2);
    c.strokeRect(-h.halfW, -h.halfH, h.halfW * 2, h.halfH * 2);
    c.restore();
    if (h.cue && warning) {
      const { x, y, n } = h.escape,
        t = tangent(n);
      c.strokeStyle = h.color;
      c.lineWidth = 4;
      c.globalAlpha = 0.9;
      c.beginPath();
      c.moveTo(x - n.x * 15, y - n.y * 15);
      c.lineTo(x + n.x * 15, y + n.y * 15);
      c.moveTo(x + n.x * 5 - t.x * 10, y + n.y * 5 - t.y * 10);
      c.lineTo(x + n.x * 15, y + n.y * 15);
      c.lineTo(x + n.x * 5 + t.x * 10, y + n.y * 5 + t.y * 10);
      c.stroke();
    }
  }
  draw(game, clock, destination = null) {
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
    const glow = c.createRadialGradient(
      WIDTH / 2,
      HEIGHT / 2,
      0,
      WIDTH / 2,
      HEIGHT / 2,
      WIDTH * 0.6,
    );
    const target =
      PATTERNS[game.preview ? game.nextPattern : game.pattern].color;
    this.tint = this.tint.map(
      (value, i) =>
        value +
        (parseInt(target.slice(1 + i * 2, 3 + i * 2), 16) - value) * 0.045,
    );
    glow.addColorStop(0, `rgba(${this.tint.join(",")},.065)`);
    glow.addColorStop(1, `rgba(${this.tint.join(",")},0)`);
    c.fillStyle = glow;
    c.fillRect(0, 0, WIDTH, HEIGHT);
    for (const h of game.hazards) {
      c.save();
      const warning = h.age < h.warning;
      if (h.kind === "laser") this.drawLaser(c, h, warning);
      else if (h.kind === "wall") this.drawWall(c, h, warning);
      else if (h.kind === "zone") this.drawZone(c, h, warning);
      else if (h.kind === "crusher") this.drawCrusher(c, h, warning);
      else this.drawCircle(c, h, warning);
      c.restore();
    }
    if (destination && game.state === "playing") {
      c.save();
      c.strokeStyle = "#89f9c4";
      c.globalAlpha = 0.55;
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(destination.x, destination.y, 9, 0, Math.PI * 2);
      c.moveTo(destination.x - 13, destination.y);
      c.lineTo(destination.x - 5, destination.y);
      c.moveTo(destination.x + 5, destination.y);
      c.lineTo(destination.x + 13, destination.y);
      c.moveTo(destination.x, destination.y - 13);
      c.lineTo(destination.x, destination.y - 5);
      c.moveTo(destination.x, destination.y + 5);
      c.lineTo(destination.x, destination.y + 13);
      c.stroke();
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
