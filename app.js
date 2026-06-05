(function () {
  "use strict";

  const config = globalThis.PITCH_CALLER_CONFIG;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
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
    wakeLock: null
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
    selectedPitch: document.getElementById("selected-pitch"),
    lastCallText: document.getElementById("last-call-text")
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

  function callLabel(pitchId, zoneId) {
    return `${labelFor(config.pitches, pitchId)} ${labelFor(config.zones, zoneId)}`;
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
      state.lastCall = { pitchId, zoneId };
      state.selectedPitchId = null;
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
      state.lastCall = { pitchId, zoneId };
      state.selectedPitchId = null;
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

  renderOptions();
  renderState();
  registerServiceWorker();
})();
