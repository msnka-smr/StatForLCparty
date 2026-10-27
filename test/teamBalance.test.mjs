import test from "node:test";
import assert from "node:assert/strict";
import {
  WARN_SPREAD_PCT,
  validateRoster,
  validateLocks,
  defaultCaptainOrder,
  buildTeamVariants,
  suggestSwaps,
  evaluateTeams,
} from "../docs/lib/teamBalance.mjs";

// 20 игроков p0…p19: чем больше номер, тем сильнее.
function makePlayers(n = 20) {
  return Array.from({ length: n }, (_, i) => ({
    id: "p" + i,
    name: "Игрок " + i,
    rating: 400 + i * 10,
    kd: 0.8 + i * 0.03,
    k: 10 + i * 2,
    d: 30 - i,
  }));
}
const CAPTAINS = ["p0", "p5", "p10", "p15"];

test("validateRoster: not enough players", () => {
  assert.deepEqual(validateRoster({ selected: 19, captains: 4 }), {
    ok: false,
    message: "Не хватает игроков: 1 (нужно 20 для 4 команд)",
  });
});

test("validateRoster: too many players", () => {
  assert.deepEqual(validateRoster({ selected: 22, captains: 4 }), {
    ok: false,
    message: "Лишних игроков: 2 (нужно 20 для 4 команд)",
  });
});

test("validateRoster: captains outside 2..10", () => {
  assert.equal(validateRoster({ selected: 5, captains: 1 }).message, "Капитанов должно быть от 2 до 10");
  assert.equal(validateRoster({ selected: 55, captains: 11 }).message, "Капитанов должно быть от 2 до 10");
});

test("validateRoster: ok for 4 captains and 20 players", () => {
  assert.deepEqual(validateRoster({ selected: 20, captains: 4 }), { ok: true, message: "" });
});

test("validateLocks catches each kind of mistake", () => {
  const captainIds = ["a", "b"];
  assert.equal(validateLocks({ captainIds, locked: { a: ["x"], b: ["x"] } }).ok, false);
  assert.equal(validateLocks({ captainIds, locked: { a: ["1", "2", "3", "4", "5"] } }).ok, false);
  assert.equal(validateLocks({ captainIds, locked: { a: ["b"] } }).ok, false);
  assert.equal(validateLocks({ captainIds, locked: { zzz: ["x"] } }).ok, false);
  assert.equal(validateLocks({ captainIds, locked: { a: ["x", "y"], b: ["z"] } }).ok, true);
});

test("defaultCaptainOrder sorts captains by rating descending", () => {
  assert.deepEqual(defaultCaptainOrder(makePlayers(), ["p5", "p15", "p0", "p10"]), ["p15", "p10", "p5", "p0"]);
});

test("buildTeamVariants makes 4 balanced teams of 5, captain first, each player once", () => {
  const { variants } = buildTeamVariants({ players: makePlayers(), captainIds: CAPTAINS, locked: {} });
  const best = variants[0];
  assert.equal(best.teams.length, 4);
  for (const [i, t] of best.teams.entries()) {
    assert.equal(t.memberIds.length, 5);
    assert.equal(t.memberIds[0], CAPTAINS[i]);
  }
  const all = best.teams.flatMap((t) => t.memberIds).sort();
  assert.deepEqual(all, makePlayers().map((p) => p.id).sort());
  assert.ok(best.spreadPct < WARN_SPREAD_PCT, "spread " + best.spreadPct);
});

test("buildTeamVariants returns two different variants, best first", () => {
  const { variants } = buildTeamVariants({ players: makePlayers(), captainIds: CAPTAINS, locked: {} });
  assert.equal(variants.length, 2);
  assert.ok(variants[0].spreadPct <= variants[1].spreadPct);
  assert.notDeepEqual(variants[0].teams, variants[1].teams);
});

test("locked players stay with their captain in every variant", () => {
  const locked = { p0: ["p19", "p18"], p5: ["p1"] };
  const { variants } = buildTeamVariants({ players: makePlayers(), captainIds: CAPTAINS, locked });
  for (const v of variants) {
    const team = (id) => v.teams.find((t) => t.captainId === id).memberIds;
    assert.ok(team("p0").includes("p19") && team("p0").includes("p18"));
    assert.ok(team("p5").includes("p1"));
  }
});

