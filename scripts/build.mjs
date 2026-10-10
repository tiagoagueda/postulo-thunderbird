// Stage the extension in dist/src for web-ext to lint, run and package.
//
// The one thing the package has that src/ does not: each catalogue's `languageTag` and
// `direction`, which the page's `lang` and `dir` and every date read. They are not sentences,
// so they are not in the catalogues Weblate holds -- machine translation would translate `ltr`
// (postulo/postulo#706) -- and are written here, from the folder's name: `pt_PT` is `pt-PT`.
//
//   node scripts/build.mjs        # then web-ext ... --source-dir dist/src

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = "src";
const OUT = join("dist", "src");
// Languages written right to left, by their primary subtag.
const RTL = new Set(["ar", "fa", "he", "ur", "ps", "yi", "dv", "sd", "ug", "ckb"]);

/** A folder's BCP 47 tag: the underscore Thunderbird demands is the tag's hyphen. */
export const tagOf = (folder) => folder.replace("_", "-");

/** A catalogue as it ships: the translation, and what the code asks of it about itself. */
export function shipped(catalogue, folder) {
  const tag = tagOf(folder);
  return {
    languageTag: { message: tag, description: "This catalogue's language: set by the build." },
    direction: {
      message: RTL.has(tag.split("-")[0]) ? "rtl" : "ltr",
      description: "ltr or rtl: set by the build.",
    },
    ...catalogue,
  };
}

/** The folders whose catalogue lacks a sentence English has, or holds an empty one. */
export function incomplete(dir) {
  const read = (folder) => JSON.parse(readFileSync(join(dir, folder, "messages.json"), "utf8"));
  const keys = Object.keys(read("en"));
  return readdirSync(dir).filter((folder) => {
    if (folder === "en") return false;
    const catalogue = read(folder);
    return keys.some((key) => typeof catalogue[key]?.message !== "string" || !catalogue[key].message.trim());
  });
}

if (process.argv[1]?.endsWith("build.mjs")) {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  cpSync(SOURCE, OUT, { recursive: true });
  const locales = join(OUT, "_locales");
  // A language Weblate has only part of: English in the gaps would read as a bug.
  for (const folder of incomplete(locales)) {
    console.warn(`Leaving out ${folder}: its catalogue is not complete.`);
    rmSync(join(locales, folder), { recursive: true, force: true });
  }
  for (const folder of readdirSync(locales)) {
    const file = join(locales, folder, "messages.json");
    if (!existsSync(file)) continue;
    const catalogue = JSON.parse(readFileSync(file, "utf8"));
    writeFileSync(file, JSON.stringify(shipped(catalogue, folder), null, 2) + "\n");
  }
  console.log(`staged: ${OUT}`);
}
