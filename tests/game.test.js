import test from "node:test";
import assert from "node:assert/strict";
import { Game, PLAYER_SPEED } from "../src/game.js";
import { collides, circleRect } from "../src/collision.js";
import {
  spawnWave,
  difficulty,
  PATTERN_DURATION,
  PATTERN_TEMPO,
} from "../src/patterns.js";
import { readBest, saveBest, formatTime } from "../src/storage.js";
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
      h: 640,
      vx: 0,
      vy: 0,
      age: 0,
      warning: 1,
      life: 2,
    },
  ];
  advance(g, 0.45);
  assert.equal(g.state, "playing");
  advance(g, 0.1);
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
test("five-second patterns finish without deleting or overlapping previous waves", () => {
  for (let seed = 1; seed <= 12; seed++) {
    let g,
      transitions = 0,
      sawHazards = false;
    g = new Game({
      random: rng(seed),
      onEvent: (e) => {
        if (e === "stage") {
          assert.equal(g.hazards.length, 0);
          assert(
            Math.abs(
              g.time - transitions * PATTERN_DURATION - PATTERN_DURATION,
            ) < 0.02,
          );
          transitions++;
        }
      },
    });
    g.start();
    g.end = () => {};
    for (let i = 0; i < 120 * 60; i++) {
      const previous = [...g.hazards],
        ages = previous.map((h) => h.age);
      g.update(1 / 120);
      sawHazards ||= g.hazards.length > 0;
      previous.forEach((h, j) => {
        if (!g.hazards.includes(h)) {
          assert(
            h.age >= h.life,
            "a live hazard must not be erased on transition",
          );
          assert(h.age > ages[j]);
          if (h.kind !== "laser")
            assert(
              h.x + (h.r || h.w) < 0 ||
                h.x - (h.r || 0) > 600 ||
                h.y + (h.r || h.h) < 0 ||
                h.y - (h.r || 0) > 640,
              "moving hazard must leave the field naturally",
            );
        }
      });
    }
    assert(sawHazards);
    assert.equal(transitions, 12);
  }
});
test("late waves are not launched and an uncleared hazard blocks a transition", () => {
  const g = new Game();
  g.start();
  g.stageTime = 4.9;
  assert.equal(spawnWave(g), Infinity);
  assert.equal(g.hazards.length, 0);
  const h = {
    kind: "circle",
    x: 20,
    y: 20,
    r: 8,
    vx: 100,
    vy: 0,
    age: 0,
    warning: 0,
    life: 1,
  };
  g.hazards = [h];
  g.spawnIn = Infinity;
  g.update(0.1);
  assert.equal(g.stage, 0);
  assert(g.hazards.includes(h));
  advance(g, 0.5);
  g.update(0.02);
  assert.equal(g.stage, 1);
  assert.equal(g.pattern, 1);
});
test("obstacle motion and lifecycle use double tempo while player and score stay real-time", () => {
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
  assert(Math.abs(h.x - 40) < 1e-8);
  assert(Math.abs(h.age - 0.2) < 1e-8);
  assert(Math.abs(g.time - 0.1) < 1e-8);
  assert(Math.abs(g.player.x - 325) < 1e-8);
  const initial = new Game();
  initial.start();
  const interval = spawnWave(initial);
  assert(Math.abs(interval - 0.6) < 1e-8);
  assert.equal(PATTERN_TEMPO, 2);
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
        const gap = wave % 2 === 0 ? b.x - (a.x + a.w) : b.y - (a.y + a.h);
        assert(gap >= 150);
      }
      if (phase === 2) assert.equal(g.hazards.length, 2);
    }
  assert(difficulty(200) > difficulty(20));
  assert(difficulty(1e6) <= 2.35);
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
