// Вкладка «Турнир»: выбор турнира по датам, составы, круг, таблица, финал,
// матч за 3 место, места. Данные — готовый массив tournaments из stats.json
// (его строит scripts/lib/tournamentStandings.mjs), здесь только отрисовка.

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const DATE_FORMAT = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Samara",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const STATUS_LABEL = { circle: "идёт круг", playoff: "плей-офф", finished: "завершён" };
const MEDAL = { 1: "🥇", 2: "🥈", 3: "🥉" };

let selectedId = null;

function label(t) {
  return `${DATE_FORMAT.format(new Date(t.createdAt))} · ${STATUS_LABEL[t.status] ?? t.status}`;
}

function teamName(t, number) {
  const team = t.teams.find((x) => x.number === number);
  return team ? `★ ${team.captain}` : `Команда ${number}`;
}

function slotHtml(t, s) {
  const a = esc(teamName(t, s.a));
  const b = esc(teamName(t, s.b));
  if (s.lobbyId === null) {
    return `<div class="tn-match tn-todo"><span>${a}</span><span class="tn-score">—</span><span>${b}</span></div>`;
  }
  const win = (n) => (s.winner === n ? " tn-win" : "");
  return (
    `<div class="tn-match"><span class="${win(s.a).trim()}">${a}</span>` +
    `<a class="tn-score" href="${esc(s.url)}" target="_blank" rel="noopener">${s.scoreA ?? "?"} : ${s.scoreB ?? "?"}</a>` +
    `<span class="${win(s.b).trim()}">${b}</span></div>`
  );
}

function nextWaiting(t) {
  for (const r of t.rounds) {
    const m = r.matches.find((s) => s.lobbyId === null);
    if (m) return `${teamName(t, m.a)} — ${teamName(t, m.b)} (тур ${r.round})`;
  }
  if (t.final && t.final.lobbyId === null) return `финал: ${teamName(t, t.final.a)} — ${teamName(t, t.final.b)}`;
  if (t.third && t.third.lobbyId === null) return `за 3 место: ${teamName(t, t.third.a)} — ${teamName(t, t.third.b)}`;
  return null;
}

function teamsHtml(t) {
  return (
    '<div class="tn-teams">' +
    t.teams
      .map(
        (team) =>
          `<div class="draft-team"><h4>${team.number}. ★ ${esc(team.captain)}</h4><ul>` +
          team.players
            .map((p) => `<li><span>${p.captain ? "★ " : ""}${esc(p.name)}${p.steamid64 ? "" : '<span class="draft-guest-tag">гость</span>'}</span></li>`)
            .join("") +
          "</ul></div>"
      )
      .join("") +
    "</div>"
  );
}

function standingsHtml(t) {
  // Команды, уже получившие место в финале или матче за 3 место, идут по местам,
  // остальные — по порядку круга.
  const placed = t.teams.filter((x) => x.rank).sort((x, y) => x.rank - y.rank).map((x) => x.number);
  const display = [...placed, ...t.order.filter((n) => !placed.includes(n))];
  const rows = display
    .map((n, i) => {
      const team = t.teams.find((x) => x.number === n);
      const place = team.rank ? MEDAL[team.rank] ?? team.rank : i + 1;
      const kd = team.kd === null ? "—" : team.kd.toFixed(2);
      const diff = team.roundDiff > 0 ? "+" + team.roundDiff : String(team.roundDiff);
      return `<tr><td>${place}</td><td>★ ${esc(team.captain)}</td><td>${team.played}</td><td>${team.wins}</td><td>${diff}</td><td>${kd}</td></tr>`;
    })
    .join("");
  return (
    '<table class="tn-table"><thead><tr><th>#</th><th>Команда</th><th>И</th><th>В</th><th>Раунды</th><th>K/D</th></tr></thead>' +
    `<tbody>${rows}</tbody></table>`
  );
}

function placesHtml(t) {
  if (t.status !== "finished") return "";
  const sorted = [...t.teams].sort((x, y) => x.rank - y.rank);
  return (
    '<div class="tn-places"><h4>Итоги</h4>' +
    sorted.map((team) => `<div>${MEDAL[team.rank] ?? team.rank + "."} ★ ${esc(team.captain)}</div>`).join("") +
    "</div>"
  );
}

function bodyHtml(t) {
  const waiting = t.status === "finished" ? null : nextWaiting(t);
  const rounds = t.rounds
    .map((r) => `<div class="tn-round"><div class="tn-ttl">Тур ${r.round}</div>${r.matches.map((s) => slotHtml(t, s)).join("")}</div>`)
    .join("");
  const playoff = t.final
    ? '<div class="tn-playoff">' +
      `<div class="tn-round"><div class="tn-ttl">Финал (места 1–2)</div>${slotHtml(t, t.final)}</div>` +
      `<div class="tn-round"><div class="tn-ttl">За 3 место (места 3–4)</div>${slotHtml(t, t.third)}</div></div>`
    : '<div class="draft-hint">Финал и матч за 3 место определятся после шести матчей круга.</div>';
  const unattributed = t.unattributed.length
    ? '<div class="tn-unattributed"><h4>Матчи, которые не удалось отнести к турниру</h4>' +
      t.unattributed
        .map((u) => `<div><a href="https://cybershoke.net/match/${u.lobbyId}" target="_blank" rel="noopener">Матч ${u.lobbyId}</a>: ${esc(u.reason)}</div>`)
        .join("") +
      "</div>"
    : "";
  return (
    (waiting ? `<div class="draft-hint">Ждём матч: ${esc(waiting)}</div>` : "") +
    placesHtml(t) +
    "<h4>Составы</h4>" + teamsHtml(t) +
    '<h4>Круг</h4><div class="tn-rounds">' + rounds + "</div>" +
    "<h4>Таблица</h4>" + standingsHtml(t) +
    "<h4>Плей-офф</h4>" + playoff +
    unattributed
  );
}

export function renderTournaments(host, tournaments) {
  if (!tournaments.length) {
    host.innerHTML =
      '<div class="draft-section"><div class="draft-hint">Турниров пока нет. Составы делятся на вкладке «Выбор составов», ' +
      "дальше — кнопка «Запустить турнир»: она даст текст для бота.</div></div>";
    return;
  }
  const current = tournaments.find((t) => t.id === selectedId) ?? tournaments[0];
  selectedId = current.id;
  host.innerHTML =
    '<div class="draft-section tn">' +
    '<div class="tn-head"><label>Турнир: <select class="tn-select" id="tn-select">' +
    tournaments.map((t) => `<option value="${esc(t.id)}"${t.id === current.id ? " selected" : ""}>${esc(label(t))}</option>`).join("") +
    "</select></label></div>" +
    bodyHtml(current) +
    "</div>";
  host.querySelector("#tn-select").addEventListener("change", (e) => {
    selectedId = e.target.value;
    renderTournaments(host, tournaments);
  });
}
