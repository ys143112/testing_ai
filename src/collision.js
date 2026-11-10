export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export function circleRect(p, r) {
  const x = clamp(p.x, r.x, r.x + r.w);
  const y = clamp(p.y, r.y, r.y + r.h);
  return (p.x - x) ** 2 + (p.y - y) ** 2 <= p.r ** 2;
}
export function collides(p, h, padding = 0) {
  const circle = { ...p, r: p.r + padding };
  if (h.kind === "circle")
    return Math.hypot(p.x - h.x, p.y - h.y) <= circle.r + h.r;
  return circleRect(circle, h);
}
