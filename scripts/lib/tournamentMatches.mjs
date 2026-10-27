// Привязка уже скачанных матчей к турнирам. Работает по нормализованным картам
// (после алиасов и фильтра coreSteamIds), ничего не читает с диска и не ходит
// в сеть. Правила — в specs/2026-10-27-teams-and-tournaments-design.md.

export const TOURNAMENT_WINDOW_HOURS = 48;

const NO_PLAYERS = "В матче нет игроков турнира";
const SIDE_UNKNOWN = "Не удалось определить команду стороны";
const SAME_TEAM = "Обе стороны сопоставлены с одной командой";
const NO_WINNER = "Победитель матча не определён";

// По одной карте на лобби: с наименьшим mapIndex.
function firstMapPerLobby(maps) {
  const byLobby = new Map();
  for (const m of maps) {
    const prev = byLobby.get(m.lobbyId);
    if (!prev || m.mapIndex < prev.mapIndex) byLobby.set(m.lobbyId, m);
  }
  return [...byLobby.values()];
}

function sidesOf(map) {
  const keys = [...new Set(map.players.map((p) => p.team))];
  return keys.map((key) => ({
    key,
    players: map.players.filter((p) => p.team === key),
    team: map.teams.find((t) => t.key === key) ?? null,
  }));
}

// Номер команды турнира, чьих игроков в стороне больше всего (минимум один).
// Возвращает { count: 0 } если игроков турнира нет, { ambiguous: true } при равенстве.
function mapSide(side, rosterByTeam) {
  const counts = new Map();
  for (const p of side.players) {
    for (const [number, ids] of rosterByTeam) {
      if (ids.has(p.steamid64)) counts.set(number, (counts.get(number) ?? 0) + 1);
    }
  }
  if (!counts.size) return { count: 0 };
  const top = Math.max(...counts.values());
  const leaders = [...counts].filter(([, c]) => c === top).map(([n]) => n);
  return leaders.length === 1 ? { team: leaders[0], count: top } : { ambiguous: true, count: top };
}

function evaluate(map, rosterByTeam) {
  const sides = sidesOf(map);
  if (sides.length !== 2) return { reason: SIDE_UNKNOWN };
  const mapped = sides.map((s) => mapSide(s, rosterByTeam));
  if (mapped.every((m) => m.count === 0)) return { reason: NO_PLAYERS };
  if (mapped.some((m) => m.team === undefined)) return { reason: SIDE_UNKNOWN };
  if (mapped[0].team === mapped[1].team) return { reason: SAME_TEAM };

  const winnerIdx = sides.findIndex((s) => s.players.some((p) => p.won === true));
  const loserIdx = sides.findIndex((s) => s.players.some((p) => p.won === false));
  if (winnerIdx === -1 || loserIdx === -1 || winnerIdx === loserIdx) return { reason: NO_WINNER };

  const [first, second] = mapped[0].team < mapped[1].team ? [0, 1] : [1, 0];
  const sum = (side, field) => side.players.reduce((s, p) => s + (p[field] ?? 0), 0);
  return {
    match: {
      lobbyId: map.lobbyId,
      playedAt: map.playedAt,
      a: mapped[first].team,
      b: mapped[second].team,
      scoreA: sides[first].team?.score ?? null,
      scoreB: sides[second].team?.score ?? null,
      winner: mapped[winnerIdx].team,
      kd: {
        [mapped[first].team]: { k: sum(sides[first], "k"), d: sum(sides[first], "d") },
        [mapped[second].team]: { k: sum(sides[second], "k"), d: sum(sides[second], "d") },
      },
    },
  };
}

export function attributeMatches(tournaments, maps) {
  const out = new Map(tournaments.map((t) => [t.id, { matches: [], unattributed: [] }]));
  const prepared = tournaments.map((t) => ({
    tournament: t,
    startSec: Date.parse(t.createdAt) / 1000,
    rosterByTeam: new Map(
      t.teams.map((team) => [
        team.number,
        new Set(team.players.map((p) => p.steamid64).filter((id) => id != null)),
      ])
    ),
  }));
  const windowSec = TOURNAMENT_WINDOW_HOURS * 3600;

  for (const map of firstMapPerLobby(maps)) {
    if (map.playedAt == null) continue;
    const inWindow = prepared.filter(
      (p) => map.playedAt >= p.startSec && map.playedAt <= p.startSec + windowSec
    );
    if (!inWindow.length) continue;

    const evaluated = inWindow.map((p) => ({ p, result: evaluate(map, p.rosterByTeam) }));
    const matching = evaluated
      .filter((e) => e.result.match)
      .sort((x, y) => y.p.startSec - x.p.startSec);
    if (matching.length) {
      out.get(matching[0].p.tournament.id).matches.push(matching[0].result.match);
    } else {
      for (const e of evaluated) {
        out.get(e.p.tournament.id).unattributed.push({ lobbyId: map.lobbyId, reason: e.result.reason });
      }
    }
  }

  for (const entry of out.values()) {
    entry.matches.sort((x, y) => x.playedAt - y.playedAt || x.lobbyId - y.lobbyId);
    entry.unattributed.sort((x, y) => x.lobbyId - y.lobbyId);
  }
  return out;
}
