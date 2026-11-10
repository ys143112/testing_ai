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
  await page.clock.install();
  await page.goto(url);
  await page.getByRole("button", { name: "살아남기" }).waitFor();
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
  // Deterministic center opening lets the real app reach its first transition.
  const paced = await browser.newPage();
  paced.on("pageerror", (e) => errors.push(e.message));
  await paced.addInitScript(() => {
    Math.random = () => 0.5;
  });
  await paced.clock.install();
  await paced.goto(url);
  await paced.getByRole("button", { name: "살아남기" }).click();
  await paced.clock.runFor(4800);
  assert.equal(await paced.locator("#stage").textContent(), "STAGE 01");
  await paced.clock.runFor(300);
  assert.equal(await paced.locator("#stage").textContent(), "STAGE 02");
  assert.equal(await paced.locator("#pattern").textContent(), "틈새 비행");
  assert(await paced.locator("#overlay").isHidden());
  await paced.close();
  // Verify project subdirectory paths using a parent-root static server.
  const prefix = spawn(process.execPath, [path.resolve("scripts/serve.js")], {
    cwd: path.resolve(".."),
    env: { ...process.env, PORT: "4179" },
    stdio: "pipe",
  });
  try {
    for (let i = 0; i < 40; i++) {
      try {
        if ((await fetch("http://127.0.0.1:4179/testing_ai/")).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    const sub = await browser.newPage();
    sub.on("pageerror", (e) => errors.push(e.message));
    await sub.goto("http://127.0.0.1:4179/testing_ai/");
    await sub.getByRole("button", { name: "살아남기" }).click();
    assert(await sub.locator("#overlay").isHidden());
    await sub.close();
  } finally {
    prefix.kill();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: browser start, keyboard, pause/resume, blur, hidden tab, resize, real collision, restart, best reload, sound, blocked storage, mobile touch, five-second transition, DPR and subdirectory.",
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
