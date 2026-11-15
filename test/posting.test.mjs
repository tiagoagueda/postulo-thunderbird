// Runs with `node --test`: reading a posting out of a message (#1), without Thunderbird.
import assert from "node:assert/strict";
import { test } from "node:test";

import { corrections, formOf } from "../src/lib/correction.js";
import { bodiesOf, linksIn, pageFromMessage, postingLinks, sanitise, textToHtml } from "../src/lib/mail.js";
import { preview } from "../src/lib/postulo.js";
import { entryOf, MOST_SENT, remember, sentList, keepSent } from "../src/lib/sent.js";

const ALERT = `<html><head><title>Alert</title><style>p{color:red}</style></head><body onload="x()">
  <!-- tracking --><p>New: <a href="https://jobs.example.org/careers/123?utm=1#top" onclick="x()">Senior Engineer</a> at Aperture</p>
  <script>steal()</script><img src="https://tracker.example.net/open.gif"><p><a href='https://example.org/unsubscribe?u=1'>Unsubscribe</a></p>
  <a href="https://twitter.com/aperture">Follow us</a><a href="mailto:jobs@example.org">Mail</a><a href="javascript:alert(1)">x</a></body></html>`;

test("the message's HTML loses what runs or loads, and keeps its words and its links' addresses", () => {
  const clean = sanitise(ALERT);
  assert.doesNotMatch(clean, /script|steal|style|color:red|onload|onclick|img|tracker|tracking|<head|<title/i);
  assert.match(clean, /<p>New: <a href="https:\/\/jobs\.example\.org\/careers\/123\?utm=1#top">Senior Engineer<\/a> at Aperture<\/p>/);
  assert.doesNotMatch(clean, /javascript:/);
});

test("a stray angle bracket stays text and cannot start a tag in the page built around it", () => {
  const clean = sanitise("<p>1 < 2 and <b>bold</b> <b");
  assert.ok(!/<\s*b\s*$/.test(clean), clean);
  assert.match(clean, /1 &lt; 2/);
});

test("sanitising a hostile message is one pass, not a quadratic one", () => {
  for (const hostile of ["<".repeat(300_000), "<a ".repeat(100_000), "<script>".repeat(50_000), `<!--${"<".repeat(300_000)}`, "<p>".repeat(100_000)]) {
    const start = performance.now();
    sanitise(hostile);
    linksIn({ html: hostile, text: hostile });
    assert.ok(performance.now() - start < 500, `took ${Math.round(performance.now() - start)} ms for ${hostile.slice(0, 10)}`);
  }
});

test("the body is cut to its limit", () => {
  assert.ok(sanitise(`<p>${"x".repeat(900_000)}</p>`).length <= 400_000);
});

test("a plain-text message becomes paragraphs, with its angle brackets escaped", () => {
  assert.equal(textToHtml("Hello <b>\nthere\n\nSecond"), "<p>Hello &lt;b&gt;<br>there</p>\n<p>Second</p>");
});

test("the text and HTML parts are found in the tree, and an attachment is not one", () => {
  const tree = {
    contentType: "multipart/mixed",
    parts: [
      { contentType: "multipart/alternative", parts: [
        { contentType: "text/plain", body: "plain" },
        { contentType: "text/html", body: "<p>html</p>" },
      ] },
      { contentType: "text/plain", name: "notes.txt", body: "attached" },
    ],
  };
  assert.deepEqual(bodiesOf(tree), { html: "<p>html</p>", text: "plain" });
  assert.deepEqual(bodiesOf(null), { html: "", text: "" });
});

test("links come from the HTML and the text, and the plainly-not-the-posting ones are left out", () => {
  const links = postingLinks(linksIn({ html: ALERT, text: "See https://jobs.example.org/careers/123, or https://other.example.org/p/9." }));
  assert.deepEqual(links.map((link) => link.url), ["https://jobs.example.org/careers/123?utm=1", "https://jobs.example.org/careers/123", "https://other.example.org/p/9"]);
  assert.equal(links[0].text, "Senior Engineer");
  assert.ok(links.every((link) => !/unsubscribe|twitter|mailto|javascript/.test(link.url)));
});

test("a link written twice is offered once, and the ones that look like a job come first", () => {
  const found = postingLinks([
    { url: "https://example.org/news", text: "News" },
    { url: "https://example.org/job/1#a", text: "Apply" },
    { url: "https://example.org/job/1#b", text: "Apply again" },
  ]);
  assert.deepEqual(found.map((link) => link.url), ["https://example.org/job/1", "https://example.org/news"]);
});

