import test from "node:test";
import assert from "node:assert/strict";
import { sortRows } from "../scripts/lib/sort.mjs";

test("there is no qualification grouping: rows sort by the chosen column only", () => {
  const rows = [
    { name: "low-rated", isQualified: true, rating: 0.5 },
    { name: "high-rated", isQualified: false, rating: 3.0 },
  ];
  const sorted = sortRows(rows, "rating", "desc");
  assert.equal(sorted[0].name, "high-rated");
  assert.equal(sorted[1].name, "low-rated");
});

test("sorts by the chosen column descending", () => {
  const rows = [
    { name: "a", isQualified: true, rating: 1.1 },
    { name: "b", isQualified: true, rating: 1.5 },
    { name: "c", isQualified: true, rating: 0.9 },
  ];
  const sorted = sortRows(rows, "rating", "desc").map((r) => r.name);
  assert.deepEqual(sorted, ["b", "a", "c"]);
});

test("ascending direction is respected", () => {
  const rows = [
    { name: "a", isQualified: true, rating: 1.1 },
    { name: "b", isQualified: true, rating: 1.5 },
  ];
  const sorted = sortRows(rows, "rating", "asc").map((r) => r.name);
  assert.deepEqual(sorted, ["a", "b"]);
});
