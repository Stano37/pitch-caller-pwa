const path = require("path");
const fs = require("fs");
const http = require("http");
const { chromium } = require("playwright");

let url = process.env.PITCH_CALLER_URL || "";
const outDir = path.resolve(__dirname);
const appRoot = path.resolve(__dirname, "..");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".m4a": "audio/mp4",
  ".png": "image/png"
};

function startStaticServer() {
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    const decodedPath = decodeURIComponent(requestUrl.pathname);
    const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
    const filePath = path.resolve(appRoot, relativePath);

    if (!filePath.startsWith(appRoot)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      response.writeHead(200, {
        "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      response.end(data);
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}/`
      });
    });
  });
}

async function verifyViewport(browser, name, viewport, isMobile = false) {
  const context = await browser.newContext({
    viewport,
    isMobile,
    hasTouch: isMobile,
    deviceScaleFactor: isMobile ? 3 : 1,
    acceptDownloads: true
  });
  const page = await context.newPage();
  const consoleErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("#arm-audio");

  const version = await page.locator("#version-label").textContent();
  if (!version.includes("2026.06.07-v5.1")) {
    throw new Error(`${name}: expected visible v5 version, saw ${version}`);
  }

  const audioLoads = await page.evaluate(async () => {
    const paths = [
      "audio/pitchout.m4a",
      "audio/mound-visit.m4a",
      "audio/step-off.m4a",
      "audio/first-third-chest.m4a"
    ];

    return Promise.all(paths.map((src) => new Promise((resolve) => {
      const audio = new Audio(src);
      const timeout = window.setTimeout(() => {
        cleanup();
        resolve({ src, ok: false, reason: "timeout" });
      }, 5000);
      const cleanup = () => {
        window.clearTimeout(timeout);
        audio.removeEventListener("loadedmetadata", loaded);
        audio.removeEventListener("error", failed);
      };
      const loaded = () => {
        cleanup();
        resolve({ src, ok: Number.isFinite(audio.duration) && audio.duration > 0, duration: audio.duration });
      };
      const failed = () => {
        cleanup();
        resolve({ src, ok: false, reason: audio.error?.message || audio.error?.code || "error" });
      };

      audio.preload = "metadata";
      audio.addEventListener("loadedmetadata", loaded);
      audio.addEventListener("error", failed);
      audio.load();
    })));
  });

  const failedAudio = audioLoads.filter((clip) => !clip.ok);
  if (failedAudio.length) {
    throw new Error(`${name}: expected v5.1 audio clips to load, saw ${JSON.stringify(failedAudio)}`);
  }

  await openTab(page, "data");
  page.once("dialog", (dialog) => dialog.accept("Tigers"));
  await page.locator("#new-game").click();
  await page.waitForFunction(() => document.querySelector("#opponent-name")?.value === "Tigers");

  await page.locator("[data-batter-name-slot='1']").fill("Leadoff");
  await page.locator("[data-batter-number-slot='1']").fill("12");
  await page.locator("[data-batter-name-slot='2']").fill("Two Hitter");

  page.once("dialog", (dialog) => dialog.accept("Ace"));
  await page.locator("#add-pitcher").click();
  await page.waitForFunction(() => document.querySelector("#pitcher-select")?.selectedOptions[0]?.textContent === "Ace");

  await openTab(page, "call");
  await page.locator("#arm-audio").click();
  await page.waitForFunction(() => {
    const status = document.querySelector("#audio-status")?.textContent;
    return status === "Ready" || status === "Audio error" || status === "No audio";
  }, null, { timeout: 15000 });

  const audioStatus = await page.locator("#audio-status").textContent();
  if (audioStatus !== "Ready") {
    throw new Error(`${name}: expected audio Ready, saw ${audioStatus}`);
  }

  await page.locator("[data-pitch-id='fastball']").click();
  await page.locator("[data-zone-id='outside']").click();
  await page.waitForFunction(() => document.querySelector("#pending-result-label")?.textContent.includes("Fastball Outside"));
  await page.locator("[data-result-id='swinging_strike']").click();
  await page.waitForFunction(() => document.querySelector("#pending-result-label")?.textContent === "No pitch pending");

  let tracker = await readTracker(page);
  if (tracker.pitchEvents.length !== 1 || tracker.pitchEvents[0].resultId !== "swinging_strike") {
    throw new Error(`${name}: first pitch was not logged as Swinging Strike`);
  }

  await openTab(page, "batter");
  const currentSequence = await page.locator("#current-sequence").textContent();
  if (!currentSequence.includes("Fastball Outside (SS)")) {
    throw new Error(`${name}: current batter sequence did not show first pitch`);
  }

  await openTab(page, "call");
  await page.locator("[data-pitch-id='pitchout']").click();
  await page.waitForFunction(() => document.querySelector("#pending-result-label")?.textContent.includes("Pitch Out"));
  await page.locator("[data-result-id='ground_out']").click();
  await page.waitForFunction(() => document.querySelector("#call-batter")?.textContent.includes("2. Two Hitter"));

  tracker = await readTracker(page);
  if (tracker.pitchEvents.length !== 2 || tracker.pitchEvents[1].pitchId !== "pitchout" || tracker.pitchEvents[1].zoneId !== null) {
    throw new Error(`${name}: Pitch Out did not log as a no-zone pitch`);
  }

  const beforeSpecial = tracker.pitchEvents.length;
  await page.locator("[data-special-id='mound-visit']").click();
  await page.waitForTimeout(250);
  tracker = await readTracker(page);
  if (tracker.pitchEvents.length !== beforeSpecial) {
    throw new Error(`${name}: special call was logged as a pitch`);
  }

  await openTab(page, "batter");
  await page.locator("#batter-prev").click();
  await page.waitForFunction(() => document.querySelector("#batter-title")?.textContent.includes("Leadoff"));
  const previousSequence = await page.locator("#previous-sequences").textContent();
  if (!previousSequence.includes("Fastball Outside (SS)") || !previousSequence.includes("Pitch Out (GO)")) {
    throw new Error(`${name}: previous batter sequence did not show completed PA`);
  }

  await openTab(page, "stats");
  const pitchCount = await statValue(page, "Pitches");
  const strikeRate = await statValue(page, "Strike");
  const positiveRate = await statValue(page, "Positive");
  if (pitchCount !== "2" || strikeRate !== "100%" || positiveRate !== "100%") {
    throw new Error(`${name}: expected stats 2 / 100% / 100%, saw ${pitchCount} / ${strikeRate} / ${positiveRate}`);
  }

  const pitchOutStats = await page.locator(".pitch-stat-row", { hasText: "Pitch Out" }).textContent();
  if (!pitchOutStats.includes("GB 100%")) {
    throw new Error(`${name}: Pitch Out row did not show GB 100%`);
  }

  await openTab(page, "data");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-csv").click();
  const download = await downloadPromise;
  const csv = fs.readFileSync(await download.path(), "utf8");
  const requiredColumns = ["opponent", "plateAppearanceId", "batterSlot", "batterName", "pitchId", "zoneId", "resultId", "terminalResult"];
  const header = csv.split(/\r?\n/)[0].split(",");
  for (const column of requiredColumns) {
    if (!header.includes(column)) {
      throw new Error(`${name}: CSV export missing ${column}`);
    }
  }

  if (!csv.includes("Tigers") || !csv.includes("Leadoff") || !csv.includes("pitchout") || !csv.includes("Ground Out")) {
    throw new Error(`${name}: CSV export missing v5 game/batter/pitch data`);
  }

  page.once("dialog", (dialog) => dialog.accept("Temp"));
  await page.locator("#add-pitcher").click();
  await page.waitForFunction(() => document.querySelector("#pitcher-select")?.selectedOptions[0]?.textContent === "Temp");
  await openTab(page, "call");
  await page.locator("[data-pitch-id='changeup']").click();
  await page.locator("[data-zone-id='low']").click();
  await page.locator("[data-result-id='ball']").click();
  await page.waitForFunction(() => JSON.parse(window.localStorage.getItem("pitch-caller-v5")).pitchEvents.length === 3);

  await openTab(page, "data");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#delete-pitcher").click();
  await page.waitForFunction(() => {
    const tracker = JSON.parse(window.localStorage.getItem("pitch-caller-v5"));
    return tracker.pitchEvents.length === 2 && tracker.pitchers.every((pitcher) => pitcher.name !== "Temp");
  });

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#clear-data").click();
  await page.waitForFunction(() => {
    const tracker = JSON.parse(window.localStorage.getItem("pitch-caller-v5"));
    return tracker.pitchEvents.length === 0 && tracker.plateAppearances.length === 0 && tracker.pitchers.length === 1;
  });

  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    y: document.documentElement.scrollHeight > document.documentElement.clientHeight
  }));

  await page.screenshot({
    path: path.join(outDir, `${name}.png`),
    fullPage: true
  });

  await context.close();

  return {
    name,
    viewport,
    overflow,
    consoleErrors
  };
}

async function openTab(page, tabName) {
  await page.locator(`[data-tab='${tabName}']`).click();
  await page.waitForFunction((name) => {
    const panel = document.querySelector(`[data-panel='${name}']`);
    return panel && !panel.hidden;
  }, tabName);
}

async function readTracker(page) {
  return page.evaluate(() => JSON.parse(window.localStorage.getItem("pitch-caller-v5")));
}

async function statValue(page, label) {
  return page.evaluate((statLabel) => {
    const cards = Array.from(document.querySelectorAll(".stat-card"));
    const card = cards.find((item) => item.querySelector("span")?.textContent === statLabel);
    return card?.querySelector("strong")?.textContent || "";
  }, label);
}

(async () => {
  const hosted = url ? null : await startStaticServer();
  if (hosted) {
    url = hosted.url;
  }

  const launchOptions = { headless: true };
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  }

  const browser = await chromium.launch(launchOptions);
  try {
    const results = [];
    results.push(await verifyViewport(browser, "desktop", { width: 1024, height: 768 }));
    results.push(await verifyViewport(browser, "mobile", { width: 390, height: 844 }, true));

    const seriousErrors = results.flatMap((result) => result.consoleErrors);
    if (seriousErrors.length) {
      throw new Error(`Console errors: ${seriousErrors.join(" | ")}`);
    }

    console.log(JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
    if (hosted) {
      hosted.server.close();
    }
  }
})();
