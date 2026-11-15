import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync("index.html", "utf8");
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
