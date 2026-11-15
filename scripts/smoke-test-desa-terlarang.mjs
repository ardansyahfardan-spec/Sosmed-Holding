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
  await page.waitForFunction(() => window.THREE?.REVISION === "160", { timeout: 30000 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("#game");
    if (!canvas || canvas.width < 1 || canvas.height < 1) return false;
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  }, { timeout: 30000 });

  await page.locator("#create-room").click();
  await page.locator("#character-select-screen").waitFor({ state: "visible", timeout: 10000 });

  if (errors.length) throw new Error("Browser runtime errors: " + errors.join(" | "));
  console.log("Desa Terlarang browser smoke test passed: Three.js r160 loaded, WebGL canvas initialized, and create-room opens character selection.");
} finally {
  if (browser) await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
