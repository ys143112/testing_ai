const BEST = "ten-seconds.best.v1",
  SOUND = "ten-seconds.sound.v1";
export function readBest(storage) {
  try {
    const n = Number(storage.getItem(BEST));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}
export function saveBest(storage, time, best) {
  const next = Math.max(best, Number.isFinite(time) ? time : 0);
  try {
    storage.setItem(BEST, String(next));
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
