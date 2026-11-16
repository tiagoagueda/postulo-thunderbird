// Runs with `node --test`: filing a message into a listing's history (#9).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { BODY_MAX, EXTERNAL_ID_MAX, SUMMARY_MAX, entryFor, plainText, rankChoices, withoutQuotes } from "../src/lib/filing.js";
import { addListingEvent, listingChoices } from "../src/lib/postulo.js";
import { abilities, judgeScopes } from "../src/lib/scopes.js";

const MESSAGE = {
  subject: "Re: Your application: Senior Engineer",
  author: "Cave Johnson <jobs@aperture.example>",
  senderName: "Cave Johnson",
  address: "jobs@aperture.example",
  sentAt: "2026-11-14T09:30:00.000Z",
  messageId: "<abc123@mail.aperture.example>",
  text: "Hello,\n\nWe would like to talk on Monday.\n\nCave\n\nOn Fri, 13 Nov 2026, Ada wrote:\n> I applied\n> yesterday\n",
  html: "",
};

test("the text goes without the replies quoted under it and the signature", () => {
  assert.equal(withoutQuotes(MESSAGE.text), "Hello,\n\nWe would like to talk on Monday.\n\nCave");
  assert.equal(withoutQuotes("Yes.\n> quoted\nStill me.\n-- \nCave\nAperture"), "Yes.\nStill me.");
  assert.equal(withoutQuotes("Oui.\n\nLe 13 nov. 2026 à 10:00, Ada a écrit :\n> bonjour"), "Oui.");
  assert.equal(withoutQuotes("Ok\n-----Original Message-----\nFrom: x"), "Ok");
  assert.equal(withoutQuotes("Ok\n\nFrom: Ada <a@b.c>\nSent: Monday\nTo: me\nbody"), "Ok");
  assert.equal(withoutQuotes("From: me is where I start a sentence\nand go on"), "From: me is where I start a sentence\nand go on");
  assert.equal(withoutQuotes("x".repeat(BODY_MAX + 100)).length, BODY_MAX);
});

test("an HTML-only message is read as its text, with nothing that runs", () => {
  const text = plainText({ html: "<p>Hello &amp; welcome</p><script>x()</script><p>Second<br>line</p>" });
  assert.equal(text.trim(), "Hello & welcome\n\nSecond\nline".replace("\n\n", "\n"));
  assert.doesNotMatch(text, /x\(\)|</);
});

test("the entry is the cleaned subject, the date sent and the Message-ID, so filing twice leaves one", () => {
  const entry = entryFor(MESSAGE);
  assert.deepEqual(entry, {
    kind: "email_received",
    summary: "Your application: Senior Engineer",
    body: "Hello,\n\nWe would like to talk on Monday.\n\nCave",
    occurred_at: "2026-11-14T09:30:00.000Z",
    external_id: "<abc123@mail.aperture.example>",
  });
  assert.equal(entryFor(MESSAGE, { subjectOnly: true }).body, "");
  assert.equal(entryFor({ ...MESSAGE, subject: "y".repeat(400) }).summary.length, SUMMARY_MAX);
  assert.equal("occurred_at" in entryFor({ ...MESSAGE, sentAt: "" }), false);
});

test("the listing that looks like the message comes first: the sender's company, then shared words", () => {
  const choices = [
    { id: 1, title: "Gardener", company_name: "Black Mesa" },
    { id: 2, title: "Senior Engineer", company_name: "Other Co" },
    { id: 3, title: "Test Subject", company_name: "Aperture" },
  ];
  const ranked = rankChoices(choices, MESSAGE);
  assert.deepEqual(ranked.map((one) => [one.id, one.suggested]), [[3, true], [2, true], [1, false]]);
  assert.deepEqual(rankChoices(choices, { subject: "Hello", address: "x@y.example" }).map((one) => one.id), [1, 2, 3], "nothing matches: Postulo's order stays");
  assert.deepEqual(rankChoices([{ id: 9, title: "Cook", company_name: "Initech" }], { subject: "Hi", address: "hr@initech.com" })[0].suggested, true, "the domain names the company");
});

