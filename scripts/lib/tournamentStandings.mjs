// Круг из четырёх команд, финал и матч за 3 место: таблица, тай-брейки, места.
// Чистые функции без диска и сети. Правила — в
// specs/2026-10-27-teams-and-tournaments-design.md.

// Туры круга: 1–3 и 2–4; 2–1 и 3–4; 2–3 и 4–1.
export const ROUND_ROBIN_SCHEDULE = [
  [[1, 3], [2, 4]],
  [[2, 1], [3, 4]],
  [[2, 3], [4, 1]],
];

const CIRCLE_SIZE = 6;
const REPEAT_REASON = "Повторный матч пары, не относящийся к плей-офф";
const CIRCLE_OPEN_REASON = "Круг ещё не закончен";

const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

function scoreFor(match, team) {
  const own = team === match.a ? match.scoreA : match.scoreB;
  const other = team === match.a ? match.scoreB : match.scoreA;
  return (own ?? 0) - (other ?? 0);
}

function teamKd(teamNumber, circle) {
  let k = 0;
  let d = 0;
  for (const m of circle) {
    const stat = m.kd?.[teamNumber];
    if (!stat) continue;
    k += stat.k;
    d += stat.d;
  }
  if (k === 0 && d === 0) return null;
  return d === 0 ? k : k / d;
}

// Номера команд от лучшей к худшей. Победы; внутри группы с равными победами
// лексикографически: победы в матчах внутри группы, разница раундов внутри
// группы, K/D команды по всему кругу, номер команды (капитана).
export function rankTeams(teams, circle) {
  const wins = new Map(teams.map((t) => [t, 0]));
  for (const m of circle) wins.set(m.winner, (wins.get(m.winner) ?? 0) + 1);

  const groups = new Map();
  for (const t of teams) {
    const w = wins.get(t);
    groups.set(w, [...(groups.get(w) ?? []), t]);
  }

  const ordered = [];
  for (const w of [...groups.keys()].sort((x, y) => y - x)) {
    const group = groups.get(w);
    if (group.length === 1) {
      ordered.push(group[0]);
      continue;
    }
    const inside = circle.filter((m) => group.includes(m.a) && group.includes(m.b));
    const key = (t) => ({
      wins: inside.filter((m) => m.winner === t).length,
      diff: inside.filter((m) => m.a === t || m.b === t).reduce((s, m) => s + scoreFor(m, t), 0),
      kd: teamKd(t, circle) ?? 0,
    });
    ordered.push(
      ...group
        .map((t) => ({ t, ...key(t) }))
        .sort((x, y) => y.wins - x.wins || y.diff - x.diff || y.kd - x.kd || x.t - y.t)
        .map((x) => x.t)
    );
  }
  return ordered;
}

function slotOf(match) {
  return {
    a: match.a,
    b: match.b,
    lobbyId: match.lobbyId,
    scoreA: match.scoreA,
    scoreB: match.scoreB,
    winner: match.winner,
    url: `https://cybershoke.net/match/${match.lobbyId}`,
  };
}

function emptySlot(x, y) {
  const [a, b] = x < y ? [x, y] : [y, x];
  return { a, b, lobbyId: null, scoreA: null, scoreB: null, winner: null, url: null };
}

export function buildTournamentView(tournament, attributed) {
  const teamNumbers = tournament.teams.map((t) => t.number);
  const unattributed = [...attributed.unattributed];

  // Первый матч каждой пары — круг; остальные могут быть плей-офф.
  const circleByPair = new Map();
  const rest = [];
  for (const m of attributed.matches) {
    const key = pairKey(m.a, m.b);
    if (circleByPair.has(key)) rest.push(m);
    else circleByPair.set(key, m);
  }
  const circle = [...circleByPair.values()];
  const circleDone = circle.length === CIRCLE_SIZE;

  const order = rankTeams(teamNumbers, circle);

  let final = null;
  let third = null;
  if (circleDone) {
    final = emptySlot(order[0], order[1]);
    third = emptySlot(order[2], order[3]);
    for (const m of rest) {
      const key = pairKey(m.a, m.b);
      if (key === pairKey(final.a, final.b) && final.lobbyId === null) final = slotOf(m);
      else if (key === pairKey(third.a, third.b) && third.lobbyId === null) third = slotOf(m);
      else unattributed.push({ lobbyId: m.lobbyId, reason: REPEAT_REASON });
    }
  } else {
    for (const m of rest) unattributed.push({ lobbyId: m.lobbyId, reason: CIRCLE_OPEN_REASON });
  }

  const finalPlayed = final?.lobbyId != null;
  const thirdPlayed = third?.lobbyId != null;
  const ranks = new Map();
  if (finalPlayed) {
    ranks.set(final.winner, 1);
    ranks.set(final.winner === final.a ? final.b : final.a, 2);
  }
  if (thirdPlayed) {
    ranks.set(third.winner, 3);
    ranks.set(third.winner === third.a ? third.b : third.a, 4);
  }

  const teams = tournament.teams.map((team) => {
    const mine = circle.filter((m) => m.a === team.number || m.b === team.number);
    return {
      number: team.number,
      captain: team.players.find((p) => p.captain)?.name ?? "",
      players: team.players,
      played: mine.length,
      wins: mine.filter((m) => m.winner === team.number).length,
      roundDiff: mine.reduce((s, m) => s + scoreFor(m, team.number), 0),
      kd: teamKd(team.number, circle),
      rank: ranks.get(team.number) ?? null,
    };
  });

  const rounds = ROUND_ROBIN_SCHEDULE.map((pairs, i) => ({
    round: i + 1,
    matches: pairs.map(([x, y]) => {
      const m = circleByPair.get(pairKey(x, y));
      return m ? slotOf(m) : emptySlot(x, y);
    }),
  }));

  return {
    id: tournament.id,
    createdAt: tournament.createdAt,
    status: !circleDone ? "circle" : finalPlayed && thirdPlayed ? "finished" : "playoff",
    teams,
    rounds,
    order,
    final,
    third,
    unattributed,
  };
}
