(function () {
  "use strict";

  const NativeAudio = window.Audio;
  const speechTextByFile = new Map([
    ["pitchout.m4a", "pitch out"],
    ["first-third-chest.m4a", "first and third chest"],
    ["mound-visit.m4a", "mound visit"],
    ["step-off.m4a", "step off"]
  ]);

  if (!NativeAudio || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
    return;
  }

  function fileNameFor(src) {
    try {
      const url = new URL(src || "", window.location.href);
      return url.pathname.split("/").pop();
    } catch {
      return "";
    }
  }

  function SpeechAudio(src) {
    this.src = src || "";
    this.currentTime = 0;
    this.duration = 1.25;
    this.preload = "auto";
    this.playsInline = true;
    this.readyState = 1;
    this._listeners = new Map();
    this._text = speechTextByFile.get(fileNameFor(src));
  }

  SpeechAudio.prototype.addEventListener = function (type, listener) {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type).add(listener);
  };

  SpeechAudio.prototype.removeEventListener = function (type, listener) {
    this._listeners.get(type)?.delete(listener);
  };

  SpeechAudio.prototype._emit = function (type) {
    for (const listener of this._listeners.get(type) || []) {
      listener.call(this, { type, target: this });
    }
  };

  SpeechAudio.prototype.load = function () {
    window.setTimeout(() => this._emit("loadedmetadata"), 0);
  };

  SpeechAudio.prototype.pause = function () {
    window.speechSynthesis.cancel();
  };

  SpeechAudio.prototype.play = function () {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(this._text);
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        this._emit("ended");
        resolve();
      };

      utterance.rate = 1;
      utterance.volume = 1;
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
      window.setTimeout(finish, 2200);
    });
  };

  window.Audio = function Audio(src) {
    return speechTextByFile.has(fileNameFor(src)) ? new SpeechAudio(src) : new NativeAudio(src);
  };
})();
