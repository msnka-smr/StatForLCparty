import test from "node:test";
import assert from "node:assert/strict";
import { ROUND_ROBIN_SCHEDULE, rankTeams, buildTournamentView } from "../scripts/lib/tournamentStandings.mjs";
import { makeTournament } from "./helpers/tournamentFixtures.mjs";

// Матч для теста: победитель получает 13 раундов, проигравший 5, если не заданы scoreA/scoreB.
function match(lobbyId, a, b, winner, { scoreA, scoreB, kdA, kdB } = {}) {
  return {
    lobbyId,
    playedAt: 1_000_000 + lobbyId,
    a,
    b,
    scoreA: scoreA ?? (winner === a ? 13 : 5),
    scoreB: scoreB ?? (winner === b ? 13 : 5),
    winner,
    kd: { [a]: kdA ?? { k: 50, d: 50 }, [b]: kdB ?? { k: 50, d: 50 } },
  };
}

// Шесть матчей круга; winners — победитель для пар в порядке 1-2, 1-3, 1-4, 2-3, 2-4, 3-4.
const PAIRS = [[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]];
function circle(winners, extras = {}) {
  return PAIRS.map(([a, b], i) => match(i + 1, a, b, winners[i], extras[i]));
}
const T = makeTournament();
const view = (matches, unattributed = []) => buildTournamentView(T, { matches, unattributed });

test("schedule is 1-3/2-4, 2-1/3-4, 2-3/4-1", () => {
  assert.deepEqual(ROUND_ROBIN_SCHEDULE, [[[1, 3], [2, 4]], [[2, 1], [3, 4]], [[2, 3], [4, 1]]]);
});

test("rankTeams with no matches keeps the team order", () => {
  assert.deepEqual(rankTeams([1, 2, 3, 4], []), [1, 2, 3, 4]);
});

test("rankTeams: more wins first, equal wins decided by the head-to-head", () => {
  // победы: 1→2 (над 3 и 4), 2→2 (над 1 и 3), 3→1, 4→1
  const c = circle([2, 1, 1, 2, 4, 3]);
  assert.deepEqual(rankTeams([1, 2, 3, 4], c), [2, 1, 3, 4]);
});

test("rankTeams: the head-to-head beats a better total round difference", () => {
  // команда 2 выиграла личную встречу с 1, хотя у 1 общая разница раундов больше (1–3 выиграно 13:0)
  const c = circle([2, 1, 1, 2, 4, 3], { 1: { scoreA: 13, scoreB: 0 } });
  assert.deepEqual(rankTeams([1, 2, 3, 4], c), [2, 1, 3, 4]);
});

test("rankTeams: a three-way cycle is decided by round difference inside the group", () => {
  // 1 бьёт 2, 2 бьёт 3, 3 бьёт 1; все трое бьют 4
  const c = circle([1, 3, 1, 2, 2, 3], {
    0: { scoreA: 13, scoreB: 10 }, // 1 побеждает 2: +3 / -3
    1: { scoreA: 12, scoreB: 13 }, // 3 побеждает 1: -1 / +1
    3: { scoreA: 13, scoreB: 9 }, //  2 побеждает 3: +4 / -4
  });
  assert.deepEqual(rankTeams([1, 2, 3, 4], c), [1, 2, 3, 4]);
});

test("rankTeams: equal round difference is decided by team K/D, then by captain number", () => {
  const equalScores = { scoreA: 13, scoreB: 10 };
  const c = circle([1, 3, 1, 2, 2, 3], {
    0: { ...equalScores },
    1: { scoreA: 10, scoreB: 13 },
    3: { ...equalScores },
  });
  // у команды 3 лучший K/D во всех её матчах
  for (const m of c) {
    if (m.a === 3) m.kd[3] = { k: 80, d: 40 };
    if (m.b === 3) m.kd[3] = { k: 80, d: 40 };
  }
  assert.deepEqual(rankTeams([1, 2, 3, 4], c), [3, 1, 2, 4]);
});

test("five matches: still the circle, no final yet", () => {
  const v = view(circle([1, 1, 1, 2, 2, 3]).slice(0, 5));
  assert.equal(v.status, "circle");
  assert.equal(v.final, null);
  assert.equal(v.third, null);
});

test("six matches: playoff status, final and third pairs are known but unplayed", () => {
  const v = view(circle([1, 1, 1, 2, 2, 3]));
  assert.equal(v.status, "playoff");
  assert.deepEqual(v.order, [1, 2, 3, 4]);
  assert.deepEqual([v.final.a, v.final.b, v.final.lobbyId], [1, 2, null]);
  assert.deepEqual([v.third.a, v.third.b, v.third.lobbyId], [3, 4, null]);
  assert.ok(v.teams.every((t) => t.rank === null));
});

test("final and third-place matches finish the tournament and give places 1-4", () => {
  const c = circle([1, 1, 1, 2, 2, 3]);
  const v = view([...c, match(7, 1, 2, 2), match(8, 3, 4, 4)]);
  assert.equal(v.status, "finished");
  assert.equal(v.final.winner, 2);
  assert.equal(v.final.url, "https://cybershoke.net/match/7");
  const rank = Object.fromEntries(v.teams.map((t) => [t.number, t.rank]));
  assert.deepEqual(rank, { 1: 2, 2: 1, 3: 4, 4: 3 });
});

test("only the final played: status stays playoff", () => {
  const v = view([...circle([1, 1, 1, 2, 2, 3]), match(7, 1, 2, 1)]);
  assert.equal(v.status, "playoff");
  assert.equal(v.final.winner, 1);
  assert.equal(v.third.lobbyId, null);
});

