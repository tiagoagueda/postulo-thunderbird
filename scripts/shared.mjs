// The files this extension shares with the browser extension, and keeping them the same.
//
// Talking to Postulo, filling a page from the catalogues, the stylesheet and the icons are
// the browser extension's, copied here from postulo-chromium at the commit `shared.json`
// names. A copy drifts unless something notices, so `shared.json` also keeps each file's
// SHA-256, and `npm test` fails when a copy no longer matches: change a shared file there,
// then bring it here.
//
//   node scripts/shared.mjs check                 # every copy matches shared.json
//   node scripts/shared.mjs sync [../postulo-chromium]
//                                                 # copy again from a checkout, at its HEAD,
//                                                 # and write the new commit and hashes

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const RECORD = join(ROOT, "shared.json");

/** A file's SHA-256, with line endings made the same first: a checkout on Windows may hold
 *  CRLF where the repository holds LF, and that is not a difference in the file. */
export function digest(path) {
  let bytes = readFileSync(path);
  if (!path.endsWith(".png")) {
    bytes = Buffer.from(bytes.toString("utf8").replaceAll("\r\n", "\n"), "utf8");
  }
  return createHash("sha256").update(bytes).digest("hex");
}

export function record() {
  return JSON.parse(readFileSync(RECORD, "utf8"));
}

/** The shared files whose copy here is not the one `shared.json` recorded. */
export function drifted() {
  return Object.entries(record().files)
    .filter(([path, expected]) => digest(join(ROOT, path)) !== expected)
    .map(([path]) => path);
}

function sync(checkout) {
  const dirty = execFileSync("git", ["-C", checkout, "status", "--porcelain", "--", "src"], { encoding: "utf8" }).trim();
  if (dirty) {
    throw new Error(`${checkout} has uncommitted changes under src/; commit them there first.`);
  }
  const current = record();
  const files = {};
  for (const path of Object.keys(current.files)) {
    copyFileSync(join(checkout, path), join(ROOT, path));
    files[path] = digest(join(ROOT, path));
  }
  const ref = execFileSync("git", ["-C", checkout, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  writeFileSync(RECORD, JSON.stringify({ ...current, ref, files }, null, 2) + "\n");
  console.log(`${Object.keys(files).length} files copied from ${checkout} at ${ref}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command = "check", checkout = join(ROOT, "..", "postulo-chromium")] = process.argv.slice(2);
  if (command === "sync") {
    sync(checkout);
  } else if (command === "check") {
    const changed = drifted();
    if (changed.length) {
      console.error(`These no longer match shared.json:\n  ${changed.join("\n  ")}`);
      process.exit(1);
    }
    console.log(`${Object.keys(record().files).length} shared files match ${record().ref}`);
  } else {
    throw new Error(`Unknown command ${command}; check or sync.`);
  }
}
