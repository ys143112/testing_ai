import {
  DIRECTIONS,
  tangent,
  support,
  project,
  entryPoint,
  safePolygon,
  closestPoint,
  projectionSlice,
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
    family: "flow",
  },
  {
    name: "틈새 비행",
    hint: "방향이 바뀌어도 열린 공간을 이으세요",
    color: "#ffbc77",
    family: "wall",
  },
  {
    name: "경계선",
    hint: "충전선이 모이기 전에 띠를 벗어나세요",
    color: "#c39cff",
    family: "beam",
  },
  {
    name: "파동",
    hint: "조준된 파동에서 옆으로 빠져나가세요",
    color: "#ff83ba",
    family: "flow",
  },
  {
    name: "잔상",
    hint: "발밑의 원이 채워지기 전에 벗어나세요",
    color: "#ff865f",
    family: "zone",
  },
  {
    name: "궤도",
    hint: "도는 탄의 안쪽이나 바깥쪽으로 이동하세요",
    color: "#ffcd6e",
    family: "orbit",
  },
  {
    name: "압축 구역",
    hint: "화살표 쪽으로 상자 밖을 탈출하세요",
    color: "#e491ff",
    family: "wall",
  },
  {
    name: "반사탄",
    hint: "벽에 튕긴 탄의 다음 경로를 보세요",
    color: "#799dff",
    family: "orbit",
  },
];
export function createPatternOrder(random, previous = null, first = false) {
  for (let attempt = 0; attempt < 64; attempt++) {
    const ids = PATTERNS.map((_, i) => i);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    if (first) {
      ids.splice(ids.indexOf(0), 1);
      ids.unshift(0);
    }
    let last = previous,
      valid = true;
    for (const id of ids) {
      if (last !== null && PATTERNS[last].family === PATTERNS[id].family) {
        valid = false;
        break;
      }
      last = id;
    }
    if (valid) return ids;
  }
  const fallback = [0, 1, 3, 4, 5, 2, 7, 6];
  while (
    previous !== null &&
    PATTERNS[fallback[0]].family === PATTERNS[previous].family
  )
    fallback.push(fallback.shift());
  return fallback;
}
export function difficulty(time) {
  return 1 + 1.35 * (1 - Math.exp((-time * PATTERN_TEMPO) / 100));
}
export const cycleLevel = (stage) =>
  Math.min(3, Math.floor(stage / PATTERNS.length));
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
    speed =
      ((110 + 20 * difficulty(game.time)) * support(DIRECTIONS[edge])) /
      (WIDTH / 2);
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
  // Replace one ordinary meteor instead of increasing density. Its fixed ray
  // crosses the player's announced position, so parking in a lane is not enough.
  const targetAcross = project(game.player, t),
    start = entryPoint(edge, targetAcross);
  let aimed = 0,
    best = Infinity;
  hazards.forEach((h, i) => {
    const distance = Math.abs(project(h, t) - targetAcross);
    if (distance < best) {
      best = distance;
      aimed = i;
    }
  });
  hazards[aimed] = {
    ...hazards[aimed],
    ...start,
    r: 10,
    vx: n.x * speed,
    vy: n.y * speed,
    target: { x: game.player.x, y: game.player.y },
    aimed: true,
  };
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
  if (game.wave % 2 === 0) {
    const candidates = [];
    for (const sign of [-1, 1]) {
      const value = project(p, t) + sign * (gap / 2 + 32);
      const region =
        sign > 0
          ? projectionSlice(poly, t, value)
          : projectionSlice(poly, t, -Infinity, value);
      if (region.length) {
        const point = closestPoint(p, region);
        candidates.push({
          point,
          distance: Math.hypot(point.x - p.x, point.y - p.y),
        });
      }
    }
    if (candidates.length)
      anchor = candidates.sort((a, b) => a.distance - b.distance)[0].point;
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
  const direction = Math.atan2(p.y - y, p.x - x),
    count = 7 + Math.floor(d),
    speed =
      ((105 + 30 * d) * (0.94 + r() * 0.12) * tuning.speedScale * support(n)) /
      (WIDTH / 2);
  const gapIndex = clamp(
      Math.floor(count / 2) + Math.floor(r() * 3) - 1,
      1,
      count - 2,
    ),
    spread = 0.2 + r() * 0.04;
  const aimIndex =
    gapIndex === Math.floor(count / 2)
      ? Math.floor(count / 2) - 1
      : Math.floor(count / 2);
  for (let i = 0; i < count; i++) {
    if (i === gapIndex) continue;
    const angle = direction + (i - aimIndex) * spread;
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
      ...(i === aimIndex ? { target: { x: p.x, y: p.y }, aimed: true } : {}),
    });
  }
  return ((2.1 / Math.sqrt(d)) * (0.9 + r() * 0.2)) / tuning.cadence;
}
function marks(game) {
  const { player: p, hazards, random: r } = game;
  hazards.push({
    kind: "zone",
    x: p.x,
    y: p.y,
    r: 42 + r() * 14,
    vx: 0,
    vy: 0,
    age: 0,
    warning: 1.2 * PATTERN_TEMPO,
    life: 2.25 * PATTERN_TEMPO,
    color: PATTERNS[4].color,
    boundedLifetime: true,
    target: { x: p.x, y: p.y },
  });
  return 1.55 * PATTERN_TEMPO;
}
function orbits(game) {
  const { player: p, hazards, random: r } = game;
  let cx = clamp(p.x - 110, 90, 510),
    cy = clamp(p.y - 45, 90, 510);
  if (Math.hypot(p.x - cx, p.y - cy) < 70)
    cx = clamp(p.x + (p.x < 300 ? 120 : -120), 60, 540);
  const radius = Math.hypot(p.x - cx, p.y - cy),
    phase = Math.atan2(p.y - cy, p.x - cx),
    turn = r() < 0.5 ? -1 : 1;
  for (let i = 0; i < 2; i++) {
    const angle = phase + i * Math.PI,
      angular = turn * (0.65 + r() * 0.12);
    hazards.push({
      kind: "circle",
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      r: 10,
      vx: -Math.sin(angle) * radius * angular,
      vy: Math.cos(angle) * radius * angular,
      age: 0,
      warning: 1.15 * PATTERN_TEMPO,
      life: 4.55 * PATTERN_TEMPO,
      color: PATTERNS[5].color,
      orbit: { cx, cy, radius, angle, angular },
      boundedLifetime: true,
      cue: i === 0,
    });
  }
  return 3.5 * PATTERN_TEMPO;
}
function crushers(game) {
  const { player: p, hazards, random: r } = game,
    rotation = r() < 0.5 ? 0 : Math.PI / 4,
    size = 122 + r() * 20,
    speed = 52 + r() * 12;
  const axes = Array.from({ length: 4 }, (_, i) => ({
    x: Math.cos(rotation + (i * Math.PI) / 2),
    y: Math.sin(rotation + (i * Math.PI) / 2),
  }));
  let opening = 0,
    best = -Infinity;
  axes.forEach((n, i) => {
    const score = n.x * (WIDTH / 2 - p.x) + n.y * (HEIGHT / 2 - p.y);
    if (score > best) {
      best = score;
      opening = i;
    }
  });
  for (let i = 0; i < 4; i++) {
    if (i === opening) continue;
    const n = axes[i],
      t = tangent(n);
    hazards.push({
      kind: "crusher",
      x: p.x + n.x * size,
      y: p.y + n.y * size,
      halfW: size,
      halfH: 7,
      angle: Math.atan2(t.y, t.x),
      vx: -n.x * speed,
      vy: -n.y * speed,
      age: 0,
      warning: 1.2 * PATTERN_TEMPO,
      life: 1.2 * PATTERN_TEMPO + (size + 24) / speed,
      color: PATTERNS[6].color,
      boundedLifetime: true,
      escape: {
        x: p.x + axes[opening].x * 65,
        y: p.y + axes[opening].y * 65,
        n: axes[opening],
      },
      cue: hazards.length === 0,
    });
  }
  return 3.4 * PATTERN_TEMPO;
}
function ricochets(game) {
  const { player: p, hazards, plan, random: r } = game,
    edge = nextEdge(plan, r),
    t = tangent(DIRECTIONS[edge]),
    start = entryPoint(edge, project(p, t)),
    angle = Math.atan2(p.y - start.y, p.x - start.x),
    speed = (130 + 15 * difficulty(game.time)) * (0.95 + r() * 0.1);
  hazards.push({
    kind: "circle",
    ...start,
    r: 11,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    age: 0,
    warning: 0.9 * PATTERN_TEMPO,
    life: 5.4 * PATTERN_TEMPO,
    color: PATTERNS[7].color,
    bounce: { remaining: 2, entered: false },
    boundedLifetime: true,
    target: { x: p.x, y: p.y },
    aimed: true,
    entry: edge,
  });
  return 1.7 * PATTERN_TEMPO;
}
export function clearanceTime(h) {
  if (h.kind === "laser" || h.boundedLifetime) return h.life;
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
    [rain, gates, lasers, fan, marks, orbits, crushers, ricochets][
      game.pattern
    ](context, tuning) / PATTERN_TEMPO;
  for (const h of pending) h.life = clearanceTime(h);
  game.hazards.push(...pending);
  return interval;
}
