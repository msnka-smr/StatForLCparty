// Общие заготовки для тестов турниров: фиктивные steamid, турнир и нормализованная карта.

export const sid = (n) => "7656119800000" + String(n).padStart(4, "0");

export const CREATED_AT = "2026-10-27T18:30:00.000Z";
export const CREATED_SEC = Date.parse(CREATED_AT) / 1000;
export const DEFAULT_ROSTERS = [
  [1, 2, 3, 4, 5],
  [6, 7, 8, 9, 10],
  [11, 12, 13, 14, 15],
  [16, 17, 18, 19, 20],
];

// rosters — четыре списка чисел (число n → steamid sid(n)); первый в списке — капитан.
export function makeTournament({ createdAt = CREATED_AT, rosters = DEFAULT_ROSTERS, id } = {}) {
  return {
    id: id ?? createdAt.slice(0, 16).replace("T", "-").replace(":", ""),
    createdAt,
    teams: rosters.map((ids, i) => ({
      number: i + 1,
      players: ids.map((n, j) => ({ name: `Игрок ${n}`, steamid64: sid(n), captain: j === 0 })),
    })),
  };
}

// side = { ids, score, won, k?, d? }; id — число (sid(n)) или готовая строка steamid.
export function makeMap({ lobbyId, playedAt, sideA, sideB, mapIndex = 1 }) {
  const sides = [
    { key: "team_2", side: sideA },
    { key: "team_3", side: sideB },
  ];
  return {
    mapId: `${lobbyId}:${mapIndex}`,
    lobbyId,
    mapIndex,
    map: "de_dust2",
    playedAt,
    totalRounds: (sideA.score ?? 0) + (sideB.score ?? 0),
    teams: sides.map(({ key, side }) => ({ key, name: null, score: side.score ?? null, isWinner: side.won === true })),
    players: sides.flatMap(({ key, side }) =>
      side.ids.map((id) => ({
        steamid64: typeof id === "number" ? sid(id) : id,
        name: String(id),
        avatar: null,
        team: key,
        won: side.won ?? null,
        k: side.k ?? 10,
        d: side.d ?? 10,
      }))
    ),
    statsTier: "basic",
  };
}