test("fully locked teams give one variant and do not throw", () => {
  const locked = {
    p0: ["p1", "p2", "p3", "p4"],
    p5: ["p6", "p7", "p8", "p9"],
    p10: ["p11", "p12", "p13", "p14"],
    p15: ["p16", "p17", "p18", "p19"],
  };
  const { variants } = buildTeamVariants({ players: makePlayers(), captainIds: CAPTAINS, locked });
  assert.equal(variants.length, 1);
});

test("buildTeamVariants is deterministic", () => {
  const input = { players: makePlayers(), captainIds: CAPTAINS, locked: { p0: ["p19"] } };
  assert.deepEqual(buildTeamVariants(input), buildTeamVariants(input));
});

test("identical players give spread 0 and no NaN", () => {
  const players = makePlayers().map((p) => ({ ...p, rating: 500, kd: 1, k: 10, d: 10 }));
  const { variants } = buildTeamVariants({ players, captainIds: CAPTAINS, locked: {} });
  assert.equal(variants[0].spreadPct, 0);
});

test("buildTeamVariants throws the validation message for a wrong roster", () => {
  assert.throws(
    () => buildTeamVariants({ players: makePlayers(19), captainIds: CAPTAINS, locked: {} }),
    /Не хватает игроков: 1/
  );
});

test("works for two teams of five", () => {
  const { variants } = buildTeamVariants({ players: makePlayers(10), captainIds: ["p0", "p9"], locked: {} });
  assert.equal(variants[0].teams.length, 2);
});

test("evaluateTeams scores hand-made teams", () => {
  const players = makePlayers();
  const teams = [
    { captainId: "p0", memberIds: ["p0", "p1", "p2", "p3", "p4"] },
    { captainId: "p5", memberIds: ["p5", "p6", "p7", "p8", "p9"] },
    { captainId: "p10", memberIds: ["p10", "p11", "p12", "p13", "p14"] },
    { captainId: "p15", memberIds: ["p15", "p16", "p17", "p18", "p19"] },
  ];
  const result = evaluateTeams({ players, teams });
  assert.equal(result.teamStrengths.length, 4);
  assert.ok(result.teamStrengths[0] < result.teamStrengths[3]);
  assert.ok(result.spreadPct > WARN_SPREAD_PCT);
});

test("suggestSwaps proposes an improving swap that never moves locked players or captains", () => {
  const players = makePlayers();
  const locked = { p0: ["p1"] };
  const ctx = { players, captainIds: CAPTAINS, locked };
  // состав вручную: слабые к слабому капитану, сильные к сильному
  const result = evaluateTeams({
    players,
    teams: [
      { captainId: "p0", memberIds: ["p0", "p1", "p2", "p3", "p4"] },
      { captainId: "p5", memberIds: ["p5", "p6", "p7", "p8", "p9"] },
      { captainId: "p10", memberIds: ["p10", "p11", "p12", "p13", "p14"] },
      { captainId: "p15", memberIds: ["p15", "p16", "p17", "p18", "p19"] },
    ],
  });
  assert.ok(result.spreadPct > WARN_SPREAD_PCT, "need a skewed result, got " + result.spreadPct);
  const swaps = suggestSwaps(result, ctx);
  assert.ok(swaps.length > 0);
  const frozen = new Set([...CAPTAINS, "p1"]);
  for (const s of swaps) {
    assert.ok(!frozen.has(s.aId) && !frozen.has(s.bId));
    assert.ok(s.newSpreadPct < result.spreadPct);
    assert.notEqual(s.fromTeam, s.toTeam);
  }
});

test("suggestSwaps returns nothing when the spread is within the threshold", () => {
  const ctx = { players: makePlayers(), captainIds: CAPTAINS, locked: {} };
  const result = buildTeamVariants(ctx).variants[0];
  assert.deepEqual(suggestSwaps(result, ctx), []);
});
