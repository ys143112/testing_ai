import { clamp } from "./collision.js";
export const WIDTH = 600,
  HEIGHT = 600;
export const PATTERN_DURATION = 5,
  PATTERN_TEMPO = 2;
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
export const LASER_MIN_WARNING = 0.9;
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
    plan.edges = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [plan.edges[i], plan.edges[j]] = [plan.edges[j], plan.edges[i]];
    }
    if (plan.edges[0] === plan.lastEdge)
      [plan.edges[0], plan.edges[1]] = [plan.edges[1], plan.edges[0]];
  }
  return (plan.lastEdge = plan.edges.shift());
}
function source(edge, across, margin = 24) {
  return {
    x: edge === 1 ? WIDTH + margin : edge === 3 ? -margin : across,
    y: edge === 0 ? -margin : edge === 2 ? HEIGHT + margin : across,
  };
}
function addCrossfire(game, edge, count) {
  const { random: r, player: p, hazards } = game;
  const across = clamp(
    (edge % 2 ? p.y : p.x) + (r() - 0.5) * 150,
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
    edge = nextEdge(plan, r),
    axis = edge % 2 ? "y" : "x";
  if (game.wave > 0 && r() < 0.25)
    plan.rainLanes[axis] = clamp(
      plan.rainLanes[axis] + (r() < 0.5 ? -1 : 1),
      1,
      4,
    );
  if (game.wave > 0 && r() < 0.25) plan.rainDirection *= -1;
  const gap = plan.rainLanes[axis],
    single = (game.wave + 1) % tuning.singleLaneEvery === 0;
  const speed = (105 + d * 30) * (0.96 + r() * 0.08) * tuning.speedScale;
  const drift = plan.rainDirection * (15 + r() * 10);
  for (let i = 0; i < 6; i++) {
    if (i === gap || (!single && (i + 1) % 6 === gap)) continue;
    const across = ((i + 0.25 + r() * 0.45) * WIDTH) / 6,
      { x, y } = source(edge, across),
      sideways = drift + (r() - 0.5) * 8;
    hazards.push({
      kind: "circle",
      x,
      y,
      r: 9 + r() * 4,
      vx: edge === 1 ? -speed : edge === 3 ? speed : sideways,
      vy: edge === 0 ? speed : edge === 2 ? -speed : sideways,
      age: 0,
      warning: 1.3,
      life: 8,
      color: PATTERNS[0].color,
      entry: edge,
    });
  }
  if ((game.wave + 1) % tuning.crossfireEvery === 0)
    addCrossfire(game, (edge + 1) % 4, tuning.crossfireCount);
  return Math.max(
    0.82,
    ((1.2 / Math.sqrt(d)) * (0.94 + r() * 0.12)) / tuning.cadence,
  );
}
function gates(game, tuning) {
  const { random: r, plan, hazards, player: p } = game,
    d = difficulty(game.time),
    edge = nextEdge(plan, r);
  const horizontal = edge % 2 === 0,
    axis = horizontal ? "x" : "y",
    span = horizontal ? WIDTH : HEIGHT;
  const gap = Math.max(
    148,
    194 - (d - 1) * 8 - r() * 18 - (tuning.speedScale - 1) * 160,
  );
  const interval = Math.max(
    1.8,
    ((2.45 / Math.sqrt(d)) * (0.95 + r() * 0.1)) / tuning.cadence,
  );
  const margin = gap / 2 + 22;
  let center = plan.gateCenters[axis];
  if (center === null) center = horizontal ? p.x : p.y;
  else {
    const elapsed = Math.max(
      interval / PATTERN_TEMPO,
      game.stageTime - plan.gateTimes[axis],
    );
    center +=
      plan.gateDirections[axis] *
      Math.min(150, 250 * elapsed * 0.45) *
      (0.85 + r() * 0.15);
  }
  center = clamp(center, margin, span - margin);
  // Independent X/Y intersections form a shared safe rectangle, even when
  // perpendicular and opposing walls are simultaneously on screen.
  const live = (game.liveHazards || []).filter((h) => h.gateAxis === axis);
  if (live.length) {
    const lo = Math.max(...live.map((h) => h.openLo)),
      hi = Math.min(...live.map((h) => h.openHi));
    center = clamp(
      center,
      lo + tuning.gateClearance - gap / 2,
      hi - tuning.gateClearance + gap / 2,
    );
  }
  if (center <= margin + 1 || center >= span - margin - 1)
    plan.gateDirections[axis] *= -1;
  plan.gateCenters[axis] = center;
  plan.gateTimes[axis] = game.stageTime;
  const speed = (120 + 24 * d) * tuning.speedScale,
    reverse = edge === 1 || edge === 2;
  const start = source(edge, 0, 26),
    velocity = reverse ? -speed : speed;
  const common = {
    kind: "rect",
    age: 0,
    warning: 1.5,
    life: 8,
    color: PATTERNS[1].color,
    entry: edge,
    gateAxis: axis,
    openLo: center - gap / 2,
    openHi: center + gap / 2,
  };
  if (horizontal) {
    hazards.push(
      {
        ...common,
        x: 0,
        y: start.y,
        w: center - gap / 2,
        h: 17,
        vx: 0,
        vy: velocity,
      },
      {
        ...common,
        x: center + gap / 2,
        y: start.y,
        w: WIDTH - center - gap / 2,
        h: 17,
        vx: 0,
        vy: velocity,
      },
    );
  } else {
    hazards.push(
      {
        ...common,
        x: start.x,
        y: 0,
        w: 17,
        h: center - gap / 2,
        vx: velocity,
        vy: 0,
      },
      {
        ...common,
        x: start.x,
        y: center + gap / 2,
        w: 17,
        h: HEIGHT - center - gap / 2,
        vx: velocity,
        vy: 0,
      },
    );
  }
  // One sparse new layer later in the run, never an extra mirrored wall pair.
  if (game.stage >= 13 && (game.wave + 1) % tuning.crossfireEvery === 0)
    addCrossfire(game, (edge + 1) % 4, 1);
  return interval;
}
function lasers(game) {
  const { random: r, plan, player: p, hazards } = game,
    d = difficulty(game.time);
  const vertical =
    game.wave === 0
      ? plan.laserVertical
      : plan.laserRepeats >= 2
        ? !plan.laserVertical
        : r() < 0.5;
  plan.laserRepeats =
    vertical === plan.laserVertical ? plan.laserRepeats + 1 : 1;
  plan.laserVertical = vertical;
  const size = 32 + r() * 14 + (d - 1) * 4,
    range = vertical ? WIDTH : HEIGHT;
  const aim = r() < 0.75 ? (vertical ? p.x : p.y) : range * (0.15 + r() * 0.7),
    target = clamp(aim, size / 2 + 12, range - size / 2 - 12);
  const warningSeconds = LASER_MIN_WARNING + r() * 0.2,
    activeSeconds = 0.26 + r() * 0.06;
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
function fan(game, tuning) {
  const { random: r, plan, route, player: p, hazards } = game,
    d = difficulty(game.time);
  const left = game.wave % 2 === 0 ? plan.fanLeft : !plan.fanLeft,
    x = left ? 0 : WIDTH;
  const y =
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
    });
  }
  return ((2.1 / Math.sqrt(d)) * (0.9 + r() * 0.2)) / tuning.cadence;
}
export function clearanceTime(h) {
  if (h.kind === "laser") return h.life;
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
