// Runs with `node --test`: the display language the person can pick, apart from Thunderbird's (#8).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// What Thunderbird gives when no language is chosen: a stub that is plainly not any catalogue.
const stored = {};
globalThis.browser = globalThis.messenger = {
  i18n: { getMessage: (key) => (key === "languageTag" ? "xx" : `thunderbird:${key}`) },
  runtime: { getURL: (path) => join("src", path) },
  storage: {
    local: {
      get: async (keys) => Object.fromEntries([].concat(keys).filter((key) => key in stored).map((key) => [key, stored[key]])),
      set: async (values) => Object.assign(stored, values),
    },
  },
};
const { makeBadge } = await import("../src/lib/badge.js");
const { whoAmI } = await import("../src/lib/api.js");
const { languageTag, t, useLanguage, useStoredLanguage } = await import("../src/lib/i18n.js");
const { LANGUAGES } = await import("../src/lib/languages.js");
const { shipped, withoutLanguages } = await import("../scripts/build.mjs");
const { loadSettings, setLanguage } = await import("../src/lib/thunderbird.js");

const readCatalogue = (folder) => JSON.parse(readFileSync(join("src", "_locales", folder, "messages.json"), "utf8"));
const fromDisk = async (path) => ({ json: async () => shipped(JSON.parse(readFileSync(path, "utf8")), path.split(/[\\/]/).at(-2)) });

test("the choice is kept as a BCP 47 tag in storage.local, and empty follows Thunderbird", async () => {
  assert.equal((await loadSettings()).language, "");
  await setLanguage("pt-PT");
  assert.equal(stored.language, "pt-PT");
  assert.equal((await loadSettings()).language, "pt-PT");
  await setLanguage("");
  assert.equal((await loadSettings()).language, "");
});

test("with a language chosen sentences, tag and Postulo's Accept-Language follow it; without, Thunderbird", async () => {
  assert.equal(t("save"), "thunderbird:save");
  assert.equal(languageTag(), "xx");

  await useLanguage("fr", fromDisk);
  assert.equal(t("save"), readCatalogue("fr").save.message);
  assert.equal(languageTag(), "fr");
  let sent = null;
  await whoAmI("https://p.example", "tok", async (url, init) => {
    sent = init.headers;
    return { ok: true, json: async () => ({}) };
  });
  assert.equal(sent["Accept-Language"], "fr");

  // The tag is the BCP 47 one, the folder is Thunderbird's: pt-PT reads pt_PT.
  await useLanguage("pt-PT", fromDisk);
  assert.equal(t("save"), readCatalogue("pt_PT").save.message);

  // What is stored is read back the way the pages do at start.
  await setLanguage("fr");
  const realFetch = globalThis.fetch;
  globalThis.fetch = fromDisk;
  try {
    await useLanguage("", fromDisk);
    await useStoredLanguage();
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(languageTag(), "fr");

  // Back to Thunderbird's own, and a language no longer shipped is passed over.
  await useLanguage("", fromDisk);
  assert.equal(t("save"), "thunderbird:save");
  await useLanguage("tlh", fromDisk);
  assert.equal(t("save"), "thunderbird:save");
  await setLanguage("");
});

test("a catalogue that cannot be read leaves Thunderbird's language in place", async () => {
  await useLanguage("fr", async () => {
    throw new Error("not found");
  });
  assert.equal(t("save"), "thunderbird:save");
});

test("both toolbar buttons get the tooltip, in the language in use", async () => {
  const titles = { action: [], messageDisplayAction: [] };
  const button = (name) => ({ setTitle: async ({ title }) => titles[name].push(title), setBadgeText: async () => {} });
  const badge = makeBadge({
    area: { get: async () => ({}), set: async () => {} },
    action: button("action"),
    messageDisplayAction: button("messageDisplayAction"),
    loadSettings: async () => ({ instance: "", token: "" }),
    sentCaptures: async () => [],
    allowed: async () => false,
    t: (key) => `said:${key}`,
  });
  await badge.repaint();
  assert.deepEqual(titles.action, ["said:actionTitle"]);
  assert.deepEqual(titles.messageDisplayAction, ["said:actionTitle"]);
});

test("the build offers only the languages it ships", () => {
  const source = readFileSync(join("src", "lib", "languages.js"), "utf8");
  const trimmed = withoutLanguages(source, ["fr", "pt_PT"]);
  assert.doesNotMatch(trimmed, /folder: "fr"|folder: "pt_PT"/);
  assert.match(trimmed, /folder: "en"/);
  assert.equal(trimmed.split("folder:").length, source.split("folder:").length - 2);
  assert.equal(withoutLanguages(source, []), source);
});

test("the settings page offers 'Follow Thunderbird' and every language, and each page reads the choice", () => {
  const html = readFileSync(join("src", "options.html"), "utf8");
  assert.match(html, /<select id="language">\s*<option value="" data-i18n="languageFollow">/);
  const options = readFileSync(join("src", "options.js"), "utf8");
  assert.match(options, /for \(const language of LANGUAGES\)[\s\S]*option\.value = language\.tag;[\s\S]*option\.lang = language\.tag;/);
  assert.match(options, /setLanguage\(language\)[\s\S]*useLanguage\(language\)/);
  for (const page of ["options.js", "popup.js", "capture.js"]) {
    assert.match(readFileSync(join("src", page), "utf8"), /await useStoredLanguage\(\);\s*localise\(\);/, page);
  }
  const background = readFileSync(join("src", "background.js"), "utf8");
  assert.match(background, /"language" in changes/);
  // Each language is named in itself, and only the ones the build keeps are offered.
  assert.ok(LANGUAGES.every((language) => language.name.trim()));
});

test("the three sentences of the setting are in English, and the hint says what cannot follow", () => {
  const english = readCatalogue("en");
  for (const key of ["languageLabel", "languageFollow", "languageHint"]) {
    assert.ok(english[key].message.trim(), key);
  }
  assert.match(english.languageHint.message, /list of add-ons/);
});
