const BEST = "ten-seconds.best.v1",
  SOUND = "ten-seconds.sound.v1";
const bestKey = (speed) => BEST + (speed === 1 ? "" : `.x${speed}`);
export function readBest(storage, speed = 1) {
  try {
    const n = Number(storage.getItem(bestKey(speed)));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}
export function saveBest(storage, time, best, speed = 1) {
  const next = Math.max(best, Number.isFinite(time) ? time : 0);
  try {
    storage.setItem(bestKey(speed), String(next));
    return { best: next, saved: true };
  } catch {
    return { best: next, saved: false };
  }
}
export function readSound(storage) {
  try {
    return storage.getItem(SOUND) === "on";
  } catch {
    return false;
  }
}
export function saveSound(storage, on) {
  try {
    storage.setItem(SOUND, on ? "on" : "off");
  } catch {
    /* Storage is optional. */
  }
}
export const formatTime = (time) =>
  Math.max(0, time).toFixed(2).padStart(5, "0");

export function readSpeed(storage) {
  try {
    const n = Number(storage.getItem("ten-seconds.speed.v1"));
    return Number.isInteger(n) && n >= 1 && n <= 8 ? n : 1;
  } catch {
    return 1;
  }
}
export function saveSpeed(storage, speed) {
  try {
    storage.setItem("ten-seconds.speed.v1", String(speed));
  } catch {}
}
