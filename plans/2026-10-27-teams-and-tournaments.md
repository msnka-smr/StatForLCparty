# Команды с капитанами и вкладка «Турнир» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Подбор сбалансированных команд (2–10, капитаны, закреплённые игроки, автоподбор) и вкладка «Турнир» (круг из 4 команд, финал, матч за 3 место, история), результаты берутся из ссылок на лобби, которые владелец присылает боту.

**Architecture:** Вся новая логика — чистые ES-модули: `docs/lib/*.mjs` (браузер и тесты) и `scripts/lib/*.mjs` (сборка). Браузерный скрипт `docs/index.html` подгружает `docs/lib` через динамический `import()`. Турнир — это файл `data/tournaments/<id>.json` (только составы и время запуска); матчи и таблица пересчитываются при каждой сборке из `data/matches/*.json` и попадают в `stats.json` как массив `tournaments`. Бот только передаёт текст `/турнир …` в workflow.

**Tech Stack:** Node 24 (`node --test`), ванильный JS без сборки, Cloudflare Worker, GitHub Actions.

**Spec:** `specs/2026-10-27-teams-and-tournaments-design.md`

## Global Constraints

- Статический сайт без сборки и без npm-зависимостей в браузере; данные только из `docs/data/stats.json`.
- Бот ничего не считает и не хранит; логика в `scripts/`; проверка владельца по Telegram ID остаётся.
- Тесты `node --test`, сейчас 161, все должны проходить после каждой задачи.
- Формат только 5×5. Подбор команд: 2–10 команд (число капитанов = число команд). Вкладка «Турнир»: только 4 команды.
- Сила игрока = рейтинг за всё время (вес 0.3) + K−D (0.3) + K/D (0.4), каждый показатель min–max к 0…1 среди выбранных. Предупреждение о перекосе при разрыве больше 5% от средней силы команды.
- Круг: тур 1: 1–3 и 2–4; тур 2: 2–1 и 3–4; тур 3: 2–3 и 4–1. Две лучшие по победам играют финал, две остальные матч за 3 место.
- Равенство побед (лексикографически): победы в матчах внутри группы, разница раундов внутри группы, средний K/D команды по матчам круга (сумма убийств / сумма смертей стороны в лобби), номер капитана.
- Время запуска турнира (`createdAt`) зашито в текст для бота при нажатии «Запустить турнир»; турнирный текст начинается с `/турнир`.
- Старые турниры не стираются при пересборке. Тексты интерфейса и сообщения бота — по-русски.
- `specs/` и `plans/` вне `docs/`. Git-коммиты: `git -c user.name="Золотухин Михаил Анатольевич" -c user.email="m.zolotukhin@corp.pravo.tech" commit`, сообщение заканчивается строкой `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Пуш только в последней задаче.

## Решения плана сверх спека (проверить при чтении)

- Окно привязки матчей к турниру: `TOURNAMENT_WINDOW_HOURS = 48` после `createdAt` (решение владельца). Без окна через месяц любой обычный матч этих же друзей считался бы «лишним матчем турнира».
- Строка «матч не удалось отнести» показывается для любого матча в окне турнира, который не удалось отнести к командам, даже если в нём нет ни одного игрока турнира (решение владельца: так ловятся ошибочные ссылки на лобби). Побочный эффект: обычные матчи, сыгранные в те же 48 часов, тоже попадут в этот список.
- Если в лобби несколько карт (в истории не встречалось, но код такое допускает), матчем считается карта с наименьшим `mapIndex`.
- Закрепление игроков в UI — через список «в команду…» у каждого выбранного игрока (не перетаскивание).

## Review Focus

- Число выбранных ≠ 5 × капитанов, капитанов 1 или 11: кнопки подбора и запуска заблокированы с точным сообщением (Задачи 2, 8).
- Нет свободных игроков (всё закреплено): подбор не падает, один вариант, «Другой вариант» скрыт (Задача 2).
- У всех игроков одинаковые рейтинг/K/D (разброс 0): нет NaN/деления на ноль (Задача 1).
- Команда из гостей без Steam-ID: матч не приписывается молча, а выводится строкой «не удалось отнести» (Задача 4).
- В `stats.json` нет поля `tournaments` (старый кеш) или турнир без единого матча: вкладка рисует пустые состояния (Задача 9).
- Дополнительно в тестах: трёхсторонний цикл по победам, сообщение с `/турнир` и ссылками, повторная отправка того же текста, лобби без победителя.

## Файлы

- Create `docs/lib/strength.mjs`, `docs/lib/teamBalance.mjs`, `docs/lib/tournamentText.mjs`
- Create `scripts/lib/tournamentMatches.mjs`, `scripts/lib/tournamentStandings.mjs`, `scripts/lib/tournamentsOutput.mjs`, `scripts/tournament-add.mjs`
- Create `test/helpers/tournamentFixtures.mjs`, `test/strength.test.mjs`, `test/teamBalance.test.mjs`, `test/tournamentText.test.mjs`, `test/tournamentMatches.test.mjs`, `test/tournamentStandings.test.mjs`, `test/tournamentsOutput.test.mjs`, `test/tournament-add.test.mjs`
- Modify `scripts/build.mjs`, `scripts/update.mjs`, `bot/src/worker.mjs`, `test/bot-worker.test.mjs`, `.github/workflows/update-stats.yml`, `docs/index.html`, `CLAUDE.md`, `bot/README.md`
- `data/tournaments/` — каталог с файлами турниров (создаётся первым турниром, `.gitkeep` не нужен).

---

### Task 1: Сила игрока и разброс команд

**Files:** Create `docs/lib/strength.mjs`; Test `test/strength.test.mjs`

**Interfaces:**
- Produces: `Player = { id: string, name: string, rating: number, kd: number, k: number, d: number, guest?: boolean }` (K−D считается как `k − d`; у гостей `k` = оценка K−D, `d` = 0, как в нынешнем `draftEstimator`).
- Produces: `STRENGTH_WEIGHTS = { rating: 0.3, kdDiff: 0.3, kd: 0.4 }`.
- Produces: `makeGuestEstimator(allPlayers: {rating,kd,k,d}[]): (rating: number) => { kd: number, kdDiff: number }` — перенос `linFit` и `draftEstimator` из `docs/index.html:2621-2646` без изменения поведения.
- Produces: `playerStrengths(players: Player[]): Map<string, number>` — по `id`.
- Produces: `spreadPct(teamStrengths: number[]): number` — `(max − min) / mean × 100`, при нулевом среднем 0.

- [ ] **Step 1: Failing tests** (`test/strength.test.mjs`): `spreadPct([10,10,10,10]) === 0`; `spreadPct([9,11]) === 20`; `spreadPct([0,0]) === 0`; `playerStrengths` для трёх игроков, где первый лучший по всем трём метрикам, даёт ему `1`, худшему `0`; для игроков с одинаковыми рейтингом/K/D возвращает все значения конечными числами (`Number.isFinite`), без NaN; `makeGuestEstimator` на данных `kd = 0.5 + rating/1000` возвращает для рейтинга 500 значение `kd ≈ 1.0` (точность 1e-9) и не опускает `kd` ниже 0.
- [ ] **Step 2: Run** `node --test test/strength.test.mjs`, ожидается FAIL (модуля нет).
- [ ] **Step 3: Implement** `docs/lib/strength.mjs`. Нормировка по min–max; если диапазон метрики 0, вклад метрики 0.
- [ ] **Step 4: Run** тот же тест, ожидается PASS.
- [ ] **Step 5: Commit** `git add docs/lib/strength.mjs test/strength.test.mjs` — «Сила игрока и разброс команд».

### Task 2: Подбор команд, проверки и обмены

**Files:** Create `docs/lib/teamBalance.mjs`; Test `test/teamBalance.test.mjs`

**Interfaces:**
- Consumes: `playerStrengths`, `spreadPct`, `Player` из Задачи 1.
- Produces: `WARN_SPREAD_PCT = 5`, `TEAM_SIZE = 5`, `MIN_TEAMS = 2`, `MAX_TEAMS = 10`.
- Produces: `validateRoster({ selected: number, captains: number }): { ok: boolean, message: string }`. Тексты: `Капитанов должно быть от 2 до 10`; `Не хватает игроков: N (нужно M для K команд)`; `Лишних игроков: N (нужно M для K команд)`; при `ok` сообщение пустое.
- Produces: `validateLocks({ captainIds: string[], locked: Record<string, string[]> }): { ok, message }` — ошибки: игрок закреплён за двумя командами; больше 4 закреплённых у капитана; закреплён игрок-капитан; ключ `locked` не из `captainIds`.
- Produces: `defaultCaptainOrder(players: Player[], captainIds: string[]): string[]` — по убыванию `rating` капитана, при равенстве по порядку в `captainIds`.
- Produces: `TeamsResult = { teams: { captainId: string, memberIds: string[] }[] /* капитан первым */, teamStrengths: number[], spreadPct: number }`.
- Produces: `buildTeamVariants({ players, captainIds, locked, count = 2 }): { variants: TeamsResult[] }` — бросает `Error` с текстом валидации, если проверки не прошли. Детерминированный (фиксированный seed), варианты различны по разбиению, отсортированы по `spreadPct`; вариантов меньше `count`, если других разбиений нет (в том числе при отсутствии свободных).
- Produces: `suggestSwaps(result: TeamsResult, ctx: { players, captainIds, locked }, max = 3): { aId, bId, fromTeam: number, toTeam: number, newSpreadPct: number }[]` — только если `result.spreadPct > WARN_SPREAD_PCT`; только обмены двух не закреплённых не-капитанов из разных команд, улучшающие разброс; по возрастанию `newSpreadPct`.

- [ ] **Step 1: Failing tests** (`test/teamBalance.test.mjs`): `validateRoster({selected:19,captains:4})` → `{ok:false, message:'Не хватает игроков: 1 (нужно 20 для 4 команд)'}`; `{selected:22,captains:4}` → `'Лишних игроков: 2 (нужно 20 для 4 команд)'`; `{selected:20,captains:1}` и `{captains:11}` → сообщение про 2–10; `{selected:20,captains:4}` → `ok`. `validateLocks` на каждую из четырёх ошибок. `buildTeamVariants` на 20 синтетических игроках (рейтинги 400…590 шагом 10, 4 капитана): у каждой команды 5 человек, капитан первый, `variants[0].spreadPct < 5`, все `id` встречаются ровно один раз; закреплённые игроки остаются у своего капитана в обоих вариантах; `variants.length === 2` и разбиения различны; при полностью закреплённых командах `variants.length === 1` и без ошибки; два вызова с одинаковым входом дают одинаковый результат; при игроках с одинаковыми метриками `spreadPct === 0` без NaN. `suggestSwaps`: при нарочно перекошенном закреплении (три сильных закреплены за капитаном 1) возвращает обмен, не трогающий закреплённых и капитанов, и `newSpreadPct < result.spreadPct`; при `spreadPct ≤ 5` возвращает `[]`. `defaultCaptainOrder` сортирует по убыванию рейтинга.
- [ ] **Step 2: Run** `node --test test/teamBalance.test.mjs`, ожидается FAIL.
- [ ] **Step 3: Implement** `docs/lib/teamBalance.mjs`. Алгоритм подбора: свободные игроки по убыванию силы раскладываются «змейкой» по командам с учётом оставшихся мест, затем жадные обмены свободных между командами, пока разброс падает; несколько стартовых порядков (детерминированный генератор, например mulberry32) дают набор кандидатов; варианты — лучшие различные кандидаты.
- [ ] **Step 4: Run** тест, ожидается PASS.
- [ ] **Step 5: Commit** — «Подбор команд: проверки, змейка с обменами, подсказки».

### Task 3: Текст для бота (формат и разбор)

**Files:** Create `docs/lib/tournamentText.mjs`; Test `test/tournamentText.test.mjs`

**Interfaces:**
- Produces: `TOURNAMENT_PREFIX = "/турнир"`.
- Produces: `Tournament = { id: string, createdAt: string /* ISO UTC */, teams: { number: 1|2|3|4, players: { name: string, steamid64: string | null, captain: boolean }[] }[] }`.
- Produces: `formatTournamentText({ createdAt, teams }): string`. Формат: первая строка `/турнир <createdAt>`, затем по строке на команду: `<номер>|*<имя>=<steamid64>|<имя>=<steamid64>|…`; капитан помечен `*` перед именем; у гостя после `=` пусто. В именах удаляются `|`, `=`, `*` в начале, переводы строк; пустое имя заменяется на `Игрок`.
- Produces: `parseTournamentText(text: string): { ok: true, tournament: Tournament } | { ok: false, error: string }`; префикс без учёта регистра; `id` = `createdAt` в UTC как `ГГГГ-ММ-ДД-ЧЧММ`.
- Тексты ошибок: `Нужно 4 команды, получено N`; `Команда K: нужно 5 игроков, получено N`; `Команда K: нужен ровно один капитан`; `Номера команд должны быть 1, 2, 3, 4 без повторов`; `Повторяется игрок <steamid64>`; `Неверный steamid64: <значение>`; `Неверное время запуска: <значение>`.

- [ ] **Step 1: Failing tests:** формат → разбор даёт исходную структуру (с гостем); `/ТУРНИР` в верхнем регистре разбирается; каждая из перечисленных ошибок; имя `Вася|x=y` после формата и разбора не ломает структуру; худший случай (20 игроков, имена по 40 символов) короче 4096 символов; `id` для `2026-10-27T18:30:00.000Z` равен `2026-10-27-1830`.
- [ ] **Step 2: Run** `node --test test/tournamentText.test.mjs`, ожидается FAIL.
- [ ] **Step 3: Implement** `docs/lib/tournamentText.mjs` (используется и браузером, и скриптами, поэтому только стандартный JS без Node API).
- [ ] **Step 4: Run** тест, ожидается PASS.
- [ ] **Step 5: Commit** — «Формат текста турнира для бота».

### Task 4: Привязка матчей к турниру

**Files:** Create `scripts/lib/tournamentMatches.mjs`, `test/helpers/tournamentFixtures.mjs`; Test `test/tournamentMatches.test.mjs`

**Interfaces:**
- Consumes: `Tournament` из Задачи 3; нормализованные карты из `scripts/lib/normalize.mjs` (поля `lobbyId`, `mapIndex`, `playedAt` в секундах, `teams[{key,score,isWinner}]`, `players[{steamid64,team,won,k,d}]`), уже после `applyAliases` и фильтра `coreSteamIds` (как в `scripts/build.mjs`, `includedMaps`).
- Produces: `TOURNAMENT_WINDOW_HOURS = 48`.
- Produces: `AttributedMatch = { lobbyId: number, playedAt: number, a: number, b: number, scoreA: number | null, scoreB: number | null, winner: number, kd: Record<number, { k: number, d: number }> }` (`a`, `b` — номера команд, `a < b`; `scoreA` — раунды команды `a`).
- Produces: `attributeMatches(tournaments: Tournament[], maps: NormalizedMap[]): Map<string, { matches: AttributedMatch[], unattributed: { lobbyId: number, reason: string }[] }>` по `tournament.id`; `matches` по возрастанию `playedAt`.
- Helper (`test/helpers/tournamentFixtures.mjs`): `sid(n): string` (17-значный фиктивный steamid), `makeTournament({ createdAt, rosters: number[][4] }): Tournament`, `makeMap({ lobbyId, playedAt, sideA: { ids, score, won }, sideB: {…}, mapIndex? }): NormalizedMap`.
- Правила: карта относится к турниру только при `createdAt ≤ playedAt ≤ createdAt + 48 ч`; от лобби берётся карта с наименьшим `mapIndex`; сторона сопоставляется с командой с наибольшим числом известных игроков (минимум 1, при равенстве нет сопоставления); матч в `unattributed`, если: обе стороны одной команды, нет однозначной команды, победитель не определён (`won` у игроков `null`, ничья); матчи без игроков турнира тоже идут в `unattributed` с причиной `В матче нет игроков турнира`; при нескольких подходящих турнирах побеждает с более поздним `createdAt`.

- [ ] **Step 1: Failing tests:** обычный матч 5×5 между командами 1 и 3 → `{a:1,b:3,winner:…}`; сторона из 2 известных + 3 гостей по-прежнему сопоставляется; сторона, где команды 1 и 2 поровну (2 и 2), → `unattributed`; обе стороны из игроков команды 1 → `unattributed`; `won: null` → `unattributed`; матч без игроков турнира внутри окна → в `unattributed` с причиной `В матче нет игроков турнира`; `playedAt` раньше `createdAt` и позже 48 часов → игнор; два турнира с одним составом: матч идёт в более поздний; два `mapIndex` одного лобби → один матч; `kd` суммирует `k` и `d` по игрокам стороны, включая запасных.
- [ ] **Step 2: Run** `node --test test/tournamentMatches.test.mjs`, ожидается FAIL.
- [ ] **Step 3: Implement** `scripts/lib/tournamentMatches.mjs` и хелпер.
- [ ] **Step 4: Run** тест, ожидается PASS.
- [ ] **Step 5: Commit** — «Привязка матчей к турниру по составам».

### Task 5: Таблица, плей-офф и места

**Files:** Create `scripts/lib/tournamentStandings.mjs`; Test `test/tournamentStandings.test.mjs`

**Interfaces:**
- Consumes: `AttributedMatch`, `Tournament`.
- Produces: `ROUND_ROBIN_SCHEDULE = [[[1,3],[2,4]], [[2,1],[3,4]], [[2,3],[4,1]]]`.
- Produces: `rankTeams(teams: number[], circle: AttributedMatch[]): number[]` — номера команд от лучшей к худшей (правила равенства из Global Constraints; пустой `circle` → порядок номеров).
- Produces: `Slot = { a: number, b: number, lobbyId: number | null, scoreA: number | null, scoreB: number | null, winner: number | null, url: string | null }` (`url` = `https://cybershoke.net/match/<id>`).
- Produces: `TournamentView = { id, createdAt, status: "circle" | "playoff" | "finished", teams: { number, captain: string, players: {name, steamid64, captain}[], played: number, wins: number, roundDiff: number, kd: number | null, rank: number | null }[], rounds: { round: 1|2|3, matches: Slot[] }[], order: number[], final: Slot | null, third: Slot | null, unattributed: { lobbyId, reason }[] }`.
- Produces: `buildTournamentView(tournament: Tournament, attributed: { matches: AttributedMatch[], unattributed }): TournamentView`.
- Правила: первый матч пары — круг; после шести матчей круга считается `order`, финалисты — первые две команды; из оставшихся матчей по хронологии первый матч финальной пары — `final`, первый матч пары за 3 место — `third`, прочие повторы идут в `unattributed` с причиной `Повторный матч пары, не относящийся к плей-офф` (до окончания круга — `Круг ещё не закончен`); `status`: `circle` до 6 матчей, `playoff` после, `finished` когда есть `final` и `third`; `rank` 1–2 по `final.winner`, 3–4 по `third.winner`, иначе `null`; незаполненные слоты `rounds` содержат пару и `lobbyId: null`.

