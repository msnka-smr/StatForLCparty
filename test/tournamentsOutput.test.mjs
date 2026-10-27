import test from "node:test";
import assert from "node:assert/strict";
import { buildTournamentsOutput } from "../scripts/lib/tournamentsOutput.mjs";
import { makeTournament, makeMap, CREATED_SEC } from "./helpers/tournamentFixtures.mjs";

test("no tournaments gives an empty array", () => {
  assert.deepEqual(buildTournamentsOutput([], []), []);
});

test("a tournament without matches has all-zero circle rows", () => {
  const [v] = buildTournamentsOutput([makeTournament()], []);
  assert.equal(v.status, "circle");
  assert.ok(v.teams.every((t) => t.played === 0));
});

test("newest tournament comes first", () => {
  const older = makeTournament({ createdAt: "2026-10-20T18:00:00.000Z" });
  const newer = makeTournament({ createdAt: "2026-10-27T18:30:00.000Z" });
  const out = buildTournamentsOutput([older, newer], []);
  assert.deepEqual(out.map((v) => v.id), [newer.id, older.id]);
});

test("a played match shows up in the matching tournament view", () => {
  const map = makeMap({
    lobbyId: 500,
    playedAt: CREATED_SEC + 3600,
    sideA: { ids: [1, 2, 3, 4, 5], score: 13, won: true },
    sideB: { ids: [11, 12, 13, 14, 15], score: 4, won: false },
  });
  const [v] = buildTournamentsOutput([makeTournament()], [map]);
  assert.equal(v.rounds[0].matches[0].lobbyId, 500);
  assert.equal(v.teams[0].wins, 1);
});
