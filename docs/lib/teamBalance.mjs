// Подбор сбалансированных команд: проверки состава, жадная раскладка с
// улучшающими обменами, подсказки обменов. Только стандартный JS (браузер и тесты).
import { playerStrengths, spreadPct } from "./strength.mjs";

export const WARN_SPREAD_PCT = 5;
export const TEAM_SIZE = 5;
export const MIN_TEAMS = 2;
export const MAX_TEAMS = 10;

const SEEDS = 40;

// maxTeams — предел, который задаёт вызывающий (интерфейс сейчас даёт максимум 4).
export function validateRoster({ selected, captains, maxTeams = MAX_TEAMS }) {
  if (captains < MIN_TEAMS || captains > maxTeams) {
    return { ok: false, message: `Капитанов должно быть от ${MIN_TEAMS} до ${maxTeams}` };
  }
  const needed = captains * TEAM_SIZE;
  if (selected < needed) {
    return { ok: false, message: `Не хватает игроков: ${needed - selected} (нужно ${needed} для ${captains} команд)` };
  }
  if (selected > needed) {
    return { ok: false, message: `Лишних игроков: ${selected - needed} (нужно ${needed} для ${captains} команд)` };
  }
  return { ok: true, message: "" };
}

export function validateLocks({ captainIds, locked }) {
  const captains = new Set(captainIds);
  const seen = new Set();
  for (const [captainId, ids] of Object.entries(locked)) {
    if (!captains.has(captainId)) {
      return { ok: false, message: `Закрепление для неизвестного капитана ${captainId}` };
    }
    if (ids.length > TEAM_SIZE - 1) {
      return { ok: false, message: `У капитана ${captainId} закреплено больше ${TEAM_SIZE - 1} игроков` };
    }
    for (const id of ids) {
      if (captains.has(id)) {
        return { ok: false, message: `Капитана ${id} нельзя закрепить в команду` };
      }
      if (seen.has(id)) {
        return { ok: false, message: `Игрок ${id} закреплён за двумя командами` };
      }
      seen.add(id);
    }
  }
  return { ok: true, message: "" };
}

export function defaultCaptainOrder(players, captainIds) {
  const rating = new Map(players.map((p) => [p.id, p.rating]));
  return captainIds
    .map((id, index) => ({ id, index }))
    .sort((a, b) => rating.get(b.id) - rating.get(a.id) || a.index - b.index)
    .map((x) => x.id);
}

// Детерминированный генератор случайных чисел.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function checkInput({ players, captainIds, locked }) {
  const roster = validateRoster({ selected: players.length, captains: captainIds.length });
  if (!roster.ok) throw new Error(roster.message);
  const locks = validateLocks({ captainIds, locked });
  if (!locks.ok) throw new Error(locks.message);
  const known = new Set(players.map((p) => p.id));
  for (const id of [...captainIds, ...Object.values(locked).flat()]) {
    if (!known.has(id)) throw new Error(`Неизвестный игрок ${id}`);
  }
}

// Цена раскладки: сумма квадратов отклонений сумм сил команд от среднего.
function cost(sums) {
  const mean = sums.reduce((s, v) => s + v, 0) / sums.length;
  return sums.reduce((s, v) => s + (v - mean) * (v - mean), 0);
}

function sumsOf(teams, strengths) {
  return teams.map((t) => t.reduce((s, id) => s + strengths.get(id), 0));
}

// teams: массив массивов id (капитан + закреплённые + добранные); frozenCount[i] —
// сколько первых элементов команды i нельзя двигать.
function improve(teams, frozenCount, strengths) {
  let sums = sumsOf(teams, strengths);
  let best = cost(sums);
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        for (let x = frozenCount[i]; x < teams[i].length; x++) {
          for (let y = frozenCount[j]; y < teams[j].length; y++) {
            const sx = strengths.get(teams[i][x]);
            const sy = strengths.get(teams[j][y]);
            const next = sums.slice();
            next[i] += sy - sx;
            next[j] += sx - sy;
            const c = cost(next);
            if (c < best - 1e-12) {
              [teams[i][x], teams[j][y]] = [teams[j][y], teams[i][x]];
              sums = next;
              best = c;
              changed = true;
            }
          }
        }
      }
    }
  }
}

function toResult(teams, captainIds, strengths) {
  const sums = sumsOf(teams, strengths);
  return {
    teams: teams.map((memberIds, i) => ({ captainId: captainIds[i], memberIds: memberIds.slice() })),
    teamStrengths: sums,
    spreadPct: spreadPct(sums),
  };
}