test("a message with no web link has no candidate", () => {
  assert.deepEqual(postingLinks(linksIn({ html: "<p>Call me on 555-0100</p>", text: "Call me" })), []);
});

test("the page sent is the body under the subject as its title; with no text or no title it is nothing", () => {
  const page = pageFromMessage({ subject: "Re: Engineer <wanted>", html: "<p>Join us</p><script>x</script>" });
  assert.match(page, /<title>Engineer &lt;wanted&gt;<\/title>/);
  assert.match(page, /<h1>Engineer &lt;wanted&gt;<\/h1><p>Join us<\/p><\/body>/);
  assert.doesNotMatch(page, /script/);
  assert.match(pageFromMessage({ subject: "Hi", text: "Join us" }), /<p>Join us<\/p>/);
  assert.equal(pageFromMessage({ subject: "Hi", html: "<img src=x>" }), "");
  assert.equal(pageFromMessage({ subject: "", text: "Join us" }), "");
});

test("the form is what Postulo read; the subject and the sender stand in where it read nothing", () => {
  const read = { data: { title: "Engineer", company_name: "Aperture", location: "Lisbon" } };
  assert.deepEqual(formOf(read, { subject: "S", senderName: "Cave" }), {
    values: { title: "Engineer", company_name: "Aperture", location: "Lisbon" },
    guessed: false,
  });
  assert.deepEqual(formOf({ data: {} }, { subject: "Subject", senderName: "Cave Johnson" }), {
    values: { title: "Subject", company_name: "Cave Johnson", location: "" },
    guessed: true,
  });
  assert.equal(formOf(null, { subject: "S", senderName: "" }).guessed, false);
});

test("only what the person changed is sent as a correction; an emptied field is left alone", () => {
  const read = { data: { title: "Engineer", company_name: "Aperture", location: "" } };
  assert.deepEqual(corrections(read, { title: "Engineer ", company_name: "Black Mesa", location: "Porto" }), { company_name: "Black Mesa", location: "Porto" });
  assert.deepEqual(corrections(read, { title: "", company_name: "Aperture", location: "" }), {});
  assert.deepEqual(corrections({ data: {} }, { title: "S", company_name: "Cave", location: "" }), { title: "S", company_name: "Cave" });
});

test("preview asks Postulo's preview with the token and the page, and reads the answer", async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    return new Response(JSON.stringify({ url: "https://e.org/j", source: "x", data: { title: "T" }, hinted: [] }), { status: 200 });
  };
  const answer = await preview("https://postulo.example.org", "tok", { url: "https://e.org/j", html: "<p>x</p>" }, fetchImpl);
  assert.equal(answer.data.title, "T");
  assert.equal(seen.url, "https://postulo.example.org/api/v1/captures/preview");
  assert.equal(seen.init.method, "POST");
  assert.equal(seen.init.headers.Authorization, "Bearer tok");
  assert.equal(seen.init.redirect, "error");
  assert.deepEqual(JSON.parse(seen.init.body), { url: "https://e.org/j", html: "<p>x</p>" });
});

test("what is kept of a sent capture is its id and the words that name its message", () => {
  const entry = entryOf({ id: 7, review_url: "https://p/review/7" }, { messageId: "<a@b>", subject: "S", sender: "Cave" }, new Date("2026-11-15T10:00:00Z"));
  assert.deepEqual(entry, { id: 7, reviewUrl: "https://p/review/7", messageId: "<a@b>", subject: "S", sender: "Cave", at: "2026-11-15T10:00:00.000Z" });
  const list = remember(remember([], entry), { ...entry, id: 8 });
  assert.deepEqual(list.map((one) => one.id), [8, 7]);
  assert.deepEqual(remember(list, { ...entry, id: 7 }).map((one) => one.id), [7, 8]);
  let many = [];
  for (let id = 0; id < MOST_SENT + 5; id++) many = remember(many, { ...entry, id });
  assert.equal(many.length, MOST_SENT);
});

test("the list is kept in a storage area and read back", async () => {
  const store = {};
  const area = {
    get: async (key) => ({ [key]: store[key] }),
    set: async (items) => Object.assign(store, items),
  };
  assert.deepEqual(await sentList(area), []);
  await keepSent(area, { id: 1 });
  assert.deepEqual(await sentList(area), [{ id: 1 }]);
});
