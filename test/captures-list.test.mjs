// Runs with `node --test`: the list of captures that need review, in the popup (#4).
import assert from "node:assert/strict";
import { test } from "node:test";

import { allCapturesUrl, instanceLink, listRows, rowLines } from "../src/lib/captures-list.js";

const INSTANCE = "https://postulo.example.org";
const row = (id, key, at, extra = {}) => ({
  id, posting_key: key, title: `T${id}`, company_name: "Aperture", location: "Lisbon", created_at: at,
  review_url: `${INSTANCE}/jobs/captures/${id}/review/`, ...extra,
});

test("three captures waiting are three rows, newest first, each linking to its review", () => {
  const waiting = [row(1, "a", "2026-11-01T10:00:00Z"), row(3, "c", "2026-11-03T10:00:00Z"), row(2, "b", "2026-11-02T10:00:00Z")];
  const { rows, total } = listRows(waiting, [], INSTANCE);
  assert.equal(total, 3);
  assert.deepEqual(rows.map((one) => one.id), [3, 2, 1]);
  assert.equal(rows[0].link, `${INSTANCE}/jobs/captures/3/review/`);
  assert.ok(rows.every((one) => one.fromMail === null));
});

test("two captures of one posting are one row that says how many there are", () => {
  const { rows, total } = listRows([row(1, "a", "2026-11-01T10:00:00Z"), row(2, "a", "2026-11-02T10:00:00Z")], [], INSTANCE);
  assert.equal(total, 1);
  assert.equal(rows[0].count, 2);
  assert.equal(rows[0].id, 2);
});

test("the ones this extension sent are marked with the message they came from; the others are not", () => {
  const waiting = [row(1, "a", "2026-11-01T10:00:00Z"), row(2, "b", "2026-11-02T10:00:00Z"), row(3, "a", "2026-11-03T10:00:00Z")];
  const sent = [
    { id: 1, messageId: "<m1@x>", subject: "Old", sender: "A", at: "2026-11-01T10:00:01Z" },
    { id: 3, messageId: "<m3@x>", subject: "Newer", sender: "B", at: "2026-11-03T10:00:01Z" },
  ];
  const { rows } = listRows(waiting, sent, INSTANCE);
  const byKey = Object.fromEntries(rows.map((one) => [one.key, one]));
  assert.equal(byKey.b.fromMail, null);
  assert.equal(byKey.a.fromMail.messageId, "<m3@x>", "the newest sent of the posting stands for it");
});

test("only the newest few are drawn, the total says how many there are", () => {
  const waiting = Array.from({ length: 8 }, (_, index) => row(index + 1, `k${index}`, `2026-11-0${index + 1}T10:00:00Z`));
  const { rows, total } = listRows(waiting, [], INSTANCE);
  assert.equal(total, 8);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].id, 8);
});

test("nothing waiting is no rows, and a missing list is no rows", () => {
  assert.deepEqual(listRows([], [], INSTANCE), { rows: [], total: 0 });
  assert.deepEqual(listRows(undefined, undefined, INSTANCE), { rows: [], total: 0 });
});

test("a row opens only an address on Postulo's own origin", () => {
  assert.equal(instanceLink(`${INSTANCE}/jobs/captures/1/review/`, INSTANCE), `${INSTANCE}/jobs/captures/1/review/`);
  assert.equal(instanceLink("https://evil.example.net/jobs/captures/1/review/", INSTANCE), "");
  assert.equal(instanceLink("javascript:alert(1)", INSTANCE), "");
  assert.equal(instanceLink("", INSTANCE), "");
  assert.equal(listRows([row(1, "a", "2026-11-01T10:00:00Z", { review_url: "https://evil.example.net/x" })], [], INSTANCE).rows[0].link, "");
  assert.equal(allCapturesUrl(INSTANCE), `${INSTANCE}/jobs/captures/`);
});

test("each row says in words what it is, where it waits and where it came from", () => {
  const t = (key, subs = []) => `${key}${subs.length ? `(${subs.join("|")})` : ""}`;
  const day = (iso) => iso.slice(0, 10);
  const { rows } = listRows([row(1, "a", "2026-11-01T10:00:00Z"), row(2, "a", "2026-11-02T10:00:00Z")], [{ id: 2, messageId: "<m@x>", subject: "Engineer", sender: "Cave", at: "x" }], INSTANCE);
  assert.deepEqual(rowLines(rows[0], { t, day }), {
    title: "T2",
    meta: "Aperture, Lisbon · 2026-11-02 · waitingInPostulo · capturesOfPosting(2)",
    origin: "fromMessage(Engineer|Cave)",
  });
  assert.equal(rowLines({ ...rows[0], title: "", fromMail: null, count: 1 }, { t, day }).title, "untitled");
});

test("a message since deleted is said, not an error: opening it reports whether it was there", async () => {
  const calls = [];
  globalThis.messenger = {
    messageDisplay: {
      open: async (options) => {
        calls.push(options);
        if (options.headerMessageId === "<gone@x>") throw new Error("Unknown message");
      },
    },
  };
  const { openMessage } = await import("../src/lib/thunderbird.js");
  assert.equal(await openMessage("<here@x>"), true);
  assert.equal(await openMessage("<gone@x>"), false);
  assert.equal(await openMessage(""), false);
  assert.deepEqual(calls[0], { headerMessageId: "<here@x>", location: "tab" });
});
