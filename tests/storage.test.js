import test from "node:test";
import assert from "node:assert/strict";
import { readBest, saveBest } from "../src/storage.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("an older tab cannot overwrite a higher record saved by another tab", () => {
  const storage = memoryStorage();
  const tabABest = readBest(storage);
  const tabBBest = readBest(storage);
  saveBest(storage, 30, tabABest);

  assert.deepEqual(saveBest(storage, 10, tabBBest), { best: 30, saved: true });
  assert.equal(readBest(storage), 30);
});

test("stale-tab protection uses the current run's speed bucket", () => {
  const storage = memoryStorage();
  const oldEightTimesBest = readBest(storage, 8);
  saveBest(storage, 60, 0, 1);
  saveBest(storage, 12, 0, 8);

  assert.deepEqual(saveBest(storage, 5, oldEightTimesBest, 8), {
    best: 12,
    saved: true,
  });
  assert.equal(readBest(storage, 1), 60);
  assert.equal(readBest(storage, 8), 12);
  assert.equal(readBest(storage, 2), 0);
});

test("invalid scores cannot poison a valid stored or session record", () => {
  for (const invalid of [NaN, Infinity, -Infinity, -10]) {
    const storage = memoryStorage();
    saveBest(storage, 30, 0);
    assert.deepEqual(saveBest(storage, invalid, invalid), {
      best: 30,
      saved: true,
    });
    assert.equal(readBest(storage), 30);

    const empty = memoryStorage();
    assert.deepEqual(saveBest(empty, invalid, invalid), {
      best: 0,
      saved: true,
    });
    assert.equal(readBest(empty), 0);
    assert.deepEqual(saveBest(null, invalid, 25), {
      best: 25,
      saved: false,
    });
  }
});

test("a failed write still returns the best record read from storage", () => {
  const storage = {
    getItem: () => "30",
    setItem() { throw new Error("quota exceeded"); },
  };
  assert.deepEqual(saveBest(storage, 10, 0), { best: 30, saved: false });
});