- [ ] **Step 1: Failing tests:** `rankTeams` — победы 2/2/1/1 решаются личной встречей внутри группы; цикл A>B>C>A (по 1 победе внутри группы) решается разницей раундов внутри группы; равные раунды решает K/D (`kd` команды выше — выше); равный K/D решает номер капитана; `status === "circle"` с пятью матчами, `final === null`; после шести: `status === "playoff"`, `final` содержит две лучшие команды без результата; седьмой матч финальной пары заполняет `final`; восьмой матч пары за 3 место → `status === "finished"` и `rank` = `[1,2,3,4]` по победителям; седьмой матч пары, не относящейся к плей-офф, попадает в `unattributed`; второй матч пары до конца круга → `unattributed` с причиной `Круг ещё не закончен`.
- [ ] **Step 2: Run** `node --test test/tournamentStandings.test.mjs`, ожидается FAIL.
- [ ] **Step 3: Implement** `scripts/lib/tournamentStandings.mjs`.
- [ ] **Step 4: Run** тест, ожидается PASS.
- [ ] **Step 5: Commit** — «Таблица круга, финал, матч за 3 место и места».

### Task 6: Файлы турниров, сборка и добавление из текста

**Files:** Create `scripts/lib/tournamentsOutput.mjs`, `scripts/tournament-add.mjs`; Modify `scripts/build.mjs`, `scripts/update.mjs`; Test `test/tournamentsOutput.test.mjs`, `test/tournament-add.test.mjs`

