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
// One plan per stage, plus bounded variation within each wave. Injected random
// keeps every run different while allowing seeded balance regression tests.
export function createPatternPlan(random, route) {
  return {
    rainLane: clamp(Math.round(route.x * 5), 1, 4),
    rainDirection: random() < 0.5 ? -1 : 1,
    gateHorizontal: random() < 0.5,
    gateReverse: random() < 0.5,
    gateDirection: random() < 0.5 ? -1 : 1,
    gateCenter: null,
    laserVertical: random() < 0.5,
    laserRepeats: 0,
    fanLeft: random() < 0.5,
    fanPhase: random() * Math.PI * 2,
    fanAmplitude: 0.12 + random() * 0.1,
  };
}
export const LASER_MIN_WARNING = 0.9;
function populateWave(game) {
  const { random: r, pattern, time, player: p } = game;
  const route = game.route || { x: 0.5, y: 0.5 };
  const plan = game.plan;
  const d = difficulty(time),
    hazards = game.hazards;
  if (pattern === 0) {
    if (game.wave > 0 && r() < 0.45)
      plan.rainLane = clamp(plan.rainLane + (r() < 0.5 ? -1 : 1), 1, 4);
    if (game.wave > 0 && r() < 0.3) plan.rainDirection *= -1;
    const gap = plan.rainLane;
    const drift = plan.rainDirection * (22 + r() * 18);
    const fallSpeed = (105 + d * 30) * (0.94 + r() * 0.12);
    for (let i = 0; i < 6; i++) {
      if (i === gap || (i + 1) % 6 === gap || hazards.length >= 100) continue;
      const x = i * 100 + 25 + r() * 45;
      hazards.push({
        kind: "circle",
        x,
        y: -24,
        r: 9 + r() * 5,
        vx: drift + (r() - 0.5) * 12,
        vy: fallSpeed,
        age: 0,
        warning: 0.55,
        life: 7,
        color: PATTERNS[0].color,
      });
    }
    return (1.2 / Math.sqrt(d)) * (0.9 + r() * 0.2);
  }
  if (pattern === 1) {
    // Keep one travel direction for this sequence; randomize the next one.
    // The opening walks to both edges instead of oscillating around the center.
    const horizontal = plan.gateHorizontal;
    const gap = 164 - (d - 1) * 12 - r() * 22;
    const range = horizontal ? WIDTH : HEIGHT;
    const interval = (2.3 / Math.sqrt(d)) * (0.93 + r() * 0.14);
    const margin = gap / 2 + 22;
    if (plan.gateCenter === null)
      plan.gateCenter = range * (horizontal ? route.x : route.y);
    else {
      const spacing = Math.min(
        interval / PATTERN_TEMPO,
        plan.gateInterval ?? Infinity,
      );
      const maxShift = Math.min(145, 250 * spacing * 0.7);
      plan.gateCenter += plan.gateDirection * maxShift * (0.78 + r() * 0.22);
    }
    const center = clamp(plan.gateCenter, margin, range - margin);
    if (center <= margin || center >= range - margin) plan.gateDirection *= -1;
    plan.gateCenter = center;
    plan.gateInterval = interval / PATTERN_TEMPO;
    const speed = (120 + 24 * d) * (plan.gateReverse ? -1 : 1);
    if (horizontal) {
      hazards.push(
        {
          kind: "rect",
          x: 0,
          y: plan.gateReverse ? HEIGHT + 26 : -26,
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
          y: plan.gateReverse ? HEIGHT + 26 : -26,
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
          x: plan.gateReverse ? WIDTH + 26 : -26,
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
          x: plan.gateReverse ? WIDTH + 26 : -26,
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
    return interval;
  }
  if (pattern === 2) {
    // A full real-time warning and a breathing gap between pulses. Never let
    // the global 2x tempo compress reaction time or stack lethal laser waves.
    const vertical =
      game.wave === 0
        ? plan.laserVertical
        : plan.laserRepeats >= 2
          ? !plan.laserVertical
          : r() < 0.5;
    plan.laserRepeats =
      vertical === plan.laserVertical ? plan.laserRepeats + 1 : 1;
    plan.laserVertical = vertical;
    const size = 32 + r() * 14 + (d - 1) * 4;
    const range = vertical ? WIDTH : HEIGHT;
    const aim =
      r() < 0.75 ? (vertical ? p.x : p.y) : range * (0.15 + r() * 0.7);
    const target = clamp(aim, size / 2 + 12, range - size / 2 - 12);
    const warningSeconds = LASER_MIN_WARNING + r() * 0.2;
    const activeSeconds = 0.26 + r() * 0.06;
    hazards.push({
      kind: "laser",
      x: vertical ? target - size / 2 : 0,
      y: vertical ? 0 : target - size / 2,
      w: vertical ? size : WIDTH,
      h: vertical ? HEIGHT : size,
      vx: 0,
      vy: 0,
      age: 0,
      warning: warningSeconds * PATTERN_TEMPO,
      life: (warningSeconds + activeSeconds) * PATTERN_TEMPO,
      color: PATTERNS[2].color,
    });
    return (warningSeconds + activeSeconds + 0.2 + r() * 0.12) * PATTERN_TEMPO;
  }
  const left = game.wave % 2 === 0 ? plan.fanLeft : !plan.fanLeft,
    x = left ? 0 : WIDTH,
    y =
      HEIGHT *
      clamp(
        route.y +
          Math.sin(plan.fanPhase + game.wave * 0.8) * plan.fanAmplitude +
          (r() - 0.5) * 0.08,
        0.16,
        0.84,
      );
  const direction = Math.atan2(HEIGHT / 2 - y, left ? WIDTH : -WIDTH),
    count = 7 + Math.floor(d),
    speed = (105 + 30 * d) * (0.94 + r() * 0.12);
  const gapIndex = clamp(
    Math.floor(count / 2) + Math.floor(r() * 3) - 1,
    1,
    count - 2,
  );
  const spread = 0.2 + r() * 0.04;
  for (let i = 0; i < count; i++) {
    if (i === gapIndex) continue;
    const angle =
      direction +
      (i - (count - 1) / 2) * spread +
      Math.sin(plan.fanPhase + game.wave) * 0.04;
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
  return (2.1 / Math.sqrt(d)) * (0.9 + r() * 0.2);
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
  if (game.stageTime >= PATTERN_DURATION) return Infinity;
  const pending = [];
  const interval = populateWave({ ...game, hazards: pending }) / PATTERN_TEMPO;
  // Five full seconds of launches, followed by natural clearance. Keep the
  // final wave complete instead of truncating its path to fit a deadline.
  for (const h of pending) h.life = clearanceTime(h);
  game.hazards.push(...pending);
  return interval;
}
