import {
  safePolygon,
  closestPoint,
  project,
  wallOutside,
  support,
} from "../src/geometry.js";
import test from "node:test";
import assert from "node:assert/strict";
import { Game, PLAYER_SPEED } from "../src/game.js";
import { collides, circleRect } from "../src/collision.js";
import {
  spawnWave,
  difficulty,
  PATTERN_DURATION,
  PATTERN_TEMPO,
  LASER_MIN_WARNING,
  cycleLevel,
  stageTuning,
  PATTERNS,
  createPatternOrder,
  WIDTH,
  HEIGHT,
} from "../src/patterns.js";
import {
  readBest,
  saveBest,
  formatTime,
  readSpeed,
  saveSpeed,
} from "../src/storage.js";
function rng(seed = 1) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function advance(g, seconds, input) {
  for (let t = 0; t < seconds - 1e-7; t += 1 / 120) g.update(1 / 120, input);
}
test("circle and rectangle boundaries, including corner misses", () => {
  assert(collides({ x: 0, y: 0, r: 7 }, { kind: "circle", x: 14, y: 0, r: 7 }));
  assert(
    !collides({ x: 0, y: 0, r: 7 }, { kind: "circle", x: 14.1, y: 0, r: 7 }),
  );
  assert(circleRect({ x: 8, y: 5, r: 2 }, { x: 10, y: 0, w: 10, h: 10 }));
  assert(!circleRect({ x: 8, y: -2, r: 2 }, { x: 10, y: 0, w: 10, h: 10 }));
});
test("all inputs share speed, diagonals normalize and target does not teleport", () => {
  for (const input of [
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { target: { x: 590, y: 630 } },
  ]) {
    const g = new Game();
    g.start();
    const p = { ...g.player };
    g.update(0.1, input);
    assert(
      Math.abs(
        Math.hypot(g.player.x - p.x, g.player.y - p.y) - PLAYER_SPEED * 0.1,
      ) < 1e-6,
    );
  }
  const g = new Game();
  g.start();
  g.update(0.1, { target: { x: 301, y: g.player.y } });
  assert.equal(g.player.x, 301);
});
test("player is clamped to arena and long frames bounded", () => {
  const g = new Game();
  g.start();
  g.spawnIn = 100;
  for (let i = 0; i < 30; i++) g.update(0.1, { x: -1, y: -1 });
  assert.equal(g.player.x, 12);
  assert.equal(g.player.y, 12);
  const t = g.time;
  g.update(100, { x: 1 });
  assert(Math.abs(g.time - t - 0.1) < 1e-8);
  g.update(NaN);
  assert(Number.isFinite(g.time));
});
test("collision ends once, warning objects cannot kill, substeps prevent tunneling", () => {
  let count = 0;
  const g = new Game({
    onEvent: (e) => {
      if (e === "over") count++;
    },
  });
  g.start();
  g.hazards = [
    {
      kind: "laser",
      x: 280,
      y: 0,
      w: 40,
      h: HEIGHT,
      vx: 0,
      vy: 0,
      age: 0,
      warning: 1,
      life: 2,
    },
  ];
  advance(g, 0.9 / PATTERN_TEMPO);
  assert.equal(g.state, "playing");
  advance(g, 0.2 / PATTERN_TEMPO);
  assert.equal(g.state, "over");
  g.end();
  assert.equal(count, 1);
  g.start();
  g.hazards = [
    {
      kind: "circle",
      x: 260,
      y: g.player.y,
      r: 8,
      vx: 900,
      vy: 0,
      age: 1,
      warning: 0,
      life: 3,
    },
  ];
  g.update(0.1);
  assert.equal(g.state, "over");
});
test("pause / resume exclude hidden time; restart removes all previous run state", () => {
  const g = new Game();
  g.start();
  advance(g, 1);
  const t = g.time;
  g.pause();
  advance(g, 20);
  assert.equal(g.time, t);
  g.resume();
  advance(g, 0.1);
  assert(g.time > t);
  g.hazards.push({});
  g.particles.push({});
  g.nearMisses = 8;
  g.end();
  g.start();
  assert.equal(g.time, 0);
  assert.equal(g.stage, 0);
  assert.equal(g.hazards.length, 0);
  assert.equal(g.particles.length, 0);
  assert.equal(g.trail.length, 0);
  assert.equal(g.nearMisses, 0);
  assert.equal(g.spawnIn, 2);
});
test("five full seconds of attacks finish naturally, preview and then connect without overlap", () => {
  for (let seed = 1; seed <= 12; seed++) {
    let g,
      stages = 0,
      previews = 0,
      stageStart = 2,
      previousPattern = 0,
      lastWave = 0;
    g = new Game({
      random: rng(seed),
      onEvent: (e) => {
        if (e === "handoff") {
          assert(g.preview, "next pattern must be announced before cleanup");
          previews++;
          assert(g.stageTime >= 5 - 1e-7);
          assert(
            g.wave >= [7, 4, 3, 4, 4, 2, 2, 3][g.pattern],
            `pattern ${g.pattern} must launch enough waves: ${g.wave}`,
          );
          lastWave = g.wave;
        }
        if (e === "stage") {
          assert.equal(g.hazards.length, 0);
          assert(g.time - stageStart >= 5 - 1e-7);
          assert(g.time - stageStart < 10);
          assert.equal(previews, stages + 1);
          assert(lastWave > 0);
          assert.notEqual(
            PATTERNS[g.pattern].family,
            PATTERNS[previousPattern].family,
          );
          previousPattern = g.pattern;
          stageStart = g.time;
          stages++;
        }
      },
    });
    g.start();
    g.end = () => {};
    for (let i = 0; i < 120 * 120; i++) {
      const previous = [...g.hazards];
      g.update(1 / 120);
      previous.forEach((h) => {
        if (!g.hazards.includes(h)) {
          assert(
            h.age >= h.life,
            "a live attack must not disappear at a boundary",
          );
          if (h.kind === "wall")
            assert(wallOutside(h), "oriented wall must fully exit");
          else if (h.kind !== "laser" && !h.boundedLifetime)
            assert(
              h.x + (h.r || h.w) < 0 ||
                h.x - (h.r || 0) > 600 ||
                h.y + (h.r || h.h) < 0 ||
                h.y - (h.r || 0) > HEIGHT,
              "moving hazard must leave naturally",
            );
        }
      });
    }
    assert(stages >= 12);
  }
});
test("late waves still launch, drain stops launches, pause and restart reset handoff", () => {
  const g = new Game();
  g.start();
  g.stageTime = 3.8;
  g.update(1 / 120);
  assert(g.preview);
  assert(!g.handoff);
  g.stageTime = 4.9;
  assert(Number.isFinite(spawnWave(g)));
  assert(g.hazards.length > 0);
  g.stageTime = 5;
  const count = g.hazards.length;
  assert.equal(spawnWave(g), Infinity);
  assert.equal(g.hazards.length, count);
  g.update(0.02);
  assert(g.handoff);
  assert.equal(g.stage, 0);
  g.pause();
  const age = g.hazards[0].age;
  advance(g, 2);
  assert.equal(g.hazards[0].age, age);
  g.start();
  assert(!g.handoff);
  assert.equal(g.stageTime, -2);
});
test("next opening inherits exit lane and previous pattern fully finishes", () => {
  const g = new Game();
  g.start();
  g.stageTime = 5;
  g.handoff = true;
  g.hazards = [];
  g.patternQueue = [1, 2, 3, 4, 5, 6, 7, 0];
  g.player.x = 390;
  g.player.y = 320;
  g.update(1 / 120);
  assert.equal(g.stage, 1);
  assert(Math.abs(g.route.x - 0.65) < 1e-8);
  assert.equal(g.stageTime, 0);
  assert.equal(g.hazards.length, 0);
  g.update(1 / 120);
  const [a, b] = g.hazards;
  const exit = closestPoint(g.player, safePolygon(g.hazards, 14));
  assert(
    Math.hypot(exit.x - g.player.x, exit.y - g.player.y) <=
      PLAYER_SPEED * (a.warning / PATTERN_TEMPO - 0.35),
  );
  assert(
    Math.abs((a.openLo + a.openHi) / 2 - project(g.player, a.gateTangent)) >=
      (a.openHi - a.openLo) / 2 + 30,
  );
  assert(g.hazards.every((h) => h.age < h.warning));
});
test("seeded runs reproduce but fresh runs vary all eight pattern families", () => {
  function trace(seed, pattern) {
    const g = new Game({ random: rng(seed) });
    g.start();
    g.pattern = pattern;
    g.stageTime = 0;
    g.time = 20;
    const result = [];
    for (let i = 0; i < 5; i++) {
      g.wave = i;
      const start = g.hazards.length;
      const interval = spawnWave(g);
      result.push({ interval, hazards: g.hazards.slice(start) });
    }
    return JSON.stringify(result);
  }
  for (let p = 0; p < PATTERNS.length; p++) {
    assert.equal(trace(42, p), trace(42, p));
    const variants = new Set(
      Array.from({ length: 100 }, (_, i) => trace(i + 1, p)),
    );
    assert(variants.size >= 95, `pattern ${p} repeats too often`);
  }
  const g = new Game({ random: rng(4) });
  g.start();
  const plan = JSON.stringify(g.plan);
  g.start();
  assert.notEqual(JSON.stringify(g.plan), plan);
});
test("eight-direction gates preserve wide openings and safe geometry", () => {
  for (let seed = 1; seed <= 100; seed++) {
    const g = new Game({ random: rng(seed) });
    g.start();
    g.pattern = 1;
    g.time = 35;
    g.stageTime = 0;
    const entries = new Set();
    let previous = null;
    for (let w = 0; w < 8; w++) {
      g.wave = w;
      g.hazards = [];
      spawnWave(g);
      const h = g.hazards[0];
      entries.add(h.entry);
      assert.notEqual(h.entry, previous);
      previous = h.entry;
      assert(h.openHi - h.openLo >= 164);
      assert(h.halfW > 0 && h.halfH > 0);
      assert(h.warning / PATTERN_TEMPO >= 1);
      assert(safePolygon(g.hazards, 42).length >= 3);
    }
    assert.equal(entries.size, 8);
  }
});
test("oriented crossing gates can be followed after 350ms reaction", () => {
  for (const stage of [1, 5])
    for (let seed = 1; seed <= 100; seed++) {
      const g = new Game({ random: rng(seed) });
      g.start();
      g.stage = stage;
      g.pattern = 1;
      g.time = 30;
      g.stageTime = 0;
      g.spawnIn = 0;
      let reaction = 1,
        target = null;
      const seen = new Set();
      for (let f = 0; f < 120 * 10 && g.stage === stage; f++) {
        if (g.hazards.some((h) => h.kind === "wall" && !seen.has(h))) {
          g.hazards.forEach((h) => seen.add(h));
          reaction = 0;
        }
        reaction += 1 / 120;
        if (reaction >= 0.35)
          target = closestPoint(g.player, safePolygon(g.hazards, 14));
        g.update(1 / 120, target ? { target } : undefined);
        assert.equal(
          g.state,
          "playing",
          `oriented gates trapped delayed player at stage ${stage}, seed ${seed}`,
        );
      }
    }
});
test("lasers allow a 350ms reaction, maintain warning floor and never stack waves", () => {
  for (let seed = 1; seed <= 100; seed++) {
    const g = new Game({ random: rng(seed) });
    g.start();
    g.pattern = 2;
    g.stage = 2;
    g.stageTime = 0;
    g.spawnIn = 0;
    g.time = seed * 5;
    g.player.x = [12, 300, 588][seed % 3];
    g.player.y = [12, HEIGHT * 0.64, HEIGHT - 12][Math.floor(seed / 3) % 3];
    let laser = null,
      reaction = 0,
      target = null,
      shots = 0;
    for (let f = 0; f < 120 * 8 && g.stage === 2; f++) {
      if (g.hazards[0] !== laser) {
        laser = g.hazards[0];
        reaction = 0;
        target = null;
        if (laser) {
          shots++;
          assert(laser.warning / PATTERN_TEMPO >= LASER_MIN_WARNING);
          assert(laser.warning / PATTERN_TEMPO <= 1.2);
        }
      }
      assert(g.hazards.length <= 1, "laser waves overlap");
      if (laser) {
        reaction += 1 / 120;
        if (reaction >= 0.35 && !target) {
          const candidates = [];
          for (let x = 12; x <= WIDTH - 12; x += 24)
            for (let y = 12; y <= HEIGHT - 12; y += 24) {
              const candidate = { x, y, r: 7 };
              if (!collides(candidate, laser, 16)) candidates.push(candidate);
            }
          target = candidates.sort(
            (a, b) =>
              Math.hypot(a.x - g.player.x, a.y - g.player.y) -
              Math.hypot(b.x - g.player.x, b.y - g.player.y),
          )[0];
          assert(target);
        }
      }
      g.update(1 / 120, target ? { target } : undefined);
      assert.equal(
        g.state,
        "playing",
        `laser unavoidable after normal reaction on seed ${seed}`,
      );
    }
    assert(shots >= 3 && shots <= 4);
  }
});
test("obstacle motion and lifecycle use 1.5 tempo while player and score stay real-time", () => {
  const g = new Game();
  g.start();
  const h = {
    kind: "circle",
    x: 20,
    y: 20,
    r: 8,
    vx: 100,
    vy: 0,
    age: 0,
    warning: 0,
    life: 2,
  };
  g.hazards = [h];
  g.update(0.1, { x: 1 });
  assert(Math.abs(h.x - (20 + 10 * PATTERN_TEMPO)) < 1e-8);
  assert(Math.abs(h.age - 0.1 * PATTERN_TEMPO) < 1e-8);
  assert(Math.abs(g.time - 0.1) < 1e-8);
  assert(Math.abs(g.player.x - 325) < 1e-8);
  const initial = new Game();
  initial.start();
  const interval = spawnWave(initial);
  assert(interval >= 1.12 / PATTERN_TEMPO && interval <= 1.28 / PATTERN_TEMPO);
  assert.equal(PATTERN_TEMPO, 1.5);
});
test("patterns leave gaps, telegraph danger and difficulty converges", () => {
  for (let phase = 0; phase < 4; phase++)
    for (let wave = 0; wave < 20; wave++) {
      const g = new Game({ random: rng(wave + 1) });
      g.start();
      g.pattern = phase;
      g.time = 200;
      g.wave = wave;
      const wait = spawnWave(g);
      assert(wait > 0.25);
      assert(g.hazards.every((h) => h.warning >= 0.5));
      if (phase === 1) {
        const [a, b] = g.hazards;
        const gap = a.openHi - a.openLo;
        assert(gap >= 125);
      }
      if (phase === 2) assert.equal(g.hazards.length, 1);
    }
  assert(difficulty(200) > difficulty(20));
  assert(difficulty(1e6) <= 2.35);
});
test("both patterns mix eight entrances from the first encounter without immediate repeats", () => {
  for (let stage of [0, 1, 4, 5, 8, 9])
    for (let seed = 1; seed <= 100; seed++) {
      const g = new Game({ random: rng(seed) });
      g.start();
      g.stage = stage;
      g.pattern = stage % 4;
      g.time = 30;
      g.stageTime = 0;
      const entries = new Set();
      let previous = null;
      for (let wave = 0; wave < 8; wave++) {
        g.wave = wave;
        g.hazards = [];
        spawnWave(g);
        const primary = g.hazards.filter((h) => !h.crossfire);
        const edge = primary[0].entry;
        assert.notEqual(edge, previous);
        assert(primary.every((h) => h.entry === edge));
        entries.add(edge);
        previous = edge;
      }
      assert.equal(entries.size, 8);
    }
});
test("stage five preserves broad lanes and introduces no bundled difficulty jump", () => {
  function profile(stage) {
    const g = new Game({ random: rng(42) });
    g.start();
    g.stage = stage;
    g.pattern = 0;
    g.time = 30;
    g.stageTime = 0;
    const hazards = [];
    let wave = 0;
    while (g.stageTime < 5) {
      g.wave = wave++;
      g.hazards = [];
      const interval = spawnWave(g);
      hazards.push(...g.hazards);
      assert.equal(g.hazards.filter((h) => !h.crossfire).length, 4);
      g.stageTime += interval;
    }
    return hazards;
  }
  const first = profile(0),
    fifth = profile(4);
  assert(!fifth.some((h) => h.crossfire));
  assert(fifth.length <= first.length * 1.2);
  for (let stage = 0; stage < 100; stage++) {
    const a = stageTuning(stage),
      b = stageTuning(stage + 1);
    assert(b.speedScale >= a.speedScale && b.speedScale - a.speedScale < 0.007);
    assert(b.cadence >= a.cadence && b.cadence - a.cadence < 0.007);
  }
  assert(stageTuning(4).speedScale / stageTuning(3).speedScale < 1.01);
  assert.equal(stageTuning(4).crossfireEvery, Infinity);
  assert.equal(stageTuning(4).singleLaneEvery, Infinity);
  assert(stageTuning(8).crossfireEvery >= 6);
  assert.equal(stageTuning(8).singleLaneEvery, Infinity);
  assert.equal(stageTuning(8).crossfireCount, 1);
  assert(stageTuning(16).singleLaneEvery >= 4);
  assert(
    stageTuning(10000).speedScale <= 1.22 && stageTuning(10000).cadence <= 1.22,
  );
});
test("all eight wall orientations leave a common safe disc through every stage", () => {
  for (const stage of [1, 5, 9, 13, 401])
    for (let seed = 1; seed <= 60; seed++) {
      const g = new Game({ random: rng(seed) });
      g.start();
      g.stage = stage;
      g.pattern = 1;
      g.stageTime = 0;
      g.spawnIn = 0;
      g.time = 35;
      g.end = () => {};
      for (let f = 0; f < 10 * 120 && g.stage === stage; f++) {
        g.update(1 / 120);
        const poly = safePolygon(
          g.hazards,
          stageTuning(stage).gateClearance / 2,
        );
        assert(
          poly.length >= 3,
          `empty safe disc at stage ${stage}, seed ${seed}`,
        );
        const centre = closestPoint({ x: 300, y: 300 }, poly);
        for (const h of g.hazards.filter((h) => h.kind === "wall"))
          assert(
            !collides(
              { ...centre, r: stageTuning(stage).gateClearance / 2 - 1e-5 },
              h,
            ),
          );
      }
    }
});
test("wide lasers always lock onto the player, do not track, and include diagonal orientations", () => {
  const angles = new Set();
  for (let seed = 1; seed <= 100; seed++) {
    const g = new Game({ random: rng(seed) });
    g.start();
    g.pattern = 2;
    g.stageTime = 0;
    g.player.x = 12 + (seed % 3) * 288;
    g.player.y = 12 + (seed % 4) * 180;
    spawnWave(g);
    const h = g.hazards[0],
      locked = { x: h.x, y: h.y };
    angles.add(h.angle);
    assert(h.halfH * 2 >= 82);
    assert(collides(g.player, h));
    assert.deepEqual(h.target, { x: g.player.x, y: g.player.y });
    g.player.x = 300;
    g.player.y = 300;
    g.spawnIn = Infinity;
    g.update(0.1);
    assert.equal(h.x, locked.x);
    assert.equal(h.y, locked.y);
    assert.equal(g.state, "playing");
  }
  assert.equal(angles.size, 4);
});
test("rotated rectangle collision follows visual edges, including corner misses", () => {
  const h = {
    kind: "wall",
    x: 300,
    y: 300,
    halfW: 100,
    halfH: 10,
    angle: Math.PI / 4,
  };
  const c = Math.SQRT1_2;
  assert(collides({ x: 300 + c * 50, y: 300 + c * 50, r: 7 }, h));
  assert(!collides({ x: 300 - c * 30, y: 300 + c * 30, r: 7 }, h));
  assert(collides({ x: 300 - c * 17, y: 300 + c * 17, r: 7 }, h));
  assert(
    !collides(
      { x: 300 + c * 112 - c * 22, y: 300 + c * 112 + c * 22, r: 7 },
      h,
    ),
  );
});
test("eight-pattern bags shuffle without repeats or adjacent similar families", () => {
  assert.equal(PATTERNS.length, 8);
  const orders = new Set();
  for (let seed = 1; seed <= 100; seed++) {
    let previous = null;
    const random = rng(seed);
    for (let bag = 0; bag < 4; bag++) {
      const order = createPatternOrder(random, previous, bag === 0);
      assert.equal(new Set(order).size, 8);
      if (bag === 0) assert.equal(order[0], 0);
      for (const id of order) {
        if (previous !== null)
          assert.notEqual(PATTERNS[id].family, PATTERNS[previous].family);
        previous = id;
      }
      orders.add(order.join(","));
    }
  }
  assert(orders.size > 80);
  const g = new Game({ random: rng(5) });
  g.start();
  const played = [g.pattern];
  for (let stage = 0; stage < 23; stage++) {
    const expected = g.nextPattern;
    g.hazards = [];
    g.handoff = true;
    g.stageTime = 6;
    g.update(1 / 120);
    assert.equal(g.pattern, expected);
    played.push(g.pattern);
  }
  for (let offset = 0; offset < 24; offset += 8)
    assert.equal(new Set(played.slice(offset, offset + 8)).size, 8);
  g.start();
  assert.equal(g.pattern, 0);
  assert.equal(g.stage, 0);
  assert.equal(g.patternQueue.length, 7);
});
test("stationary play cannot clear any pattern at center, edges or corners", () => {
  const positions = [
    { x: 300, y: 384 },
    { x: 300, y: 300 },
    { x: 12, y: 12 },
    { x: 588, y: 588 },
    { x: 12, y: 300 },
    { x: 300, y: 588 },
    { x: 588, y: 12 },
  ];
  for (let pattern = 0; pattern < PATTERNS.length; pattern++)
    for (let seed = 1; seed <= 30; seed++)
      for (const pos of positions) {
        const g = new Game({ random: rng(seed) });
        g.start();
        g.pattern = pattern;
        g.stage = pattern;
        g.stageTime = 0;
        g.spawnIn = 0;
        g.time = 20;
        Object.assign(g.player, pos);
        for (
          let f = 0;
          f < 12 * 120 && g.state === "playing" && g.stage === pattern;
          f++
        )
          g.update(1 / 120);
        assert.equal(
          g.state,
          "over",
          `idle clear: pattern ${pattern}, seed ${seed}, position ${JSON.stringify(pos)}`,
        );
      }
});
test("new marks, orbit and crusher patterns allow delayed, ordinary movement", () => {
  for (const pattern of [4, 5, 6])
    for (let seed = 1; seed <= 60; seed++) {
      const g = new Game({ random: rng(seed) });
      g.start();
      g.pattern = pattern;
      g.stage = pattern;
      g.stageTime = 0;
      g.spawnIn = 0;
      g.time = 20;
      let target = null,
        reaction = 1;
      const seen = new Set();
      for (let f = 0; f < 120 * 12 && g.stage === pattern; f++) {
        const fresh = g.hazards.find((h) => !seen.has(h));
        if (fresh) {
          g.hazards.forEach((h) => seen.add(h));
          reaction = 0;
          target = null;
        }
        reaction += 1 / 120;
        if (reaction >= 0.35 && !target && g.hazards.length) {
          const h = g.hazards[g.hazards.length - 1];
          if (pattern === 4) {
            const candidates = Array.from({ length: 8 }, (_, i) => ({
              x: g.player.x + Math.cos((i * Math.PI) / 4) * (h.r + 25),
              y: g.player.y + Math.sin((i * Math.PI) / 4) * (h.r + 25),
            })).filter(
              (p) => p.x >= 12 && p.x <= 588 && p.y >= 12 && p.y <= 588,
            );
            target =
              candidates.find((p) =>
                g.hazards.every(
                  (z) => Math.hypot(p.x - z.x, p.y - z.y) > z.r + 12,
                ),
              ) || candidates[0];
          }
          if (pattern === 5) {
            const o = h.orbit,
              dx = g.player.x - o.cx,
              dy = g.player.y - o.cy,
              len = Math.hypot(dx, dy) || 1;
            target = [1, -1]
              .map((sign) => ({
                x: g.player.x + (dx / len) * 60 * sign,
                y: g.player.y + (dy / len) * 60 * sign,
              }))
              .find((p) => p.x >= 12 && p.x <= 588 && p.y >= 12 && p.y <= 588);
          }
          if (pattern === 6) {
            const e = h.escape;
            target = {
              x: g.player.x + e.n.x * 170,
              y: g.player.y + e.n.y * 170,
            };
          }
        }
        g.update(1 / 120, target ? { target } : undefined);
        assert.equal(
          g.state,
          "playing",
          `new pattern ${pattern} reaction route failed on seed ${seed}`,
        );
      }
    }
});
test("ricochet motion reflects from the wall and all new effects have finite lifetimes", () => {
  const g = new Game();
  g.start();
  g.spawnIn = Infinity;
  const h = {
    kind: "circle",
    x: 587,
    y: 300,
    r: 11,
    vx: 120,
    vy: 0,
    age: 1,
    warning: 0,
    life: 9,
    bounce: { entered: true, remaining: 2 },
  };
  g.hazards = [h];
  g.update(0.1);
  assert(h.vx < 0);
  assert.equal(h.bounce.remaining, 1);
  assert(h.x < 589);
  for (let pattern = 4; pattern < 8; pattern++) {
    g.start();
    g.pattern = pattern;
    g.stageTime = 0;
    spawnWave(g);
    assert(
      g.hazards.every(
        (h) => Number.isFinite(h.life) && h.life / PATTERN_TEMPO < 6,
      ),
    );
  }
});
test("1x to 8x accelerates physics but counts real survival seconds and pause excludes time", () => {
  for (let speed = 1; speed <= 8; speed++) {
    const g = new Game();
    g.start();
    g.spawnIn = Infinity;
    const x = g.player.x;
    g.update(0.1, { x: 1 }, speed);
    assert(Math.abs(g.time - 0.1 * speed) < 1e-8);
    assert(Math.abs(g.survivalTime - 0.1) < 1e-8);
    assert(Math.abs(g.player.x - x - 25 * speed) < 1e-8);
    g.pause();
    g.update(0.1, { x: 1 }, speed);
    assert(Math.abs(g.survivalTime - 0.1) < 1e-8);
    g.start();
    assert.equal(g.survivalTime, 0);
  }
  const g = new Game();
  g.start();
  g.spawnIn = Infinity;
  g.hazards = [
    {
      kind: "circle",
      x: 480,
      y: g.player.y,
      r: 8,
      vx: -200,
      vy: 0,
      age: 0,
      warning: 0,
      life: 10,
    },
  ];
  g.update(0.1, { x: 1 }, 8);
  assert.equal(g.state, "over");
  assert(g.survivalTime < 0.1);
});
test("mouse destinations and keyboard movement keep equal speed at every playback rate", () => {
  for (let speed = 1; speed <= 8; speed++) {
    const mouse = new Game(),
      keyboard = new Game();
    mouse.start();
    keyboard.start();
    const start = { ...mouse.player };
    mouse.spawnIn = Infinity;
    keyboard.spawnIn = Infinity;
    mouse.update(0.1, { target: { x: 580, y: 20 } }, speed);
    keyboard.update(0.1, { x: 1, y: -1 }, speed);
    assert(
      Math.abs(
        Math.hypot(mouse.player.x - start.x, mouse.player.y - start.y) -
          Math.hypot(keyboard.player.x - start.x, keyboard.player.y - start.y),
      ) < 1e-7,
    );
  }
});
test("speed choices persist and real-time best records stay isolated per speed", () => {
  const map = new Map(),
    storage = { getItem: (k) => map.get(k), setItem: (k, v) => map.set(k, v) };
  assert.equal(readSpeed(storage), 1);
  saveSpeed(storage, 8);
  assert.equal(readSpeed(storage), 8);
  saveBest(storage, 20, 0);
  saveBest(storage, 3, 0, 8);
  assert.equal(readBest(storage), 20);
  assert.equal(readBest(storage, 8), 3);
  assert.equal(readBest(storage, 2), 0);
  assert.equal(readSpeed({ getItem: () => 99 }), 1);
  assert.equal(
    readSpeed({
      getItem() {
        throw Error();
      },
    }),
    1,
  );
});
test("personal best is monotonic and storage failures do not stop game", () => {
  const map = new Map(),
    s = { getItem: (k) => map.get(k), setItem: (k, v) => map.set(k, v) };
  assert.equal(readBest(s), 0);
  assert.equal(saveBest(s, 25, 0).best, 25);
  assert.equal(saveBest(s, 12, readBest(s)).best, 25);
  assert.equal(readBest(s), 25);
  const denied = {
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("blocked");
    },
  };
  assert.equal(readBest(denied), 0);
  assert.deepEqual(saveBest(denied, 30, 20), { best: 30, saved: false });
  assert.equal(formatTime(1.2), "01.20");
});
test("ten-minute seeded simulations have finite state and bounded live objects", () => {
  for (let seed = 1; seed <= 4; seed++) {
    const g = new Game({ random: rng(seed) });
    g.start();
    let peak = 0;
    for (let step = 0; step < 600 * 60; step++) {
      // Suppress only lethal contact to exercise all later cycles and cleanup.
      g.end = () => {};
      g.update(1 / 60, { x: Math.sin(step / 90), y: Math.cos(step / 110) });
      peak = Math.max(peak, g.hazards.length);
      assert.equal(g.state, "playing");
      assert(Number.isFinite(g.player.x) && Number.isFinite(g.player.y));
    }
    assert(g.time > 599.9);
    assert(peak < 100);
    assert(g.particles.length <= 120);
    assert(g.trail.length <= 18);
  }
});