test("the choices are asked narrowed by words, and a filing says whether it added anything", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push([url, init]);
    if (String(url).includes("/choices")) return new Response(JSON.stringify({ items: [{ id: 5 }], count: 1 }), { status: 200 });
    return new Response(JSON.stringify({ id: 77 }), { status: seen.length > 2 ? 200 : 201 });
  };
  const answer = await listingChoices("https://p.example.org", "tok", { q: " Aperture & co " }, fetchImpl);
  assert.equal(answer.count, 1);
  assert.equal(seen[0][0], "https://p.example.org/api/v1/listings/choices?limit=50&q=Aperture%20%26%20co");
  assert.equal(seen[0][1].method, "GET");
  assert.equal(seen[0][1].headers.Authorization, "Bearer tok");
  assert.equal("body" in seen[0][1], false);
  const first = await addListingEvent("https://p.example.org", "tok", 5, entryFor(MESSAGE), fetchImpl);
  assert.equal(first.created, true);
  assert.equal(seen[1][0], "https://p.example.org/api/v1/listings/5/events");
  assert.equal(JSON.parse(seen[1][1].body).external_id, MESSAGE.messageId);
  const again = await addListingEvent("https://p.example.org", "tok", 5, entryFor(MESSAGE), fetchImpl);
  assert.equal(again.created, false, "the same external_id: 200, nothing added");
});

test("the popup offers filing only to a token that holds listings:bind", () => {
  assert.deepEqual(abilities({ scopes: ["captures"] }), { capture: true, file: false });
  assert.deepEqual(abilities({ scopes: ["captures", "listings:bind"] }), { capture: true, file: true });
  assert.deepEqual(abilities({ scopes: ["listings:bind"] }), { capture: false, file: true });
  assert.deepEqual(abilities(null), { capture: false, file: false });
  assert.equal(judgeScopes({ scopes: ["listings:bind"] }).extra.length, 0, "and that token is not too wide");
  const code = readFileSync("src/popup.js", "utf8");
  assert.match(code, /abilities\(\{ scopes: await scopesOfToken\(settings\) \}\)\.file/);
});

test("the settings say what the token allows and keep it for the popup; forgetting the token forgets it", () => {
  const code = readFileSync("src/options.js", "utf8");
  assert.match(code, /keepScopes\(me\.scopes\)/);
  assert.match(code, /tokenCanFile[\s\S]*tokenCannotFile/);
  assert.match(readFileSync("src/lib/thunderbird.js", "utf8"), /remove\(\["token", "scopes"\]\)/);
});

test("the choices are asked with the message's id, and the popup says where it is already filed (#271)", async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(String(url));
    return new Response(JSON.stringify({ items: [{ id: 5, filed: true }], count: 1 }), { status: 200 });
  };
  await listingChoices("https://p.example.org", "tok", { q: "a", externalId: "<abc@x.example>" }, fetchImpl);
  assert.equal(seen[0], "https://p.example.org/api/v1/listings/choices?limit=50&q=a&external_id=%3Cabc%40x.example%3E");
  await listingChoices("https://p.example.org", "tok", { externalId: "  " }, fetchImpl);
  assert.equal(seen[1], "https://p.example.org/api/v1/listings/choices?limit=50", "no id, nothing asked about it");
  await listingChoices("https://p.example.org", "tok", { externalId: "y".repeat(400) }, fetchImpl);
  assert.equal(decodeURIComponent(seen[2].split("external_id=")[1]).length, EXTERNAL_ID_MAX);
  const ranked = rankChoices([{ id: 1, title: "A", company_name: "B", filed: true }, { id: 2, title: "C", company_name: "D" }], { subject: "x" });
  assert.deepEqual(ranked.map((one) => one.filed === true), [true, false], "ranking keeps what Postulo said");
  const code = readFileSync("src/popup.js", "utf8");
  assert.match(code, /externalId: filing\.message\.messageId/);
  assert.match(code, /choice\.filed[\s\S]*t\("filedHere"\)/);
  assert.doesNotMatch(readFileSync("src/_locales/en/messages.json", "utf8"), /which is not built yet/);
});
