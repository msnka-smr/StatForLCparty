import test from "node:test";
import assert from "node:assert/strict";
import { TOURNAMENT_PREFIX, formatTournamentText, parseTournamentText } from "../docs/lib/tournamentText.mjs";

const sid = (n) => "7656119800000" + String(n).padStart(4, "0");

function makeTeams({ guest = false } = {}) {
  return [1, 2, 3, 4].map((number) => ({
    number,
    players: [0, 1, 2, 3, 4].map((i) => ({
      name: `Игрок ${number}-${i}`,
      steamid64: guest && number === 2 && i === 4 ? null : sid(number * 10 + i),
      captain: i === 0,
    })),
  }));
}
const CREATED = "2026-10-27T18:30:00.000Z";

test("prefix is /турнир", () => {
  assert.equal(TOURNAMENT_PREFIX, "/турнир");
});

test("format then parse gives back the same structure, including a guest", () => {
  const teams = makeTeams({ guest: true });
  const text = formatTournamentText({ createdAt: CREATED, teams });
  const parsed = parseTournamentText(text);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.tournament.createdAt, CREATED);
  assert.deepEqual(parsed.tournament.teams, teams);
});

test("id is the UTC start time as YYYY-MM-DD-HHmm", () => {
  const parsed = parseTournamentText(formatTournamentText({ createdAt: CREATED, teams: makeTeams() }));
  assert.equal(parsed.tournament.id, "2026-10-27-1830");
});

test("an upper-case prefix is accepted", () => {
  const text = formatTournamentText({ createdAt: CREATED, teams: makeTeams() }).replace("/турнир", "/ТУРНИР");
  assert.equal(parseTournamentText(text).ok, true);
});

test("a name with separators does not break the structure", () => {
  const teams = makeTeams();
  teams[0].players[1].name = "Вася|x=y";
  const parsed = parseTournamentText(formatTournamentText({ createdAt: CREATED, teams }));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.tournament.teams[0].players.length, 5);
  assert.equal(parsed.tournament.teams[0].players[1].steamid64, sid(11));
});

test("an empty name becomes Игрок", () => {
  const teams = makeTeams();
  teams[0].players[1].name = "  ";
  const parsed = parseTournamentText(formatTournamentText({ createdAt: CREATED, teams }));
  assert.equal(parsed.tournament.teams[0].players[1].name, "Игрок");
});

test("three teams are rejected", () => {
  const text = formatTournamentText({ createdAt: CREATED, teams: makeTeams().slice(0, 3) });
  assert.deepEqual(parseTournamentText(text), { ok: false, error: "Нужно 4 команды, получено 3" });
});

test("a team with four players is rejected", () => {
  const teams = makeTeams();
  teams[1].players.pop();
  assert.deepEqual(parseTournamentText(formatTournamentText({ createdAt: CREATED, teams })), {
    ok: false,
    error: "Команда 2: нужно 5 игроков, получено 4",
  });
});

test("two captains in one team are rejected", () => {
  const teams = makeTeams();
  teams[2].players[1].captain = true;
  assert.deepEqual(parseTournamentText(formatTournamentText({ createdAt: CREATED, teams })), {
    ok: false,
    error: "Команда 3: нужен ровно один капитан",
  });
});

test("no captain is rejected", () => {
  const teams = makeTeams();
  teams[0].players[0].captain = false;
  assert.equal(parseTournamentText(formatTournamentText({ createdAt: CREATED, teams })).error, "Команда 1: нужен ровно один капитан");
});

test("repeated team numbers are rejected", () => {
  const teams = makeTeams();
  teams[3].number = 1;
  assert.deepEqual(parseTournamentText(formatTournamentText({ createdAt: CREATED, teams })), {
    ok: false,
    error: "Номера команд должны быть 1, 2, 3, 4 без повторов",
  });
});

test("a duplicated steamid is rejected", () => {
  const teams = makeTeams();
  teams[3].players[2].steamid64 = teams[0].players[2].steamid64;
  assert.deepEqual(parseTournamentText(formatTournamentText({ createdAt: CREATED, teams })), {
    ok: false,
    error: `Повторяется игрок ${teams[0].players[2].steamid64}`,
  });
});

test("a malformed steamid is rejected", () => {
  const teams = makeTeams();
  teams[0].players[3].steamid64 = "123";
  assert.deepEqual(parseTournamentText(formatTournamentText({ createdAt: CREATED, teams })), {
    ok: false,
    error: "Неверный steamid64: 123",
  });
});

test("a malformed start time is rejected", () => {
  const text = formatTournamentText({ createdAt: CREATED, teams: makeTeams() }).replace(CREATED, "вчера");
  assert.deepEqual(parseTournamentText(text), { ok: false, error: "Неверное время запуска: вчера" });
});

test("a text without the prefix is rejected", () => {
  assert.equal(parseTournamentText("привет").ok, false);
});

test("worst case (20 players, 40-char names) fits a Telegram message", () => {
  const teams = makeTeams().map((t) => ({
    ...t,
    players: t.players.map((p) => ({ ...p, name: "Я".repeat(40) })),
  }));
  assert.ok(formatTournamentText({ createdAt: CREATED, teams }).length < 4096);
});

test("ratings survive format and parse, guests included", () => {
  const teams = makeTeams({ guest: true });
  teams.forEach((t) => t.players.forEach((p, i) => (p.rating = 480 + i * 11)));
  const parsed = parseTournamentText(formatTournamentText({ createdAt: CREATED, teams }));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.tournament.teams, teams);
});

test("a fractional rating is rounded to an integer when formatted", () => {
  const teams = makeTeams();
  teams[0].players[1].rating = 512.6;
  const parsed = parseTournamentText(formatTournamentText({ createdAt: CREATED, teams }));
  assert.equal(parsed.tournament.teams[0].players[1].rating, 513);
});

test("a player without a rating gets no rating key", () => {
  const parsed = parseTournamentText(formatTournamentText({ createdAt: CREATED, teams: makeTeams() }));
  assert.equal("rating" in parsed.tournament.teams[0].players[0], false);
});

test("a malformed rating is rejected", () => {
  const text = formatTournamentText({ createdAt: CREATED, teams: makeTeams() }).replace(
    `=${sid(11)}`,
    `=${sid(11)}:abc`
  );
  assert.deepEqual(parseTournamentText(text), { ok: false, error: "Неверный рейтинг: abc" });
});
