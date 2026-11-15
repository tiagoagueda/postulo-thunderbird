// Runs with `node --test`: what the extension says about the token it holds (SEC2-085, SEC2-087),
// and that it reads an answer that is not Postulo's as a sentence, not as an engine error
// (SEC2-086).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { Refusal, readResponse, whoAmI } from "../src/lib/api.js";
import { BIND, CAPTURES, SCOPES_USED, judgeScopes } from "../src/lib/scopes.js";

test("the extension uses exactly the two scopes the settings and the README name", () => {
  assert.deepEqual(SCOPES_USED, ["captures", "listings:bind"]);
  const readme = readFileSync("README.md", "utf8");
  const html = readFileSync("src/options.html", "utf8");
  for (const scope of [CAPTURES, BIND]) {
    assert.ok(readme.includes(`\`${scope}\``), `README names ${scope}`);
    assert.ok(html.includes(`<code>${scope}</code>`), `options.html names ${scope}`);
  }
});

test("a token of one scope, or both, is not too wide", () => {
  for (const scopes of [["captures"], ["listings:bind"], ["captures", "listings:bind"]]) {
    const judged = judgeScopes({ scopes });
    assert.deepEqual(judged.extra, [], scopes.join());
    assert.equal(judged.neither, false);
  }
});

test("a token with another scope is called too wide, naming it; one with neither of ours is useless", () => {
  assert.deepEqual(judgeScopes({ scopes: ["captures", "read", "write"] }).extra, ["read", "write"]);
  const useless = judgeScopes({ scopes: ["read"] });
  assert.equal(useless.neither, true);
  assert.deepEqual(useless.extra, ["read"]);
  assert.equal(judgeScopes({}).neither, true);
  assert.equal(judgeScopes(null).neither, true);
});

test("a 200 answer that is not JSON is a Refusal with the key notPostulo", async () => {
  const html = new Response("<html>Sign in</html>", { status: 200, headers: { "content-type": "text/html" } });
  await assert.rejects(
    () => readResponse(html),
    (error) => error instanceof Refusal && error.key === "notPostulo",
  );
  const asked = () => Promise.resolve(new Response("<html>Sign in</html>", { status: 200 }));
  await assert.rejects(
    () => whoAmI("https://postulo.example.org", "token", asked),
    (error) => error instanceof Refusal && error.key === "notPostulo",
  );
});

test("Forget token removes the token from storage and keeps the address", async () => {
  const store = {};
  globalThis.messenger = {
    storage: {
      local: {
        get: async (keys) => Object.fromEntries(keys.filter((key) => key in store).map((key) => [key, store[key]])),
        set: async (values) => Object.assign(store, values),
        remove: async (key) => {
          delete store[key];
        },
      },
    },
  };
  try {
    const { forgetToken, loadSettings, saveSettings } = await import("../src/lib/thunderbird.js");
    await saveSettings({ instance: "https://postulo.example.org", token: "secret" });
    assert.equal((await loadSettings()).token, "secret");
    await forgetToken();
    assert.equal("token" in store, false, "no token key is left in storage");
    assert.deepEqual(await loadSettings(), { instance: "https://postulo.example.org", token: "", offline: false });
  } finally {
    delete globalThis.messenger;
  }
});

test("the options page has the control, wired to forgetToken, and says the token is unencrypted", () => {
  const html = readFileSync("src/options.html", "utf8");
  assert.match(html, /<button id="forget"[^>]*data-i18n="forgetToken"/);
  assert.match(html, /unencrypted/i);
  assert.match(html, /primary password/i);
  const code = readFileSync("src/options.js", "utf8");
  assert.match(code, /\$\("forget"\)\.addEventListener\("click"[\s\S]*forgetToken\(\)/);
});

test("the options page judges the token's scopes on Save as well as on Test (SEC3-004)", () => {
  const code = readFileSync("src/options.js", "utf8");
  const save = code.slice(code.indexOf('$("settings").addEventListener("submit"'), code.indexOf('$("forget")'));
  assert.match(save, /judgeToken\(/, "Save asks Postulo what the token may do");
  assert.match(save, /judged\.warning/, "and shows the warning");
  assert.match(save, /catch \{\s*say\(saved\)/, "an instance that cannot be reached does not undo the save");
  const test = code.slice(code.indexOf('$("test")'));
  assert.match(test, /judgeToken\(/, "Test uses the same judgement");
});

test("the hint says capturing needs the captures scope, and filing, not built yet, the other", () => {
  const messages = JSON.parse(readFileSync("src/_locales/en/messages.json", "utf8"));
  assert.match(messages.tokenHintScopes.message, /Capturing a posting needs \$CAPTURES\$/);
  assert.match(readFileSync("src/options.html", "utf8"), /Capturing a posting needs\s+<code>captures<\/code>/);
});
