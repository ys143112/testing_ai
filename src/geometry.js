export const FIELD_SIZE = 600;
const q = Math.SQRT1_2;
export const DIRECTIONS = [
  { x: 0, y: 1 },
  { x: -q, y: q },
  { x: -1, y: 0 },
  { x: -q, y: -q },
  { x: 0, y: -1 },
  { x: q, y: -q },
  { x: 1, y: 0 },
  { x: q, y: q },
];
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const tangent = (n) => ({ x: n.y, y: -n.x });
export const support = (n) =>
  (FIELD_SIZE / 2) * (Math.abs(n.x) + Math.abs(n.y));
export const project = (p, n) =>
  dot({ x: p.x - FIELD_SIZE / 2, y: p.y - FIELD_SIZE / 2 }, n);
export function entryPoint(edge, across = 0, margin = 24) {
  const n = DIRECTIONS[edge],
    t = tangent(n),
    base = {
      x: FIELD_SIZE / 2 + t.x * across,
      y: FIELD_SIZE / 2 + t.y * across,
    };
  let enter = -Infinity;
  for (const axis of ["x", "y"])
    if (Math.abs(n[axis]) > 1e-8) {
      const a = (-margin - base[axis]) / n[axis],
        b = (FIELD_SIZE + margin - base[axis]) / n[axis];
      enter = Math.max(enter, Math.min(a, b));
    }
  return { x: base.x + n.x * enter, y: base.y + n.y * enter };
}
function clip(polygon, n, bound) {
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length],
      da = dot(a, n) - bound,
      db = dot(b, n) - bound;
    if (da <= 1e-8) result.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const f = da / (da - db);
      result.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
    }
  }
  return result;
}
// Feasible centers of a safe disc, clipped by every live oriented corridor.
export function safePolygon(walls, radius = 42) {
  const a = radius + 12,
    b = FIELD_SIZE - a;
  let poly = [
    { x: a, y: a },
    { x: b, y: a },
    { x: b, y: b },
    { x: a, y: b },
  ];
  for (const h of walls) {
    if (!h.gateTangent) continue;
    const t = h.gateTangent,
      offset = (FIELD_SIZE / 2) * (t.x + t.y);
    poly = clip(poly, t, h.openHi + offset - radius);
    poly = clip(poly, { x: -t.x, y: -t.y }, -h.openLo - offset - radius);
    if (!poly.length) break;
  }
  return poly;
}
export function closestPoint(p, poly) {
  if (!poly.length) throw Error("No safe corridor intersection");
  let inside = true,
    best = poly[0],
    distance = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length],
      dx = b.x - a.x,
      dy = b.y - a.y;
    if (dx * (p.y - a.y) - dy * (p.x - a.x) < -1e-7) inside = false;
    const f = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
    const v = { x: a.x + dx * f, y: a.y + dy * f },
      d = Math.hypot(p.x - v.x, p.y - v.y);
    if (d < distance) {
      distance = d;
      best = v;
    }
  }
  return inside ? p : best;
}
export function wallOutside(h) {
  return project(h, h.gateNormal) - h.halfH > support(h.gateNormal);
}