**Interfaces:**
- Consumes: `attributeMatches` (Задача 4), `buildTournamentView` (Задача 5), `parseTournamentText` (Задача 3).
- Produces: `buildTournamentsOutput(tournaments: Tournament[], maps: NormalizedMap[]): TournamentView[]` — новые турниры сверху (по `createdAt`); пустой массив при отсутствии турниров.
- Produces: `data/tournaments/<id>.json` — `Tournament` как есть, `JSON.stringify(_, null, 2) + "\n"`.
- Produces: CLI `node scripts/tournament-add.mjs <путь к файлу с текстом>`: код 0 и строка `Турнир <id> создан` в stdout; при ошибке разбора код 1 и текст ошибки Задачи 3 в stderr; при существующем файле код 1 и `Турнир с таким временем уже есть: <id>`. Каталог данных можно переопределить переменной `TOURNAMENTS_DIR` (для теста).
- Produces: `node scripts/update.mjs --tournament-file <путь>` — `git pull --rebase --autostash`, затем `tournament-add.mjs`, без `collect.mjs` и `refresh-avatars.mjs`, дальше общая часть (проверка изменений в `data/`, `build`, коммит, пуш).

- [ ] **Step 1: Failing tests:** `buildTournamentsOutput` на фикстурах Задачи 4: два турнира → порядок по убыванию `createdAt`; без турниров → `[]`; турнир без матчей → `status: "circle"`, у всех команд `played: 0`. `tournament-add`: корректный текст создаёт файл (проверка содержимого), повторный запуск с тем же текстом даёт код 1 и сообщение о дубле, текст с тремя командами даёт код 1 и `Нужно 4 команды, получено 3`; тест запускает CLI через `child_process.spawnSync` с `TOURNAMENTS_DIR` во временной папке.
- [ ] **Step 2: Run** `node --test test/tournamentsOutput.test.mjs test/tournament-add.test.mjs`, ожидается FAIL.
- [ ] **Step 3: Implement** оба модуля; в `scripts/build.mjs` читать все `data/tournaments/*.json` (каталога нет → `[]`), вызывать `buildTournamentsOutput(tournaments, sortedMaps)` и класть результат в `output.tournaments`; в `scripts/update.mjs` добавить ветку `--tournament-file`.
- [ ] **Step 4: Run** новые тесты и `npm test`, ожидается PASS.
- [ ] **Step 5: Smoke** `npm run build` затем `node -e "console.log(JSON.parse(require('fs').readFileSync('docs/data/stats.json','utf8')).tournaments)"` → `[]`; `git checkout -- docs/data/stats.json data` для отката побочных изменений.
- [ ] **Step 6: Commit** — «Сборка: турниры в stats.json и добавление турнира из текста».

