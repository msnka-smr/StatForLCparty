// Вкладка «Выбор составов»: капитаны, закрепление игроков, автоподбор,
// запуск турнира. Вся логика подбора — в strength.mjs / teamBalance.mjs /
// tournamentText.mjs, здесь только состояние формы и разметка.
import { makeGuestEstimator } from "./strength.mjs";
import {
  WARN_SPREAD_PCT,
  TEAM_SIZE,
  validateRoster,
  validateLocks,
  defaultCaptainOrder,
  buildTeamVariants,
  suggestSwaps,
} from "./teamBalance.mjs";
import { formatTournamentText } from "./tournamentText.mjs";

const GUEST_NAME_MAX = 40;
const RATING_MIN = 1;
const RATING_MAX = 3000;
const GUEST_DEFAULT_RATING = 500;
const TOURNAMENT_TEAMS = 4;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function mountDraft(host, { getPlayers }) {
  const all = getPlayers();
  const pool = all
    .filter((p) => p.rating != null && p.kd != null)
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const estimate = all.length >= 2 ? makeGuestEstimator(all) : () => ({ kd: 1, kdDiff: 0 });

  const st = {
    selected: new Set(),
    captains: new Set(),
    guests: [],
    nextGuest: 1,
    locked: {},
    variants: null,
    view: 0,
    order: null,
    launchText: null,
  };

  // ---------- модель ----------
  const poolPlayer = (p) => ({ id: p.steamid64, name: p.name, rating: p.rating, kd: p.kd, k: p.k, d: p.d });
  const guestValid = (g) => {
    const r = Number(g.rating);
    return Number.isInteger(r) && r >= RATING_MIN && r <= RATING_MAX;
  };
  const guestPlayer = (g, i) => {
    const rating = guestValid(g) ? Number(g.rating) : GUEST_DEFAULT_RATING;
    const est = estimate(rating);
    return { id: g.id, name: g.name.trim() || "Гость " + (i + 1), rating, kd: est.kd, k: est.kdDiff, d: 0, guest: true };
  };
  const currentPlayers = () => [
    ...pool.filter((p) => st.selected.has(p.steamid64)).map(poolPlayer),
    ...st.guests.map(guestPlayer),
  ];
  const captainIds = () => currentPlayers().map((p) => p.id).filter((id) => st.captains.has(id));
  const nameOf = (id) => (currentPlayers().find((p) => p.id === id) ?? { name: id }).name;

  function currentLocks() {
    const known = new Set(currentPlayers().map((p) => p.id));
    const caps = new Set(captainIds());
    const out = {};
    for (const [c, ids] of Object.entries(st.locked)) {
      if (!caps.has(c)) continue;
      const kept = ids.filter((id) => known.has(id) && !caps.has(id));
      if (kept.length) out[c] = kept;
    }
    return out;
  }

  // В сообщениях из teamBalance игроки названы своими id — подменяем на имена.
  function humanize(message) {
    let out = message;
    for (const p of currentPlayers().sort((a, b) => b.id.length - a.id.length)) {
      out = out.split(p.id).join(p.name);
    }
    return out;
  }

  function problems() {
    const players = currentPlayers();
    const caps = captainIds();
    if (st.guests.some((g) => !guestValid(g))) {
      return `Рейтинг гостя — целое число от ${RATING_MIN} до ${RATING_MAX}`;
    }
    const roster = validateRoster({ selected: players.length, captains: caps.length });
    if (!roster.ok) return roster.message;
    const locks = validateLocks({ captainIds: caps, locked: currentLocks() });
    return locks.ok ? "" : humanize(locks.message);
  }

  function invalidateResult() {
    st.variants = null;
    st.view = 0;
    st.order = null;
    st.launchText = null;
  }

  // ---------- разметка ----------
  const $ = (sel) => host.querySelector(sel);

  function lockSelect(id) {
    const caps = captainIds();
    if (st.captains.has(id) || !caps.length) return "";
    const locks = currentLocks();
    const owner = caps.find((c) => (locks[c] ?? []).includes(id)) ?? "";
    return (
      `<select class="draft-lock" data-act="lock" data-id="${esc(id)}">` +
      '<option value="">в команду…</option>' +
      caps.map((c) => `<option value="${esc(c)}"${c === owner ? " selected" : ""}>★ ${esc(nameOf(c))}</option>`).join("") +
      "</select>"
    );
  }

  function poolRow(p) {
    const on = st.selected.has(p.steamid64);
    const cap = st.captains.has(p.steamid64);
    const avatar = p.avatarUrl
      ? `<img class="avatar" src="${esc(p.avatarUrl)}" alt="" loading="lazy">`
      : '<div class="avatar"></div>';
    return (
      `<div class="draft-row" data-id="${esc(p.steamid64)}">` +
      `<input type="checkbox" data-act="play"${on ? " checked" : ""} aria-label="Играет">` +
      avatar +
      `<span class="draft-name">${esc(p.name)}</span>` +
      `<span class="draft-meta">рейтинг ${Math.round(p.rating)} · K/D ${p.kd.toFixed(2)}</span>` +
      (on ? `<button type="button" class="draft-cap${cap ? " on" : ""}" data-act="cap" title="Капитан">${cap ? "★" : "☆"}</button>` : "") +
      (on ? lockSelect(p.steamid64) : "") +
      "</div>"
    );
  }

  function guestRow(g, i) {
    const cap = st.captains.has(g.id);
    return (
      `<div class="draft-guest-row" data-id="${esc(g.id)}">` +
      `<input type="text" data-field="name" maxlength="${GUEST_NAME_MAX}" placeholder="Гость ${i + 1}: имя" value="${esc(g.name)}">` +
      `<input type="number" data-field="rating" class="${guestValid(g) ? "" : "invalid"}" min="${RATING_MIN}" max="${RATING_MAX}" step="1" value="${esc(g.rating)}">` +
      `<button type="button" class="draft-cap${cap ? " on" : ""}" data-act="cap" title="Капитан">${cap ? "★" : "☆"}</button>` +
      lockSelect(g.id) +
      '<button type="button" class="draft-guest-remove" data-act="remove-guest" aria-label="Удалить гостя">×</button>' +
      `<div class="draft-guest-label">Рейтинг на глаз, ${RATING_MIN}–${RATING_MAX} (${GUEST_DEFAULT_RATING} — средний игрок)</div>` +
      "</div>"
    );
  }

  function renderAll() {
    host.innerHTML =
      '<div class="draft-section">' +
      '<p class="draft-hint">Отметьте, кто играет, и назначьте капитанов звёздочкой (от 2 до 10, сколько капитанов — столько команд по ' +
      TEAM_SIZE + " человек). Игрока можно заранее закрепить за капитаном списком «в команду…». " +
      "Остальных подберёт сайт по рейтингу, K-D и K/D, так чтобы команды были как можно ровнее. У гостей K-D и K/D оцениваются по рейтингу.</p>" +
      `<div class="draft-list">${pool.map(poolRow).join("")}</div>` +
      `<div class="draft-guests"><button type="button" class="draft-guest-add" data-act="add-guest">+ Добавить гостя</button>` +
      `<div>${st.guests.map(guestRow).join("")}</div></div>` +
      '<div class="draft-toolbar"><div class="draft-counter" id="dr-counter"></div>' +
      '<button type="button" class="draft-clear-btn" data-act="clear">Очистить всё</button></div>' +
      '<div class="draft-error" id="dr-problem"></div>' +
      '<button type="button" class="wheel-spin-btn" id="dr-build" data-act="build">Подобрать остальных автоматически</button>' +
      '<div id="dr-result"></div>' +
      "</div>";
    renderStatus();
    renderResult();
  }

  // Счётчик, сообщение об ошибке и доступность кнопки — без пересборки полей ввода.
  function renderStatus() {
    const count = currentPlayers().length;
    const caps = captainIds().length;
    const problem = problems();
    const counter = $("#dr-counter");
    const teamsWord = caps >= 2 && caps <= 4 ? "команды" : "команд";
    counter.textContent = `Выбрано: ${count} · Капитанов: ${caps}` + (caps >= 2 ? ` → ${caps} ${teamsWord} по ${TEAM_SIZE}` : "");
    counter.classList.toggle("full", !problem && caps >= 2);
    $("#dr-problem").textContent = problem;
    $("#dr-build").disabled = !!problem;
  }

  const avg = (list, f) => list.reduce((s, p) => s + f(p), 0) / list.length;

  function teamBlock(team, result, players, locks) {
    const byId = new Map(players.map((p) => [p.id, p]));
    const members = team.memberIds.map((id) => byId.get(id));
    const lockedHere = new Set(locks[team.captainId] ?? []);
    const items = members
      .map((p) => {
        const isCap = p.id === team.captainId;
        const mark = isCap ? "★ " : lockedHere.has(p.id) ? "🔒 " : "";
        const tag = p.guest ? '<span class="draft-guest-tag">гость</span>' : "";
        return `<li${lockedHere.has(p.id) ? ' class="locked"' : ""}><span>${mark}${esc(p.name)}${tag}</span><span>${Math.round(p.rating)}</span></li>`;
      })
      .join("");
    return (
      `<div class="draft-team"><h4>Команда ★ ${esc(nameOf(team.captainId))}</h4><ul>${items}</ul>` +
      `<div class="team-stats">Средний рейтинг: ${Math.round(avg(members, (p) => p.rating))} · средний K/D: ${avg(members, (p) => p.kd).toFixed(2)}</div></div>`
    );
  }

  function renderResult() {
    const el = $("#dr-result");
    if (!st.variants) {
      el.innerHTML = "";
      return;
    }
    const players = currentPlayers();
    const locks = currentLocks();
    const result = st.variants[st.view];
    const ctx = { players, captainIds: captainIds(), locked: locks };
    const spread = result.spreadPct;
    const over = spread > WARN_SPREAD_PCT;

    let warning = "";
    if (over) {
      const swaps = suggestSwaps(result, ctx);
      const swapHtml = swaps.length
        ? "<ul>" +
          swaps
            .map(
              (s) =>
                `<li>Поменять ${esc(nameOf(s.aId))} (команда ★ ${esc(nameOf(result.teams[s.fromTeam].captainId))}) и ${esc(nameOf(s.bId))} (команда ★ ${esc(nameOf(result.teams[s.toTeam].captainId))}) — разброс станет ${s.newSpreadPct.toFixed(1)}%</li>`
            )
            .join("") +
          "</ul>"
        : "<div>Обменов без закреплённых игроков нет. Попробуйте изменить закрепления.</div>";
      warning =
        `<div class="draft-warn">Команды заметно различаются по силе (разброс ${spread.toFixed(1)}%, допустимо до ${WARN_SPREAD_PCT}%). ` +
        "Скорее всего, закреплённые игроки перекосили составы." + swapHtml + "</div>";
    }

    const teams = result.teams.map((t) => teamBlock(t, result, players, locks)).join("");
    const another = st.variants.length > 1
      ? `<button type="button" class="wheel-spin-btn" data-act="variant">${st.view === 0 ? "🔁 Другой вариант" : "⬅️ Первый вариант"}</button> `
      : "";
    const launch = captainIds().length === TOURNAMENT_TEAMS ? launchBlock() : "";

    el.innerHTML =
      `<div class="draft-teams multi">${teams}</div>` +
      `<div class="draft-summary">Разброс силы команд: <strong>${spread.toFixed(1)}%</strong>${over ? "" : " — очень ровно"}.</div>` +
      warning +
      '<div class="draft-again-wrap">' + another +
      '<button type="button" class="draft-clear-btn" data-act="reset">Сбросить подбор</button></div>' +
      (st.variants.length > 1 ? `<div class="draft-variant-note">Вариант ${st.view + 1} из ${st.variants.length}.</div>` : "") +
      launch;
  }

  function launchBlock() {
    const order = st.order ?? captainIds();
    const rows = order
      .map(
        (c, i) =>
          `<div class="draft-order-row"><span>${i + 1}. ★ ${esc(nameOf(c))}</span>` +
          `<button type="button" class="draft-clear-btn" data-act="up" data-i="${i}"${i === 0 ? " disabled" : ""}>↑</button>` +
          `<button type="button" class="draft-clear-btn" data-act="down" data-i="${i}"${i === order.length - 1 ? " disabled" : ""}>↓</button></div>`
      )
      .join("");
    const text = st.launchText
      ? `<div class="draft-hint">Скопируйте этот текст и передайте администратору — он создаст турнир.</div>` +
        `<textarea class="launch-text" id="dr-launch-text" readonly rows="8">${esc(st.launchText)}</textarea>` +
        '<button type="button" class="wheel-spin-btn" data-act="copy">Копировать</button> <span id="dr-copied" class="draft-variant-note"></span>'
      : "";
    return (
      '<div class="launch-box"><h4>Турнир</h4>' +
      '<div class="draft-hint">Номер команды (1–4) задаёт расписание круга. По умолчанию по убыванию рейтинга капитана, порядок можно поменять.</div>' +
      rows +
      '<button type="button" class="wheel-spin-btn" data-act="launch">Запустить турнир</button>' +
      text +
      "</div>"
    );
  }

  // ---------- действия ----------
  function build() {
    if (problems()) return;
    const players = currentPlayers();
    const caps = captainIds();
    try {
      st.variants = buildTeamVariants({ players, captainIds: caps, locked: currentLocks() }).variants;
    } catch (err) {
      $("#dr-problem").textContent = err.message;
      return;
    }
    st.view = 0;
    st.order = defaultCaptainOrder(players, caps);
    st.launchText = null;
    renderResult();
  }

  function launch() {
    const result = st.variants[st.view];
    const players = new Map(currentPlayers().map((p) => [p.id, p]));
    const byCaptain = new Map(result.teams.map((t) => [t.captainId, t]));
    const teams = (st.order ?? captainIds()).map((c, i) => ({
      number: i + 1,
      players: byCaptain.get(c).memberIds.map((id) => ({
        name: players.get(id).name,
        steamid64: players.get(id).guest ? null : id,
        captain: id === c,
        rating: Math.round(players.get(id).rating),
      })),
    }));
    st.launchText = formatTournamentText({ createdAt: new Date().toISOString(), teams });
    renderResult();
  }

  function copy() {
    const text = st.launchText;
    const done = () => {
      const note = $("#dr-copied");
      if (note) note.textContent = "Скопировано";
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => {
        $("#dr-launch-text").select();
      });
    } else {
      const ta = $("#dr-launch-text");
      ta.select();
      try { document.execCommand("copy"); done(); } catch (err) {}
    }
  }

  function forget(id) {
    st.selected.delete(id);
    st.captains.delete(id);
    delete st.locked[id];
    for (const ids of Object.values(st.locked)) {
      const k = ids.indexOf(id);
      if (k !== -1) ids.splice(k, 1);
    }
  }

  host.addEventListener("change", (e) => {
    const t = e.target;
    const act = t.dataset.act;
    const id = t.closest("[data-id]")?.dataset.id;
    if (act === "play") {
      if (t.checked) st.selected.add(id);
      else forget(id);
      invalidateResult();
      renderAll();
    } else if (act === "lock") {
      setLock(id, t.value);
      invalidateResult();
      renderAll();
    } else if (t.dataset.field) {
      const g = st.guests.find((x) => x.id === id);
      if (!g) return;
      g[t.dataset.field] = t.value;
      invalidateResult();
      t.classList.toggle("invalid", t.dataset.field === "rating" && !guestValid(g));
      renderStatus();
      renderResult();
    }
  });

  function setLock(playerId, captainId) {
    for (const ids of Object.values(st.locked)) {
      const k = ids.indexOf(playerId);
      if (k !== -1) ids.splice(k, 1);
    }
    if (captainId) (st.locked[captainId] ??= []).push(playerId);
  }

  host.addEventListener("input", (e) => {
    const t = e.target;
    if (!t.dataset.field) return;
    const id = t.closest("[data-id]")?.dataset.id;
    const g = st.guests.find((x) => x.id === id);
    if (!g) return;
    g[t.dataset.field] = t.value;
    if (t.dataset.field === "rating") t.classList.toggle("invalid", !guestValid(g));
    invalidateResult();
    renderStatus();
    $("#dr-result").innerHTML = "";
  });

  host.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn || btn.tagName === "SELECT" || btn.tagName === "INPUT") return;
    const act = btn.dataset.act;
    const id = btn.closest("[data-id]")?.dataset.id;
    if (act === "cap") {
      if (st.captains.has(id)) {
        st.captains.delete(id);
        delete st.locked[id];
      } else {
        st.captains.add(id);
        setLock(id, "");
      }
      invalidateResult();
      renderAll();
    } else if (act === "add-guest") {
      st.guests.push({ id: "g" + st.nextGuest++, name: "", rating: String(GUEST_DEFAULT_RATING) });
      invalidateResult();
      renderAll();
      const inputs = host.querySelectorAll('.draft-guest-row input[data-field="name"]');
      inputs[inputs.length - 1].focus();
    } else if (act === "remove-guest") {
      st.guests = st.guests.filter((g) => g.id !== id);
      forget(id);
      invalidateResult();
      renderAll();
    } else if (act === "clear") {
      st.selected.clear();
      st.captains.clear();
      st.guests = [];
      st.locked = {};
      invalidateResult();
      renderAll();
    } else if (act === "build") {
      build();
    } else if (act === "reset") {
      invalidateResult();
      renderResult();
    } else if (act === "variant") {
      st.view = (st.view + 1) % st.variants.length;
      st.launchText = null;
      renderResult();
    } else if (act === "up" || act === "down") {
      const i = Number(btn.dataset.i);
      const j = act === "up" ? i - 1 : i + 1;
      const order = (st.order ?? captainIds()).slice();
      [order[i], order[j]] = [order[j], order[i]];
      st.order = order;
      st.launchText = null;
      renderResult();
    } else if (act === "launch") {
      launch();
    } else if (act === "copy") {
      copy();
    }
  });

  renderAll();
}
