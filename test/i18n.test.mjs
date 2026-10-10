// Runs with `node --test`: every language says every sentence, with the same placeholders.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SOURCE = "src";
const LOCALES = join(SOURCE, "_locales");

// The languages the skeleton ships, as BCP 47 tags in their canonical form. A folder's name
// is the tag with an underscore for the hyphen, which is the form Thunderbird demands.
const OFFERED = ["en", "fr", "pt-PT"];
const folderOf = (tag) => tag.replace("-", "_");

function read(path) {
  const text = readFileSync(path, "utf8");
  assert.notEqual(text.charCodeAt(0), 0xfeff, `${path} starts with a byte-order mark`);
  return JSON.parse(text);
}

const folders = readdirSync(LOCALES).sort();
const messages = Object.fromEntries(folders.map((folder) => [folder, read(join(LOCALES, folder, "messages.json"))]));
const english = messages.en;

// The keys the build writes into every catalogue that ships (scripts/build.mjs), never a
// translator: they are the catalogue's language and direction, not sentences (postulo/postulo#706).
const BUILT = new Set(["languageTag", "direction"]);
const { shipped } = await import("../scripts/build.mjs");

const placeholdersIn = (message) => [...message.matchAll(/\$([A-Za-z_]+)\$/g)].map((match) => match[1].toLowerCase()).sort();

test("the extension ships the languages it says it does, English by default", () => {
  assert.deepEqual(folders, OFFERED.map(folderOf).sort());
  assert.equal(read(join(SOURCE, "manifest.json")).default_locale, "en");
});

test("every language code is a BCP 47 tag in its canonical form", () => {
  for (const tag of OFFERED) {
    assert.deepEqual(Intl.getCanonicalLocales(tag), [tag], tag);
    const folder = folderOf(tag);
    assert.equal(shipped(messages[folder], folder).languageTag.message, tag, `${tag} names itself`);
  }
});

test("no language has a sentence English lacks, and none is empty", () => {
  // A sentence English has and a language lacks is Weblate's to fill, not the commit's
  // (postulo/postulo#706); the build leaves such a language out of the package.
  for (const [folder, catalogue] of Object.entries(messages)) {
    const extra = Object.keys(catalogue).filter((key) => !(key in english));
    assert.deepEqual(extra, [], `${folder} has sentences English does not`);
    for (const [key, entry] of Object.entries(catalogue)) {
      assert.equal(typeof entry.message, "string", `${folder}.${key}`);
      assert.ok(entry.message.trim(), `${folder}.${key} is empty`);
    }
  }
});

test("placeholders are the same in every language", () => {
  for (const [folder, catalogue] of Object.entries(messages)) {
    for (const [key, entry] of Object.entries(catalogue)) {
      assert.deepEqual(placeholdersIn(entry.message), placeholdersIn(english[key].message), `${folder}.${key}`);
      assert.deepEqual(entry.placeholders, english[key].placeholders, `${folder}.${key}`);
    }
  }
});

test("each shipped translation says which way it is written, and the build says it", () => {
  for (const [folder, catalogue] of Object.entries(messages)) {
    assert.ok(!("languageTag" in catalogue) && !("direction" in catalogue), `${folder} holds what the build writes`);
    assert.ok(["ltr", "rtl"].includes(shipped(catalogue, folder).direction.message), folder);
  }
});

test("the scope keeps its name in every language: it is what Postulo calls it", () => {
  for (const [folder, catalogue] of Object.entries(messages)) {
    assert.match(catalogue.lacksCaptures.message, /\bcaptures\b/, folder);
  }
});

test("no sentence speaks of a browser: the ones copied from the browser extension were reworded", () => {
  for (const [folder, catalogue] of Object.entries(messages)) {
    for (const [key, entry] of Object.entries(catalogue)) {
      assert.doesNotMatch(entry.message, /\bbrowser\b|\bnavigateur\b|\bnavegador\b/i, `${folder}.${key}`);
    }
  }
});

test("every key the code asks for exists, and every sentence is asked for", () => {
  const patterns = [
    /\bt\("([A-Za-z]+)"/g,
    /\bRefusal\("([A-Za-z]+)"/g,
    /\blocaliseWith\([^,]+, "([A-Za-z]+)"/g,
    /\bkey: "([A-Za-z]+)"/g,
    /data-i18n(?:-label)?="([A-Za-z]+)"/g,
    /__MSG_([A-Za-z]+)__/g,
  ];
  const files = readdirSync(SOURCE, { recursive: true })
    .filter((name) => /\.(js|html|json)$/.test(name) && !name.startsWith("_locales"))
    .map((name) => readFileSync(join(SOURCE, name), "utf8"));
  const used = new Set(files.flatMap((text) => patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => match[1]))));
  for (const key of used) {
    assert.ok(key in english || BUILT.has(key), `the code asks for ${key}, which en does not have`);
  }
  for (const key of Object.keys(english)) {
    assert.ok(used.has(key), `en has ${key}, which nothing asks for`);
  }
});