### Task 7: Бот и workflow

**Files:** Modify `bot/src/worker.mjs`, `test/bot-worker.test.mjs`, `.github/workflows/update-stats.yml`

**Interfaces:**
- Produces: `isTournamentMessage(text: string): boolean` (экспорт из `worker.mjs`) — `/^\s*\/турнир(?=\s|$)/i`.
- Produces: `dispatchWorkflow(env, inputs: Record<string,string>, fetchFn)` — вместо прежнего `links: string[]` (ссылки передаются как `{ links: links.join(" ") }`).
- Поведение: сообщение владельца, начинающееся с `/турнир`, обрабатывается раньше ссылок и исключает их; общая проверка очереди `queueIsFull`; запуск с входами `{ tournament: <весь текст> }`; ответ `Принял турнир, создаю. Напишу, когда закончу.`; ошибка запуска — прежний текст про ответ GitHub; чужие чаты по-прежнему игнорируются.
- Workflow: `links` становится необязательным (`default: ""`), добавляется вход `tournament` (`required: false`, `default: ""`); первым шагом падает, если оба пусты; шаги работы со ссылками (проверка cybershoke, скачивание) выполняются только при непустых `links`; при непустом `tournament` текст пишется в `$RUNNER_TEMP/tournament.txt` и запускается `node scripts/update.mjs --tournament-file "$RUNNER_TEMP/tournament.txt"` с перехватом stderr в `$RUNNER_TEMP/tournament-error.txt`; шаг «Запустить сборку Pages» остаётся для обоих режимов; Telegram-сообщение для турнира: успех — `Турнир создан. Сайт обновится через минуту-две.`, ошибка — `Не удалось создать турнир: <первые 300 символов tournament-error.txt>. Лог: <RUN_URL>`.

