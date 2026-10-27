// Добавляет турнир из текста, который сайт сформировал, а владелец прислал боту.
// node scripts/tournament-add.mjs <файл с текстом>
// При ошибке — код 1 и причина по-русски в stderr (workflow покажет её в Telegram).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseTournamentText } from "../docs/lib/tournamentText.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOURNAMENTS_DIR = process.env.TOURNAMENTS_DIR || path.join(ROOT, "data", "tournaments");

function die(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  const file = process.argv[2];
  if (!file) die("Использование: node scripts/tournament-add.mjs <файл с текстом>");

  const parsed = parseTournamentText(await readFile(file, "utf8"));
  if (!parsed.ok) die(parsed.error);

  const target = path.join(TOURNAMENTS_DIR, `${parsed.tournament.id}.json`);
  if (existsSync(target)) die(`Турнир с таким временем уже есть: ${parsed.tournament.id}`);

  await mkdir(TOURNAMENTS_DIR, { recursive: true });
  await writeFile(target, JSON.stringify(parsed.tournament, null, 2) + "\n");
  console.log(`Турнир ${parsed.tournament.id} создан`);
}

main().catch((err) => die(err.stack ?? err.message));
