// Runs with `node --test`: translations come from Weblate and nowhere else (postulo/postulo#706).
import assert from "node:assert/strict";
import { test } from "node:test";

const { fromWeblate, translationChanges } = await import("../scripts/guard.mjs");

const catalogue = (entries) => Object.fromEntries(Object.entries(entries).map(([key, message]) => [key, { message }]));

test("a commit may drop a sentence and add one with an empty slot", () => {
  assert.deepEqual(translationChanges(catalogue({ save: "Enregistrer", gone: "Parti" }), catalogue({ save: "Enregistrer", fresh: "" })), []);
});

test("writing or changing a translation is refused", () => {
  assert.equal(translationChanges(catalogue({ save: "Sauver" }), catalogue({ save: "Enregistrer" })).length, 1);
  assert.equal(translationChanges(catalogue({}), catalogue({ fresh: "Nouveau" })).length, 1);
  assert.equal(translationChanges(null, catalogue({ fresh: "Nouveau" })).length, 1, "a new file arrives empty");
});

test("a renamed key may carry its sentence", () => {
  assert.deepEqual(translationChanges(catalogue({ kind: "Genre" }), catalogue({ type: "Genre" })), []);
});

test("Weblate is known by its committer, or by its trailer on a commit of catalogues only", () => {
  const trailer = "Translated using Weblate\n\nTranslate-URL: https://translate.tiagoagueda.com/projects/postulo/chromium/fr/\n";
  assert.ok(fromWeblate("weblate@tiagoagueda.com", "", ["src/popup.js"]));
  assert.ok(fromWeblate("me@example.org", trailer, ["src/_locales/fr/messages.json"]));
  assert.ok(!fromWeblate("me@example.org", trailer, ["src/popup.js"]));
  assert.ok(!fromWeblate("me@example.org", "by hand", ["src/_locales/fr/messages.json"]));
});
