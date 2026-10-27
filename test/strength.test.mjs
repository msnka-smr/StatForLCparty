import test from "node:test";
import assert from "node:assert/strict";
import {
  STRENGTH_WEIGHTS,
  makeGuestEstimator,
  playerStrengths,
  spreadPct,
} from "../docs/lib/strength.mjs";

test("spreadPct of equal teams is 0", () => {
  assert.equal(spreadPct([10, 10, 10, 10]), 0);
});

test("spreadPct is (max-min)/mean in percent", () => {
  assert.equal(spreadPct([9, 11]), 20);
});

test("spreadPct with zero mean does not divide by zero", () => {
  assert.equal(spreadPct([0, 0]), 0);
});

test("weights are 0.3 / 0.3 / 0.4", () => {
  assert.deepEqual(STRENGTH_WEIGHTS, { rating: 0.3, kdDiff: 0.3, kd: 0.4 });
});

test("playerStrengths gives 1 to the best on every metric and 0 to the worst", () => {
  const s = playerStrengths([
    { id: "a", rating: 600, kd: 1.4, k: 30, d: 10 },
    { id: "b", rating: 500, kd: 1.0, k: 20, d: 20 },
    { id: "c", rating: 400, kd: 0.6, k: 10, d: 30 },
  ]);
  assert.equal(s.get("a"), 1);
  assert.equal(s.get("c"), 0);
  assert.ok(s.get("b") > 0 && s.get("b") < 1);
});

test("playerStrengths stays finite when all players are identical", () => {
  const same = { rating: 500, kd: 1, k: 10, d: 10 };
  const s = playerStrengths([{ id: "a", ...same }, { id: "b", ...same }, { id: "c", ...same }]);
  for (const v of s.values()) assert.ok(Number.isFinite(v));
});

test("playerStrengths handles a single player", () => {
  const s = playerStrengths([{ id: "a", rating: 500, kd: 1, k: 10, d: 10 }]);
  assert.ok(Number.isFinite(s.get("a")));
});

test("guest estimator recovers a linear kd(rating) relation", () => {
  const all = [400, 500, 600, 700].map((r) => ({ rating: r, kd: 0.5 + r / 1000, k: r / 10, d: 40 }));
  const estimate = makeGuestEstimator(all);
  assert.ok(Math.abs(estimate(500).kd - 1.0) < 1e-9);
});

test("guest estimator never returns a negative kd", () => {
  const all = [400, 500, 600, 700].map((r) => ({ rating: r, kd: 0.5 + r / 1000, k: r / 10, d: 40 }));
  assert.ok(makeGuestEstimator(all)(-5000).kd >= 0);
});
