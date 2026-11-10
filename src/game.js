import { clamp, collides } from "./collision.js";
import {
  WIDTH,
  HEIGHT,
  PATTERN_DURATION,
  PATTERN_TEMPO,
  spawnWave,
} from "./patterns.js";
export const PLAYER_SPEED = 250;
export class Game {
  constructor({ random = Math.random, onEvent = () => {} } = {}) {
    this.random = random;
    this.onEvent = onEvent;
    this.state = "ready";
    this.reset();
  }
  reset() {
    this.time = 0;
    this.stage = 0;
    this.stageTime = 0;
    this.pattern = 0;
    this.wave = 0;
    this.spawnIn = 2;
    this.hazards = [];
    this.particles = [];
    this.nearMisses = 0;
    this.player = { x: WIDTH / 2, y: HEIGHT * 0.64, r: 7 };
    this.trail = [];
    this.flash = 0;
  }
  start() {
    this.reset();
    this.state = "playing";
    this.onEvent("start");
  }
  pause() {
    if (this.state === "playing") {
      this.state = "paused";
      this.onEvent("pause");
    }
  }
  resume() {
    if (this.state === "paused") {
      this.state = "playing";
      this.onEvent("resume");
    }
  }
  end() {
    if (this.state !== "playing") return;
    this.state = "over";
    this.burst(this.player.x, this.player.y, "#89f9c4", 22);
    this.flash = 0.28;
    this.onEvent("over");
  }
  burst(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
      const a = this.random() * Math.PI * 2,
        s = 25 + this.random() * 100;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.55,
        maxLife: 0.55,
        color,
      });
    }
    if (this.particles.length > 120)
      this.particles.splice(0, this.particles.length - 120);
  }
  update(dt, input = { x: 0, y: 0 }) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    // Bound each physics step to prevent tunneling even for slow frames.
    let remaining = Math.min(dt, 0.1);
    while (remaining > 1e-8) {
      const step = Math.min(remaining, 1 / 120);
      this.step(step, input);
      remaining -= step;
    }
  }
  step(dt, input) {
    if (this.state === "paused" || this.state === "ready") return;
    this.flash = Math.max(0, this.flash - dt);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.state !== "playing") return;
    this.time += dt;
    this.stageTime += dt;
    // Never cut off a live wave. Normal waves are budgeted to clear before 5s;
    // this guard also handles delayed cleanup without overlapping patterns.
    if (
      this.stageTime + 1e-8 >= PATTERN_DURATION &&
      this.hazards.length === 0
    ) {
      this.stage++;
      this.stageTime = 0;
      this.pattern = this.stage % 4;
      this.spawnIn = 0;
      this.wave = 0;
      this.burst(this.player.x, this.player.y, "#89f9c4", 12);
      this.onEvent("stage");
    }
    const p = this.player;
    let dx = Number.isFinite(input.x) ? input.x : 0,
      dy = Number.isFinite(input.y) ? input.y : 0;
    if (input.target) {
      dx = input.target.x - p.x;
      dy = input.target.y - p.y;
      const len = Math.hypot(dx, dy);
      if (len) {
        const distance = Math.min(len, PLAYER_SPEED * dt);
        dx = (dx / len) * distance;
        dy = (dy / len) * distance;
      }
    } else {
      const len = Math.hypot(dx, dy);
      if (len) {
        dx = (dx / len) * PLAYER_SPEED * dt;
        dy = (dy / len) * PLAYER_SPEED * dt;
      }
    }
    p.x = clamp(p.x + dx, p.r + 5, WIDTH - p.r - 5);
    p.y = clamp(p.y + dy, p.r + 5, HEIGHT - p.r - 5);
    this.trail.push({ x: p.x, y: p.y });
    if (this.trail.length > 18) this.trail.shift();
    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.stageTime < PATTERN_DURATION) {
      this.spawnIn = spawnWave(this);
      this.wave++;
    }
    for (const h of this.hazards) {
      h.age += dt * PATTERN_TEMPO;
      if (h.age < h.warning) continue;
      h.x += h.vx * dt * PATTERN_TEMPO;
      h.y += h.vy * dt * PATTERN_TEMPO;
    }
    for (const h of this.hazards) {
      if (h.age < h.warning || h.age >= h.life) continue;
      if (collides(p, h)) {
        this.end();
        break;
      }
      if (!h.grazed && collides(p, h, 14)) {
        h.grazed = true;
        this.nearMisses++;
        this.burst(p.x, p.y, "#89f9c4", 4);
        this.onEvent("graze");
      }
    }
    this.hazards = this.hazards.filter((h) => h.age < h.life);
  }
}