- [ ] **Step 1: Failing tests** (`test/bot-worker.test.mjs`, в стиле существующих с `fakeFetch`): `/турнир 2026-…` от владельца → один POST на dispatch с телом `inputs: { tournament: <текст> }` без `links`, ответ `Принял турнир, создаю. Напишу, когда закончу.`; `/ТУРНИР` в верхнем регистре тоже; сообщение с `/турнир` и ссылкой на матч → ссылка не уходит в dispatch; при двух активных запусках → `BUSY`; из чужого чата → ничего не отправляется; обычные ссылки по-прежнему уходят как `inputs: { links: "…" }`.
- [ ] **Step 2: Run** `node --test test/bot-worker.test.mjs`, ожидается FAIL.
- [ ] **Step 3: Implement** изменения в `worker.mjs`; поправить существующие тесты под новую сигнатуру только там, где они обращаются к `dispatchWorkflow` напрямую.
- [ ] **Step 4: Run** `node --test test/bot-worker.test.mjs` и `npm test`, ожидается PASS.
- [ ] **Step 5: Edit workflow** по описанию выше. Проверить, что файл разбирается как YAML (`python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/update-stats.yml',encoding='utf8'))"`, если модуль доступен; иначе внимательно прочитать diff). Полная проверка workflow возможна только на GitHub — в Задаче 10.
- [ ] **Step 6: Commit** — «Бот и workflow: команда /турнир».

