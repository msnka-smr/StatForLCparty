// Этап 3: build полностью пересобирает docs/data/stats.json из сырых файлов
// data/matches/*.json — никогда не читает предыдущий stats.json и не ходит в сеть.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeLobby } from "./lib/normalize.mjs";
import { applyAliases } from "./lib/aliases.mjs";
import { assignSessions } from "./lib/session.mjs";
import { aggregatePlayerMaps } from "./lib/aggregate.mjs";
import { sortRows } from "./lib/sort.mjs";
import { buildSessionsOutput } from "./lib/sessionsOutput.mjs";
import { computeRatingHistory } from "./lib/ratingHistory.mjs";
import { computeRecords } from "./lib/records.mjs";
import { computeRecap } from "./lib/recap.mjs";
import { computeAllTimeRating, computeRatingDelta } from "./lib/allTimeRating.mjs";
import { buildTournamentsOutput } from "./lib/tournamentsOutput.mjs";
import { summarizeMapFrequency, mapIconUrl, mapBannerUrl } from "./lib/mapCatalog.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MATCHES_DIR = path.join(ROOT, "data", "matches");
const CONFIG_PATH = path.join(ROOT, "data", "config.json");
const PLAYERS_PATH = path.join(ROOT, "data", "players.json");
const TOURNAMENTS_DIR = path.join(ROOT, "data", "tournaments");
const OUTPUT_PATH = path.join(ROOT, "docs", "data", "stats.json");

const DEFAULT_CONFIG = {
  coreSteamIds: [],
  steamAliases: {},
  sessionGapHours: 6,
  sessionTimezone: "Europe/Samara",
};

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2) + "\n");
}

async function loadTournaments() {
  let files;
  try {
    files = await readdir(TOURNAMENTS_DIR);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  const tournaments = [];
  for (const file of files.filter((f) => f.endsWith(".json")).sort()) {
    tournaments.push(await readJson(path.join(TOURNAMENTS_DIR, file), null));
  }
  return tournaments.filter(Boolean);
}

async function loadAllMaps() {
  await mkdir(MATCHES_DIR, { recursive: true });
  const files = await readdir(MATCHES_DIR);
  const maps = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const raw = await readJson(path.join(MATCHES_DIR, file), null);
    if (!raw) continue;
    maps.push(...normalizeLobby(raw));
  }
  return maps;
}

function countCorePlayers(map, coreSteamIds) {
  if (!coreSteamIds.length) return null;
  const core = new Set(coreSteamIds.map(String));
  return map.players.filter((p) => core.has(p.steamid64)).length;
}

function updatePlayersRegistry(registry, maps) {
  // сортируем по времени, чтобы "последний ник" был действительно последним
  const byTime = [...maps].sort((a, b) => (a.playedAt ?? 0) - (b.playedAt ?? 0));
  for (const map of byTime) {
    for (const p of map.players) {
      const entry = registry[p.steamid64] ?? {
        displayName: null,
        nicknames: [],
        lastSeenName: null,
        avatarUrl: null,
      };
      if (!p.aliased) {
        if (!entry.nicknames.includes(p.name)) entry.nicknames.push(p.name);
        entry.lastSeenName = p.name;
        if (p.avatar) entry.avatarUrl = p.avatar;
      }
      registry[p.steamid64] = entry;
    }
  }
  return registry;
}

function displayName(registry, steamid64) {
  const entry = registry[steamid64];
  return entry?.displayName ?? entry?.lastSeenName ?? steamid64;
}

function buildRow(steamid64, registry, mapsForPlayer, rating) {
  const agg = aggregatePlayerMaps(mapsForPlayer);
  const totalRounds = mapsForPlayer.reduce((sum, m) => sum + (m.mapTotalRounds ?? 0), 0);
  return {
    steamid64,
    name: displayName(registry, steamid64),
    avatarUrl: registry[steamid64]?.steamAvatarUrl ?? registry[steamid64]?.avatarUrl ?? null,
    steamProfileUrl: `https://steamcommunity.com/profiles/${steamid64}`,
    totalRounds,
    mapsPlayed: agg.mapsPlayed,
    wins: agg.wins,
    losses: agg.losses,
    winRate: agg.mapsPlayed ? agg.wins / agg.mapsPlayed : null,
    k: agg.k,
    d: agg.d,
    kd: agg.kd,
    kdDiff: agg.k - agg.d,
    rating,
  };
}