// Ключ раскладки: у каждой команды отсортированный состав (капитан и закреплённые
// во всех вариантах одинаковы, поэтому разбиение определяется добранными).
function keyOf(teams) {
  return teams.map((t) => t.slice().sort().join(",")).join("|");
}

export function buildTeamVariants({ players, captainIds, locked, count = 2 }) {
  checkInput({ players, captainIds, locked });
  const strengths = playerStrengths(players);
  const fixed = captainIds.map((c) => [c, ...(locked[c] ?? [])]);
  const frozenCount = fixed.map((t) => t.length);
  const taken = new Set(fixed.flat());
  const free = players.map((p) => p.id).filter((id) => !taken.has(id));

  const candidates = new Map();
  const add = (teams) => {
    const key = keyOf(teams);
    if (!candidates.has(key)) candidates.set(key, teams.map((t) => t.slice()));
  };

  if (free.length === 0) {
    add(fixed);
  } else {
    for (let seed = 0; seed < SEEDS; seed++) {
      const rand = mulberry32(seed + 1);
      // seed 0 — чистая сортировка по силе, остальные — с шумом
      const order = free
        .map((id) => ({ id, key: strengths.get(id) + (seed === 0 ? 0 : (rand() - 0.5) * 0.4) }))
        .sort((a, b) => b.key - a.key || (a.id < b.id ? -1 : 1))
        .map((x) => x.id);
      const teams = fixed.map((t) => t.slice());
      const sums = sumsOf(teams, strengths);
      for (const id of order) {
        let target = -1;
        for (let i = 0; i < teams.length; i++) {
          if (teams[i].length >= TEAM_SIZE) continue;
          if (target === -1 || sums[i] < sums[target]) target = i;
        }
        teams[target].push(id);
        sums[target] += strengths.get(id);
      }
      improve(teams, frozenCount, strengths);
      add(teams);
    }
    // Одиночные обмены вокруг лучшего: гарантируют второй вариант, если он вообще есть.
    const best = [...candidates.values()]
      .map((t) => ({ t, c: cost(sumsOf(t, strengths)) }))
      .sort((a, b) => a.c - b.c)[0].t;
    for (let i = 0; i < best.length; i++) {
      for (let j = i + 1; j < best.length; j++) {
        for (let x = frozenCount[i]; x < best[i].length; x++) {
          for (let y = frozenCount[j]; y < best[j].length; y++) {
            const copy = best.map((t) => t.slice());
            [copy[i][x], copy[j][y]] = [copy[j][y], copy[i][x]];
            add(copy);
          }
        }
      }
    }
  }

  const ranked = [...candidates.entries()]
    .map(([key, teams]) => ({ key, result: toResult(teams, captainIds, strengths) }))
    .sort((a, b) => a.result.spreadPct - b.result.spreadPct || (a.key < b.key ? -1 : 1));
  return { variants: ranked.slice(0, count).map((r) => r.result) };
}

export function suggestSwaps(result, { players, captainIds, locked }, max = 3) {
  if (result.spreadPct <= WARN_SPREAD_PCT) return [];
  const strengths = playerStrengths(players);
  const frozen = new Set([...captainIds, ...Object.values(locked).flat()]);
  const swaps = [];
  for (let i = 0; i < result.teams.length; i++) {
    for (let j = i + 1; j < result.teams.length; j++) {
      for (const a of result.teams[i].memberIds) {
        if (frozen.has(a)) continue;
        for (const b of result.teams[j].memberIds) {
          if (frozen.has(b)) continue;
          const next = result.teamStrengths.slice();
          const d = strengths.get(b) - strengths.get(a);
          next[i] += d;
          next[j] -= d;
          const newSpreadPct = spreadPct(next);
          if (newSpreadPct < result.spreadPct) {
            swaps.push({ aId: a, bId: b, fromTeam: i, toTeam: j, newSpreadPct });
          }
        }
      }
    }
  }
  return swaps.sort((x, y) => x.newSpreadPct - y.newSpreadPct).slice(0, max);
}

// Оценка готовых (например, собранных вручную) команд тем же способом.
export function evaluateTeams({ players, teams }) {
  const strengths = playerStrengths(players);
  const sums = teams.map((t) => t.memberIds.reduce((s, id) => s + strengths.get(id), 0));
  return {
    teams: teams.map((t) => ({ captainId: t.captainId, memberIds: t.memberIds.slice() })),
    teamStrengths: sums,
    spreadPct: spreadPct(sums),
  };
}
