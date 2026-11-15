// Runs with `node --test`: the number on the toolbar button (#2).
import assert from "node:assert/strict";
import { test } from "node:test";

import { badgeCount, badgeTitle, makeBadge, ours } from "../src/lib/badge.js";
import { WAITING, badgeText } from "../src/lib/waiting.js";

const row = (id, key) => ({ id, posting_key: key, title: `T${id}`, created_at: "2026-11-01T10:00:00Z", review_url: `https://p/review/${id}` });

test("only what this extension sent is counted, and a posting once however often it was captured", () => {
  const rows = [row(1, "a"), row(2, "a"), row(3, "b"), row(4, "c")];
  const sent = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.deepEqual(ours(rows, sent).map((one) => one.id), [1, 2, 3]);
  assert.equal(badgeCount(rows, sent), 2); // a (twice) and b; c came from elsewhere
  assert.equal(badgeCount(rows, []), 0);
  assert.equal(badgeCount([], sent), 0);
});

test("a capture reviewed in Postulo leaves its list, and so the number", () => {
  const sent = [{ id: 1 }, { id: 2 }];
  assert.equal(badgeCount([row(1, "a"), row(2, "b")], sent), 2);
  assert.equal(badgeCount([row(2, "b")], sent), 1);
});

test("the badge says nothing for none and 99+ past what fits; the tooltip says the number in words", () => {
  assert.equal(badgeText(0), "");
  assert.equal(badgeText(7), "7");
  assert.equal(badgeText(100), "99+");
  const t = (key, subs = []) => `${key}:${subs.join()}`;
  assert.equal(badgeTitle(0, t), "actionTitle:");
  assert.equal(badgeTitle(1, t), "badgeWaitingOne:");
  assert.equal(badgeTitle(120, t), "badgeWaiting:120");
});

function host({ rows, sent, settings = { instance: "https://p.example.org", token: "tok" } }) {
  const store = rows ? { [WAITING]: { at: "2026-11-15T09:00:00Z", rows } } : {};
  const painted = {};
  const made = {
    area: {
      get: async (key) => ({ [key]: store[key] }),
      set: async (items) => Object.assign(store, items),
    },
    action: {
      setBadgeText: async ({ text }) => (painted.text = text),
      setTitle: async ({ title }) => (painted.title = title),
    },
    loadSettings: async () => settings,
    sentCaptures: async () => sent,
    allowed: async () => true,
    t: (key, subs = []) => `${key}:${subs.join()}`,
  };
  return { made, painted, store };
}

const answer = (items) => async () => new Response(JSON.stringify({ items, count: items.length }), { status: 200 });

test("repainting uses the copy kept and asks nobody: the number is there as Thunderbird starts", async () => {
  const { made, painted } = host({ rows: [row(1, "a"), row(2, "b")], sent: [{ id: 1 }, { id: 2 }] });
  const badge = makeBadge(made, () => assert.fail("repaint must not ask Postulo"));
  assert.equal(await badge.repaint(), 2);
  assert.deepEqual(painted, { text: "2", title: "badgeWaiting:2" });
});

test("refreshing reads Postulo's list, keeps it and paints it", async () => {
  const { made, painted, store } = host({ rows: [], sent: [{ id: 5 }, { id: 6 }] });
  const badge = makeBadge(made, answer([row(5, "k"), row(6, "k")]));
  assert.equal((await badge.refresh()).outcome, "read");
  assert.equal(painted.text, "1");
  assert.equal(store[WAITING].rows.length, 2);
});

test("with Postulo unreachable the last number stays", async () => {
  const { made, painted } = host({ rows: [row(1, "a")], sent: [{ id: 1 }] });
  const badge = makeBadge(made, async () => {
    throw new TypeError("network down");
  });
  assert.equal((await badge.refresh()).outcome, "unreachable");
  assert.equal(painted.text, "1");
});

test("nothing is asked before Postulo is set up, or when the origin was not allowed", async () => {
  const unset = host({ rows: null, sent: [], settings: { instance: "", token: "" } });
  assert.equal((await makeBadge(unset.made, () => assert.fail("asked")).refresh()).outcome, "skipped");
  assert.equal(unset.painted.text, "");
  const refused = host({ rows: [], sent: [] });
  refused.made.allowed = async () => false;
  assert.equal((await makeBadge(refused.made, () => assert.fail("asked")).refresh()).outcome, "skipped");
});

test("a list read a moment ago is not read again when the popup asks", async () => {
  const { made } = host({ rows: [row(1, "a")], sent: [{ id: 1 }] });
  const badge = makeBadge(made, () => assert.fail("asked"));
  const result = await badge.refresh({ maxAgeMs: 10 * 365 * 24 * 3600 * 1000 });
  assert.equal(result.outcome, "skipped");
});

test("the background asks for the alarm permission it needs, and its listeners are registered first", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync("src/background.js", "utf8");
  assert.match(source, /alarms\.onAlarm\.addListener/);
  assert.match(source, /alarms\.create\(/);
  assert.ok(source.indexOf("onAlarm.addListener") < source.indexOf("alarms.create("));
});
