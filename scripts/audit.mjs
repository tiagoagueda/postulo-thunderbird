// Fails when `npm audit` reports a high or critical advisory that is not listed below
// (SEC2-051), and when the audit could not be made at all (SEC3-002). The extension's shipped
// bundle takes nothing from node_modules, so these are development-time findings in the
// web-ext tree; a new one should still stop CI.
//
//   node scripts/audit.mjs
//
// An advisory is allowed only with the reason and the day it is looked at again. Remove it
// from here once the audit no longer reports it.
//
// Exit status: 0 nothing refused, 1 an advisory that is not allowed, 2 no report was made.
// npm itself exits 1 both for "advisories found" and for "could not ask the registry", so the
// shape of the document it prints is what tells them apart.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ALLOWED = {
  // An advisory with no fixed release, and why it cannot reach the extension:
  // "GHSA-…": "reason; look again YYYY-MM-DD".
};

// The report npm printed, or an Error saying why it is not one. When the advisory endpoint
// cannot be reached npm still prints valid JSON ({ message, error }) with no `vulnerabilities`.
export function parseReport(text) {
  let report;
  try {
    report = JSON.parse(text);
  } catch {
    throw new Error(`npm audit printed no JSON: ${String(text).slice(0, 500)}`);
  }
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("npm audit printed something that is not a report");
  }
  if (report.error) {
    throw new Error(`npm audit reported an error: ${report.message || JSON.stringify(report.error)}`);
  }
  if (!report.vulnerabilities || typeof report.vulnerabilities !== "object" || !report.metadata) {
    throw new Error(`npm audit printed no advisories section: ${report.message || "no vulnerabilities or metadata member"}`);
  }
  return report;
}

function advisories(report, severities) {
  const found = new Map();
  for (const vulnerability of Object.values(report.vulnerabilities)) {
    for (const via of vulnerability.via ?? []) {
      if (typeof via === "object" && severities.includes(via.severity)) {
        found.set(via.url?.split("/").pop() ?? via.title, {
          what: `${via.severity}: ${via.title} (${vulnerability.name})`,
          fixable: Boolean(vulnerability.fixAvailable),
        });
      }
    }
  }
  return found;
}

// What to print and which status to exit with, for the text npm printed.
export function judge(text, allowed = ALLOWED) {
  let report;
  try {
    report = parseReport(text);
  } catch (error) {
    return { status: 2, out: [], err: [`npm audit did not produce a report: ${error.message}`] };
  }
  const out = [];
  const err = [];
  for (const [id, { what, fixable }] of advisories(report, ["moderate"])) {
    if (fixable) out.push(`moderate with a fix available ${id} - ${what}`);
  }
  let status = 0;
  for (const [id, { what }] of advisories(report, ["high", "critical"])) {
    if (id in allowed) {
      out.push(`allowed ${id} - ${allowed[id]}`);
    } else {
      err.push(`NOT ALLOWED ${id} - ${what}`);
      status = 1;
    }
  }
  return { status, out, err };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const run = spawnSync("npm", ["audit", "--json"], { encoding: "utf8", shell: process.platform === "win32", maxBuffer: 64 * 1024 * 1024 });
  if (run.error) {
    console.error("npm audit did not run:", run.error.message);
    process.exit(2);
  }
  const { status, out, err } = judge(run.stdout);
  for (const line of out) console.log(line);
  for (const line of err) console.error(line);
  process.exit(status);
}
