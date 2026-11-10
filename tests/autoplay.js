import { Game } from "../src/game.js";
import { collides } from "../src/collision.js";
// A deterministic keyboard route exercises the real first-stage handoff. No
// production hooks or invulnerability: every candidate uses normal collisions.
export function planFirstStage() {
  const choices = [
    { x: 0, y: 0 },
    ...Array.from({ length: 8 }, (_, i) => ({
      x: Math.round(Math.cos((i * Math.PI) / 4)),
      y: Math.round(Math.sin((i * Math.PI) / 4)),
    })),
  ];
  const copy = (g) => {
    const { random, onEvent, ...state } = g;
    return Object.assign(
      Object.create(Game.prototype),
      structuredClone(state),
      { random: () => 0.5, onEvent: () => {} },
    );
  };
  const g = new Game({ random: () => 0.5 });
  g.start();
  const route = [];
  let previous = 0;
  for (
    let tick = 0;
    tick < 150 && g.stage === 0 && g.state === "playing";
    tick++
  ) {
    let best = -Infinity,
      index = 0;
    for (let i = 0; i < choices.length; i++) {
      const c = copy(g);
      let score = i === previous ? 0.2 : 0;
      for (let f = 0; f < 12; f++) {
        c.update(1 / 15, choices[i]);
        if (c.state !== "playing") {
          score -= 100000 + (12 - f) * 1000;
          break;
        }
        for (const h of c.hazards) {
          if (h.age < h.warning) continue;
          if (collides(c.player, h, 20)) score -= 80;
          else if (collides(c.player, h, 40)) score -= 4;
        }
        score -= Math.hypot(c.player.x - 300, c.player.y - 300) * 0.001;
      }
      if (score > best) {
        best = score;
        index = i;
      }
    }
    previous = index;
    g.update(0.1, choices[index]);
    route.push({ input: choices[index], time: g.time, handoff: g.handoff });
  }
  if (g.state !== "playing" || g.stage !== 1)
    throw Error("Unable to plan a legal first-stage route");
  return route;
}
