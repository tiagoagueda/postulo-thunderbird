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
import { LANGUAGES } from "../src/lib/languages.js";

const SOURCE = "src";
const OUT = join("dist", "src");

/** A catalogue as it ships: the translation, and what the code asks of it about itself.
 *  The tag and direction come from src/lib/languages.js, which a folder's name cannot give:
 *  Serbian's folder is `sr` whichever script its catalogue is written in. */
export function shipped(catalogue, folder) {
  const language = LANGUAGES.find((one) => one.folder === folder);
  if (!language) throw new Error(`${folder} is not a language src/lib/languages.js lists.`);
  return {
    ...catalogue,
    languageTag: { message: language.tag, description: "This catalogue's language: set by the build." },
    direction: { message: language.direction, description: "ltr or rtl: set by the build." },
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
