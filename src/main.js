import { Game } from "./game.js";
import { WIDTH, HEIGHT, PATTERNS, PATTERN_DURATION } from "./patterns.js";
import { Renderer } from "./render.js";
import { Audio } from "./audio.js";
import {
  readBest,
  saveBest,
  readSound,
  saveSound,
  formatTime,
} from "./storage.js";
const $ = (id) => document.getElementById(id);
const canvas = $("game"),
  renderer = new Renderer(canvas),
  audio = new Audio();
// Access to localStorage itself can throw in private / restricted contexts.
let storage;
try {
  storage = window.localStorage;
} catch {
  storage = null;
}
let best = readBest(storage),
  saved = true,
  previousBest = best;
audio.enabled = readSound(storage);
const keys = new Set();
let drag = null,
  target = null,
  announcementUntil = 0,
  lastFrame = null;
const game = new Game({
  onEvent: (event) => {
    if (event === "graze") {
      audio.play(event);
      return;
    }
    if (event === "preview" || event === "handoff") {
      $("status").textContent =
        `다음 패턴 ${PATTERNS[(game.pattern + 1) % 4].name}. 남은 장애물을 피하세요.`;
      return;
    }
    if (event === "stage") {
      announcementUntil = game.time + 1.1;
      $("announcement").textContent =
        `STAGE ${String(game.stage + 1).padStart(2, "0")} · ${PATTERNS[game.pattern].name}`;
      $("status").textContent =
        `${game.stage + 1}단계. ${PATTERNS[game.pattern].hint}`;
      audio.play(event);
      return;
    }
    clearInput();
    if (event === "over") {
      previousBest = best;
      const result = saveBest(storage, game.time, best);
      best = result.best;
      saved = result.saved;
    }
    if (event === "start") {
      announcementUntil = 2;
      $("announcement").textContent = "움직여 보세요 · 첫 위험은 2초 후";
    }
    updateOverlay();
    audio.play(event);
  },
});
function clearInput() {
  keys.clear();
  drag = null;
  target = null;
}
function updateSound() {
  const b = $("sound");
  b.setAttribute("aria-pressed", String(audio.enabled));
  b.setAttribute("aria-label", audio.enabled ? "소리 끄기" : "소리 켜기");
  b.innerHTML = `♪ <span>${audio.enabled ? "ON" : "OFF"}</span>`;
}
function updateOverlay() {
  const state = game.state,
    isOver = state === "over",
    paused = state === "paused";
  $("overlay").hidden = state === "playing";
  if (state !== "playing") $("announcement").classList.remove("visible");
  $("pause").disabled = state === "ready" || isOver;
  $("pause").innerHTML = paused
    ? "▶ <span>재개</span>"
    : "Ⅱ <span>일시정지</span>";
  $("pause").setAttribute("aria-label", paused ? "게임 재개" : "일시정지");
  $("result").hidden = !isOver;
  if (state === "ready") return;
  $("overlay-kicker").textContent = paused
    ? "TAKE A BREATH"
    : game.time > previousBest
      ? "NEW PERSONAL BEST"
      : "ONE MORE TRY?";
  $("overlay-title").innerHTML = paused
    ? "잠깐, 숨 고르기."
    : "이번엔 여기까지.<br>다음엔 조금 더.";
  $("overlay-description").textContent = paused
    ? "준비되면 이어서 도전하세요."
    : `${game.stage + 1}단계 · ${PATTERNS[game.pattern].name}에서 생존 종료`;
  $("result").textContent = `${formatTime(game.time)} s`;
  $("action").innerHTML = paused
    ? "계속 살아남기 <span>↗</span>"
    : "다시 도전하기 <span>↻</span>";
  $("overlay-hint").textContent = paused
    ? "P / ESC로도 재개할 수 있어요"
    : saved
      ? "기록은 이 브라우저에 저장됩니다."
      : "저장소를 사용할 수 없어 기록은 이번 방문 동안 유지됩니다.";
  $("status").textContent = paused
    ? "일시정지"
    : `게임 종료. 생존 시간 ${formatTime(game.time)}초.`;
  if (isOver || paused) $("action").focus({ preventScroll: true });
}
function startOrResume() {
  audio.unlock();
  if (game.state === "paused") game.resume();
  else if (game.state !== "playing") game.start();
}
$("action").addEventListener("click", startOrResume);
$("pause").addEventListener("click", () => {
  audio.unlock();
  if (game.state === "playing") game.pause();
  else if (game.state === "paused") game.resume();
});
$("sound").addEventListener("click", () => {
  audio.enabled = !audio.enabled;
  audio.unlock();
  saveSound(storage, audio.enabled);
  updateSound();
  audio.play("resume");
});
const movement = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "w",
  "a",
  "s",
  "d",
];
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (movement.includes(key) && game.state === "playing") {
    e.preventDefault();
    keys.add(key);
    target = null;
  }
  if (e.repeat) return;
  if (
    (key === "Escape" || key === "p") &&
    (game.state === "playing" || game.state === "paused")
  ) {
    e.preventDefault();
    if (game.state === "playing") game.pause();
    else game.resume();
  }
  if (
    key === "Enter" &&
    e.target.tagName !== "BUTTON" &&
    game.state !== "playing"
  ) {
    e.preventDefault();
    startOrResume();
  }
});
window.addEventListener("keyup", (e) =>
  keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key),
);
canvas.addEventListener("pointerdown", (e) => {
  if (
    game.state !== "playing" ||
    (e.pointerType === "mouse" && e.button !== 0) ||
    drag
  )
    return;
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  const scale = renderer.viewport().scale;
  drag = {
    id: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    px: game.player.x,
    py: game.player.y,
    sx: 1 / scale,
    sy: 1 / scale,
  };
  target = { x: game.player.x, y: game.player.y };
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  e.preventDefault();
  target = {
    x: Math.max(
      12,
      Math.min(WIDTH - 12, drag.px + (e.clientX - drag.x) * drag.sx),
    ),
    y: Math.max(
      12,
      Math.min(HEIGHT - 12, drag.py + (e.clientY - drag.y) * drag.sy),
    ),
  };
});
function stopDrag(e) {
  if (drag?.id === e.pointerId) {
    drag = null;
    target = null;
  }
}
for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
  canvas.addEventListener(event, stopDrag);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearInput();
    game.pause();
  }
});
window.addEventListener("blur", () => {
  clearInput();
  game.pause();
});
window.addEventListener("pagehide", () => game.pause());
window.addEventListener("resize", () => {
  renderer.resize();
  clearInput();
  game.pause();
});
function frame(timestamp) {
  const dt =
    lastFrame === null ? 0 : Math.min((timestamp - lastFrame) / 1000, 0.1);
  lastFrame = timestamp;
  game.update(dt, {
    x:
      Number(keys.has("d") || keys.has("ArrowRight")) -
      Number(keys.has("a") || keys.has("ArrowLeft")),
    y:
      Number(keys.has("s") || keys.has("ArrowDown")) -
      Number(keys.has("w") || keys.has("ArrowUp")),
    target,
  });
  renderer.draw(game, timestamp / 1000);
  $("time").innerHTML = `${formatTime(game.time)}<small>s</small>`;
  $("best").innerHTML = `${formatTime(best)}<small>s</small>`;
  $("stage").textContent = `STAGE ${String(game.stage + 1).padStart(2, "0")}`;
  const next = PATTERNS[(game.pattern + 1) % PATTERNS.length];
  $("pattern").textContent = game.handoff
    ? `${PATTERNS[game.pattern].name} · 마무리`
    : PATTERNS[game.pattern].name;
  $("handoff").hidden = !game.preview || game.state !== "playing";
  $("handoff").textContent = `NEXT / ${next.name} · ${next.hint}`;
  $("arena").style.setProperty("--next-color", next.color);
  $("progress").style.width =
    `${Math.max(0, Math.min(1, game.stageTime / PATTERN_DURATION)) * 100}%`;
  $("announcement").classList.toggle(
    "visible",
    game.state === "playing" && game.time < announcementUntil,
  );
  document.querySelectorAll("[data-pattern]").forEach((el) => {
    el.classList.toggle("active", Number(el.dataset.pattern) === game.pattern);
    el.classList.toggle(
      "up-next",
      game.handoff &&
        Number(el.dataset.pattern) === (game.pattern + 1) % PATTERNS.length,
    );
  });
  requestAnimationFrame(frame);
}
updateSound();
requestAnimationFrame(frame);
