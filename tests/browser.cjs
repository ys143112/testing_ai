const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const { mkdir } = require("node:fs/promises");
const assert = require("node:assert/strict");
const path = require("node:path");
const server = spawn(process.execPath, ["scripts/serve.js"], {
  env: { ...process.env, PORT: "4178" },
  stdio: "pipe",
});
const url = "http://127.0.0.1:4178/";
let browser;
async function waitServer() {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Server did not start");
}
(async () => {
  await waitServer();
  await mkdir("test-results", { recursive: true });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
  });
  const errors = [];
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1120 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  async function squareCanvas(page) {
    const size = await page.locator("canvas").evaluate((c) => ({
      w: c.getBoundingClientRect().width,
      h: c.getBoundingClientRect().height,
      bw: c.width,
      bh: c.height,
    }));
    assert(Math.abs(size.w - size.h) < 1, "display must be square");
    assert.equal(size.bw, size.bh);
  }
  await page.clock.install();
  await page.goto(url);
  await page.getByRole("button", { name: "살아남기" }).waitFor();
  await squareCanvas(page);
  await page.screenshot({
    path: "test-results/desktop-start.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "살아남기" }).click();
  await page.clock.runFor(500);
  assert(await page.locator("#overlay").isHidden());
  await page.keyboard.down("ArrowLeft");
  await page.clock.runFor(300);
  await page.keyboard.up("ArrowLeft");
  assert.equal(await page.evaluate(() => scrollY), 0);
  await page.keyboard.press("p");
  assert.equal(
    await page.locator("#overlay-title").textContent(),
    "잠깐, 숨 고르기.",
  );
  const time = await page.locator("#time").textContent();
  await page.clock.runFor(10000);
  assert.equal(await page.locator("#time").textContent(), time);
  await page.getByRole("button", { name: "계속 살아남기" }).click();
  await page.clock.runFor(200);
  assert(await page.locator("#overlay").isHidden());
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert(await page.locator("#overlay").isVisible());
  await page.getByRole("button", { name: "계속 살아남기" }).click();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  assert(await page.locator("#overlay").isVisible());
  await page.getByRole("button", { name: "계속 살아남기" }).click();
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.clock.runFor(50);
  await page.locator("#overlay").waitFor({ state: "visible" });
  assert(await page.locator("#overlay").isVisible());
  await page.getByRole("button", { name: "계속 살아남기" }).click();
  // Let a real run collide, then verify persistence and complete reset.
  for (let i = 0; i < 90 && (await page.locator("#overlay").isHidden()); i++)
    await page.clock.runFor(1000);
  assert(
    await page.locator("#result").isVisible(),
    "idle player should encounter a hazard",
  );
  const score = await page.evaluate(() =>
    Number(localStorage.getItem("ten-seconds.best.v1")),
  );
  assert(score > 0);
  await page.screenshot({
    path: "test-results/desktop-over.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "다시 도전하기" }).click();
  await page.clock.runFor(50);
  assert(Number.parseFloat(await page.locator("#time").textContent()) < 0.2);
  await page.reload();
  await page.clock.runFor(50);
  assert.equal(
    Number.parseFloat(await page.locator("#best").textContent()),
    Number(score.toFixed(2)),
  );
  await page.getByRole("button", { name: "소리 켜기" }).click();
  assert.equal(
    await page.locator("#sound").getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "소리 끄기" }).click();
  // Exercise real diagonal beam rendering, including charge visibility and
  // the absence of small numeric countdown labels.
  await page.evaluate(async () => {
    const entry = document.querySelector("script[type=module]").src;
    const { Game } = await import(new URL("game.js", entry).href),
      { Renderer } = await import(new URL("render.js", entry).href);
    const canvas = document.createElement("canvas");
    canvas.id = "beam-preview";
    canvas.style.cssText =
      "position:fixed;left:20px;top:20px;width:500px;height:500px;z-index:9999";
    document.body.append(canvas);
    const renderer = new Renderer(canvas),
      game = new Game();
    game.start();
    game.player = { x: 480, y: 450, r: 7 };
    game.pattern = 2;
    const beam = {
      kind: "laser",
      x: 300,
      y: 300,
      halfW: 850,
      halfH: 48,
      angle: Math.PI / 4,
      vx: 0,
      vy: 0,
      age: 0.15,
      warning: 1.65,
      life: 2.2,
      color: "#c39cff",
    };
    game.hazards = [beam];
    const labels = [],
      original = renderer.ctx.fillText;
    renderer.ctx.fillText = function (...args) {
      labels.push(args[0]);
      return original.apply(this, args);
    };
    window.__beamPreview = { canvas, renderer, game, beam, labels };
    renderer.draw(game, 0);
  });
  const sampleBeam = () =>
    page.evaluate(() => {
      const { canvas, renderer } = window.__beamPreview,
        q = Math.SQRT1_2,
        x = Math.round(((300 - q * 30) * canvas.width) / 600),
        y = Math.round(((300 + q * 30) * canvas.height) / 600),
        p = renderer.ctx.getImageData(x, y, 1, 1).data;
      return p[0] + p[2];
    });
  const early = await sampleBeam();
  await page.evaluate(() => {
    const v = window.__beamPreview;
    v.beam.age = v.beam.warning * 0.8;
    v.renderer.draw(v.game, 0);
  });
  const charged = await sampleBeam();
  assert(charged > early + 30, "charging band must become visibly filled");
  assert.deepEqual(await page.evaluate(() => window.__beamPreview.labels), []);
  await page
    .locator("#beam-preview")
    .screenshot({ path: "test-results/laser-charge.png" });
  await page.evaluate(() => {
    const v = window.__beamPreview;
    v.beam.age = v.beam.warning + 0.1;
    v.renderer.draw(v.game, 0);
  });
  await page
    .locator("#beam-preview")
    .screenshot({ path: "test-results/laser-fire.png" });
  await page.evaluate(() => {
    window.__beamPreview.canvas.remove();
    delete window.__beamPreview;
  });
  // Render every new family in both telegraph and active states.
  await page.evaluate(async () => {
    const entry = document.querySelector("script[type=module]").src,
      { Game } = await import(new URL("game.js", entry).href),
      { Renderer } = await import(new URL("render.js", entry).href),
      p = await import(new URL("patterns.js", entry).href);
    const canvas = document.createElement("canvas");
    canvas.style.cssText =
      "width:300px;height:300px;position:fixed;left:0;top:0";
    document.body.append(canvas);
    const renderer = new Renderer(canvas);
    for (let pattern = 4; pattern < 8; pattern++) {
      const g = new Game({ random: () => 0.5 });
      g.start();
      g.pattern = pattern;
      g.stageTime = 0;
      g.spawnIn = Infinity;
      p.spawnWave(g);
      renderer.draw(g, 0);
      g.end = () => {};
      for (let i = 0; i < 20; i++) g.update(0.1);
      renderer.draw(g, 2);
    }
    canvas.remove();
  });
  assert.equal(await page.locator("[data-pattern]").count(), 8);
  const fast = await browser.newPage();
  await fast.clock.install();
  await fast.goto(url);
  await fast.getByRole("combobox", { name: "게임 배속" }).selectOption("8");
  await fast.getByRole("button", { name: "살아남기" }).click();
  await fast.clock.runFor(100);
  assert.equal(await fast.locator("#speed").isDisabled(), true);
  assert(Number.parseFloat(await fast.locator("#time").textContent()) < 0.8);
  await fast.keyboard.press("p");
  const fastTime = await fast.locator("#time").textContent();
  await fast.clock.runFor(1000);
  assert.equal(await fast.locator("#time").textContent(), fastTime);
  await fast.getByRole("button", { name: "계속 살아남기" }).click();
  for (let i = 0; i < 10 && (await fast.locator("#overlay").isHidden()); i++)
    await fast.clock.runFor(500);
  assert(await fast.locator("#result").isVisible());
  assert(
    await fast.evaluate(
      () =>
        Number(localStorage.getItem("ten-seconds.best.v1.x8")) > 0 &&
        !localStorage.getItem("ten-seconds.best.v1"),
    ),
  );
  await fast.getByRole("combobox", { name: "게임 배속" }).selectOption("1");
  await fast.reload();
  assert.equal(await fast.locator("#speed").inputValue(), "1");
  await fast.close();
  // Denied storage must still boot and start.
  const denied = await browser.newPage();
  await denied.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("denied", "SecurityError");
      },
    });
  });
  await denied.goto(url);
  await denied.getByRole("button", { name: "살아남기" }).click();
  assert(await denied.locator("#overlay").isHidden());
  await denied.close();
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const mp = await mobile.newPage();
  mp.on("pageerror", (e) => errors.push(e.message));
  await mp.clock.install();
  await mp.goto(url);
  await mp.getByRole("button", { name: "살아남기" }).click();
  await mp.clock.runFor(100);
  const playerCenter = () =>
    mp.locator("canvas").evaluate((c) => {
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let x = 0,
        y = 0,
        n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (
          d[i] > 100 &&
          d[i] < 180 &&
          d[i + 1] > 230 &&
          d[i + 2] > 170 &&
          d[i + 2] < 220
        ) {
          x += (i / 4) % c.width;
          y += Math.floor(i / 4 / c.width);
          n++;
        }
      }
      return { x: x / n, y: y / n };
    });
  await squareCanvas(mp);
  const before = await playerCenter();
  const rect = await mp.locator("canvas").boundingBox(),
    session = await mobile.newCDPSession(mp);
  // Actual Chromium touch events (not merely synthetic DOM handlers).
  const x = rect.x + rect.width * 0.35,
    y = rect.y + rect.height * 0.7;
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: x + 80, y: y - 60 }],
  });
  await mp.clock.runFor(500);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  const after = await playerCenter();
  assert(
    after.x > before.x + 20 && after.y < before.y - 15,
    "touch drag must visibly move player relatively",
  );
  assert(await mp.locator("#overlay").isHidden());
  assert.equal(
    await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await mp.screenshot({
    path: "test-results/mobile-playing.png",
    fullPage: false,
  });
  const canvasSize = await mp.locator("canvas").evaluate((c) => ({
    w: c.width,
    h: c.height,
    cw: c.clientWidth,
    ch: c.clientHeight,
  }));
  assert(canvasSize.w <= canvasSize.cw * 2 + 1);
  assert(canvasSize.h <= canvasSize.ch * 2 + 1);
  await mp.setViewportSize({ width: 844, height: 390 });
  await mp.clock.runFor(50);
  await mp.locator("#overlay").waitFor({ state: "visible" });
  assert(await mp.locator("#overlay").isVisible());
  // An idle player now dies, so reach the handoff using an actual legal route.
  const { planFirstStage } = await import("./autoplay.js");
  const route = planFirstStage();
  const paced = await browser.newPage();
  paced.on("pageerror", (e) => errors.push(e.message));
  await paced.addInitScript(() => {
    Math.random = () => 0.5;
  });
  await paced.clock.install();
  await paced.goto(url);
  await paced.clock.pauseAt(await paced.evaluate(() => Date.now() + 1000));
  await paced.locator("#action").dispatchEvent("click");
  let sawHandoff = false,
    expectedName = "";
  for (const step of route) {
    await paced.evaluate((input) => {
      const desired = new Set();
      if (input.x < 0) desired.add("ArrowLeft");
      if (input.x > 0) desired.add("ArrowRight");
      if (input.y < 0) desired.add("ArrowUp");
      if (input.y > 0) desired.add("ArrowDown");
      for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"])
        window.dispatchEvent(
          new KeyboardEvent(desired.has(key) ? "keydown" : "keyup", {
            key,
            bubbles: true,
            cancelable: true,
          }),
        );
    }, step.input);
    await paced.clock.runFor(100);
    if (!sawHandoff && step.time > 7.1) {
      sawHandoff = await paced.locator("#handoff").isVisible();
      if (sawHandoff) {
        expectedName = (await paced.locator("#handoff").textContent())
          .split(" · ")[0]
          .replace("NEXT / ", "");
        await paced.screenshot({ path: "test-results/transition.png" });
      }
    }
  }
  await paced.evaluate(() => {
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"])
      window.dispatchEvent(new KeyboardEvent("keyup", { key }));
  });
  await paced.clock.runFor(200);
  assert(sawHandoff);
  assert.equal(await paced.locator("#stage").textContent(), "STAGE 02");
  assert.equal(await paced.locator("#pattern").textContent(), expectedName);
  assert(await paced.locator("#overlay").isHidden());
  assert(await paced.locator("#handoff").isHidden());
  await paced.setViewportSize({ width: 320, height: 568 });
  await paced.clock.runFor(50);
  await paced.locator("#overlay").waitFor({ state: "visible" });
  await squareCanvas(paced);
  const actionBox = await paced.locator("#action").boundingBox(),
    arenaBox = await paced.locator("#arena").boundingBox();
  assert(
    actionBox.y >= arenaBox.y &&
      actionBox.y + actionBox.height <= arenaBox.y + arenaBox.height,
    "small-screen resume button must fit inside square field",
  );
  await paced.close();
  // Verify project subdirectory paths using a parent-root static server.
  const siteRoot = path.resolve(process.env.SERVE_DIR || ".");
  const prefixUrl = `http://127.0.0.1:4179/${path.basename(siteRoot)}/`;
  const prefix = spawn(process.execPath, [path.resolve("scripts/serve.js")], {
    cwd: path.dirname(siteRoot),
    env: { ...process.env, PORT: "4179", SERVE_DIR: path.dirname(siteRoot) },
    stdio: "pipe",
  });
  try {
    for (let i = 0; i < 40; i++) {
      try {
        if ((await fetch(prefixUrl)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    const sub = await browser.newPage();
    sub.on("pageerror", (e) => errors.push(e.message));
    await sub.goto(prefixUrl);
    await sub.getByRole("button", { name: "살아남기" }).click();
    assert(await sub.locator("#overlay").isHidden());
    await sub.close();
  } finally {
    prefix.kill();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: browser start, keyboard, pause/resume, blur, hidden tab, resize, real collision, restart, best reload, sound, blocked storage, mobile touch, full attacks and seamless handoff, DPR and subdirectory.",
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    server.kill();
  });
