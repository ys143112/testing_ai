import { clamp } from "./collision.js";
export const WIDTH = 600,
  HEIGHT = 640;
export const PATTERN_DURATION = 5;
export const PATTERN_TEMPO = 2;
export const PATTERNS = [
  { name: "유성우", hint: "흐름 사이를 가로지르세요", color: "#ff718c" },
  { name: "틈새 비행", hint: "열린 통로를 찾으세요", color: "#ffbc77" },
  { name: "경계선", hint: "점선에서 벗어나세요", color: "#c39cff" },
  { name: "파동", hint: "퍼지는 탄 사이를 통과하세요", color: "#ff83ba" },
];
export function difficulty(time) {
  return 1 + 1.35 * (1 - Math.exp((-time * PATTERN_TEMPO) / 100));
}
// Each wave is bounded. Gates always leave a traversable opening; lasers have a
// fixed warning; edge emitters announce themselves before releasing a fan.
function populateWave(game) {
  const { random: r, pattern, time, player: p } = game;
  const route = game.route || { x: 0.5, y: 0.5 };
  const d = difficulty(time),
    hazards = game.hazards;
  if (pattern === 0) {
    const gap = clamp(
      Math.round(route.x * 5 + Math.sin(game.wave * 0.7) * 0.8),
      1,
      4,
    );
    const drift = (Math.floor(game.wave / 2) % 2 === 0 ? 1 : -1) * 32;
    for (let i = 0; i < 6; i++) {
      if (i === gap || (i + 1) % 6 === gap || hazards.length >= 100) continue;
      const x = i * 100 + 25 + r() * 45;
      hazards.push({
        kind: "circle",
        x,
        y: -24,
        r: 9 + r() * 5,
        vx: drift + (r() - 0.5) * 12,
        vy: 105 + d * 30,
        age: 0,
        warning: 0.55,
        life: 7,
        color: PATTERNS[0].color,
      });
    }
    return 1.2 / Math.sqrt(d);
  }
  if (pattern === 1) {
    // A sequence shares its travel axis and bends its gap gradually. Rotate
    // the axis on the next cycle instead of crossing walls unpredictably.
    const horizontal = Math.floor(game.stage / 4) % 2 === 0;
    const gap = 176 - 16 * (d - 1),
      range = horizontal ? WIDTH : HEIGHT;
    const center =
        range *
        clamp(
          (horizontal ? route.x : route.y) + Math.sin(game.wave * 0.65) * 0.11,
          0.25,
          0.75,
        ),
      speed = 120 + 24 * d;
    if (horizontal) {
      hazards.push(
        {
          kind: "rect",
          x: 0,
          y: -26,
          w: center - gap / 2,
          h: 17,
          vx: 0,
          vy: speed,
          age: 0,
          warning: 0.65,
          life: 8,
          color: PATTERNS[1].color,
        },
        {
          kind: "rect",
          x: center + gap / 2,
          y: -26,
          w: WIDTH - center - gap / 2,
          h: 17,
          vx: 0,
          vy: speed,
          age: 0,
          warning: 0.65,
          life: 8,
          color: PATTERNS[1].color,
        },
      );
    } else {
      hazards.push(
        {
          kind: "rect",
          x: -26,
          y: 0,
          w: 17,
          h: center - gap / 2,
          vx: speed,
          vy: 0,
          age: 0,
          warning: 0.65,
          life: 8,
          color: PATTERNS[1].color,
        },
        {
          kind: "rect",
          x: -26,
          y: center + gap / 2,
          w: 17,
          h: HEIGHT - center - gap / 2,
          vx: speed,
          vy: 0,
          age: 0,
          warning: 0.65,
          life: 8,
          color: PATTERNS[1].color,
        },
      );
    }
    return 2.3 / Math.sqrt(d);
  }
  if (pattern === 2) {
    const vertical = game.wave % 2 === 0,
      size = 39 + 6 * d;
    const target = vertical ? p.x : p.y;
    hazards.push({
      kind: "laser",
      x: vertical ? target - size / 2 : 0,
      y: vertical ? 0 : target - size / 2,
      w: vertical ? size : WIDTH,
      h: vertical ? HEIGHT : size,
      vx: 0,
      vy: 0,
      age: 0,
      warning: 1.05,
      life: 1.65,
      color: PATTERNS[2].color,
    });
    // A second line challenges later cycles, with the same generous warning.
    if (time * PATTERN_TEMPO >= 60) {
      const offset = (vertical ? WIDTH : HEIGHT) * 0.35;
      const t = (target + offset) % (vertical ? WIDTH : HEIGHT);
      hazards.push({
        kind: "laser",
        x: vertical ? t - size / 2 : 0,
        y: vertical ? 0 : t - size / 2,
        w: vertical ? size : WIDTH,
        h: vertical ? HEIGHT : size,
        vx: 0,
        vy: 0,
        age: 0,
        warning: 1.05,
        life: 1.65,
        color: PATTERNS[2].color,
      });
    }
    return (game.wave % 2 === 0 ? 1.45 : 1.95) / Math.sqrt(d);
  }
  const left = game.wave % 2 === 0,
    x = left ? 0 : WIDTH,
    y = HEIGHT * clamp(route.y + Math.sin(game.wave * 0.8) * 0.18, 0.2, 0.8);
  const direction = Math.atan2(HEIGHT / 2 - y, left ? WIDTH : -WIDTH),
    count = 7 + Math.floor(d),
    speed = 105 + 30 * d;
  for (let i = 0; i < count; i++) {
    if (i === Math.floor(count / 2)) continue;
    const angle =
      direction + (i - (count - 1) / 2) * 0.22 + Math.sin(game.wave) * 0.04;
    hazards.push({
      kind: "circle",
      x,
      y,
      r: 8,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      age: 0,
      warning: 0.85,
      life: 7,
      color: PATTERNS[3].color,
    });
  }
  return 2.1 / Math.sqrt(d);
}

// Seconds in the original pattern clock until the entire shape (and trail)
// leaves the arena. Unlike a fixed TTL, this never removes moving bullets
// midway through their visible path.
export function clearanceTime(h) {
  if (h.kind === "laser") return h.life;
  const margin = 24;
  const right = h.kind === "circle" ? h.r : 0;
  const left = h.kind === "circle" ? h.r : h.w;
  const bottom = h.kind === "circle" ? h.r : 0;
  const top = h.kind === "circle" ? h.r : h.h;
  const exits = [];
  if (h.vx > 0) exits.push((WIDTH + right + margin - h.x) / h.vx);
  if (h.vx < 0) exits.push((h.x + left + margin) / -h.vx);
  if (h.vy > 0) exits.push((HEIGHT + bottom + margin - h.y) / h.vy);
  if (h.vy < 0) exits.push((h.y + top + margin) / -h.vy);
  return h.warning + Math.min(...exits);
}
export function spawnWave(game) {
  const pending = [];
  const interval = populateWave({ ...game, hazards: pending }) / PATTERN_TEMPO;
  // Five full seconds of launches, followed by natural clearance. Keep the
  // final wave complete instead of truncating its path to fit a deadline.
  if (game.stageTime >= PATTERN_DURATION) return Infinity;
  for (const h of pending) h.life = clearanceTime(h);
  game.hazards.push(...pending);
  return interval;
}
