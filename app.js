(function () {
  "use strict";

  const config = globalThis.PITCH_CALLER_CONFIG;
  const STORAGE_KEY = "pitch-caller-v5";
  const LEGACY_KEY = "pitch-caller-v3";
  const SCHEMA = 2;

  const $ = (id) => document.getElementById(id);
  const byId = (items, id) => items.find((item) => item.id === id);
  const clean = (value) => String(value || "").trim().replace(/\s+/g, " ");
  const now = () => new Date().toISOString();
  const id = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const pct = (count, total) => (total ? `${Math.round((count / total) * 100)}%` : "0%");

  const els = {
    version: $("version-label"),
    audioStatus: $("audio-status"),
    audioDetail: $("audio-detail"),
    cacheStatus: $("cache-status"),
    arm: $("arm-audio"),
    test: $("test-audio"),
    replay: $("replay-last"),
    lock: $("lock-toggle"),
    clear: $("clear-call"),
    tabs: Array.from(document.querySelectorAll(".tab-button")),
    panels: Array.from(document.querySelectorAll(".tab-panel")),
    callOpponent: $("call-opponent"),
    callPitcher: $("call-pitcher"),
    callBatter: $("call-batter"),
    prevBatter: $("prev-batter"),
    nextBatter: $("next-batter"),
    batterPrev: $("batter-prev"),
    batterNext: $("batter-next"),
    pitches: $("pitch-options"),
    zones: $("zone-options"),
    results: $("result-options"),
    specials: $("special-call-options"),
    selectedPitch: $("selected-pitch"),
    pendingLabel: $("pending-result-label"),
    batterTitle: $("batter-title"),
    currentSeq: $("current-sequence"),
    previousSeq: $("previous-sequences"),
    statsContext: $("stats-context"),
    statsCurrent: $("stats-current"),
    statsCumulative: $("stats-cumulative"),
    statsSummary: $("stats-summary"),
    pitchStats: $("pitch-stats"),
    opponent: $("opponent-name"),
    gameSelect: $("game-select"),
    gameLabel: $("game-label"),
    newGame: $("new-game"),
    pitcherSelect: $("pitcher-select"),
    addPitcher: $("add-pitcher"),
    renamePitcher: $("rename-pitcher"),
    deletePitcher: $("delete-pitcher"),
    lineup: $("lineup-editor"),
    activeSlot: $("active-slot-label"),
    storageCount: $("storage-count"),
    exportCsv: $("export-csv"),
    clearData: $("clear-data")
  };

  const state = {
    data: loadData(),
    ready: false,
    locked: false,
    tab: "call",
    statsScope: "game",
    selectedPitchId: null,
    pendingEventId: null,
    lastCall: null,
    audio: new Map()
  };

  function pitch(id) { return byId(config.pitches, id); }
  function zone(id) { return byId(config.zones, id); }
  function result(id) { return byId(config.results, id); }
  function pitcher() { return byId(state.data.pitchers, state.data.activePitcherId) || state.data.pitchers[0]; }
  function game() { return byId(state.data.games, state.data.currentGameId) || state.data.games[0]; }
  function batter() {
    const g = game();
    return g?.lineup.find((item) => item.slot === g.activeBatterSlot) || g?.lineup[0] || null;
  }

  function makeLineup(gameId) {
    return Array.from({ length: 9 }, (_, index) => {
      const slot = index + 1;
      return { id: `${gameId}_batter_${slot}`, slot, name: `Batter ${slot}`, number: "" };
    });
  }

  function makeGame(opponentName = "") {
    const gameId = id("game");
    return {
      id: gameId,
      startedAt: now(),
      opponentName: clean(opponentName),
      lineup: makeLineup(gameId),
      activeBatterSlot: 1,
      activePlateAppearanceId: null
    };
  }

  function makeInitial() {
    const pitcherId = id("pitcher");
    const g = makeGame();
    return {
      schemaVersion: SCHEMA,
      activePitcherId: pitcherId,
      currentGameId: g.id,
      pitchers: [{ id: pitcherId, name: "Pitcher 1", createdAt: now() }],
      games: [g],
      plateAppearances: [],
      pitchEvents: []
    };
  }

  function normalizeGame(raw) {
    const g = makeGame(raw?.opponentName || "");
    g.id = typeof raw?.id === "string" ? raw.id : g.id;
    g.startedAt = typeof raw?.startedAt === "string" ? raw.startedAt : g.startedAt;
    g.activeBatterSlot = Number.isInteger(raw?.activeBatterSlot) && raw.activeBatterSlot >= 1 && raw.activeBatterSlot <= 9 ? raw.activeBatterSlot : 1;
    g.activePlateAppearanceId = typeof raw?.activePlateAppearanceId === "string" ? raw.activePlateAppearanceId : null;
    const existing = Array.isArray(raw?.lineup) ? raw.lineup : [];
    g.lineup = makeLineup(g.id).map((fallback) => {
      const match = existing.find((item) => Number(item?.slot) === fallback.slot) || {};
      return {
        id: typeof match.id === "string" ? match.id : fallback.id,
        slot: fallback.slot,
        name: clean(match.name) || fallback.name,
        number: clean(match.number)
      };
    });
    return g;
  }

  function normalize(raw) {
    const fallback = makeInitial();
    if (!raw || typeof raw !== "object") return fallback;
    const pitchers = (Array.isArray(raw.pitchers) ? raw.pitchers : [])
      .filter((item) => item && typeof item.id === "string")
      .map((item) => ({ id: item.id, name: clean(item.name) || "Pitcher", createdAt: item.createdAt || now() }));
    const games = (Array.isArray(raw.games) ? raw.games : []).filter((item) => item?.id).map(normalizeGame);
    const data = {
      schemaVersion: SCHEMA,
      activePitcherId: raw.activePitcherId,
      currentGameId: raw.currentGameId,
      pitchers: pitchers.length ? pitchers : fallback.pitchers,
      games: games.length ? games : fallback.games,
      plateAppearances: (Array.isArray(raw.plateAppearances) ? raw.plateAppearances : []).filter((pa) => pa?.id && pa?.gameId).map((pa) => ({
        id: pa.id,
        gameId: pa.gameId,
        batterId: typeof pa.batterId === "string" ? pa.batterId : null,
        pitcherId: typeof pa.pitcherId === "string" ? pa.pitcherId : null,
        startedAt: pa.startedAt || now(),
        endedAt: pa.endedAt || null,
        terminalResultId: result(pa.terminalResultId) ? pa.terminalResultId : null
      })),
      pitchEvents: (Array.isArray(raw.pitchEvents) ? raw.pitchEvents : raw.events || []).filter((event) => event?.id).map((event) => ({
        id: event.id,
        gameId: event.gameId || raw.currentGameId || fallback.currentGameId,
        timestamp: event.timestamp || now(),
        pitcherId: event.pitcherId || raw.activePitcherId || fallback.activePitcherId,
        batterId: typeof event.batterId === "string" ? event.batterId : null,
        plateAppearanceId: typeof event.plateAppearanceId === "string" ? event.plateAppearanceId : null,
        pitchId: event.pitchId,
        zoneId: typeof event.zoneId === "string" ? event.zoneId : null,
        resultId: mapResult(event.resultId)
      })).filter((event) => pitch(event.pitchId))
    };
    if (!byId(data.pitchers, data.activePitcherId)) data.activePitcherId = data.pitchers[0].id;
    if (!byId(data.games, data.currentGameId)) data.currentGameId = data.games[data.games.length - 1].id;
    return data;
  }

  function mapResult(resultId) {
    const legacy = {
      strike_looking: "called_strike",
      strike_swinging: "swinging_strike",
      foul: "foul",
      ball: "ball",
      in_play_out: "ground_out",
      hit: "ground_hit",
      hbp: "hbp"
    };
    return result(resultId) ? resultId : legacy[resultId] || null;
  }

  function loadData() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
      return stored ? normalize(JSON.parse(stored)) : makeInitial();
    } catch (error) {
      console.warn("Could not load tracking data.", error);
      return makeInitial();
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  }

  function fmt(iso) {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function batterLabel(item = batter()) {
    if (!item) return "No batter";
    return `${item.slot}. ${item.name || `Batter ${item.slot}`}${item.number ? ` #${item.number}` : ""}`;
  }

  function pitchText(event) {
    const p = pitch(event.pitchId);
    if (!p) return "Unknown Pitch";
    return p.requiresZone === false ? p.label : `${p.label} ${zone(event.zoneId)?.label || ""}`.trim();
  }

  function audioPathForPitch(p, zoneId) {
    return p.requiresZone === false ? `${config.audioBasePath}/${p.audioFile}` : `${config.audioBasePath}/${p.id}-${zoneId}.${config.audioExtension}`;
  }

  function audioKeyForPitch(p, zoneId) {
    return p.requiresZone === false ? `pitch:${p.id}` : `pitch:${p.id}:${zoneId}`;
  }

  function allCalls() {
    const pitches = config.pitches.flatMap((p) => p.requiresZone === false
      ? [{ key: audioKeyForPitch(p), path: audioPathForPitch(p), label: p.label }]
      : config.zones.map((z) => ({ key: audioKeyForPitch(p, z.id), path: audioPathForPitch(p, z.id), label: `${p.label} ${z.label}` })));
    const specials = (config.specialCalls || []).map((call) => ({
      key: `special:${call.id}`,
      path: `${config.audioBasePath}/${call.audioFile}`,
      label: call.label
    }));
    return [...pitches, ...specials];
  }

  function setStatus(text, mode = "status-idle") {
    els.audioStatus.textContent = text;
    els.audioStatus.className = `status-pill ${mode}`;
  }

  function render() {
    const g = game();
    const b = batter();
    const p = pitcher();
    const pending = pendingEvent();
    els.version.textContent = `Version ${config.version}`;
    els.audioDetail.hidden = !els.audioDetail.textContent;
    els.cacheStatus.textContent = location.protocol === "file:" ? "Local preview" : "Offline ready";
    els.test.disabled = !state.ready || state.locked;
    els.replay.disabled = !state.lastCall || !state.ready || state.locked;
    els.lock.disabled = !state.ready;
    els.lock.setAttribute("aria-pressed", String(state.locked));
    els.clear.disabled = !state.selectedPitchId;

    els.tabs.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.tab === state.tab)));
    els.panels.forEach((panel) => { panel.hidden = panel.dataset.panel !== state.tab; });

    els.callOpponent.textContent = g?.opponentName || "Opponent not set";
    els.callPitcher.textContent = p?.name || "No pitcher";
    els.callBatter.textContent = batterLabel(b);
    els.batterTitle.textContent = `Vs ${batterLabel(b)}`;
    els.selectedPitch.textContent = state.selectedPitchId ? pitch(state.selectedPitchId).label : "No pitch";
    els.pendingLabel.textContent = pending ? pitchText(pending) : "No pitch pending";
    els.opponent.value = g?.opponentName || "";
    els.gameLabel.textContent = g ? `Started ${fmt(g.startedAt)}` : "Game pending";
    els.activeSlot.textContent = `Slot ${g?.activeBatterSlot || 1} active`;
    els.storageCount.textContent = `${state.data.pitchEvents.length} ${state.data.pitchEvents.length === 1 ? "pitch" : "pitches"}`;

    renderPitchButtons();
    renderZones();
    renderResults();
    renderSpecials();
    renderGameSelect();
    renderPitcherSelect();
    renderLineup();
    renderSequences();
    renderStats();
  }

  function renderPitchButtons() {
    els.pitches.innerHTML = "";
    config.pitches.forEach((p) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option-button pitch-button";
      button.dataset.pitchId = p.id;
      button.textContent = p.label;
      button.disabled = !state.ready || state.locked;
      button.setAttribute("aria-pressed", String(state.selectedPitchId === p.id));
      button.addEventListener("click", () => selectPitch(p.id));
      els.pitches.append(button);
    });
  }

  function renderZones() {
    els.zones.innerHTML = "";
    const selected = pitch(state.selectedPitchId);
    config.zones.forEach((z) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `option-button zone-button zone-${z.id}`;
      button.dataset.zoneId = z.id;
      button.textContent = z.label;
      button.disabled = !selected || selected.requiresZone === false || !state.ready || state.locked;
      button.addEventListener("click", () => callPitch(selected.id, z.id));
      els.zones.append(button);
    });
  }

  function renderResults() {
    els.results.innerHTML = "";
    const pending = Boolean(pendingEvent());
    config.resultGroups.forEach((group) => {
      const section = document.createElement("section");
      section.className = "result-group";
      const label = document.createElement("span");
      label.className = "result-group-title";
      label.textContent = group.label;
      const grid = document.createElement("div");
      grid.className = "result-grid";
      config.results.filter((item) => item.group === group.id).forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "result-button";
        button.dataset.resultId = item.id;
        button.textContent = item.label;
        button.disabled = !pending;
        button.addEventListener("click", () => recordResult(item.id));
        grid.append(button);
      });
      section.append(label, grid);
      els.results.append(section);
    });
  }

  function renderSpecials() {
    els.specials.innerHTML = "";
    (config.specialCalls || []).forEach((call) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "special-button";
      button.dataset.specialId = call.id;
      button.textContent = call.label;
      button.disabled = !state.ready || state.locked;
      button.addEventListener("click", () => playSpecial(call.id));
      els.specials.append(button);
    });
  }

  function renderGameSelect() {
    const active = state.data.currentGameId;
    els.gameSelect.innerHTML = "";
    state.data.games.forEach((g, index) => {
      const option = document.createElement("option");
      option.value = g.id;
      option.textContent = `${g.opponentName || `Game ${index + 1}`} - ${fmt(g.startedAt)}`;
      els.gameSelect.append(option);
    });
    els.gameSelect.value = active;
  }

  function renderPitcherSelect() {
    const active = state.data.activePitcherId;
    els.pitcherSelect.innerHTML = "";
    state.data.pitchers.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.name;
      els.pitcherSelect.append(option);
    });
    els.pitcherSelect.value = active;
  }

  function renderLineup() {
    const g = game();
    els.lineup.innerHTML = "";
    g.lineup.forEach((item) => {
      const row = document.createElement("div");
      row.className = "lineup-row";
      const slot = document.createElement("span");
      slot.className = "lineup-slot";
      slot.textContent = item.slot;
      const name = document.createElement("input");
      name.className = "text-input";
      name.type = "text";
      name.value = item.name;
      name.dataset.batterNameSlot = String(item.slot);
      name.placeholder = `Batter ${item.slot}`;
      name.addEventListener("input", () => updateLineup(item.slot, "name", name.value));
      const number = document.createElement("input");
      number.className = "text-input number-input";
      number.type = "text";
      number.value = item.number;
      number.dataset.batterNumberSlot = String(item.slot);
      number.placeholder = "#";
      number.addEventListener("input", () => updateLineup(item.slot, "number", number.value));
      row.append(slot, name, number);
      els.lineup.append(row);
    });
  }

  function renderSequences() {
    const g = game();
    const b = batter();
    const open = activePa();
    const openEvents = open && open.batterId === b?.id ? eventsForPa(open.id) : [];
    fillSequence(els.currentSeq, openEvents, "No active sequence");
    const previous = state.data.plateAppearances
      .filter((pa) => pa.gameId === g.id && pa.batterId === b?.id && pa.endedAt)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    els.previousSeq.innerHTML = "";
    if (!previous.length) {
      const li = document.createElement("li");
      li.className = "empty-state";
      li.textContent = "No previous plate appearances";
      els.previousSeq.append(li);
      return;
    }
    previous.forEach((pa) => {
      const li = document.createElement("li");
      const terminal = result(pa.terminalResultId);
      li.textContent = `${fmt(pa.startedAt)}: ${eventsForPa(pa.id).map(sequenceText).join(", ")}${terminal ? ` - ${terminal.label}` : ""}`;
      els.previousSeq.append(li);
    });
  }

  function fillSequence(list, events, emptyText) {
    list.innerHTML = "";
    if (!events.length) {
      const li = document.createElement("li");
      li.className = "empty-state";
      li.textContent = emptyText;
      list.append(li);
      return;
    }
    events.forEach((event) => {
      const li = document.createElement("li");
      li.textContent = sequenceText(event);
      list.append(li);
    });
  }

  function sequenceText(event) {
    const r = result(event.resultId);
    return `${pitchText(event)}${r ? ` (${r.shortLabel || r.label})` : ""}`;
  }

  function renderStats() {
    const activePitcher = pitcher();
    const g = game();
    const scoped = state.data.pitchEvents.filter((event) =>
      event.pitcherId === activePitcher?.id &&
      (state.statsScope === "cumulative" || event.gameId === g.id)
    );
    const completed = scoped.filter((event) => result(event.resultId));
    const strikes = completed.filter((event) => result(event.resultId).countsAsStrike).length;
    const positive = completed.filter((event) => result(event.resultId).positive).length;
    const offSpeed = scoped.filter((event) => pitch(event.pitchId)?.category === "offSpeed").length;
    els.statsCurrent.setAttribute("aria-pressed", String(state.statsScope === "game"));
    els.statsCumulative.setAttribute("aria-pressed", String(state.statsScope === "cumulative"));
    els.statsContext.textContent = `${activePitcher?.name || "Pitcher"} - ${state.statsScope === "game" ? (g.opponentName || "Current game") : "All games"}`;
    els.statsSummary.innerHTML = "";
    [
      ["Pitches", scoped.length],
      ["Off-Speed", pct(offSpeed, scoped.length)],
      ["Strike", pct(strikes, completed.length)],
      ["Positive", pct(positive, completed.length)]
    ].forEach(([label, value]) => {
      const card = document.createElement("div");
      card.className = "stat-card";
      card.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
      els.statsSummary.append(card);
    });
    els.pitchStats.innerHTML = "";
    if (!scoped.length) {
      els.pitchStats.innerHTML = `<p class="empty-state">No pitches logged for this view.</p>`;
      return;
    }
    config.pitches.forEach((p) => {
      const rows = scoped.filter((event) => event.pitchId === p.id);
      if (!rows.length) return;
      const done = rows.filter((event) => result(event.resultId));
      const terminal = done.filter((event) => result(event.resultId).terminal);
      const counts = config.results
        .map((r) => [r.shortLabel || r.label, done.filter((event) => event.resultId === r.id).length])
        .filter(([, count]) => count)
        .map(([label, count]) => `${label} ${count}`)
        .join(", ");
      const row = document.createElement("article");
      row.className = "pitch-stat-row";
      row.innerHTML = `
        <div><strong>${p.label}</strong><span>${rows.length} calls - ${pct(rows.length, scoped.length)} usage</span></div>
        <div class="metric-line">
          <span>Strike ${pct(done.filter((event) => result(event.resultId).countsAsStrike).length, done.length)}</span>
          <span>Positive ${pct(done.filter((event) => result(event.resultId).positive).length, done.length)}</span>
          <span>K ${pct(terminal.filter((event) => result(event.resultId).terminalType === "k").length, terminal.length)}</span>
          <span>GB ${pct(terminal.filter((event) => result(event.resultId).terminalType === "ground").length, terminal.length)}</span>
          <span>FB ${pct(terminal.filter((event) => result(event.resultId).terminalType === "fly").length, terminal.length)}</span>
        </div>
        <p>${counts || "No completed results"}</p>`;
      els.pitchStats.append(row);
    });
  }

  function pendingEvent() {
    return byId(state.data.pitchEvents, state.pendingEventId);
  }

  function activePa() {
    const g = game();
    const pa = g?.activePlateAppearanceId ? byId(state.data.plateAppearances, g.activePlateAppearanceId) : null;
    return pa && !pa.endedAt ? pa : null;
  }

  function eventsForPa(paId) {
    return state.data.pitchEvents.filter((event) => event.plateAppearanceId === paId).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  function ensurePa() {
    const g = game();
    const b = batter();
    const p = pitcher();
    const open = activePa();
    if (open && open.batterId === b.id && open.pitcherId === p.id) return open;
    const pa = { id: id("pa"), gameId: g.id, batterId: b.id, pitcherId: p.id, startedAt: now(), endedAt: null, terminalResultId: null };
    state.data.plateAppearances.push(pa);
    g.activePlateAppearanceId = pa.id;
    return pa;
  }

  function selectPitch(pitchId) {
    const p = pitch(pitchId);
    if (!p || !state.ready || state.locked) return;
    if (p.requiresZone === false) {
      callPitch(p.id, null);
      return;
    }
    state.selectedPitchId = p.id;
    render();
  }

  function callPitch(pitchId, zoneId) {
    const p = pitch(pitchId);
    if (!p || !state.ready || state.locked || (p.requiresZone !== false && !zone(zoneId))) return;
    const call = { key: audioKeyForPitch(p, zoneId), path: audioPathForPitch(p, zoneId), label: p.requiresZone === false ? p.label : `${p.label} ${zone(zoneId).label}` };
    playCall(call, () => {
      const g = game();
      const b = batter();
      const pa = ensurePa();
      const event = {
        id: id("event"),
        gameId: g.id,
        timestamp: now(),
        pitcherId: pitcher().id,
        batterId: b.id,
        plateAppearanceId: pa.id,
        pitchId: p.id,
        zoneId: zoneId || null,
        resultId: null
      };
      state.data.pitchEvents.push(event);
      state.pendingEventId = event.id;
      state.selectedPitchId = null;
      save();
    });
  }

  function recordResult(resultId) {
    const r = result(resultId);
    const event = pendingEvent();
    if (!r || !event) return;
    event.resultId = r.id;
    state.pendingEventId = null;
    if (r.terminal) {
      const pa = byId(state.data.plateAppearances, event.plateAppearanceId);
      if (pa) {
        pa.endedAt = now();
        pa.terminalResultId = r.id;
      }
      const g = game();
      g.activePlateAppearanceId = null;
      advanceBatter(1, false);
    }
    save();
    render();
  }

  function advanceBatter(delta, shouldRender = true) {
    const g = game();
    g.activeBatterSlot = ((g.activeBatterSlot - 1 + delta + 9) % 9) + 1;
    g.activePlateAppearanceId = null;
    state.pendingEventId = null;
    save();
    if (shouldRender) render();
  }

  function updateLineup(slot, field, value) {
    const item = game().lineup.find((b) => b.slot === slot);
    if (!item) return;
    item[field] = clean(value);
    save();
    renderContext();
  }

  function renderContext() {
    els.callOpponent.textContent = game().opponentName || "Opponent not set";
    els.callBatter.textContent = batterLabel();
    els.batterTitle.textContent = `Vs ${batterLabel()}`;
  }

  function updateOpponent() {
    game().opponentName = clean(els.opponent.value);
    save();
    renderContext();
    renderStats();
  }

  function startGame() {
    const g = makeGame(window.prompt("Opponent name", "") || "");
    state.data.games.push(g);
    state.data.currentGameId = g.id;
    state.pendingEventId = null;
    state.selectedPitchId = null;
    save();
    render();
  }

  function selectGame() {
    if (byId(state.data.games, els.gameSelect.value)) {
      state.data.currentGameId = els.gameSelect.value;
      state.pendingEventId = null;
      state.selectedPitchId = null;
      save();
      render();
    }
  }

  function addPitcher() {
    const name = clean(window.prompt("Pitcher name", `Pitcher ${state.data.pitchers.length + 1}`));
    if (!name) return;
    const item = { id: id("pitcher"), name, createdAt: now() };
    state.data.pitchers.push(item);
    state.data.activePitcherId = item.id;
    game().activePlateAppearanceId = null;
    state.pendingEventId = null;
    save();
    render();
  }

  function renamePitcher() {
    const item = pitcher();
    const name = clean(window.prompt("Pitcher name", item.name));
    if (!name) return;
    item.name = name;
    save();
    render();
  }

  function deletePitcher() {
    const item = pitcher();
    if (!window.confirm(`Delete ${item.name} and all pitches logged for this pitcher?`)) return;
    const paIds = new Set(state.data.plateAppearances.filter((pa) => pa.pitcherId === item.id).map((pa) => pa.id));
    state.data.pitchers = state.data.pitchers.filter((p) => p.id !== item.id);
    state.data.pitchEvents = state.data.pitchEvents.filter((event) => event.pitcherId !== item.id);
    state.data.plateAppearances = state.data.plateAppearances.filter((pa) => pa.pitcherId !== item.id);
    state.data.games.forEach((g) => {
      if (paIds.has(g.activePlateAppearanceId)) g.activePlateAppearanceId = null;
    });
    if (!state.data.pitchers.length) state.data.pitchers.push({ id: id("pitcher"), name: "Pitcher 1", createdAt: now() });
    state.data.activePitcherId = state.data.pitchers[0].id;
    state.pendingEventId = null;
    save();
    render();
  }

  function selectPitcher() {
    if (!byId(state.data.pitchers, els.pitcherSelect.value)) return;
    state.data.activePitcherId = els.pitcherSelect.value;
    game().activePlateAppearanceId = null;
    state.pendingEventId = null;
    save();
    render();
  }

  function clearTracking() {
    if (!window.confirm("Clear all pitchers, games, batters, and pitch logs from this phone?")) return;
    state.data = makeInitial();
    state.pendingEventId = null;
    state.selectedPitchId = null;
    save();
    render();
  }

  function exportCsv() {
    const headers = ["gameId", "opponent", "gameStartedAt", "plateAppearanceId", "batterSlot", "batterName", "batterNumber", "timestamp", "pitcher", "pitcherId", "pitchId", "pitch", "zoneId", "zone", "resultId", "result", "terminalResult"];
    const rows = state.data.pitchEvents.map((event) => {
      const g = byId(state.data.games, event.gameId);
      const b = g?.lineup.find((item) => item.id === event.batterId);
      const p = byId(state.data.pitchers, event.pitcherId);
      const r = result(event.resultId);
      const pa = byId(state.data.plateAppearances, event.plateAppearanceId);
      const terminal = result(pa?.terminalResultId);
      return [event.gameId, g?.opponentName || "", g?.startedAt || "", event.plateAppearanceId || "", b?.slot || "", b?.name || "", b?.number || "", event.timestamp, p?.name || "", event.pitcherId, event.pitchId, pitch(event.pitchId)?.label || event.pitchId, event.zoneId || "", event.zoneId ? zone(event.zoneId)?.label || "" : "", event.resultId || "", r?.label || "", terminal?.label || ""];
    });
    const csv = [headers, ...rows].map((row) => row.map((value) => {
      const text = value == null ? "" : String(value);
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
    }).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `pitch-caller-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function armAudio() {
    els.arm.disabled = true;
    setStatus("Loading", "status-loading");
    allCalls().forEach((call) => {
      if (state.audio.has(call.key)) return;
      const audio = new Audio(call.path);
      audio.preload = "auto";
      audio.playsInline = true;
      audio.load();
      state.audio.set(call.key, audio);
    });
    state.ready = true;
    state.locked = false;
    setStatus("Ready", "status-ready");
    render();
  }

  async function playCall(call, onStart) {
    if (!state.ready || state.locked) return;
    const audio = state.audio.get(call.key) || new Audio(call.path);
    state.audio.set(call.key, audio);
    state.lastCall = call;
    if (typeof onStart === "function") onStart();
    try {
      audio.pause();
      audio.currentTime = 0;
      await audio.play();
      setStatus("Playing", "status-ready");
      setTimeout(() => !state.locked && setStatus("Ready", "status-ready"), Math.max(900, Number.isFinite(audio.duration) ? audio.duration * 1000 : 900));
    } catch (error) {
      setStatus("Ready", "status-ready");
    }
    render();
  }

  function playSpecial(callId) {
    const call = byId(config.specialCalls || [], callId);
    if (!call) return;
    playCall({ key: `special:${call.id}`, path: `${config.audioBasePath}/${call.audioFile}`, label: call.label });
  }

  function replayLast() {
    if (state.lastCall) playCall(state.lastCall);
  }

  function toggleLock() {
    state.locked = !state.locked;
    setStatus(state.locked ? "Locked" : "Ready", state.locked ? "status-danger" : "status-ready");
    render();
  }

  function registerWorker() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
    navigator.serviceWorker.register("./sw.js").then(() => navigator.serviceWorker.ready).catch(() => {
      els.cacheStatus.textContent = "Cache unavailable";
    });
  }

  els.arm.addEventListener("click", armAudio);
  els.test.addEventListener("click", () => {
    const p = pitch(config.testCall.pitchId);
    playCall({ key: audioKeyForPitch(p, config.testCall.zoneId), path: audioPathForPitch(p, config.testCall.zoneId), label: `${p.label} ${zone(config.testCall.zoneId).label}` });
  });
  els.replay.addEventListener("click", replayLast);
  els.lock.addEventListener("click", toggleLock);
  els.clear.addEventListener("click", () => { state.selectedPitchId = null; render(); });
  els.tabs.forEach((button) => button.addEventListener("click", () => { state.tab = button.dataset.tab; render(); }));
  els.prevBatter.addEventListener("click", () => advanceBatter(-1));
  els.nextBatter.addEventListener("click", () => advanceBatter(1));
  els.batterPrev.addEventListener("click", () => advanceBatter(-1));
  els.batterNext.addEventListener("click", () => advanceBatter(1));
  els.opponent.addEventListener("input", updateOpponent);
  els.gameSelect.addEventListener("change", selectGame);
  els.newGame.addEventListener("click", startGame);
  els.pitcherSelect.addEventListener("change", selectPitcher);
  els.addPitcher.addEventListener("click", addPitcher);
  els.renamePitcher.addEventListener("click", renamePitcher);
  els.deletePitcher.addEventListener("click", deletePitcher);
  els.clearData.addEventListener("click", clearTracking);
  els.exportCsv.addEventListener("click", exportCsv);
  els.statsCurrent.addEventListener("click", () => { state.statsScope = "game"; renderStats(); });
  els.statsCumulative.addEventListener("click", () => { state.statsScope = "cumulative"; renderStats(); });

  save();
  setStatus("Locked", "status-idle");
  render();
  registerWorker();
})();
