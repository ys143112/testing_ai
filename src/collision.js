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
  if (h.halfW !== undefined) {
    const cos = Math.cos(h.angle),
      sin = Math.sin(h.angle),
      dx = p.x - h.x,
      dy = p.y - h.y;
    return circleRect(
      { x: dx * cos + dy * sin, y: -dx * sin + dy * cos, r: circle.r },
      { x: -h.halfW, y: -h.halfH, w: h.halfW * 2, h: h.halfH * 2 },
    );
  }
  return circleRect(circle, h);
}
