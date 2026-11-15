import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync("index.html", "utf8");
const serviceWorker = readFileSync("sw.js", "utf8");

const securityChecks = [
  ["CSP blocks object embedding", /object-src 'none'/.test(html)],
  ["CSP restricts base URLs", /base-uri 'self'/.test(html)],
  ["CSP restricts form destinations", /form-action 'self'/.test(html)],
  ["image URLs use a protocol allowlist", /function safeImageSrc\\([\\s\\S]*?url\\.protocol==='https:'/.test(html)],
  ["external links use HTTPS only", /function safeExternalUrl\\([\\s\\S]*?url\\.protocol==='https:'/.test(html)],
  ["push links are restricted to the app origin", /target\\.origin !== self\\.location\\.origin/.test(serviceWorker)],
  ["Supabase JS CDN is version-pinned", /@supabase\\/supabase-js@\\d+\\.\\d+\\.\\d+/.test(html)],
  ["Chart.js CDN is version-pinned", /chart\\.js@\\d+\\.\\d+\\.\\d+/.test(html)],
  ["tus client CDN is version-pinned", /tus-js-client@\\d+\\.\\d+\\.\\d+/.test(html)],
  ["group and DM composers have length limits", /id="chat-input"[^>]*maxlength="4000"/.test(html) && /id="dm-input"[^>]*maxlength="4000"/.test(html)],
];

const securityFailures = securityChecks.filter(([, passed]) => !passed).map(([name]) => name);
if (securityFailures.length) {
  console.error("Security checks failed:\\n" + securityFailures.join("\\n"));
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
