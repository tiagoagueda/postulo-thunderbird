// Refuse translations written outside Weblate (postulo/postulo#706).
//
// Every translation, correction and review is made in Weblate, at translate.tiagoagueda.com,
// which commits it back as a pull request from its `weblate` branch. This reads every commit
// of a push or a pull request and names each one that writes or changes a sentence in a
// language other than English anywhere else. A commit may change English, drop a sentence
// the extension no longer says, and carry a translation to a renamed key (the same sentence,
// removed from one key and added under another, in the same commit).
//
//   node scripts/guard.mjs [BASE]   # the commits since BASE (default: where origin/main is)
//
// Weblate's commits are known by their committer, or, after a squash or rebase merge that
// makes the maintainer the committer, by Weblate's Translate-URL trailer on a commit that
// touches catalogues only. This catches a mistake, not an attacker.

import { execFileSync } from "node:child_process";

const WEBLATE_COMMITTERS = new Set(["weblate@tiagoagueda.com", "noreply@weblate.org"]);
const TRAILER = /^Translate-URL: https:\/\/translate\.tiagoagueda\.com\//m;
const CATALOGUE = /^src\/_locales\/([^/]+)\/messages\.json$/;

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

function fileAt(revision, path) {
  try {
    return JSON.parse(git("show", `${revision}:${path}`));
  } catch {
    return null;
  }
}

/** What one catalogue's change does that only Weblate may do. */
export function translationChanges(before, after) {
  const found = [];
  const messages = (catalogue) =>
    Object.fromEntries(Object.entries(catalogue ?? {}).map(([key, entry]) => [key, entry?.message ?? ""]));
  const old = messages(before);
  const now = messages(after);
  const removed = new Set(Object.keys(old).filter((key) => !(key in now)).map((key) => old[key]));
  for (const [key, message] of Object.entries(now)) {
    if (key in old) {
      if (old[key] !== message) found.push(`${key}: its translation was changed here`);
    } else if (message.trim() && !removed.has(message)) {
      found.push(`${key}: a new sentence arrives with a translation`);
    }
  }
  return found;
}

export function fromWeblate(committer, message, paths) {
  if (WEBLATE_COMMITTERS.has(committer.toLowerCase())) return true;
  return TRAILER.test(message) && paths.every((path) => CATALOGUE.test(path));
}

function main() {
  const given = process.argv[2] || process.env.BASE || "";
  const head = "HEAD";
  const base = git("merge-base", given && !/^0+$/.test(given) ? given : "origin/main", head).trim();
  const commits = git("rev-list", "--reverse", "--no-merges", `${base}..${head}`).split("\n").filter(Boolean);
  const problems = [];
  for (const commit of commits) {
    const [committer, ...rest] = git("show", "-s", "--format=%ce%n%B", commit).split("\n");
    const paths = git("diff-tree", "--no-commit-id", "--name-only", "-r", "--root", commit).split("\n").filter(Boolean);
    if (fromWeblate(committer.trim(), rest.join("\n"), paths)) continue;
    const parents = git("rev-list", "--parents", "-n", "1", commit).trim().split(" ").slice(1);
    for (const path of paths) {
      const match = CATALOGUE.exec(path);
      if (!match || match[1] === "en") continue;
      const after = fileAt(commit, path);
      if (!after) continue;
      const before = parents.length ? fileAt(`${commit}^`, path) : null;
      for (const problem of translationChanges(before, after)) problems.push(`${commit.slice(0, 9)} ${path}: ${problem}`);
    }
  }
  for (const problem of problems) console.log(problem);
  if (problems.length) {
    console.log(
      `${problems.length} translation(s) written outside Weblate. Translations are made at ` +
        "https://translate.tiagoagueda.com and come back as its pull request (postulo/postulo#706).",
    );
    process.exit(1);
  }
  console.log("no translation written outside Weblate");
}

if (process.argv[1]?.endsWith("guard.mjs")) main();
