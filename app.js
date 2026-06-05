(function () {
  "use strict";

  const config = globalThis.PITCH_CALLER_CONFIG;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const STORAGE_KEY = "pitch-caller-v3";
  const STORAGE_SCHEMA = 1;

  const state = {
    audioContext: null,
    buffers: new Map(),
    mediaElements: new Map(),
    currentSource: null,
    playbackMode: "web-audio",
    selectedPitchId: null,
    lastCall: null,
    ready: false,
    locked: false,
    wakeLock: null,
    data: loadTrackerState(),
    statsScope: "game",
    pendingEventId: null
  };

  const els = {
    audioStatus: document.getElementById("audio-status"),
    audioDetail: document.getElementById("audio-detail"),
    cacheStatus: document.getElementById("cache-status"),
    armAudio: document.getElementById("arm-audio"),
    testAudio: document.getElementById("test-audio"),
    replayLast: document.getElementById("replay-last"),
    lockToggle: document.getElementById("lock-toggle"),
    clearCall: document.getElementById("clear-call"),
    pitchOptions: document.getElementById("pitch-options"),
    zoneOptions: document.getElementById("zone-options"),
    resultOptions: document.getElementById("result-options"),
    selectedPitch: document.getElementById("selected-pitch"),
    lastCallText: document.getElementById("last-call-text"),
    pitcherSelect: document.getElementById("pitcher-select"),
    addPitcher: document.getElementById("add-pitcher"),
    renamePitcher: document.getElementById("rename-pitcher"),
    gameLabel: document.getElementById("game-label"),
    newGame: document.getElementById("new-game"),
    exportCsv: document.getElementById("export-csv"),
    pendingResultLabel: document.getElementById("pending-result-label"),
    statsCurrent: document.getElementById("stats-current"),
    statsCumulative: document.getElementById("stats-cumulative"),
    statsSummary: document.getElementById("stats-summary"),
    pitchStats: document.getElementById("pitch-stats"),
    undoLast: document.getElementById("undo-last"),
    recentLog: document.getElementById("recent-log")
  };

  function audioPath(pitchId, zoneId) {
    return `${config.audioBasePath}/${pitchId}-${zoneId}.${config.audioExtension}`;
  }

  function callKey(pitchId, zoneId) {
    return `${pitchId}:${zoneId}`;
  }

  function allCalls() {
    return config.pitches.flatMap((pitch) =>
      config.zones.map((zone) => ({
        pitch,
        zone,
        path: audioPath(pitch.id, zone.id),
        key: callKey(pitch.id, zone.id)
      }))
    );
  }

  function labelFor(collection, id) {
    return collection.find((item) => item.id === id)?.label || id;
  }

  function pitchFor(pitchId) {
    return config.pitches.find((pitch) => pitch.id === pitchId);
  }

  function resultFor(resultId) {
    return config.results.find((result) => result.id === resultId);
  }

  function callLabel(pitchId, zoneId) {
    return `${labelFor(config.pitches, pitchId)} ${labelFor(config.zones, zoneId)}`;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function createId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function createInitialTracker() {
    const createdAt = nowIso();
    const pitcherId = createId("pitcher");
    const gameId = createId("game");

    return {
      schemaVersion: STORAGE_SCHEMA,
      activePitcherId: pitcherId,
      currentGameId: gameId,
      pitchers: [
        {
          id: pitcherId,
          name: "Pitcher 1",
          createdAt
        }
      ],
      games: [
        {
          id: gameId,
          startedAt: createdAt
        }
      ],
      events: []
    };
  }

  function loadTrackerState() {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return createInitialTracker();
      }

      return normalizeTracker(JSON.parse(stored));
    } catch (error) {
      console.warn("Could not load pitch tracking data.", error);
      return createInitialTracker();
    }
  }

  function normalizeTracker(value) {
    const fallback = createInitialTracker();
    if (!value || typeof value !== "object") {
      return fallback;
    }

    const pitchers = Array.isArray(value.pitchers)
      ? value.pitchers
        .filter((pitcher) => pitcher && typeof pitcher.id === "string")
        .map((pitcher) => ({
          id: pitcher.id,
          name: normalizeName(pitcher.name) || "Pitcher",
          createdAt: typeof pitcher.createdAt === "string" ? pitcher.createdAt : nowIso()
        }))
      : [];

    const games = Array.isArray(value.games)
      ? value.games
        .filter((game) => game && typeof game.id === "string")
        .map((game) => ({
          id: game.id,
          startedAt: typeof game.startedAt === "string" ? game.startedAt : nowIso()
        }))
      : [];

    const events = Array.isArray(value.events)
      ? value.events
        .filter((event) =>
          event &&
          typeof event.id === "string" &&
          typeof event.gameId === "string" &&
          typeof event.timestamp === "string" &&
          typeof event.pitcherId === "string" &&
          typeof event.pitchId === "string" &&
          typeof event.zoneId === "string"
        )
        .map((event) => ({
          id: event.id,
          gameId: event.gameId,
          timestamp: event.timestamp,
          pitcherId: event.pitcherId,
          pitchId: event.pitchId,
          zoneId: event.zoneId,
          resultId: typeof event.resultId === "string" && resultFor(event.resultId) ? event.resultId : null
        }))
      : [];

    if (!pitchers.length) {
      pitchers.push(fallback.pitchers[0]);
    }

    if (!games.length) {
      games.push(fallback.games[0]);
    }

    const activePitcherId = pitchers.some((pitcher) => pitcher.id === value.activePitcherId)
      ? value.activePitcherId
      : pitchers[0].id;
    const currentGameId = games.some((game) => game.id === value.currentGameId)
      ? value.currentGameId
      : games[games.length - 1].id;

    return {
      schemaVersion: STORAGE_SCHEMA,
      activePitcherId,
      currentGameId,
      pitchers,
      games,
      events
    };
  }

  function saveTrackerState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
    } catch (error) {
      console.warn("Could not save pitch tracking data.", error);
    }
  }

  function normalizeName(name) {
    return String(name || "").trim().replace(/\s+/g, " ");
  }

  function activePitcher() {
    return state.data.pitchers.find((pitcher) => pitcher.id === state.data.activePitcherId) || state.data.pitchers[0];
  }

  function currentGame() {
    return state.data.games.find((game) => game.id === state.data.currentGameId) || state.data.games[0];
  }

  function setAudioStatus(text, mode) {
    els.audioStatus.textContent = text;
    els.audioStatus.className = `status-pill ${mode || "status-idle"}`;
  }

  function setCacheStatus(text) {
    els.cacheStatus.textContent = text;
  }

  function setAudioDetail(text, mode) {
    if (!text) {
      els.audioDetail.hidden = true;
      els.audioDetail.textContent = "";
      els.audioDetail.className = "audio-detail";
      return;
    }

    els.audioDetail.hidden = false;
    els.audioDetail.textContent = text;
    els.audioDetail.className = `audio-detail ${mode || ""}`.trim();
  }

  function renderOptions() {
    els.pitchOptions.innerHTML = "";
    els.zoneOptions.innerHTML = "";
    els.resultOptions.innerHTML = "";

    for (const pitch of config.pitches) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option-button pitch-button";
      button.textContent = pitch.label;
      button.dataset.pitchId = pitch.id;
      button.setAttribute("aria-pressed", String(state.selectedPitchId === pitch.id));
      button.addEventListener("click", () => selectPitch(pitch.id));
      els.pitchOptions.appendChild(button);
    }

    for (const zone of config.zones) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `option-button zone-button zone-${zone.id}`;
      button.textContent = zone.label;
      button.dataset.zoneId = zone.id;
      button.disabled = !state.ready || state.locked || !state.selectedPitchId;
      button.addEventListener("click", () => callZone(zone.id));
      els.zoneOptions.appendChild(button);
    }

    for (const result of config.results) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "result-button";
      button.textContent = result.label;
      button.dataset.resultId = result.id;
      button.disabled = !state.pendingEventId;
      button.addEventListener("click", () => recordResult(result.id));
      els.resultOptions.appendChild(button);
    }
  }

  function renderState() {
    const selectedLabel = state.selectedPitchId
      ? labelFor(config.pitches, state.selectedPitchId)
      : "No pitch";

    els.selectedPitch.textContent = selectedLabel;
    els.testAudio.disabled = !state.ready || state.locked;
    els.replayLast.disabled = !state.ready || state.locked || !state.lastCall;
    els.lockToggle.disabled = !state.ready;
    els.lockToggle.setAttribute("aria-pressed", String(state.locked));
    els.lockToggle.querySelector("span:last-child").textContent = state.locked ? "Unlock" : "Mute/Lock";
    els.clearCall.disabled = !state.selectedPitchId && !state.lastCall;

    if (state.lastCall) {
      els.lastCallText.textContent = callLabel(state.lastCall.pitchId, state.lastCall.zoneId);
    } else {
      els.lastCallText.textContent = "None";
    }

    for (const button of els.pitchOptions.querySelectorAll(".pitch-button")) {
      const isSelected = button.dataset.pitchId === state.selectedPitchId;
      button.setAttribute("aria-pressed", String(isSelected));
    }

    for (const button of els.zoneOptions.querySelectorAll(".zone-button")) {
      button.disabled = !state.ready || state.locked || !state.selectedPitchId;
    }

    renderTrackingState();
  }

  function renderTrackingState() {
    renderPitcherSelect();
    renderGameState();
    renderResultState();
    renderStats();
    renderRecentLog();
  }

  function renderPitcherSelect() {
    const selectedId = state.data.activePitcherId;
    els.pitcherSelect.innerHTML = "";

    for (const pitcher of state.data.pitchers) {
      const option = document.createElement("option");
      option.value = pitcher.id;
      option.textContent = pitcher.name;
      els.pitcherSelect.appendChild(option);
    }

    els.pitcherSelect.value = selectedId;
    els.renamePitcher.disabled = !activePitcher();
  }

  function renderGameState() {
    const game = currentGame();
    els.gameLabel.textContent = game ? `Game ${formatDateTime(game.startedAt)}` : "Game pending";
    els.exportCsv.disabled = state.data.events.length === 0;
    els.undoLast.disabled = !latestCurrentPitcherEvent();

    const isGameScope = state.statsScope === "game";
    els.statsCurrent.setAttribute("aria-pressed", String(isGameScope));
    els.statsCumulative.setAttribute("aria-pressed", String(!isGameScope));
  }

  function renderResultState() {
    const pendingEvent = pendingEventForResult();
    els.pendingResultLabel.textContent = pendingEvent
      ? `Log result: ${callLabel(pendingEvent.pitchId, pendingEvent.zoneId)}`
      : "No pitch pending";

    for (const button of els.resultOptions.querySelectorAll(".result-button")) {
      button.disabled = !pendingEvent;
    }
  }

  function renderStats() {
    const events = scopedEvents();
    const total = events.length;
    const offSpeed = events.filter((event) => pitchFor(event.pitchId)?.category === "offSpeed").length;
    const completed = completedEvents(events);
    const strikes = completed.filter((event) => resultFor(event.resultId)?.type === "strike").length;
    const positives = completed.filter((event) => resultFor(event.resultId)?.positive).length;

    els.statsSummary.innerHTML = "";
    els.statsSummary.appendChild(createStatCard("Pitches", String(total)));
    els.statsSummary.appendChild(createStatCard("Off-speed", percent(offSpeed, total)));
    els.statsSummary.appendChild(createStatCard("Strike", percent(strikes, completed.length)));
    els.statsSummary.appendChild(createStatCard("Positive", percent(positives, completed.length)));

    els.pitchStats.innerHTML = "";
    for (const pitch of config.pitches) {
      els.pitchStats.appendChild(createPitchStatRow(pitch, events, total));
    }
  }

  function createStatCard(label, value) {
    const card = document.createElement("div");
    card.className = "stat-card";

    const labelEl = document.createElement("span");
    labelEl.textContent = label;

    const valueEl = document.createElement("strong");
    valueEl.textContent = value;

    card.appendChild(labelEl);
    card.appendChild(valueEl);
    return card;
  }

  function createPitchStatRow(pitch, allEvents, total) {
    const events = allEvents.filter((event) => event.pitchId === pitch.id);
    const completed = completedEvents(events);
    const strikes = completed.filter((event) => resultFor(event.resultId)?.type === "strike").length;
    const positives = completed.filter((event) => resultFor(event.resultId)?.positive).length;

    const row = document.createElement("article");
    row.className = "pitch-stat-row";

    const heading = document.createElement("div");
    heading.className = "pitch-stat-heading";

    const title = document.createElement("strong");
    title.textContent = pitch.label;

    const usage = document.createElement("span");
    usage.textContent = `${events.length} pitches | ${percent(events.length, total)} use`;

    heading.appendChild(title);
    heading.appendChild(usage);

    const metrics = document.createElement("div");
    metrics.className = "pitch-stat-metrics";
    metrics.textContent = `Strike ${percent(strikes, completed.length)} | Positive ${percent(positives, completed.length)}`;

    const breakdown = document.createElement("div");
    breakdown.className = "result-breakdown";

    let hasBreakdown = false;
    for (const result of config.results) {
      const count = completed.filter((event) => event.resultId === result.id).length;
      if (!count) {
        continue;
      }

      hasBreakdown = true;
      const chip = document.createElement("span");
      chip.textContent = `${result.shortLabel}: ${count}`;
      breakdown.appendChild(chip);
    }

    if (!hasBreakdown) {
      const empty = document.createElement("span");
      empty.textContent = "No results";
      breakdown.appendChild(empty);
    }

    row.appendChild(heading);
    row.appendChild(metrics);
    row.appendChild(breakdown);
    return row;
  }

  function renderRecentLog() {
    els.recentLog.innerHTML = "";

    const events = scopedEvents("game").slice().reverse().slice(0, 8);
    if (!events.length) {
      const empty = document.createElement("li");
      empty.className = "recent-empty";
      empty.textContent = "No pitches this game";
      els.recentLog.appendChild(empty);
      return;
    }

    for (const event of events) {
      const item = document.createElement("li");

      const main = document.createElement("span");
      main.className = "recent-main";
      main.textContent = callLabel(event.pitchId, event.zoneId);

      const meta = document.createElement("span");
      meta.className = "recent-meta";
      meta.textContent = `${resultLabel(event.resultId)} | ${formatTime(event.timestamp)}`;

      item.appendChild(main);
      item.appendChild(meta);
      els.recentLog.appendChild(item);
    }
  }

  function selectPitch(pitchId) {
    state.selectedPitchId = pitchId;
    renderState();
  }

  function clearCall() {
    state.selectedPitchId = null;
    state.lastCall = null;
    renderState();
  }

  function addPitcher() {
    const defaultName = `Pitcher ${state.data.pitchers.length + 1}`;
    const name = normalizeName(window.prompt("Pitcher name", defaultName));
    if (!name) {
      return;
    }

    const pitcher = {
      id: createId("pitcher"),
      name,
      createdAt: nowIso()
    };

    state.data.pitchers.push(pitcher);
    state.data.activePitcherId = pitcher.id;
    state.pendingEventId = latestPendingEventId();
    saveTrackerState();
    renderState();
  }

  function renamePitcher() {
    const pitcher = activePitcher();
    if (!pitcher) {
      return;
    }

    const name = normalizeName(window.prompt("Pitcher name", pitcher.name));
    if (!name) {
      return;
    }

    pitcher.name = name;
    saveTrackerState();
    renderState();
  }

  function selectActivePitcher() {
    state.data.activePitcherId = els.pitcherSelect.value;
    state.pendingEventId = latestPendingEventId();
    saveTrackerState();
    renderState();
  }

  function startNewGame() {
    const game = {
      id: createId("game"),
      startedAt: nowIso()
    };

    state.data.games.push(game);
    state.data.currentGameId = game.id;
    state.pendingEventId = null;
    state.selectedPitchId = null;
    state.lastCall = null;
    saveTrackerState();
    renderState();
  }

  function setStatsScope(scope) {
    state.statsScope = scope === "cumulative" ? "cumulative" : "game";
    renderState();
  }

  function logPitchEvent(pitchId, zoneId) {
    const pitcher = activePitcher();
    const game = currentGame();
    if (!pitcher || !game) {
      return;
    }

    const event = {
      id: createId("event"),
      gameId: game.id,
      timestamp: nowIso(),
      pitcherId: pitcher.id,
      pitchId,
      zoneId,
      resultId: null
    };

    state.data.events.push(event);
    state.pendingEventId = event.id;
    saveTrackerState();
  }

  function rememberCall(pitchId, zoneId) {
    state.lastCall = { pitchId, zoneId };
    state.selectedPitchId = null;
    logPitchEvent(pitchId, zoneId);
  }

  function recordResult(resultId) {
    const event = pendingEventForResult();
    if (!event || !resultFor(resultId)) {
      return;
    }

    event.resultId = resultId;
    state.pendingEventId = null;
    saveTrackerState();
    renderState();
  }

  function undoLastPitch() {
    const latest = latestCurrentPitcherEvent();
    if (!latest) {
      return;
    }

    state.data.events = state.data.events.filter((event) => event.id !== latest.id);
    if (state.pendingEventId === latest.id) {
      state.pendingEventId = null;
    }

    const previous = latestCurrentPitcherEvent();
    state.lastCall = previous ? { pitchId: previous.pitchId, zoneId: previous.zoneId } : null;
    state.pendingEventId = latestPendingEventId();
    saveTrackerState();
    renderState();
  }

  function exportCsv() {
    const headers = [
      "gameId",
      "gameStartedAt",
      "timestamp",
      "pitcher",
      "pitcherId",
      "pitchId",
      "pitch",
      "category",
      "zoneId",
      "zone",
      "resultId",
      "result"
    ];

    const rows = state.data.events.map((event) => {
      const pitcher = state.data.pitchers.find((item) => item.id === event.pitcherId);
      const game = state.data.games.find((item) => item.id === event.gameId);
      const pitch = pitchFor(event.pitchId);
      const result = resultFor(event.resultId);

      return [
        event.gameId,
        game?.startedAt || "",
        event.timestamp,
        pitcher?.name || "",
        event.pitcherId,
        event.pitchId,
        pitch?.label || event.pitchId,
        pitch?.category || "",
        event.zoneId,
        labelFor(config.zones, event.zoneId),
        event.resultId || "",
        result?.label || ""
      ];
    });

    const csv = [headers, ...rows].map((row) => row.map(csvValue).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pitch-caller-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
  }

  function csvValue(value) {
    const text = value == null ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
  }

  function scopedEvents(scope = state.statsScope) {
    const pitcher = activePitcher();
    if (!pitcher) {
      return [];
    }

    return state.data.events.filter((event) => {
      if (event.pitcherId !== pitcher.id) {
        return false;
      }

      return scope === "cumulative" || event.gameId === state.data.currentGameId;
    });
  }

  function completedEvents(events) {
    return events.filter((event) => resultFor(event.resultId));
  }

  function pendingEventForResult() {
    return state.data.events.find((event) => event.id === state.pendingEventId) || null;
  }

  function latestPendingEventId() {
    const latest = latestCurrentPitcherEvent();
    return latest && !latest.resultId ? latest.id : null;
  }

  function latestCurrentPitcherEvent() {
    const events = scopedEvents("game");
    return events.length ? events[events.length - 1] : null;
  }

  function percent(count, total) {
    if (!total) {
      return "0%";
    }

    return `${Math.round((count / total) * 100)}%`;
  }

  function resultLabel(resultId) {
    return resultFor(resultId)?.label || "No result";
  }

  function formatDateTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function formatTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    });
  }

  async function armAudio() {
    if (state.ready) {
      setAudioStatus(state.locked ? "Locked" : "Ready", state.locked ? "status-danger" : "status-ready");
      return;
    }

    if (!AudioContextClass && typeof Audio === "undefined") {
      setAudioStatus("No audio", "status-danger");
      setAudioDetail("This browser does not expose a usable audio playback API.", "error");
      return;
    }

    els.armAudio.disabled = true;
    setAudioStatus("Loading", "status-loading");
    setAudioDetail("");

    try {
      if (isFilePreview()) {
        await armMediaElementAudio("File preview mode: audio can play, but offline PWA caching only works from localhost or an HTTPS host.");
        return;
      }

      state.audioContext = state.audioContext || new AudioContextClass();
      await state.audioContext.resume();
      unlockAudioContext();
      await loadAudioBuffers();
      state.playbackMode = "web-audio";
      state.ready = true;
      state.locked = false;
      await requestWakeLock();
      setAudioStatus("Ready", "status-ready");
    } catch (error) {
      console.error(error);
      if (await tryMediaElementFallback(error)) {
        return;
      }

      els.armAudio.disabled = false;
      setAudioStatus("Audio error", "status-danger");
      setAudioDetail(describeArmError(error), "error");
    }

    renderState();
  }

  function isFilePreview() {
    return window.location.protocol === "file:";
  }

  async function armMediaElementAudio(detail) {
    await loadMediaElements();
    state.playbackMode = "media";
    state.ready = true;
    state.locked = false;
    setAudioStatus("Ready", "status-ready");
    setAudioDetail(detail);
    renderState();
  }

  async function tryMediaElementFallback(error) {
    if (typeof Audio === "undefined") {
      return false;
    }

    try {
      await armMediaElementAudio(`Using browser media playback because Web Audio preload failed: ${shortError(error)}`);
      return true;
    } catch (fallbackError) {
      console.error(fallbackError);
      setAudioDetail(`${describeArmError(error)} Fallback also failed: ${shortError(fallbackError)}`, "error");
      return false;
    }
  }

  function shortError(error) {
    return error?.message || String(error || "Unknown error");
  }

  function describeArmError(error) {
    const message = shortError(error);

    if (isFilePreview() || /failed to fetch|cors|origin 'null'|file:/i.test(message)) {
      return "The page appears to be opened as a local file, and the browser blocked local audio loading. Use the built-in file preview mode, or run it from localhost/HTTPS for the real PWA offline test.";
    }

    return message;
  }

  function unlockAudioContext() {
    const source = state.audioContext.createOscillator();
    const gain = state.audioContext.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(state.audioContext.destination);
    source.start(0);
    source.stop(state.audioContext.currentTime + 0.04);
  }

  async function loadAudioBuffers() {
    const calls = allCalls();
    await Promise.all(calls.map(async (call) => {
      if (state.buffers.has(call.key)) {
        return;
      }

      const response = await fetch(call.path, { cache: "force-cache" });
      if (!response.ok) {
        throw new Error(`Missing audio clip: ${call.path}`);
      }

      const bytes = await response.arrayBuffer();
      const buffer = await decodeAudioData(bytes);
      state.buffers.set(call.key, buffer);
    }));
  }

  async function loadMediaElements() {
    const calls = allCalls();
    await Promise.all(calls.map(loadMediaElement));
  }

  function loadMediaElement(call) {
    if (state.mediaElements.has(call.key)) {
      return Promise.resolve();
    }

    const audio = new Audio();
    audio.preload = "auto";
    audio.playsInline = true;
    audio.src = call.path;
    state.mediaElements.set(call.key, audio);

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve();
      };
      const fail = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(new Error(`Cannot load audio clip: ${call.path}`));
      };
      const cleanup = () => {
        window.clearTimeout(timeout);
        audio.removeEventListener("canplaythrough", finish);
        audio.removeEventListener("loadeddata", finish);
        audio.removeEventListener("error", fail);
      };
      const timeout = window.setTimeout(finish, 2500);

      audio.addEventListener("canplaythrough", finish);
      audio.addEventListener("loadeddata", finish);
      audio.addEventListener("error", fail);

      if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        finish();
      } else {
        audio.load();
      }
    });
  }

  function decodeAudioData(bytes) {
    return new Promise((resolve, reject) => {
      const result = state.audioContext.decodeAudioData(bytes.slice(0), resolve, reject);
      if (result && typeof result.then === "function") {
        result.then(resolve, reject);
      }
    });
  }

  async function callZone(zoneId) {
    if (!state.selectedPitchId) {
      return;
    }

    await playCall(state.selectedPitchId, zoneId, true);
  }

  async function playCall(pitchId, zoneId, remember) {
    if (!state.ready || state.locked) {
      return;
    }

    if (state.playbackMode === "media") {
      await playMediaCall(pitchId, zoneId, remember);
      return;
    }

    await state.audioContext.resume();

    const key = callKey(pitchId, zoneId);
    const buffer = state.buffers.get(key);
    if (!buffer) {
      setAudioStatus("Missing clip", "status-danger");
      return;
    }

    stopCurrentSource();

    const source = state.audioContext.createBufferSource();
    const gain = state.audioContext.createGain();
    gain.gain.value = 1;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(state.audioContext.destination);
    source.onended = () => {
      if (state.currentSource === source) {
        state.currentSource = null;
      }
    };

    state.currentSource = source;
    source.start(0);

    if (remember) {
      rememberCall(pitchId, zoneId);
    }

    setAudioStatus("Playing", "status-ready");
    window.setTimeout(() => {
      if (state.ready && !state.locked) {
        setAudioStatus("Ready", "status-ready");
      }
    }, Math.max(900, buffer.duration * 1000));

    renderState();
  }

  async function playMediaCall(pitchId, zoneId, remember) {
    const key = callKey(pitchId, zoneId);
    const audio = state.mediaElements.get(key);
    if (!audio) {
      setAudioStatus("Missing clip", "status-danger");
      setAudioDetail(`Missing audio clip: ${audioPath(pitchId, zoneId)}`, "error");
      return;
    }

    stopCurrentSource();
    audio.currentTime = 0;
    audio.onended = () => {
      if (state.currentSource === audio) {
        state.currentSource = null;
      }
    };

    state.currentSource = audio;
    await audio.play();

    if (remember) {
      rememberCall(pitchId, zoneId);
    }

    setAudioStatus("Playing", "status-ready");
    const duration = Number.isFinite(audio.duration) ? audio.duration * 1000 : 900;
    window.setTimeout(() => {
      if (state.ready && !state.locked) {
        setAudioStatus("Ready", "status-ready");
      }
    }, Math.max(900, duration));

    renderState();
  }

  function stopCurrentSource() {
    if (!state.currentSource) {
      return;
    }

    try {
      if (typeof state.currentSource.pause === "function") {
        state.currentSource.pause();
        state.currentSource.currentTime = 0;
        state.currentSource = null;
        return;
      }

      state.currentSource.stop(0);
    } catch {
      // The source may have already ended.
    }
    state.currentSource = null;
  }

  function replayLast() {
    if (!state.lastCall) {
      return;
    }

    playCall(state.lastCall.pitchId, state.lastCall.zoneId, false);
  }

  function toggleLock() {
    if (!state.ready) {
      return;
    }

    state.locked = !state.locked;
    stopCurrentSource();
    setAudioStatus(state.locked ? "Locked" : "Ready", state.locked ? "status-danger" : "status-ready");
    renderState();
  }

  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) {
      return;
    }

    try {
      state.wakeLock = await navigator.wakeLock.request("screen");
      state.wakeLock.addEventListener("release", () => {
        state.wakeLock = null;
      });
    } catch {
      state.wakeLock = null;
    }
  }

  function registerServiceWorker() {
    if (isFilePreview()) {
      setCacheStatus("Local preview");
      return;
    }

    if (!("serviceWorker" in navigator)) {
      setCacheStatus("Online only");
      return;
    }

    navigator.serviceWorker.register("./sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then(() => setCacheStatus("Offline ready"))
      .catch(() => setCacheStatus("Cache unavailable"));
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.ready && !state.wakeLock) {
      requestWakeLock();
    }
  });

  els.armAudio.addEventListener("click", armAudio);
  els.testAudio.addEventListener("click", () => {
    playCall(config.testCall.pitchId, config.testCall.zoneId, false);
  });
  els.replayLast.addEventListener("click", replayLast);
  els.lockToggle.addEventListener("click", toggleLock);
  els.clearCall.addEventListener("click", clearCall);
  els.pitcherSelect.addEventListener("change", selectActivePitcher);
  els.addPitcher.addEventListener("click", addPitcher);
  els.renamePitcher.addEventListener("click", renamePitcher);
  els.newGame.addEventListener("click", startNewGame);
  els.exportCsv.addEventListener("click", exportCsv);
  els.undoLast.addEventListener("click", undoLastPitch);
  els.statsCurrent.addEventListener("click", () => setStatsScope("game"));
  els.statsCumulative.addEventListener("click", () => setStatsScope("cumulative"));

  state.pendingEventId = latestPendingEventId();
  saveTrackerState();
  renderOptions();
  renderState();
  registerServiceWorker();
})();
