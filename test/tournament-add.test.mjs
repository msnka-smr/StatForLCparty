import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { formatTournamentText } from "../docs/lib/tournamentText.mjs";
import { makeTournament } from "./helpers/tournamentFixtures.mjs";

const CLI = path.resolve("scripts/tournament-add.mjs");

function setup(text) {
  const dir = mkdtempSync(path.join(tmpdir(), "lc-tournaments-"));
  const file = path.join(dir, "text.txt");
  writeFileSync(file, text);
  return { dir, file, outDir: path.join(dir, "tournaments") };
}
const run = ({ file, outDir }) =>
  spawnSync(process.execPath, [CLI, file], {
    encoding: "utf8",
    env: { ...process.env, TOURNAMENTS_DIR: outDir },
  });

const goodText = () => formatTournamentText(makeTournament());

test("a valid text creates data/tournaments/<id>.json", () => {
  const ctx = setup(goodText());
  const r = run(ctx);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Турнир 2026-10-27-1830 создан/);
  const saved = JSON.parse(readFileSync(path.join(ctx.outDir, "2026-10-27-1830.json"), "utf8"));
  assert.equal(saved.id, "2026-10-27-1830");
  assert.equal(saved.teams.length, 4);
});

test("the same text twice is refused as a duplicate", () => {
  const ctx = setup(goodText());
  assert.equal(run(ctx).status, 0);
  const again = run(ctx);
  assert.equal(again.status, 1);
  assert.match(again.stderr, /Турнир с таким временем уже есть: 2026-10-27-1830/);
});

test("three teams are refused with the parser's message and nothing is written", () => {
  const t = makeTournament();
  const ctx = setup(formatTournamentText({ createdAt: t.createdAt, teams: t.teams.slice(0, 3) }));
  const r = run(ctx);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Нужно 4 команды, получено 3/);
  assert.equal(existsSync(ctx.outDir), false);
});
