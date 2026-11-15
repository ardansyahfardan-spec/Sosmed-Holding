import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    const file = resolve(root, "." + pathname);
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404).end("Not found");
  }
});

const errors = [];
let browser;
try {
  await new Promise((resolveListen) => server.listen(4173, "127.0.0.1", resolveListen));
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("http://127.0.0.1:4173/assets/games/desa-terlarang/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.THREE?.REVISION === "159", { timeout: 30000 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("#game");
    if (!canvas || canvas.width < 1 || canvas.height < 1) return false;
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  }, { timeout: 30000 });

  await page.locator("#create-room").click();
  await page.locator("#character-select-screen").waitFor({ state: "visible", timeout: 10000 });

  if (errors.length) throw new Error("Standalone game runtime errors: " + errors.join(" | "));
  console.log("Standalone game test passed: Three.js r159 loaded, WebGL canvas initialized, and create-room opens character selection.");

  errors.length = 0;
  await page.route("https://**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith("https://cdn.jsdelivr.net/npm/three@0.159.0/") ||
        url.startsWith("https://cdnjs.cloudflare.com/ajax/libs/three.js/0.159.0/")) {
      await route.continue();
    } else {
      await route.abort();
    }
  });
  await page.goto("http://127.0.0.1:4173/index.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => typeof window.openDesaTerlarang === "function", { timeout: 30000 });
  await page.evaluate(() => { window.showPage("arena"); window.openDesaTerlarang(); });
  await page.locator("#arena-play-panel iframe").waitFor({ state: "attached", timeout: 10000 });

  const gameFrame = page.frames().find((frame) => frame.url().includes("/assets/games/desa-terlarang/index.html"));
  if (!gameFrame) throw new Error("Game Hub did not load the Desa Terlarang iframe.");
  await gameFrame.waitForFunction(() => window.THREE?.REVISION === "159", { timeout: 30000 });
  await gameFrame.waitForFunction(() => {
    const canvas = document.querySelector("#game");
    return !!canvas && canvas.width > 0 && canvas.height > 0 && !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  }, { timeout: 30000 });
  await gameFrame.locator("#create-room").click();
  await gameFrame.locator("#character-select-screen").waitFor({ state: "visible", timeout: 10000 });

  console.log("Game Hub integration test passed: launcher opens the iframe, Three.js r159 initializes WebGL, and the in-game character selection opens.");
} finally {
  if (browser) await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
