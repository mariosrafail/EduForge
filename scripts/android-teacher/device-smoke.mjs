import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const endpoint = process.env.ANDROID_WEBVIEW_DEVTOOLS_URL || "http://127.0.0.1:9222/json";
const runFile = promisify(execFile);
const targets = await fetch(endpoint).then((response) => response.json());
const target = targets.find((candidate) => candidate.type === "page" && candidate.url.startsWith("https://localhost"));
assert.ok(target?.webSocketDebuggerUrl, "No debuggable teacher Android WebView was found");

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
const networkUrls = [];
const consoleErrors = [];
let nextId = 1;

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
    return;
  }
  if (message.method === "Network.requestWillBeSent") {
    networkUrls.push(message.params.request.url);
  }
  if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
    consoleErrors.push(message.params.args.map((argument) => argument.value || argument.description || "").join(" "));
  }
  if (message.method === "Runtime.exceptionThrown") {
    consoleErrors.push(message.params.exceptionDetails.text || "Uncaught WebView exception");
  }
});

function command(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const response = await command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  }
  return response.result.value;
}

const scenario = String.raw`
(async () => {
  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const waitFor = async (predicate, label, timeout = 15000) => {
    const started = performance.now();
    while (!predicate()) {
      if (performance.now() - started > timeout) throw new Error("Timed out waiting for " + label);
      await sleep(50);
    }
    return Math.round(performance.now() - started);
  };
  const button = (label) => [...document.querySelectorAll("button")]
    .find((candidate) => candidate.textContent.replace(/\s+/g, " ").trim().includes(label));
  const click = async (label) => {
    const target = button(label);
    if (!target) throw new Error("Button not found: " + label);
    target.click();
    await sleep(75);
  };
  const openArticle = async (index) => {
    const articles = [...document.querySelectorAll(".teacher-offline-lessons article")];
    if (!articles[index]) throw new Error("Activity article not found: " + index);
    articles[index].querySelector("button").click();
    await waitFor(() => document.querySelector(".teacher-offline-presentation"), "activity presentation");
    if (document.querySelectorAll(".unit2-normalized-activity").length !== 1) {
      throw new Error("Expected exactly one active activity renderer");
    }
    await click("Back to book");
    await waitFor(() => document.querySelector(".teacher-offline-book"), "book after activity");
  };
  const openMediaActivity = async (unit, title, type) => {
    await click("Unit " + unit);
    await click("Contents / Exercises");
    const article = [...document.querySelectorAll(".teacher-offline-lessons article")]
      .find((candidate) => candidate.querySelector("strong")?.textContent.trim() === title);
    if (!article) throw new Error("Media activity not found: " + unit + " " + title);
    article.querySelector("button").click();
    await waitFor(() => document.querySelector(type), type + " element");
    const media = document.querySelector(type);
    await waitFor(() => media.readyState >= 1, type + " metadata", 30000);
    const source = new URL(media.currentSrc || media.src);
    if (source.origin !== location.origin || !source.pathname.startsWith("/assets/")) {
      throw new Error("Media did not resolve to a packaged local asset");
    }
    const before = media.currentTime;
    await media.play();
    await sleep(1200);
    const playedTo = media.currentTime;
    media.pause();
    if (!(playedTo > before)) throw new Error(type + " playback did not advance");
    const seekTarget = Math.min(2, Number.isFinite(media.duration) ? media.duration / 2 : 2);
    media.currentTime = seekTarget;
    await sleep(200);
    const seekedTo = media.currentTime;
    await click("Back to book");
    await waitFor(() => document.querySelector(".teacher-offline-book"), "book after media activity");
    return {
      unit,
      type,
      durationSeconds: Number(media.duration.toFixed(2)),
      playedSeconds: Number((playedTo - before).toFixed(2)),
      seekedToSeconds: Number(seekedTo.toFixed(2)),
    };
  };

  const timings = {};
  await waitFor(
    () => document.querySelector(".teacher-offline-library, .teacher-offline-book, .teacher-offline-presentation"),
    "initial teacher view",
    30000,
  );
  for (let attempts = 0; !document.querySelector(".teacher-offline-library") && attempts < 3; attempts += 1) {
    if (button("Back to book")) await click("Back to book");
    else if (button("Library")) await click("Library");
    else throw new Error("Could not return to the classroom library");
    await sleep(150);
  }
  if (!document.querySelector(".teacher-offline-library")) throw new Error("Classroom library did not open");
  timings.bookOpenMs = await (async () => {
    const started = performance.now();
    await click("Open Students Book");
    await waitFor(() => document.querySelector(".teacher-offline-book"), "book");
    return Math.round(performance.now() - started);
  })();

  let maximumMountedPages = 0;
  const pageSwitchTimes = [];
  for (let index = 0; index < 30; index += 1) {
    const unit = index % 2 + 1;
    await click("Unit " + unit);
    if (!document.querySelector(".teacher-offline-pages")) await click("Book pages");
    const pages = [...document.querySelectorAll(".teacher-offline-pages aside button")];
    const started = performance.now();
    pages[index % pages.length].click();
    await waitFor(() => {
      const image = document.querySelector(".teacher-offline-page-image img");
      return image?.complete && image.naturalWidth > 0;
    }, "page image");
    pageSwitchTimes.push(Math.round(performance.now() - started));
    maximumMountedPages = Math.max(maximumMountedPages, document.querySelectorAll(".teacher-offline-page-image img").length);
  }

  await click("Unit 1");
  await click("Contents / Exercises");
  const unit1Count = document.querySelectorAll(".teacher-offline-lessons article").length;
  for (let index = 0; index < 10; index += 1) await openArticle(index);
  await click("Unit 2");
  const unit2Count = document.querySelectorAll(".teacher-offline-lessons article").length;
  for (let index = 0; index < 10; index += 1) await openArticle(index);

  const media = [];
  media.push(await openMediaActivity(1, "Reading · Exercise 1", "video"));
  media.push(await openMediaActivity(1, "Reading · Exercise 2", "audio"));
  media.push(await openMediaActivity(2, "Reading · Exercise 1", "video"));
  media.push(await openMediaActivity(2, "Reading · Exercise 2", "audio"));

  const visibleControls = [...document.querySelectorAll("button, input, select, textarea")]
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
    });
  const smallestTouchTarget = visibleControls.reduce((smallest, element) => {
    const rect = element.getBoundingClientRect();
    return Math.min(smallest, rect.width, rect.height);
  }, Infinity);

  return {
    unit1Count,
    unit2Count,
    enabled: unit1Count + unit2Count,
    pageSwitches: pageSwitchTimes.length,
    pageSwitchAverageMs: Math.round(pageSwitchTimes.reduce((sum, value) => sum + value, 0) / pageSwitchTimes.length),
    pageSwitchMaximumMs: Math.max(...pageSwitchTimes),
    maximumMountedPages,
    activityOpenCloseCycles: 20,
    media,
    smallestVisibleTouchTargetPx: Math.round(smallestTouchTarget),
    timings,
    location: location.hash,
  };
})()
`;