### Task 8: Вкладка «Выбор составов»: капитаны, закрепление, автоподбор, запуск турнира

**Files:** Modify `docs/index.html` (блок «Выбор составов», строки ~2580–2940, и CSS `.draft-*` ~661–825)

**Interfaces:**
- Consumes: `validateRoster`, `validateLocks`, `defaultCaptainOrder`, `buildTeamVariants`, `suggestSwaps`, `WARN_SPREAD_PCT` (Задача 2), `makeGuestEstimator` (Задача 1), `formatTournamentText` (Задача 3). Подключаются динамическим `import("./lib/teamBalance.mjs")` и т.д. при первом открытии вкладки (до загрузки модулей показывать «Загрузка…»).
- Поведение (по макетам из обсуждения): список игроков с галочкой «играет» и звёздочкой «капитан»; гости как сейчас (`+ Добавить гостя`, имя, рейтинг на глаз, оценка K/D через `makeGuestEstimator`; id гостя `g1`, `g2`…); счётчик `Выбрано: N · Капитанов: C → C команд по 5`; сообщение `validateRoster` блокирует кнопку подбора и показывается красным; у каждого выбранного не-капитана список «в команду…» с капитанами (закрепление, 🔒 и крестик для снятия; ошибки `validateLocks` показываются под списком); кнопки «Подобрать остальных автоматически» и «Сбросить подбор»; результат — колонки команд (закреплённые с 🔒, добранные подсвечены), средняя сила команды, строка «Разброс силы команд: X%», при `spreadPct > WARN_SPREAD_PCT` предупреждение и список обменов из `suggestSwaps`; «Другой вариант» показывает второй вариант (лимит как сейчас: ключ в `localStorage`, префикс заменить на `lcstat:draftGen:`, второй вариант не тратится повторно), скрыта при одном варианте; если число капитанов равно 4 и составы полные — кнопка «Запустить турнир» (порядок номеров по `defaultCaptainOrder`, с возможностью поменять кнопками вверх/вниз), которая берёт `createdAt = new Date().toISOString()` и показывает текст `formatTournamentText` в поле с кнопкой «Копировать» и подписью «Отправьте этот текст боту @Cs2_stat_LCparty_bot».
- Старый подбор 2 команд по 10 человек заменяется общим (2 капитана = прежний сценарий); старые `DRAFT_MAX`, `computeDraftSplits`, `draftEstimator` удаляются.

