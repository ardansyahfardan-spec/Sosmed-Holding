import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync("index.html", "utf8");
const serviceWorker = readFileSync("sw.js", "utf8");

const gameGridStart = html.indexOf('<div id="arena-game-grid"');
const gameGridEnd = gameGridStart >= 0 ? html.indexOf("</div>", gameGridStart) : -1;
const gameGrid = gameGridStart >= 0 && gameGridEnd > gameGridStart ? html.slice(gameGridStart, gameGridEnd + 6) : "";
const gameHubChecks = [
  ["Desa Terlarang card opens the standalone game", gameGrid.includes('onclick="openDesaTerlarang()"') && gameGrid.includes('data-mode="desa_terlarang"')],
  ["Malam Terlarang card opens the Malam game", gameGrid.includes('onclick="openMalamTerlarang()"') && gameGrid.includes('data-mode="malam_terlarang"')],
  ["Desa Terlarang launcher uses the project-relative game path", html.includes('src="./assets/games/desa-terlarang/index.html"')],
  ["Desa Terlarang launcher provides a return action", html.includes('onclick="closeArenaGame()"') && html.includes("window.openDesaTerlarang=function()")],
  ["Malam Terlarang opens the game panel and renders its home screen", html.includes("window.openMalamTerlarang=function(){") && html.includes("arenaCurrent='malam_terlarang';showArenaGamePage();") && html.includes("malamHome();")],
  ["closing a game restores the Game Hub", html.includes("window.closeArenaGame=function(){") && html.includes("l.classList.remove('hidden')")],
];

const gameHubFailures = gameHubChecks.filter(([, passed]) => !passed).map(([name]) => name);
if (gameHubFailures.length) {
  console.error("Game Hub checks failed:\\n" + gameHubFailures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Passed " + gameHubChecks.length + " Game Hub navigation checks.");
}

const securityChecks = [
  ["CSP blocks object embedding", html.includes("object-src 'none'")],
  ["CSP restricts base URLs", html.includes("base-uri 'self'")],
  ["CSP restricts form destinations", html.includes("form-action 'self'")],
  ["image URL allowlist helper exists", html.includes("function safeImageSrc") && html.includes("url.protocol==='https:'")],
  ["external HTTPS URL helper is used for LORE references", html.includes("function safeExternalUrl") && html.includes("safeExternalUrl(source.url)")],
  ["push links are restricted to the app origin", serviceWorker.includes("target.origin !== self.location.origin")],
  ["Supabase JS CDN is version-pinned", html.includes("@supabase/supabase-js@2.119.0") && !html.includes("@supabase/supabase-js@2/dist/")],
  ["Chart.js CDN is version-pinned", html.includes("chart.js@4.6.1")],
  ["tus client CDN is version-pinned", html.includes("tus-js-client@4.3.1")],
  ["segment logos have file type and size limits", html.includes("logoFile.size>5*1024*1024")],
  ["dynamic chat forms constrain field lengths", html.includes("maxlength=\"20000\"") && html.includes("maxlength=\"50000\"") && html.includes("maxlength=\"12000\"")],
  ["group and DM composers have length limits", html.includes('id="chat-input" type="text" maxlength="4000"') && html.includes('id="dm-input" maxlength="4000"')],
  ["app_state writes use the patch RPC", html.includes("rpc('ghoustory_patch_app_state'")],
  ["DM inbox uses a bounded RPC", html.includes("ghoustory_dm_inbox")],
  ["DM conversation lookup uses the optimized RPC", html.includes("ghoustory_dm_find_conversation")],
  ["legacy logo migration runs after cloud sync", html.includes("await migrateLegacySegmentLogos();")],
  ["shared saves are debounced", html.includes("}, 700);")],
  ["social ranking labels are escaped and bar colors are allowlisted", html.includes("escapeHtml(x.label)") && html.includes("const barColor=/^#[0-9a-f]{6}$/i.test(x.color||'')")],
  ["Malam investigation names and event text are escaped", html.includes("esc(s.investigation.name)") && html.includes("esc(String(s.lastEvent||''))")],
  ["Malam player avatars use the safe image URL helper", html.includes("safeImageSrc(p.avatar_url)") && html.includes("safeImageSrc(x.avatar_url)")],

];

const securityFailures = securityChecks.filter(([, passed]) => !passed).map(([name]) => name);
if (securityFailures.length) {
  console.error("Security checks failed:\\n" + securityFailures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Passed " + securityChecks.length + " static security checks.");
}
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(([, attributes, body]) => !/\bsrc\s*=/.test(attributes) && body.trim());

if (scripts.length === 0) {
  throw new Error("No inline JavaScript blocks were found in index.html.");
}

const failures = [];
for (let i = 0; i < scripts.length; i += 1) {
  try {
    new vm.Script(scripts[i][2], { filename: "index.html:inline-script-" + (i + 1) });
  } catch (error) {
    failures.push("Inline script " + (i + 1) + ": " + error.message);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Validated " + scripts.length + " inline JavaScript blocks in index.html.");
}


// Validate the standalone Desa Terlarang game as part of the application.
const desaGame = readFileSync("assets/games/desa-terlarang/index.html", "utf8");
if (!/<meta\s+name=["']viewport["']/i.test(desaGame)) {
  console.error("Desa Terlarang is missing its viewport meta tag.");
  process.exitCode = 1;
}

const portraitChecks = [
  ["portrait launch option is available", desaGame.includes('id="portrait-continue"') && desaGame.includes("MAIN DALAM MODE POTRET")],
  ["portrait launch dismisses the blocking orientation overlay", desaGame.includes("document.body.classList.add('portrait-play')") && desaGame.includes("overlay.style.display='none'")],
  ["portrait mode keeps touch controls usable", desaGame.includes("body.portrait-play #joystick") && desaGame.includes("body.portrait-play #action-controls")],
];
const portraitFailures = portraitChecks.filter(([, passed]) => !passed).map(([name]) => name);
if (portraitFailures.length) {
  console.error("Desa Terlarang portrait checks failed:\\n" + portraitFailures.join("\\n"));
  process.exitCode = 1;
} else {
  console.log("Passed " + portraitChecks.length + " Desa Terlarang portrait launch checks.");
}
const desaScripts = [...desaGame.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(([, attributes, body]) => !/\bsrc\s*=/.test(attributes) && body.trim());
for (let i = 0; i < desaScripts.length; i += 1) {
  try {
    new vm.Script(desaScripts[i][2], { filename: "Desa-Terlarang:inline-script-" + (i + 1) });
  } catch (error) {
    console.error("Desa Terlarang inline script " + (i + 1) + ": " + error.message);
    process.exitCode = 1;
  }
}
if (desaScripts.length) {
  console.log("Validated " + desaScripts.length + " inline JavaScript blocks in Desa Terlarang.");
} else {
  console.error("No inline JavaScript blocks found in Desa Terlarang.");
  process.exitCode = 1;
}
