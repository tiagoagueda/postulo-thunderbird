// Runs with `node --test`: what is read from a message to file it, what is sent, and to where.
import assert from "node:assert/strict";
import { test } from "node:test";

import { BODY_LIMIT, SUMMARY_LIMIT, chooseListings, entryFor, fileEntry, messageId, plainText } from "../src/lib/filing.js";

const header = {
  id: 7,
  author: "Ada Lovelace <ada@example.org>",
  recipients: ["me@example.org"],
  subject: "Re: Research Engineer",
  date: new Date("2026-09-20T10:30:00Z"),
  folder: { type: "inbox" },
};
const full = {
  contentType: "multipart/mixed",
  headers: {
    "message-id": ["<talk@blackmesa.example>"],
    from: ["Ada Lovelace <ada@example.org>"],
    to: ["me@example.org"],
    date: ["Sun, 20 Sep 2026 10:30:00 +0000"],
    subject: ["Re: Research Engineer"],
  },
  parts: [
    { contentType: "text/plain", body: "We would like to talk.\r\n\r\n\r\n\r\nSoon." },
    { contentType: "application/pdf", name: "job.pdf", size: 1000 },
  ],
};

function recorder(status, body) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: status < 300, status, json: async () => body };
  };
  return { calls, fetchImpl };
}

test("the Message-ID is the one the message carries, angle brackets and all", () => {
  assert.equal(messageId(full), "<talk@blackmesa.example>");
  assert.equal(messageId({ headers: {} }), "");
  assert.equal(messageId({ headers: { "message-id": ["<" + "x".repeat(300) + ">"] } }), "");
});

test("the text is the plain part, never an attachment, with runs of blank lines folded", () => {
  assert.equal(plainText(full), "We would like to talk.\n\nSoon.");
});

test("a message with only HTML is read as words, and its scripts are not", () => {
  const html = { contentType: "text/html", body: "<style>p{}</style><p>Hello &amp; welcome</p><script>alert(1)</script><p>Bye</p>" };
  assert.equal(plainText(html), ["Hello & welcome", "Bye"].join(String.fromCharCode(10)));
});

test("the entry names the identifying headers, the text, the date and the Message-ID", () => {
  const entry = entryFor(header, full);
  assert.equal(entry.kind, "email_received");
  assert.equal(entry.summary, "Research Engineer");
  assert.equal(entry.external_id, "<talk@blackmesa.example>");
  assert.equal(entry.occurred_at, "2026-09-20T10:30:00.000Z");
  assert.match(entry.body, /^From: Ada Lovelace <ada@example\.org>\nTo: me@example\.org\n/);
  assert.match(entry.body, /Message-ID: <talk@blackmesa\.example>/);
  assert.ok(entry.body.endsWith("We would like to talk.\n\nSoon."));
});

test("a message from the sent folder is the person's own words", () => {
  assert.equal(entryFor({ ...header, folder: { type: "sent" } }, full).kind, "message");
});

test("what is too long is cut here, with a mark, because Postulo refuses rather than cuts", () => {
  const long = { ...full, parts: [{ contentType: "text/plain", body: "word ".repeat(20_000) }], headers: { ...full.headers, subject: ["s".repeat(900)] } };
  const entry = entryFor(header, long);
  assert.ok(entry.body.length <= BODY_LIMIT);
  assert.ok(entry.body.endsWith("[...cut]"));
  assert.ok(entry.summary.length <= SUMMARY_LIMIT);
});

test("choosing asks the brief list, with the Message-ID, and sends the token to the address given", async () => {
  const { calls, fetchImpl } = recorder(200, { items: [{ id: 3, title: "T", company_name: "C", filed: true }], count: 1 });
  const found = await chooseListings("https://postulo.example", "tok", { q: " black ", externalId: "<a@b>" }, fetchImpl);
  assert.equal(found.items[0].filed, true);
  const { url, init } = calls[0];
  assert.ok(url.startsWith("https://postulo.example/api/v1/listings/choices?"));
  const query = new URL(url).searchParams;
  assert.equal(query.get("q"), "black");
  assert.equal(query.get("external_id"), "<a@b>");
  assert.equal(init.headers.Authorization, "Bearer tok");
  assert.equal(init.redirect, "error");
});

test("filing posts the entry to the listing and says whether it was new", async () => {
  const entry = entryFor(header, full);
  const made = recorder(201, { id: 1 });
  assert.deepEqual((await fileEntry("https://postulo.example", "tok", 42, entry, made.fetchImpl)).created, true);
  assert.equal(made.calls[0].url, "https://postulo.example/api/v1/listings/42/events");
  assert.equal(made.calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(made.calls[0].init.body), entry);
  const again = recorder(200, { id: 1 });
  assert.equal((await fileEntry("https://postulo.example", "tok", 42, entry, again.fetchImpl)).created, false);
});

test("a message with no Message-ID is not sent at all", async () => {
  const { calls, fetchImpl } = recorder(201, {});
  await assert.rejects(fileEntry("https://postulo.example", "tok", 42, entryFor(header, { ...full, headers: {} }), fetchImpl), (error) => error.key === "noMessageId");
  assert.equal(calls.length, 0);
});

test("a refused token is said, not swallowed", async () => {
  const { fetchImpl } = recorder(403, { detail: "Needs the listings:bind scope." });
  await assert.rejects(chooseListings("https://postulo.example", "tok", {}, fetchImpl), /listings:bind/);
});
