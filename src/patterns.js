import {
  DIRECTIONS,
  tangent,
  support,
  project,
  entryPoint,
  safePolygon,
  closestPoint,
} from "./geometry.js";
import { clamp } from "./collision.js";
export const WIDTH = 600,
  HEIGHT = 600;
export const PATTERN_DURATION = 5,
  PATTERN_TEMPO = 1.5;
export const PATTERNS = [
  {
    name: "유성우",
    hint: "예고된 방향을 보고 흐름을 피하세요",
    color: "#ff718c",
  },
  {
    name: "틈새 비행",
    hint: "방향이 바뀌어도 열린 공간을 이으세요",
    color: "#ffbc77",
  },
  { name: "경계선", hint: "점선에서 벗어나세요", color: "#c39cff" },
  { name: "파동", hint: "퍼지는 탄 사이를 통과하세요", color: "#ff83ba" },
];
export function difficulty(time) {
  return 1 + 1.35 * (1 - Math.exp((-time * PATTERN_TEMPO) / 100));
}
export const cycleLevel = (stage) => Math.min(3, Math.floor(stage / 4));
export const LASER_MIN_WARNING = 1.05;
// Continuous small increments. Stage 5 no longer switches several rules on at once.
export function stageTuning(stage) {
  const progress = 1 - Math.exp(-Math.max(0, stage) / 18);
  return {
    speedScale: 1 + progress * 0.12,
    cadence: 1 + progress * 0.12,
    gateClearance: 92 - progress * 16,
    singleLaneEvery: stage >= 24 ? 3 : stage >= 16 ? 4 : Infinity,
    crossfireEvery:
      stage >= 20 ? 4 : stage >= 12 ? 5 : stage >= 8 ? 6 : Infinity,
    crossfireCount: stage >= 12 ? 2 : 1,
  };
}
export function createPatternPlan(random, route) {
  return {
    edges: [],
    flowStart: Math.floor(random() * 8),
    flowTurn: random() < 0.5 ? -1 : 1,
    gateAnchor: null,
    gateGoal: { x: 130 + random() * 340, y: 130 + random() * 340 },
    laserAngles: [],
    lastLaserAngle: null,
    lastEdge: null,
    rainLanes: {
      x: clamp(Math.round(route.x * 5), 1, 4),
      y: clamp(Math.round(route.y * 5), 1, 4),
    },
    rainDirection: random() < 0.5 ? -1 : 1,
    gateCenters: { x: null, y: null },
    gateTimes: { x: null, y: null },
    gateDirections: { x: random() < 0.5 ? -1 : 1, y: random() < 0.5 ? -1 : 1 },
    laserVertical: random() < 0.5,
    laserRepeats: 0,
    fanLeft: random() < 0.5,
    fanPhase: random() * Math.PI * 2,
    fanAmplitude: 0.12 + random() * 0.1,
  };
}
function nextEdge(plan, random) {
  if (!plan.edges.length) {
    const groups = [
      [0, 2, 4, 6],
      [1, 3, 5, 7],
    ];
    for (const group of groups)
      for (let i = 3; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [group[i], group[j]] = [group[j], group[i]];
      }
    const first = random() < 0.5 ? 0 : 1;
    plan.edges = Array.from(
      { length: 8 },
      (_, i) => groups[(i + first) % 2][Math.floor(i / 2)],
    );
    if (plan.edges[0] === plan.lastEdge)
      [plan.edges[0], plan.edges[1]] = [plan.edges[1], plan.edges[0]];
  }
  return (plan.lastEdge = plan.edges.shift());
}
function source(edge, across, margin = 24) {
  return entryPoint(edge, across - WIDTH / 2, margin);
}
function addCrossfire(game, edge, count) {
  const { random: r, player: p, hazards } = game;
  const across = clamp(
    project(p, tangent(DIRECTIONS[edge])) + WIDTH / 2 + (r() - 0.5) * 150,
    65,
    WIDTH - 65,
  );
  const { x, y } = source(edge, across),
    aim = Math.atan2(p.y - y, p.x - x),
    speed = 110 + 20 * difficulty(game.time);
  for (let i = 0; i < count; i++) {
    const angle = aim + (i - (count - 1) / 2) * 0.26;
    hazards.push({
      kind: "circle",
      x,
      y,
      r: 6,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      age: 0,
      warning: 1.8,
      life: 8,
      color: PATTERNS[game.pattern].color,
      entry: edge,
      crossfire: true,
    });
  }
}
function rain(game, tuning) {
  const { random: r, plan, hazards } = game,
    d = difficulty(game.time),
    edge =
      game.stage >= 4 && Math.floor(game.stage / 4) % 3 === 1
        ? (plan.flowStart + game.wave * plan.flowTurn + 80) % 8
        : nextEdge(plan, r),
    n = DIRECTIONS[edge],
    t = tangent(n),
    axis = edge % 4,
    laneKey =
      edge % 2 ? "diagonal" + axis : edge === 0 || edge === 4 ? "x" : "y";
  if (plan.rainLanes[laneKey] === undefined)
    plan.rainLanes[laneKey] = clamp(
      Math.round((project(game.player, t) / support(t) + 1) * 2.5),
      1,
      4,
    );
  if (game.wave > 0 && r() < 0.25)
    plan.rainLanes[laneKey] = clamp(
      plan.rainLanes[laneKey] + (r() < 0.5 ? -1 : 1),
      1,
      4,
    );
  if (game.wave > 0 && r() < 0.25) plan.rainDirection *= -1;
  const gap = plan.rainLanes[laneKey],
    single = (game.wave + 1) % tuning.singleLaneEvery === 0;
  const speed =
    ((105 + d * 30) * (0.96 + r() * 0.08) * tuning.speedScale * support(n)) /
    (WIDTH / 2);
  const drift = plan.rainDirection * (15 + r() * 10);
  for (let i = 0; i < 6; i++) {
    if (i === gap || (!single && (i + 1) % 6 === gap)) continue;
    const across = (((i + 0.25 + r() * 0.45) / 6) * 2 - 1) * support(t),
      { x, y } = entryPoint(edge, across),
      sideways = drift + (r() - 0.5) * 8;
    hazards.push({
      kind: "circle",
      x,
      y,
      r: 9 + r() * 4,
      vx: n.x * speed + t.x * sideways,
      vy: n.y * speed + t.y * sideways,
      age: 0,
      warning: 1.3,
      life: 8,
      color: PATTERNS[0].color,
      entry: edge,
    });
  }
  if ((game.wave + 1) % tuning.crossfireEvery === 0)
    addCrossfire(game, (edge + 2) % 8, tuning.crossfireCount);
  return Math.max(
    0.82,
    ((1.2 / Math.sqrt(d)) * (0.94 + r() * 0.12)) / tuning.cadence,
  );
}
function gates(game, tuning) {
  const { random: r, plan, hazards, player: p } = game,
    d = difficulty(game.time),
    edge = nextEdge(plan, r),
    n = DIRECTIONS[edge],
    t = tangent(n);
  const gap = Math.max(
    164,
    202 - (d - 1) * 8 - r() * 16 - (tuning.speedScale - 1) * 120,
  );
  const interval = Math.max(
    1.8,
    ((2.45 / Math.sqrt(d)) * (0.95 + r() * 0.1)) / tuning.cadence,
  );
  const radius = tuning.gateClearance / 2;
  const poly = safePolygon(game.liveHazards || [], radius);
  let anchor = plan.gateAnchor || { x: p.x, y: p.y };
  if (game.stage >= 5 && game.wave)
    plan.gateGoal = {
      x: WIDTH / 2 + 140 * Math.cos(plan.fanPhase + game.wave * 0.65),
      y: HEIGHT / 2 + 140 * Math.sin(plan.fanPhase + game.wave * 0.65),
    };
  if (game.wave) {
    const dx = plan.gateGoal.x - anchor.x,
      dy = plan.gateGoal.y - anchor.y,
      len = Math.hypot(dx, dy);
    if (len < 30) plan.gateGoal = { x: 110 + r() * 380, y: 110 + r() * 380 };
    else {
      const step = Math.min(65, len);
      anchor = {
        x: anchor.x + (dx / len) * step,
        y: anchor.y + (dy / len) * step,
      };
    }
  }
  anchor = closestPoint(anchor, poly);
  plan.gateAnchor = anchor;
  const span = support(t) + 30,
    center = project(anchor, t),
    lo = center - gap / 2,
    hi = center + gap / 2;
  const speed = ((120 + 24 * d) * tuning.speedScale * support(n)) / (WIDTH / 2);
  const plane = -support(n) - 26,
    angle = Math.atan2(t.y, t.x);
  for (const [a, b] of [
    [-span, lo],
    [hi, span],
  ]) {
    const across = (a + b) / 2;
    hazards.push({
      kind: "wall",
      x: WIDTH / 2 + n.x * plane + t.x * across,
      y: HEIGHT / 2 + n.y * plane + t.y * across,
      halfW: (b - a) / 2,
      halfH: 8.5,
      angle,
      vx: n.x * speed,
      vy: n.y * speed,
      age: 0,
      warning: PATTERN_TEMPO,
      life: 8,
      color: PATTERNS[1].color,
      entry: edge,
      gateAxis: edge % 4,
      gateNormal: n,
      gateTangent: t,
      openLo: lo,
      openHi: hi,
      cue: a === -span,
    });
  }
  if (game.stage >= 13 && (game.wave + 1) % tuning.crossfireEvery === 0)
    addCrossfire(game, (edge + 2) % 8, 1);
  return interval;
}
function lasers(game) {
  const { random: r, plan, player: p, hazards } = game,
    d = difficulty(game.time);
  if (!plan.laserAngles.length) {
    plan.laserAngles = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [plan.laserAngles[i], plan.laserAngles[j]] = [
        plan.laserAngles[j],
        plan.laserAngles[i],
      ];
    }
    if (plan.laserAngles[0] === plan.lastLaserAngle)
      [plan.laserAngles[0], plan.laserAngles[1]] = [
        plan.laserAngles[1],
        plan.laserAngles[0],
      ];
  }
  const index = plan.laserAngles.shift();
  plan.lastLaserAngle = index;
  const size = 82 + r() * 18 + (d - 1) * 6,
    warningSeconds = LASER_MIN_WARNING + r() * 0.15,
    activeSeconds = 0.3 + r() * 0.06;
  hazards.push({
    kind: "laser",
    x: p.x,
    y: p.y,
    halfW: WIDTH * Math.SQRT2,
    halfH: size / 2,
    angle: (index * Math.PI) / 4,
    vx: 0,
    vy: 0,
    age: 0,
    warning: warningSeconds * PATTERN_TEMPO,
    life: (warningSeconds + activeSeconds) * PATTERN_TEMPO,
    color: PATTERNS[2].color,
    target: { x: p.x, y: p.y },
  });
  return (warningSeconds + activeSeconds + 0.22 + r() * 0.12) * PATTERN_TEMPO;
}
function fan(game, tuning) {
  const { random: r, plan, route, player: p, hazards } = game,
    d = difficulty(game.time);
  const edge =
      game.stage >= 7 && game.wave % 2 === 1
        ? (plan.lastEdge + 4) % 8
        : nextEdge(plan, r),
    n = DIRECTIONS[edge],
    t = tangent(n);
  const across =
    project({ x: WIDTH * route.x, y: HEIGHT * route.y }, t) +
    Math.sin(plan.fanPhase + game.wave * 0.8) * WIDTH * plan.fanAmplitude;
  const { x, y } = entryPoint(
    edge,
    clamp(across, -support(t) * 0.7, support(t) * 0.7),
    12,
  );
  const direction = Math.atan2(HEIGHT / 2 - y, WIDTH / 2 - x),
    count = 7 + Math.floor(d),
    speed = (105 + 30 * d) * (0.94 + r() * 0.12) * tuning.speedScale;
  const gapIndex = clamp(
      Math.floor(count / 2) + Math.floor(r() * 3) - 1,
      1,
      count - 2,
    ),
    spread = 0.2 + r() * 0.04;
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
      life: 8,
      color: PATTERNS[3].color,
      entry: edge,
    });
  }
  return ((2.1 / Math.sqrt(d)) * (0.9 + r() * 0.2)) / tuning.cadence;
}
export function clearanceTime(h) {
  if (h.kind === "laser") return h.life;
  if (h.kind === "wall")
    return (
      h.warning +
      (support(h.gateNormal) + h.halfH + 24 - project(h, h.gateNormal)) /
        Math.hypot(h.vx, h.vy)
    );
  const margin = 24,
    right = h.kind === "circle" ? h.r : 0,
    left = h.kind === "circle" ? h.r : h.w,
    bottom = h.kind === "circle" ? h.r : 0,
    top = h.kind === "circle" ? h.r : h.h,
    exits = [];
  if (h.vx > 0) exits.push((WIDTH + right + margin - h.x) / h.vx);
  if (h.vx < 0) exits.push((h.x + left + margin) / -h.vx);
  if (h.vy > 0) exits.push((HEIGHT + bottom + margin - h.y) / h.vy);
  if (h.vy < 0) exits.push((h.y + top + margin) / -h.vy);
  return h.warning + Math.min(...exits);
}
export function spawnWave(game) {
  if (game.stageTime >= PATTERN_DURATION) return Infinity;
  const pending = [],
    context = { ...game, liveHazards: game.hazards, hazards: pending },
    tuning = stageTuning(game.stage);
  const interval =
    [rain, gates, lasers, fan][game.pattern](context, tuning) / PATTERN_TEMPO;
  for (const h of pending) h.life = clearanceTime(h);
  game.hazards.push(...pending);
  return interval;
}