try {
  await command("Runtime.enable");
  await command("Network.enable");
  const result = await evaluate(scenario);
  let lifecycle = { tested: false };
  if (process.env.ANDROID_ADB) {
    const mediaStarted = await evaluate(String.raw`
      (async () => {
        const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
        const click = (label) => [...document.querySelectorAll("button")]
          .find((candidate) => candidate.textContent.replace(/\s+/g, " ").trim().includes(label))?.click();
        click("Unit 2");
        click("Contents / Exercises");
        await sleep(100);
        const article = [...document.querySelectorAll(".teacher-offline-lessons article")]
          .find((candidate) => candidate.querySelector("strong")?.textContent.trim() === "Reading · Exercise 2");
        article.querySelector("button").click();
        for (let attempt = 0; attempt < 200 && !document.querySelector("audio"); attempt += 1) await sleep(50);
        const media = document.querySelector("audio");
        for (let attempt = 0; attempt < 600 && media.readyState < 1; attempt += 1) await sleep(50);
        await media.play();
        await sleep(500);
        return !media.paused;
      })()
    `);
    assert.equal(mediaStarted, true, "Lifecycle audio did not start");
    await runFile(process.env.ANDROID_ADB, ["shell", "input", "keyevent", "3"]);
    await new Promise((resolve) => setTimeout(resolve, 750));
    const pausedInBackground = await evaluate("document.querySelector('audio')?.paused === true");
    await runFile(process.env.ANDROID_ADB, [
      "shell", "am", "start", "-n", "com.eduforge.offlinebooks/.MainActivity",
    ]);
    await new Promise((resolve) => setTimeout(resolve, 750));
    const pausedAfterResume = await evaluate("document.querySelector('audio')?.paused === true");
    assert.equal(pausedInBackground, true, "Audio continued while the app was backgrounded");
    assert.equal(pausedAfterResume, true, "Audio resumed without an explicit user action");
    const restartedForLock = await evaluate(String.raw`
      (async () => {
        const media = document.querySelector("audio");
        await media.play();
        await new Promise((resolve) => setTimeout(resolve, 400));
        return !media.paused;
      })()
    `);
    assert.equal(restartedForLock, true, "Lock-screen audio did not start");
    await runFile(process.env.ANDROID_ADB, ["shell", "input", "keyevent", "26"]);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const pausedWhileLocked = await evaluate("document.querySelector('audio')?.paused === true");
    await runFile(process.env.ANDROID_ADB, ["shell", "input", "keyevent", "26"]);
    await runFile(process.env.ANDROID_ADB, ["shell", "input", "keyevent", "82"]);
    await runFile(process.env.ANDROID_ADB, [
      "shell", "am", "start", "-n", "com.eduforge.offlinebooks/.MainActivity",
    ]);
    await new Promise((resolve) => setTimeout(resolve, 750));
    const pausedAfterUnlock = await evaluate("document.querySelector('audio')?.paused === true");
    assert.equal(pausedWhileLocked, true, "Audio continued while the screen was locked");
    assert.equal(pausedAfterUnlock, true, "Audio resumed without an explicit action after unlock");
    lifecycle = {
      tested: true,
      pausedInBackground,
      pausedAfterResume,
      pausedWhileLocked,
      pausedAfterUnlock,
    };
  }
  assert.equal(result.unit1Count, 37);
  assert.equal(result.unit2Count, 40);
  assert.equal(result.enabled, 77);
  assert.equal(result.maximumMountedPages, 1);
  assert.ok(result.smallestVisibleTouchTargetPx >= 48, "A visible teacher control is smaller than 48px");
  const forbiddenRequests = networkUrls.filter((url) => (
    /^(?:https?|wss?):/i.test(url) && !url.startsWith("https://localhost")
  ));
  assert.deepEqual(forbiddenRequests, []);
  assert.deepEqual(consoleErrors, []);
  console.log(JSON.stringify({
    status: "passed",
    target: { title: target.title, url: target.url },
    ...result,
    observedRequests: networkUrls.length,
    externalRequests: forbiddenRequests.length,
    consoleErrors: consoleErrors.length,
    lifecycle,
  }, null, 2));
} finally {
  socket.close();
}