- [ ] **Step 1: Prepare** локальный просмотр: `cd docs && python -m http.server 8765`; открыть `http://localhost:8765/` (модули не работают по `file://`).
- [ ] **Step 2: Rewrite** блок «Выбор составов» по описанию; пересобрать UI-состояние чистыми вызовами `lib` (логику подбора в HTML не дублировать).
- [ ] **Step 3: Verify** в headless Edge скриншотами (как для футера: `msedge --headless --screenshot=… --window-size=1100,900 http://localhost:8765/`; для действий пользователя использовать временный URL-хэш `#draft` или ручную проверку в браузере): 20 игроков (демо-данные из Задачи 9 или временная подстановка в `stats.json`), 4 капитана → результат без предупреждения; 19 игроков → красное сообщение `Не хватает игроков: 1 (нужно 20 для 4 команд)`; 3 закреплённых сильных у одного капитана → предупреждение и обмены; «Запустить турнир» показывает текст, который `parseTournamentText` принимает (проверить копированием в `node -e`).
- [ ] **Step 4: Run** `npm test`, ожидается PASS.
- [ ] **Step 5: Commit** — «Выбор составов: капитаны, закрепление, автоподбор, запуск турнира».

### Task 9: Вкладка «Турнир» и история

**Files:** Modify `docs/index.html` (HTML вкладок ~950, `VALID_TABS` ~1024, `noTableTab` ~1337, `render()` ~1118, новая секция `#tournamentSection`, CSS)