async function main() {
  const config = { ...DEFAULT_CONFIG, ...(await readJson(CONFIG_PATH, {})) };
  const registry = await readJson(PLAYERS_PATH, {});

  const allMaps = applyAliases(await loadAllMaps(), config.steamAliases);

  const includedMaps = allMaps.filter((m) => {
    const coreCount = countCorePlayers(m, config.coreSteamIds);
    return coreCount === null || coreCount >= 3;
  });

  updatePlayersRegistry(registry, includedMaps);
  await writeJson(PLAYERS_PATH, registry);

  const { maps: sortedMaps, sessions } = assignSessions(includedMaps, {
    gapHours: config.sessionGapHours,
    timezone: config.sessionTimezone,
  });
  const lastSession = sessions[sessions.length - 1] ?? null;

  const byPlayerAllTime = new Map();
  for (const map of sortedMaps) {
    for (const p of map.players) {
      const list = byPlayerAllTime.get(p.steamid64) ?? [];
      list.push({ ...p, mapTotalRounds: map.totalRounds, sessionId: map.sessionId });
      byPlayerAllTime.set(p.steamid64, list);
    }
  }

  // byPlayerAllTime уже хронологический: sortedMaps идёт по playedAt, и мы
  // только добавляем в список каждого игрока по ходу этого же перебора.
  // История для графика "Динамика рейтинга": тот же replay, что и рейтинг выше.
  const ratingHistoryInput = {};
  const allTimeRows = [...byPlayerAllTime.entries()].map(([steamid64, mapsForPlayer]) => {
    const { rating, history } = computeAllTimeRating(mapsForPlayer);
    ratingHistoryInput[steamid64] = { matches: mapsForPlayer, history };
    const row = buildRow(steamid64, registry, mapsForPlayer, Math.round(rating));
    row.ratingDelta = computeRatingDelta(mapsForPlayer, history, lastSession?.id ?? null);
    return row;
  });
  const allTimeRowsSorted = sortRows(allTimeRows, "rating", "desc");

  // Вкладка "Карты": статистика по каждой карте за всю историю, без привязки
  // к сессиям и без рейтинга — тот же пул карт (sortedMaps), что и "За всё
  // время", просто сгруппированный по имени карты вместо игрока.
  const mapsOutput = summarizeMapFrequency(sortedMaps).map(({ mapKey, displayName: mapDisplayName, timesPlayed }) => {
    const byPlayerOnMap = new Map();
    for (const map of sortedMaps) {
      if (map.map !== mapKey) continue;
      for (const p of map.players) {
        const list = byPlayerOnMap.get(p.steamid64) ?? [];
        list.push({ ...p, mapTotalRounds: map.totalRounds });
        byPlayerOnMap.set(p.steamid64, list);
      }
    }
    const players = [...byPlayerOnMap.entries()].map(([steamid64, mapsForPlayer]) =>
      buildRow(steamid64, registry, mapsForPlayer, null)
    );
    // Сортировка по умолчанию — число карт, при равенстве выше тот, у кого
    // лучше K/D. sortRows сортирует только по одной колонке, поэтому сначала
    // сортируем по kd (вторичный ключ), а затем стабильно — по mapsPlayed:
    // Array.prototype.sort в Node гарантированно стабилен (ES2019), так что
    // порядок внутри "ничьей" по mapsPlayed останется таким, как после
    // первого прохода.
    const playersByMapsThenKd = sortRows(sortRows(players, "kd", "desc"), "mapsPlayed", "desc");
    return {
      mapKey,
      displayName: mapDisplayName,
      iconUrl: mapIconUrl(mapKey),
      bannerUrl: mapBannerUrl(mapKey),
      timesPlayed,
      players: playersByMapsThenKd,
    };
  });

  // Все игровые вечера, от новых к старым.
  const sessionsOutput = buildSessionsOutput(sessions, (steamid64, mapsForPlayer, rating) =>
    buildRow(steamid64, registry, mapsForPlayer, rating)
  );

  // "Итоги вечера": считаем после sessionsOutput и истории рейтинга, обоим нужен один и тот же набор сессий.
  const ratingHistoryOut = computeRatingHistory(sessions, ratingHistoryInput);
  for (const s of sessionsOutput) s.recap = computeRecap(s, ratingHistoryOut);

  const output = {
    generatedAt: new Date().toISOString(),
    totalMapsCollected: sortedMaps.length,
    allTime: { players: allTimeRowsSorted },
    sessions: sessionsOutput,
    ratingHistory: ratingHistoryOut,
    records: computeRecords(sortedMaps, sessions),
    maps: mapsOutput,
    tournaments: buildTournamentsOutput(await loadTournaments(), sortedMaps),
  };

  await writeJson(OUTPUT_PATH, output);

  console.log(`Карт учтено: ${sortedMaps.length}, сессий: ${sessions.length}.`);
  console.log(`Записано в ${path.relative(ROOT, OUTPUT_PATH)}`);
}

main().catch((err) => {
  console.error(err.stack ?? err.message);
  process.exit(1);
});
