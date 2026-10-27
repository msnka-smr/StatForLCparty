// Сила игрока и разброс силы команд. Используется и в браузере, и в тестах,
// поэтому только стандартный JS, без Node API.
//
// Player = { id, name, rating, kd, k, d, guest? }. K-D считается как k - d;
// у гостей k — оценка K-D по рейтингу, d = 0.

export const STRENGTH_WEIGHTS = { rating: 0.3, kdDiff: 0.3, kd: 0.4 };

// y ≈ a + b·x по методу наименьших квадратов; при нулевом разбросе x — среднее y.
function linFit(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) * (xs[i] - mx);
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  const b = sxx > 0 ? sxy / sxx : 0;
  return { a: my - b * mx, b };
}

// У гостей нет K/D и K-D, поэтому оцениваем их линейной регрессией по рейтингу
// на всех игроках «за всё время».
export function makeGuestEstimator(allPlayers) {
  const pool = allPlayers.filter(
    (p) => p.rating != null && p.kd != null && p.k != null && p.d != null
  );
  const ratings = pool.map((p) => p.rating);
  const kdFit = linFit(ratings, pool.map((p) => p.kd));
  const diffFit = linFit(ratings, pool.map((p) => p.k - p.d));
  return (rating) => ({
    kd: Math.max(0, kdFit.a + kdFit.b * rating),
    kdDiff: diffFit.a + diffFit.b * rating,
  });
}

// Каждый показатель приводится к 0…1 по min–max среди переданных игроков;
// если разброс показателя нулевой, его вклад 0.
function normalizer(values) {
  const min = Math.min(...values);
  const range = Math.max(...values) - min;
  return (v) => (range > 0 ? (v - min) / range : 0);
}

export function playerStrengths(players) {
  const result = new Map();
  if (!players.length) return result;
  const normRating = normalizer(players.map((p) => p.rating));
  const normKdDiff = normalizer(players.map((p) => p.k - p.d));
  const normKd = normalizer(players.map((p) => p.kd));
  for (const p of players) {
    result.set(
      p.id,
      STRENGTH_WEIGHTS.rating * normRating(p.rating) +
        STRENGTH_WEIGHTS.kdDiff * normKdDiff(p.k - p.d) +
        STRENGTH_WEIGHTS.kd * normKd(p.kd)
    );
  }
  return result;
}

// Разница между самой сильной и самой слабой командой в процентах от средней.
export function spreadPct(teamStrengths) {
  if (!teamStrengths.length) return 0;
  const mean = teamStrengths.reduce((s, v) => s + v, 0) / teamStrengths.length;
  if (mean === 0) return 0;
  return ((Math.max(...teamStrengths) - Math.min(...teamStrengths)) / mean) * 100;
}
