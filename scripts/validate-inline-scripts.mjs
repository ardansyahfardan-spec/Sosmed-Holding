import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync("index.html", "utf8");
const serviceWorker = readFileSync("sw.js", "utf8");

const securityChecks = [
  ["CSP blocks object embedding", html.includes("object-src 'none'")],
  ["CSP restricts base URLs", html.includes("base-uri 'self'")],
  ["CSP restricts form destinations", html.includes("form-action 'self'")],
  ["image URL allowlist helper exists", html.includes("function safeImageSrc") && html.includes("url.protocol==='https:'")],
  ["external HTTPS URL helper is used for LORE references", html.includes("function safeExternalUrl") && html.includes("safeExternalUrl(source.url)")],
  ["push links are restricted to the app origin", serviceWorker.includes("target.origin !== self.location.origin")],
  ["Supabase JS CDN is version-pinned", html.includes("@supabase/supabase-js@2.119.0")],
  ["Chart.js CDN is version-pinned", html.includes("chart.js@4.6.1")],
  ["tus client CDN is version-pinned", html.includes("tus-js-client@4.3.1")],
  ["group and DM composers have length limits", html.includes('id="chat-input" type="text" maxlength="4000"') && html.includes('id="dm-input" maxlength="4000"')],
];;

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
