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
const EARLY_REPEAT_REASON = "Повторный матч пары до окончания круга";

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

// Группы команд с одинаковым числом побед (по убыванию побед). Внутри группы
// порядок по ключам: победы в матчах между командами группы (личные встречи),
// разница раундов в этих же матчах, средний K/D по всему кругу, номер команды.
function tieGroups(teams, circle) {
  const wins = new Map(teams.map((t) => [t, 0]));
  for (const m of circle) wins.set(m.winner, (wins.get(m.winner) ?? 0) + 1);

  const groups = new Map();
  for (const t of teams) {
    const w = wins.get(t);
    groups.set(w, [...(groups.get(w) ?? []), t]);
  }

  return [...groups.keys()]
    .sort((x, y) => y - x)
    .map((w) => {
      const group = groups.get(w);
      const inside = circle.filter((m) => group.includes(m.a) && group.includes(m.b));
      const rows = group
        .map((t) => ({
          team: t,
          h2h: inside.filter((m) => m.winner === t).length,
          diff: inside.filter((m) => m.a === t || m.b === t).reduce((sum, m) => sum + scoreFor(m, t), 0),
          kd: teamKd(t, circle) ?? 0,
        }))
        .sort((x, y) => y.h2h - x.h2h || y.diff - x.diff || y.kd - x.kd || x.team - y.team);
      return { wins: w, rows };
    });
}

// Номера команд от лучшей к худшей. Победы; при равенстве — личные встречи
// между равными командами, затем разница раундов в этих играх, затем средний
// K/D команды по кругу, затем номер команды (капитана).
export function rankTeams(teams, circle) {
  return tieGroups(teams, circle).flatMap((g) => g.rows.map((r) => r.team));
}

// Какой показатель развёл команды группы: первый, значения которого не одинаковы у всех.
function decidingReason(rows) {
  const differs = (f) => rows.some((r) => Math.abs(f(r) - f(rows[0])) > 1e-9);
  if (differs((r) => r.h2h)) return "h2h";
  if (differs((r) => r.diff)) return "diff";
  if (differs((r) => r.kd)) return "kd";
  return "number";
}

function winsWord(n) {
  return n === 1 ? "победе" : n >= 2 && n <= 4 ? "победы" : "побед";
}
const signed = (v) => (v > 0 ? "+" + v : v < 0 ? "−" + Math.abs(v) : "0");

// Пояснения к равенству побед для подписи под таблицей.
function explainTies(tournament, teams, circle) {
  const label = (n) => `★ ${tournament.teams.find((t) => t.number === n)?.players.find((p) => p.captain)?.name ?? n}`;
  return tieGroups(teams, circle)
    .filter((g) => g.rows.length > 1)
    .map((g, i) => {
      const names = g.rows.map((r) => label(r.team));
      const list = names.length === 2 ? `${names[0]} и ${names[1]}` : names.join(", ");
      const head = `В круге ${list}: по ${g.wins} ${winsWord(g.wins)}`;
      const reason = decidingReason(g.rows);
      let text;
      if (reason === "h2h" && g.rows.length === 2) {
        const m = circle.find((x) => g.rows.every((r) => r.team === x.a || r.team === x.b));
        const win = m.winner === m.a ? [m.scoreA, m.scoreB] : [m.scoreB, m.scoreA];
        text = `${head} — выше ${names[0]}, он выиграл личную встречу (${win[0] ?? "?"}:${win[1] ?? "?"}).`;
      } else if (reason === "h2h") {
        text = `${head} — порядок по личным встречам между ними (${g.rows.map((r, k) => `${names[k]} ${r.h2h}`).join(", ")}).`;
      } else if (reason === "diff") {
        text = `${head} — личные встречи не разделили, порядок по разнице раундов в играх между ними (${g.rows.map((r, k) => `${names[k]} ${signed(r.diff)}`).join(", ")}).`;
      } else if (reason === "kd") {
        text = `${head} — личные встречи и раунды не разделили, порядок по среднему K/D за круг (${g.rows.map((r, k) => `${names[k]} ${r.kd.toFixed(2)}`).join(", ")}).`;
      } else {
        text = `${head} — равны по всем показателям, порядок по номеру команды.`;
      }
      return { number: i + 1, teams: g.rows.map((r) => r.team), text };
    });
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
  // Пометки о равенстве побед показываем, только когда круг закончен: до этого
  // равенство может ещё разрешиться само.
  const ties = circleDone ? explainTies(tournament, teamNumbers, circle) : [];
  const tieOf = new Map(ties.flatMap((t) => t.teams.map((n) => [n, t.number])));

  let final = null;
  let third = null;
  if (circleDone) {
    final = emptySlot(order[0], order[1]);
    third = emptySlot(order[2], order[3]);
    // Плей-офф идёт только после шестого матча круга: переигровка, сыгранная
    // раньше, не может стать финалом.
    const circleEnd = Math.max(...circle.map((m) => m.playedAt));
    for (const m of rest) {
      const key = pairKey(m.a, m.b);
      if (m.playedAt <= circleEnd) unattributed.push({ lobbyId: m.lobbyId, reason: EARLY_REPEAT_REASON });
      else if (key === pairKey(final.a, final.b) && final.lobbyId === null) final = slotOf(m);
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
      tie: tieOf.get(team.number) ?? null,
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
    ties,
    final,
    third,
    unattributed,
  };
}
