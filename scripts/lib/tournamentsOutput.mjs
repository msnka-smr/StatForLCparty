// Секция "tournaments" для stats.json: каждый турнир с матчами, найденными среди
// уже скачанных карт. Новые турниры сверху.
import { attributeMatches } from "./tournamentMatches.mjs";
import { buildTournamentView } from "./tournamentStandings.mjs";

export function buildTournamentsOutput(tournaments, maps) {
  const attributed = attributeMatches(tournaments, maps);
  return [...tournaments]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((t) => buildTournamentView(t, attributed.get(t.id)));
}
