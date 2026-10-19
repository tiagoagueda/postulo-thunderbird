// Fails when `npm audit` reports a high or critical advisory that is not listed below
// (SEC2-051). The extension's shipped bundle takes nothing from node_modules, so these are
// development-time findings in the web-ext tree; a new one should still stop CI.
//
//   node scripts/audit.mjs
//
// An advisory is allowed only with the reason and the day it is looked at again. Remove it
// from here once the audit no longer reports it.

import { spawnSync } from "node:child_process";

const ALLOWED = {
  // node-forge has no release without it. It is reached through web-ext's Android debugging
  // (@devicefarmer/adbkit), which this project never runs.
  "GHSA-86w9-cpqp-85rv": "no fixed node-forge release; web-ext's adb path only; look again 2026-12-01",
};

const run = spawnSync("npm", ["audit", "--json"], { encoding: "utf8", shell: process.platform === "win32", maxBuffer: 64 * 1024 * 1024 });
let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.error("npm audit gave no report:", run.stderr || run.stdout);
  process.exit(2);
}

const found = new Map();
for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vulnerability.via ?? []) {
    if (typeof via === "object" && ["high", "critical"].includes(via.severity)) {
      found.set(via.url?.split("/").pop() ?? via.title, `${via.severity}: ${via.title} (${vulnerability.name})`);
    }
  }
}

let failed = false;
for (const [id, what] of found) {
  if (id in ALLOWED) {
    console.log(`allowed ${id} - ${ALLOWED[id]}`);
  } else {
    console.error(`NOT ALLOWED ${id} - ${what}`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