**Interfaces:**
- Consumes: `state.data.tournaments: TournamentView[]` (Задача 5); поле может отсутствовать (трактуется как `[]`).
- Поведение: вкладка `<div class="tab" data-tab="tournament">Турнир</div>` после «Рекорды»; `VALID_TABS` и `noTableTab()` дополнены; наверху `<select>` турнира по образцу `renderSessionHeader` (подпись — дата и время запуска в `Europe/Samara`, новые сверху, по умолчанию последний, id запоминается в `state`); для выбранного: составы четырёх команд (капитан отмечен ★), три тура с матчами (счёт, победитель выделен, ссылка на лобби; несыгранные — `—`), таблица (место, команда, игры, победы, разница раундов, K/D), блоки «Финал» и «За 3 место» (пока пары не известны — «после круга»), итоговые места 1–4 после завершения, строки `unattributed` («Матч <id> не удалось отнести: <причина>», ссылка на лобби). Статус незавершённого турнира: «Ждём матч: …» по первому несыгранному слоту. Пустое состояние: «Турниров пока нет. Составы делятся на вкладке «Выбор составов», дальше — кнопка «Запустить турнир».»

- [ ] **Step 1: Create demo data**: временный `scratch`-скрипт в scratchpad строит `stats.json` с демо-турниром через `buildTournamentsOutput` на фикстурах `test/helpers/tournamentFixtures.mjs` (4 команды, 6 матчей круга, финал сыгран, матч за 3 место нет; один матч в `unattributed`); копирует результат поверх `docs/data/stats.json` только на время проверки.
- [ ] **Step 2: Implement** вкладку и секцию.
- [ ] **Step 3: Verify** скриншотами на `http://localhost:8765/` (десктоп 1100 px и 400 px): заполненный турнир, незавершённый (после пятого матча), пустое состояние (демо без `tournaments`), `stats.json` без поля `tournaments` — ошибок в консоли нет, вкладка пустая. Затем `git checkout -- docs/data/stats.json` и остановить сервер.
- [ ] **Step 4: Run** `npm test`, ожидается PASS.
- [ ] **Step 5: Commit** — «Вкладка «Турнир»: составы, круг, таблица, финал, история».

### Task 10: Документация, проверка на живом боте и пуш

**Files:** Modify `CLAUDE.md`, `bot/README.md`

- [ ] **Step 1: Docs.** В `CLAUDE.md` добавить раздел «Команды и турниры»: файлы `data/tournaments/*.json`, формат текста `/турнир`, правила привязки матчей (окно 48 ч), правила равенства; в `bot/README.md` — команда `/турнир` и что делать при ошибке (текст ошибки приходит в Telegram).
- [ ] **Step 2: Full check.** `npm test` — все тесты проходят; `npm run build` — завершается без ошибок, `git status` показывает только ожидаемые изменения (откатить побочные: `git checkout -- docs/data/stats.json data`).
- [ ] **Step 3: Commit и push** (`git push`), затем задеплоить воркер: `cd bot && npx wrangler deploy` (секреты те же, webhook не менять).
- [ ] **Step 4: Живая проверка с владельцем.** Открыть сайт, вкладка «Выбор составов»: выбрать 20 игроков/гостей, 4 капитана, подобрать, «Запустить турнир», скопировать текст, отправить боту `@Cs2_stat_LCparty_bot`. Ожидаемо: «Принял турнир, создаю…», затем «Турнир создан…», на вкладке «Турнир» появился турнир без матчей. Отправить боту ссылку на лобби матча между двумя командами турнира: матч появляется в круге. Ошибочный текст (например, 3 команды) → в Telegram приходит понятная причина.
- [ ] **Step 5: Update memory** (`cs2statforlc-project.md`): состояние фичи и то, что «вариант 3» остаётся отложенным (`cs2statforlc-tournament-idea-site-save.md`).

---

## Self-review (спек → задачи)

- Подбор 2–10 команд, капитаны, закрепление, автоподбор, баланс, предупреждение и обмены, кратность 5 — Задачи 1, 2, 8.
- Запуск турнира текстом боту, бот без вычислений — Задачи 3, 6, 7, 8.
- Привязка матчей, повторы, гости, алиасы/фильтр (вход после `includedMaps`), `createdAt` из текста — Задача 4 (+ решения сверх спека).
- Круг, тай-брейки, финал, место 3–4, места — Задача 5.
- Файлы турниров, история, `stats.json` — Задача 6; вкладка и выбор по датам — Задача 9.
- Не цели соблюдены: 5+ команд на вкладке «Турнир», ручной ввод результатов и кнопка сохранения на сайте не планируются.
