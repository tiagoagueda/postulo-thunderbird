// Runs with `node --test`: the state icon in the popup's footer (#6).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { SLOW_MS, checkConnection } from "../src/lib/connection.js";
import { footerState } from "../src/lib/footer.js";

const SET = { instance: "https://postulo.example.org", token: "tok", offline: false };
const at = (state, ms) => ({ state, at: "2026-11-15T10:00:00Z", how: "healthz", ...(ms === undefined ? {} : { ms }) });

test("Postulo answering within a second is a green tick; slower is the orange clock", () => {
  assert.equal(footerState(SET, at("reachable", 120)).state, "online");
  assert.equal(footerState(SET, at("reachable", SLOW_MS + 1)).state, "slow");
  assert.equal(footerState(SET, null, { slow: true }).state, "slow", "no answer after a second, and the wait goes on");
  assert.equal(footerState(SET, null), null, "nothing learnt yet shows nothing");
});

test("nothing answering is the red cross, and the states the list does not name are said too", () => {
  assert.equal(footerState(SET, at("unreachable")).state, "unreachable");
  assert.equal(footerState(SET, at("noPermission")).state, "noPermission");
  assert.equal(footerState(SET, at("tokenRefused")).state, "tokenRefused");
  assert.equal(footerState(SET, at("unreachable"), { slow: true }).state, "unreachable", "a red state is not softened while waiting");
});

test("the testing switch is grey, and wins over everything that was learnt", () => {
  assert.equal(footerState({ ...SET, offline: true }, at("reachable", 10)).state, "testing");
  assert.equal(footerState({ ...SET, offline: true }, at("unreachable"), {}, false).state, "testing");
});

test("Thunderbird working offline is its own state, not the red cross", () => {
  const shown = footerState(SET, at("reachable", 10), {}, false);
  assert.deepEqual(shown, { state: "mailOffline", key: "thunderbirdOffline" });
  assert.equal(footerState(SET, at("unreachable"), {}, false).state, "mailOffline");
});

test("not set up shows nothing", () => {
  assert.equal(footerState({ instance: "", token: "", offline: false }, at("reachable", 1)), null);
  assert.equal(footerState({ instance: SET.instance, token: "", offline: false }, null, {}, false), null);
});

test("the check asks /healthz, with no token, and keeps how long it took; with the switch on it asks nothing", async () => {
  const store = {};
  const area = { get: async (key) => ({ [key]: store[key] }), set: async (items) => Object.assign(store, items) };
  const asked = [];
  let clock = 1000;
  const fetchImpl = async (url, init) => {
    asked.push([url, init]);
    clock += 1500;
    if (String(url).endsWith("/healthz")) return new Response("{}", { status: 200 });
    return new Response(JSON.stringify({ name: "n", owner: "o", scopes: ["captures"] }), { status: 200 });
  };
  const record = await checkConnection({ area, settings: SET, allowed: async () => true, fetchImpl, now: () => clock });
  assert.equal(record.state, "reachable");
  assert.ok(record.ms >= 1500);
  assert.equal(footerState(SET, record).state, "slow");
  assert.equal(asked[0][0], "https://postulo.example.org/healthz");
  assert.equal(asked[0][1].headers.Authorization, undefined);
  const before = asked.length;
  assert.equal(await checkConnection({ area, settings: { ...SET, offline: true }, allowed: async () => true, fetchImpl }), null);
  assert.equal(asked.length, before, "nothing is asked in the testing switch");
});

test("each state has a shape of its own in the footer, and the icon is named for a screen reader", () => {
  const html = readFileSync("src/popup.html", "utf8");
  const footer = html.slice(html.indexOf("<footer>"));
  assert.match(footer, /<span id="state" class="state" role="img" hidden>/);
  const shapes = [...footer.matchAll(/<svg data-state="(\w+)"/g)].map((match) => match[1]);
  assert.deepEqual(shapes.sort(), ["mailOffline", "noPermission", "online", "slow", "testing", "tokenRefused", "unreachable"]);
  assert.ok(footer.indexOf('id="state"') < footer.indexOf('id="server"'), "before the address");
  const code = readFileSync("src/popup.js", "utf8");
  assert.match(code, /setAttribute\("aria-label", words\)/);
  assert.match(code, /navigator\.onLine === false/, "no check while Thunderbird works offline");
});

test("the settings have the testing switch", () => {
  const html = readFileSync("src/options.html", "utf8");
  assert.match(html, /<input id="offline" type="checkbox"/);
  assert.match(readFileSync("src/options.js", "utf8"), /setOffline\(\$\("offline"\)\.checked\)/);
});

// WCAG contrast of the state colours against the page, light and dark, so the orange is readable.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test("the state colours pass 4.5:1 against the page in light and dark", () => {
  const css = readFileSync("src/style.css", "utf8");
  const block = (text) => Object.fromEntries([...text.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((match) => [match[1], match[2]]));
  const light = block(css.slice(css.indexOf(":root"), css.indexOf("@media")));
  const dark = block(css.slice(css.indexOf("@media (prefers-color-scheme: dark)"), css.indexOf("* {")));
  for (const [scheme, colours] of [["light", light], ["dark", dark]]) {
    for (const name of ["ok", "warn", "error", "muted"]) {
      assert.ok(ratio(colours[name], colours.paper) >= 4.5, `${scheme} --${name} ${ratio(colours[name], colours.paper).toFixed(2)}`);
    }
  }
});
