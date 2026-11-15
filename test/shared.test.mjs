// Runs with `node --test`: the files shared with the browser extension are still its files.
import assert from "node:assert/strict";
import { test } from "node:test";

import { drifted, record } from "../scripts/shared.mjs";

test("the pin is a commit, which cannot move", () => {
  assert.match(record().ref, /^[0-9a-f]{40}$/);
});

test("every shared file is the copy shared.json recorded", () => {
  assert.deepEqual(drifted(), [], "change a shared file in postulo-chromium, then `npm run shared:sync`");
});

// Against a throwaway repository standing in for postulo-chromium (SEC3-005): the hashes in
// shared.json are compared with the files at `ref`, not with each other.
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after } from "node:test";
import { digestBytes, verify } from "../scripts/shared.mjs";

const root = mkdtempSync(join(tmpdir(), "shared-test-"));
after(() => rmSync(root, { recursive: true, force: true }));

function git(cwd, ...args) {
  return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.org", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" }).trim();
}

function chromium() {
  const repo = mkdtempSync(join(root, "chromium-"));
  process.env.SHARED_ALLOW = repo;
  git(repo, "init", "-q", "-b", "main");
  mkdirSync(join(repo, "src", "lib"), { recursive: true });
  writeFileSync(join(repo, "src", "lib", "api.js"), "export const a = 1;\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "first");
  return { repo, ref: git(repo, "rev-parse", "HEAD") };
}

const hash = (text) => digestBytes("src/lib/api.js", Buffer.from(text));

test("a record that is the source's passes", () => {
  const { repo, ref } = chromium();
  assert.deepEqual(verify({ repository: repo, ref, files: { "src/lib/api.js": hash("export const a = 1;\n") } }), []);
});

test("a shared file and its hash changed together is caught against the source", () => {
  const { repo, ref } = chromium();
  // What a change that edits src/lib/api.js and shared.json together records: self-consistent, not the source's.
  const files = { "src/lib/api.js": hash("export const a = 2; // stealing the token\n") };
  const found = verify({ repository: repo, ref, files });
  assert.equal(found.length, 1);
  assert.match(found[0], /src\/lib\/api\.js: the hash in shared\.json is not the hash/);
});

test("a ref that is not on main, or not there at all, is caught", () => {
  const { repo, ref } = chromium();
  git(repo, "checkout", "-q", "-b", "side");
  writeFileSync(join(repo, "src", "lib", "api.js"), "side\n");
  git(repo, "commit", "-qam", "side");
  const side = git(repo, "rev-parse", "HEAD");
  git(repo, "checkout", "-q", "main");
  const onSide = verify({ repository: repo, ref: side, files: { "src/lib/api.js": hash("side\n") } });
  assert.ok(onSide.some((line) => /not on postulo-chromium's main/.test(line)), onSide.join("\n"));
  const missing = verify({ repository: repo, ref: "0".repeat(40), files: { "src/lib/api.js": hash("x") } });
  assert.ok(missing.some((line) => /is not in postulo-chromium/.test(line)), missing.join("\n"));
  assert.ok(ref);
});

test("a repository other than postulo-chromium is refused", () => {
  delete process.env.SHARED_ALLOW;
  const found = verify({ repository: "https://example.org/evil.git", ref: "0".repeat(40), files: {} });
  assert.match(found[0], /which is not/);
});
