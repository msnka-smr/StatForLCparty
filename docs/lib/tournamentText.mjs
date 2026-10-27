// Текст, которым владелец один раз передаёт боту составы турнира.
// Один модуль для браузера (формирует текст) и скриптов (разбирают его), поэтому
// только стандартный JS.
//
//   /турнир 2026-10-27T18:30:00.000Z
//   1|*Капитан=76561198000000010|Игрок=76561198000000011|Гость=|…
//
// Номер команды, затем игроки через «|»; у капитана перед именем «*»;
// у гостя после «=» пусто.

export const TOURNAMENT_PREFIX = "/турнир";

const PREFIX_RE = /^\s*\/турнир(?=\s|$)/i;
const STEAMID_RE = /^\d{17}$/;

function cleanName(name) {
  const cleaned = String(name ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/[|=]/g, "")
    .replace(/^\s*\*+/, "")
    .trim();
  return cleaned || "Игрок";
}

export function formatTournamentText({ createdAt, teams }) {
  const lines = [`${TOURNAMENT_PREFIX} ${createdAt}`];
  for (const team of teams) {
    const players = team.players.map(
      (p) => `${p.captain ? "*" : ""}${cleanName(p.name)}=${p.steamid64 ?? ""}`
    );
    lines.push([team.number, ...players].join("|"));
  }
  return lines.join("\n");
}

function tournamentId(date) {
  return date.toISOString().slice(0, 16).replace("T", "-").replace(":", "");
}

const fail = (error) => ({ ok: false, error });

export function parseTournamentText(text) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length || !PREFIX_RE.test(lines[0])) {
    return fail(`Текст должен начинаться с ${TOURNAMENT_PREFIX}`);
  }

  const rawTime = lines[0].replace(PREFIX_RE, "").trim();
  const time = new Date(rawTime);
  if (!rawTime || Number.isNaN(time.getTime())) {
    return fail(`Неверное время запуска: ${rawTime}`);
  }

  const teamLines = lines.slice(1);
  if (teamLines.length !== 4) return fail(`Нужно 4 команды, получено ${teamLines.length}`);

  const teams = teamLines.map((line) => {
    const [numberToken, ...tokens] = line.split("|");
    return {
      number: Number(numberToken),
      players: tokens.map((token) => {
        const captain = token.startsWith("*");
        const body = captain ? token.slice(1) : token;
        const at = body.lastIndexOf("=");
        const name = at === -1 ? body : body.slice(0, at);
        const id = at === -1 ? "" : body.slice(at + 1).trim();
        return { name: name.trim(), steamid64: id === "" ? null : id, captain };
      }),
    };
  });

  const numbers = teams.map((t) => t.number).sort();
  if (numbers.join(",") !== "1,2,3,4") return fail("Номера команд должны быть 1, 2, 3, 4 без повторов");

  for (const team of teams) {
    if (team.players.length !== 5) {
      return fail(`Команда ${team.number}: нужно 5 игроков, получено ${team.players.length}`);
    }
    if (team.players.filter((p) => p.captain).length !== 1) {
      return fail(`Команда ${team.number}: нужен ровно один капитан`);
    }
  }

  const seen = new Set();
  for (const team of teams) {
    for (const p of team.players) {
      if (p.steamid64 === null) continue;
      if (!STEAMID_RE.test(p.steamid64)) return fail(`Неверный steamid64: ${p.steamid64}`);
      if (seen.has(p.steamid64)) return fail(`Повторяется игрок ${p.steamid64}`);
      seen.add(p.steamid64);
    }
  }

  teams.sort((a, b) => a.number - b.number);
  return {
    ok: true,
    tournament: { id: tournamentId(time), createdAt: time.toISOString(), teams },
  };
}
