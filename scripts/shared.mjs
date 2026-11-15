// The files this extension shares with the browser extension, and keeping them the same.
//
// Talking to Postulo, filling a page from the catalogues, the stylesheet and the icons are
// the browser extension's, copied here from postulo-chromium at the commit `shared.json`
// names. A copy drifts unless something notices, so `shared.json` also keeps each file's
// SHA-256, and `npm test` fails when a copy no longer matches: change a shared file there,
// then bring it here.
//
// `check` alone proves only that the copies match the record, and the record is a file a
// change can edit: `verify` compares the record with postulo-chromium itself (SEC3-005).
//
//   node scripts/shared.mjs check                 # every copy matches shared.json
//   node scripts/shared.mjs verify                # every recorded hash is the hash of that file in
//                                                 # postulo-chromium at `ref`, and `ref` is on its
//                                                 # main (needs the network; CI runs it)
//   node scripts/shared.mjs sync [../postulo-chromium]
//                                                 # copy again from a checkout of postulo-chromium
//                                                 # that is clean and whose HEAD is on its
//                                                 # origin/main, and write the new commit and hashes

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const RECORD = join(ROOT, "shared.json");

/** The only repository the copies may come from. SHARED_ALLOW (comma separated) adds to the
 *  list for the tests, which stand a throwaway repository in for it. */
export const CHROMIUM = "https://source.tiagoagueda.com/postulo/postulo-chromium.git";

export function allowedRepositories(env = process.env) {
  const extra = String(env.SHARED_ALLOW || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return [CHROMIUM, ...extra];
}

/** A file's SHA-256, with line endings made the same first: a checkout on Windows may hold
 *  CRLF where the repository holds LF, and that is not a difference in the file. */
export function digest(path) {
  return digestBytes(path, readFileSync(path));
}

export function digestBytes(path, bytes) {
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

function git(args, encoding = "utf8") {
  return execFileSync("git", args, { encoding, stdio: ["ignore", "pipe", "pipe"] });
}

function normalised(url) {
  return String(url).trim().replace(/\/+$/, "").replace(/\.git$/, "");
}

function isAllowed(url) {
  return allowedRepositories().some((allowed) => normalised(allowed) === normalised(url));
}

/** What is wrong with `recorded` ({ repository, ref, files }) when it is compared with the
 *  repository itself: a recorded hash that is not that file's hash at `ref`, or a `ref` that is
 *  not on its main. Empty when the record is the source's. Needs the network. */
export function verify(recorded = record()) {
  if (!isAllowed(recorded.repository)) {
    return [`shared.json names ${recorded.repository}, which is not ${CHROMIUM}.`];
  }
  const dir = mkdtempSync(join(tmpdir(), "postulo-shared-"));
  try {
    git(["clone", "--quiet", "--bare", "--filter=blob:none", "--no-tags", recorded.repository, dir]);
    const problems = [];
    for (const [path, expected] of Object.entries(recorded.files)) {
      let bytes;
      try {
        bytes = git(["--git-dir", dir, "show", `${recorded.ref}:${path}`], "buffer");
      } catch {
        problems.push(`${path} is not in postulo-chromium at ${recorded.ref}.`);
        continue;
      }
      if (digestBytes(path, bytes) !== expected) {
        problems.push(`${path}: the hash in shared.json is not the hash of postulo-chromium's file at ${recorded.ref}.`);
      }
    }
    try {
      git(["--git-dir", dir, "merge-base", "--is-ancestor", recorded.ref, "refs/heads/main"]);
    } catch {
      problems.push(`${recorded.ref} is not on postulo-chromium's main.`);
    }
    return problems;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function sync(checkout) {
  const origin = git(["-C", checkout, "remote", "get-url", "origin"]).trim();
  if (!isAllowed(origin)) {
    throw new Error(`${checkout} has origin ${origin}, which is not ${CHROMIUM}; refusing to copy from it.`);
  }
  if (git(["-C", checkout, "status", "--porcelain"]).trim()) {
    throw new Error(`${checkout} has uncommitted changes; commit or stash them there first.`);
  }
  try {
    git(["-C", checkout, "merge-base", "--is-ancestor", "HEAD", "origin/main"]);
  } catch {
    throw new Error(`${checkout}'s HEAD is not on its origin/main; fetch it and check out a commit of main.`);
  }
  const current = record();
  const files = {};
  for (const path of Object.keys(current.files)) {
    copyFileSync(join(checkout, path), join(ROOT, path));
    files[path] = digest(join(ROOT, path));
  }
  const ref = git(["-C", checkout, "rev-parse", "HEAD"]).trim();
  writeFileSync(RECORD, JSON.stringify({ ...current, ref, files }, null, 2) + "\n");
  console.log(`${Object.keys(files).length} files copied from ${checkout} at ${ref}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command = "check", checkout = join(ROOT, "..", "postulo-chromium")] = process.argv.slice(2);
  if (command === "sync") {
    sync(checkout);
  } else if (command === "verify") {
    const found = verify();
    if (found.length) {
      console.error(`shared.json is not postulo-chromium's:\n  ${found.join("\n  ")}`);
      process.exit(1);
    }
    console.log(`shared.json matches postulo-chromium at ${record().ref}, which is on its main`);
  } else if (command === "check") {
    const changed = drifted();
    if (changed.length) {
      console.error(`These no longer match shared.json:\n  ${changed.join("\n  ")}`);
      process.exit(1);
    }
    console.log(`${Object.keys(record().files).length} shared files match ${record().ref}`);
  } else {
    throw new Error(`Unknown command ${command}; check, verify or sync.`);
  }
}
