importScripts("./config.js");

const config = self.PITCH_CALLER_CONFIG;
const SERVICE_WORKER_BUILD = "2026.06.07-v5.1";
const CACHE_NAME = `pitch-caller-${config.version}-${SERVICE_WORKER_BUILD}`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./config.js",
  "./audio-fix.js",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

function audioPath(pitchId, zoneId) {
  return `./${config.audioBasePath}/${pitchId}-${zoneId}.${config.audioExtension}`;
}

function callAudioPath(call) {
  return `./${config.audioBasePath}/${call.audioFile}`;
}

const PITCH_AUDIO_ASSETS = config.pitches.flatMap((pitch) => {
  if (pitch.requiresZone === false) {
    return [callAudioPath(pitch)];
  }

  return config.zones.map((zone) => audioPath(pitch.id, zone.id));
});

const SPECIAL_AUDIO_ASSETS = (config.specialCalls || []).map(callAudioPath);
const AUDIO_ASSETS = [...PITCH_AUDIO_ASSETS, ...SPECIAL_AUDIO_ASSETS];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll([...APP_SHELL, ...AUDIO_ASSETS]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("pitch-caller-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request).catch(() => {
        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }
        throw new Error("Offline asset unavailable");
      });
    })
  );
});