test("a repeat of a pair that is not a playoff pair is unattributed", () => {
  const v = view([...circle([1, 1, 1, 2, 2, 3]), match(7, 1, 3, 1)]);
  assert.deepEqual(v.unattributed, [
    { lobbyId: 7, reason: "Повторный матч пары, не относящийся к плей-офф" },
  ]);
  assert.equal(v.final.lobbyId, null);
});

test("a repeat of a pair before the circle is complete is unattributed", () => {
  const c = circle([1, 1, 1, 2, 2, 3]).slice(0, 4);
  const v = view([...c, match(9, 1, 2, 2)]);
  assert.deepEqual(v.unattributed, [{ lobbyId: 9, reason: "Круг ещё не закончен" }]);
});

test("unattributed matches from the matcher are passed through", () => {
  const v = view([], [{ lobbyId: 5, reason: "В матче нет игроков турнира" }]);
  assert.deepEqual(v.unattributed, [{ lobbyId: 5, reason: "В матче нет игроков турнира" }]);
});

test("teams, rounds and standings are shaped for the page", () => {
  const v = view([match(1, 1, 3, 1), match(2, 2, 4, 4)]);
  assert.equal(v.id, T.id);
  assert.equal(v.createdAt, T.createdAt);
  assert.equal(v.teams.length, 4);
  assert.equal(v.teams[0].captain, "Игрок 1");
  assert.equal(v.teams[0].players.length, 5);
  assert.equal(v.teams[0].played, 1);
  assert.equal(v.teams[0].wins, 1);
  assert.equal(v.teams[0].roundDiff, 8);
  assert.equal(v.teams[0].kd, 1);
  assert.equal(v.teams[1].kd, 1);
  assert.equal(v.rounds.length, 3);
  assert.equal(v.rounds[0].round, 1);
  assert.equal(v.rounds[0].matches.length, 2);
  const played = v.rounds[0].matches.find((s) => s.lobbyId === 1);
  assert.deepEqual([played.a, played.b, played.winner, played.scoreA, played.scoreB], [1, 3, 1, 13, 5]);
  const unplayed = v.rounds[1].matches[0];
  assert.equal(unplayed.lobbyId, null);
  assert.equal(unplayed.winner, null);
  assert.equal(v.status, "circle");
});

test("a tournament with no matches has empty zero rows", () => {
  const v = view([]);
  assert.equal(v.status, "circle");
  assert.ok(v.teams.every((t) => t.played === 0 && t.wins === 0 && t.kd === null && t.rank === null));
});

test("a rematch played before the circle ended is not taken for the final", () => {
  // лобби 1 — игра круга 1–2, лобби 2 — переигровка той же пары до конца круга,
  // лобби 3–7 — остальные пять игр круга, лобби 8 — настоящий финал 1–2
  const matches = [
    match(1, 1, 2, 1),
    match(2, 1, 2, 2),
    match(3, 1, 3, 1),
    match(4, 1, 4, 1),
    match(5, 2, 3, 2),
    match(6, 2, 4, 2),
    match(7, 3, 4, 3),
    match(8, 1, 2, 2),
  ];
  const v = view(matches);
  assert.equal(v.final.lobbyId, 8);
  assert.equal(v.final.winner, 2);
  assert.deepEqual(v.unattributed, [{ lobbyId: 2, reason: "Повторный матч пары до окончания круга" }]);
});

// --- пометки о тай-брейке ---

test("a two-team tie is explained by the head-to-head with the score", () => {
  const v = view(circle([2, 1, 1, 2, 4, 3]));
  assert.equal(v.ties.length, 2);
  const first = v.ties[0];
  assert.deepEqual(first.teams, [2, 1]);
  assert.match(first.text, /★ Игрок 6 и ★ Игрок 1/);
  assert.match(first.text, /по 2 победы/);
  assert.match(first.text, /выше ★ Игрок 6, он выиграл личную встречу \(13:5\)/);
  assert.deepEqual(v.ties[1].teams, [3, 4]);
});

test("tied teams carry the footnote number, others do not", () => {
  const v = view(circle([2, 1, 1, 2, 4, 3]));
  const mark = Object.fromEntries(v.teams.map((t) => [t.number, t.tie]));
  assert.deepEqual(mark, { 1: 1, 2: 1, 3: 2, 4: 2 });
});

test("a three-way cycle is explained by the round difference inside the group", () => {
  const c = circle([1, 3, 1, 2, 2, 3], {
    0: { scoreA: 13, scoreB: 10 },
    1: { scoreA: 12, scoreB: 13 },
    3: { scoreA: 13, scoreB: 9 },
  });
  const [tie] = view(c).ties;
  assert.deepEqual(tie.teams, [1, 2, 3]);
  assert.match(tie.text, /личные встречи не разделили/);
  assert.match(tie.text, /разнице раундов в играх между ними/);
});

test("a tie settled by K/D says so", () => {
  const c = circle([1, 3, 1, 2, 2, 3], { 0: { scoreA: 13, scoreB: 10 }, 1: { scoreA: 10, scoreB: 13 }, 3: { scoreA: 13, scoreB: 10 } });
  for (const m of c) {
    if (m.a === 3) m.kd[3] = { k: 80, d: 40 };
    if (m.b === 3) m.kd[3] = { k: 80, d: 40 };
  }
  const [tie] = view(c).ties;
  assert.match(tie.text, /среднему K\/D/);
});

test("no tie, no note", () => {
  const v = view(circle([1, 1, 1, 2, 2, 3]));
  assert.deepEqual(v.ties, []);
  assert.ok(v.teams.every((t) => t.tie === null));
});

test("an unfinished circle shows no tie notes yet", () => {
  const v = view(circle([2, 1, 1, 2, 4, 3]).slice(0, 5));
  assert.deepEqual(v.ties, []);
});
