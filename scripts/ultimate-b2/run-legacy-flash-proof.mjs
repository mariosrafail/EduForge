import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseURL = process.env.LEGACY_FLASH_PROOF_BASE_URL || "http://localhost:8888";
const email = process.env.LEGACY_FLASH_PROOF_EMAIL;
const password = process.env.LEGACY_FLASH_PROOF_PASSWORD;
const browserChannel = process.env.LEGACY_FLASH_BROWSER_CHANNEL || "msedge";
if (!email || !password) throw new Error("LEGACY_FLASH_PROOF_EMAIL and LEGACY_FLASH_PROOF_PASSWORD are required");

const outputDirectory = path.resolve("test-results/legacy-flash-proof");
fs.mkdirSync(outputDirectory, { recursive: true });
const browser = await chromium.launch({ channel: browserChannel, headless: true });
const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const consoleEvents = [];
const pageErrors = [];
const sourceRequests = [];

page.on("console", (message) => {
  if (["warning", "error"].includes(message.type()) || /ruffle|unsupported|avm|air/i.test(message.text())) {
    consoleEvents.push({ text: message.text(), type: message.type() });
  }
});
page.on("pageerror", (error) => pageErrors.push(String(error.stack || error.message || error)));
page.on("response", (response) => {
  const url = response.url();
  if (url.includes("__legacy-") || url.includes("legacy-flash-proof")) {
    sourceRequests.push({ status: response.status(), url: url.replace(/\/__legacy-ultimate-b2-source\/[^/]+\//, "/__legacy-ultimate-b2-source/[scoped-token]/") });
  }
});

const signIn = await context.request.post("/.netlify/functions/auth-signin", { data: { email, password } });
if (!signIn.ok()) throw new Error(`Sign-in failed (${signIn.status()}): ${await signIn.text()}`);
await page.goto("/#/dev/ultimate-b2-legacy-player", { waitUntil: "domcontentloaded" });
await page.getByTestId("legacy-flash-proof").waitFor({ timeout: 20_000 });
await page.waitForTimeout(Number(process.env.LEGACY_FLASH_OBSERVE_MS || 25_000));
await page.screenshot({ fullPage: true, path: path.join(outputDirectory, `${browserChannel}-runtime.png`) });

const status = await page.locator("text=Status:").locator("..").innerText().catch(() => "Status unavailable");
const diagnostics = await page.locator("text=Runtime diagnostics").locator("..").innerText().catch(() => "Diagnostics unavailable");
const player = await page.locator("ruffle-player").count();
const report = {
  browser: await browser.version(),
  consoleEvents,
  diagnostics,
  pageErrors,
  playerElements: player,
  sourceRequests,
  status,
};
fs.writeFileSync(path.join(outputDirectory, `${browserChannel}-runtime.json`), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
await browser.close();
