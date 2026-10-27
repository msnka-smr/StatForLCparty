import test from "node:test";
import assert from "node:assert/strict";
import { TOURNAMENT_WINDOW_HOURS, attributeMatches } from "../scripts/lib/tournamentMatches.mjs";
import { makeTournament, makeMap, CREATED_SEC } from "./helpers/tournamentFixtures.mjs";

const T = makeTournament();
const run = (maps, tournaments = [T]) => attributeMatches(tournaments, maps).get(tournaments[0].id);
const HOUR = 3600;

test("window is 48 hours", () => {
  assert.equal(TOURNAMENT_WINDOW_HOURS, 48);
});

test("a regular match between team 1 and team 3 is attributed with winner, scores and kd", () => {
  const map = makeMap({
    lobbyId: 100,
    playedAt: CREATED_SEC + HOUR,
    sideA: { ids: [1, 2, 3, 4, 5], score: 13, won: true, k: 20, d: 10 },
    sideB: { ids: [11, 12, 13, 14, 15], score: 9, won: false, k: 10, d: 20 },
  });
  const { matches, unattributed } = run([map]);
  assert.deepEqual(unattributed, []);
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0], {
    lobbyId: 100,
    playedAt: CREATED_SEC + HOUR,
    a: 1,
    b: 3,
    scoreA: 13,
    scoreB: 9,
    winner: 1,
    kd: { 1: { k: 100, d: 50 }, 3: { k: 50, d: 100 } },
  });
});

test("a and b are ordered by team number regardless of the lobby side", () => {
  const map = makeMap({
    lobbyId: 101,
    playedAt: CREATED_SEC + HOUR,
    sideA: { ids: [16, 17, 18, 19, 20], score: 5, won: false },
    sideB: { ids: [6, 7, 8, 9, 10], score: 13, won: true },
  });
  const [m] = run([map]).matches;
  assert.equal(m.a, 2);
  assert.equal(m.b, 4);
  assert.equal(m.scoreA, 13);
  assert.equal(m.scoreB, 5);
  assert.equal(m.winner, 2);
});

test("a side with 2 known players and 3 guests still maps to its team", () => {
  const map = makeMap({
    lobbyId: 102,
    playedAt: CREATED_SEC + HOUR,
    sideA: { ids: [1, 2, "76561198999999991", "76561198999999992", "76561198999999993"], score: 13, won: true },
    sideB: { ids: [11, 12, 13, 14, 15], score: 1, won: false },
  });
  assert.equal(run([map]).matches.length, 1);
});

test("a side split 2/2 between two teams is unattributed", () => {
  const map = makeMap({
    lobbyId: 103,
    playedAt: CREATED_SEC + HOUR,
    sideA: { ids: [1, 2, 6, 7, "76561198999999991"], score: 13, won: true },
    sideB: { ids: [11, 12, 13, 14, 15], score: 1, won: false },
  });
  const r = run([map]);
  assert.equal(r.matches.length, 0);
  assert.deepEqual(r.unattributed.map((u) => u.lobbyId), [103]);
});

test("both sides from the same team are unattributed", () => {
  const map = makeMap({
    lobbyId: 104,
    playedAt: CREATED_SEC + HOUR,
    sideA: { ids: [1, 2, 3], score: 13, won: true },
    sideB: { ids: [4, 5], score: 1, won: false },
  });
  assert.equal(run([map]).unattributed[0].lobbyId, 104);
});

test("a match with no winner is unattributed", () => {
  const map = makeMap({
    lobbyId: 105,
    playedAt: CREATED_SEC + HOUR,
    sideA: { ids: [1, 2, 3, 4, 5], score: 12, won: null },
    sideB: { ids: [11, 12, 13, 14, 15], score: 12, won: null },
  });
  const r = run([map]);
  assert.equal(r.matches.length, 0);
  assert.equal(r.unattributed[0].lobbyId, 105);
});

test("a match with no tournament players inside the window is listed as unattributed", () => {
  const map = makeMap({
    lobbyId: 106,
    playedAt: CREATED_SEC + HOUR,
    sideA: { ids: [101, 102, 103, 104, 105], score: 13, won: true },
    sideB: { ids: [106, 107, 108, 109, 110], score: 2, won: false },
  });
  const r = run([map]);
  assert.equal(r.matches.length, 0);
  assert.deepEqual(r.unattributed, [{ lobbyId: 106, reason: "В матче нет игроков турнира" }]);
});

test("matches before the start or after the 48 h window are ignored completely", () => {
  const early = makeMap({
    lobbyId: 107,
    playedAt: CREATED_SEC - 1,
    sideA: { ids: [1, 2, 3, 4, 5], score: 13, won: true },
    sideB: { ids: [11, 12, 13, 14, 15], score: 1, won: false },
  });
  const late = makeMap({
    lobbyId: 108,
    playedAt: CREATED_SEC + 48 * HOUR + 1,
    sideA: { ids: [1, 2, 3, 4, 5], score: 13, won: true },
    sideB: { ids: [11, 12, 13, 14, 15], score: 1, won: false },
  });
  const r = run([early, late]);
  assert.deepEqual(r, { matches: [], unattributed: [] });
});

test("with two tournaments of the same roster the later one gets the match", () => {
  const older = makeTournament({ createdAt: "2026-10-27T10:00:00.000Z" });
  const newer = makeTournament({ createdAt: "2026-10-27T18:30:00.000Z" });
  const map = makeMap({
    lobbyId: 109,
    playedAt: CREATED_SEC + HOUR,
    sideA: { ids: [1, 2, 3, 4, 5], score: 13, won: true },
    sideB: { ids: [11, 12, 13, 14, 15], score: 1, won: false },
  });
  const out = attributeMatches([older, newer], [map]);
  assert.equal(out.get(older.id).matches.length, 0);
  assert.equal(out.get(newer.id).matches.length, 1);
});

test("two maps of one lobby give one match (lowest mapIndex)", () => {
  const base = {
    lobbyId: 110,
    playedAt: CREATED_SEC + HOUR,
    sideA: { ids: [1, 2, 3, 4, 5], score: 13, won: true },
    sideB: { ids: [11, 12, 13, 14, 15], score: 1, won: false },
  };
  const second = makeMap({
    ...base,
    mapIndex: 2,
    sideA: { ...base.sideA, score: 7, won: false },
    sideB: { ...base.sideB, score: 13, won: true },
  });
  const r = run([second, makeMap(base)]);
  assert.equal(r.matches.length, 1);
  assert.equal(r.matches[0].winner, 1);
});

test("kd counts every player of the side, substitutes included", () => {
  const map = makeMap({
    lobbyId: 111,
    playedAt: CREATED_SEC + HOUR,
    sideA: { ids: [1, 2, 3, "76561198999999991", "76561198999999992"], score: 13, won: true, k: 10, d: 5 },
    sideB: { ids: [11, 12, 13, 14, 15], score: 1, won: false },
  });
  assert.deepEqual(run([map]).matches[0].kd[1], { k: 50, d: 25 });
});

test("matches come back in chronological order", () => {
  const mk = (lobbyId, t) =>
    makeMap({
      lobbyId,
      playedAt: CREATED_SEC + t,
      sideA: { ids: [1, 2, 3, 4, 5], score: 13, won: true },
      sideB: { ids: [11, 12, 13, 14, 15], score: 1, won: false },
    });
  assert.deepEqual(run([mk(2, 2 * HOUR), mk(1, HOUR)]).matches.map((m) => m.lobbyId), [1, 2]);
});
