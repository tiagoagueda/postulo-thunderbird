// Runs with `node --test`: what the popup says about the message on screen.
import assert from "node:assert/strict";
import { test } from "node:test";

import { cleanSubject, splitAuthor, summarise } from "../src/lib/mail.js";

test("a subject loses the marks of a reply or a forward, however many", () => {
  assert.equal(cleanSubject("Re: Fwd: Senior Engineer at Aperture"), "Senior Engineer at Aperture");
  assert.equal(cleanSubject("TR : Offre d'emploi"), "Offre d'emploi");
  assert.equal(cleanSubject("WG: AW: Stellenangebot"), "Stellenangebot");
  assert.equal(cleanSubject("ENC: Vaga de engenheiro"), "Vaga de engenheiro");
  assert.equal(cleanSubject("Re[2]: Your application"), "Your application");
});

test("a subject that only looks like one keeps its words", () => {
  assert.equal(cleanSubject("Recruiting: three openings"), "Recruiting: three openings");
  assert.equal(cleanSubject("  Engineer wanted  "), "Engineer wanted");
  assert.equal(cleanSubject(undefined), "");
});

test("an author is a name and an address, or whichever of them there is", () => {
  assert.deepEqual(splitAuthor("Ada Lovelace <ada@example.org>"), { name: "Ada Lovelace", address: "ada@example.org" });
  assert.deepEqual(splitAuthor('"Lovelace, Ada" <ada@example.org>'), { name: "Lovelace, Ada", address: "ada@example.org" });
  assert.deepEqual(splitAuthor("jobs@example.org"), { name: "", address: "jobs@example.org" });
  assert.deepEqual(splitAuthor("<jobs@example.org>"), { name: "", address: "jobs@example.org" });
  assert.deepEqual(splitAuthor("Aperture Recruiting"), { name: "Aperture Recruiting", address: "" });
  assert.deepEqual(splitAuthor(""), { name: "", address: "" });
});

test("a message is summed up as its subject, its sender and when it was sent", () => {
  const header = {
    subject: "Fwd: Test Engineer at Aperture Science",
    author: "Cave Johnson <cave@aperture.example>",
    date: new Date("2026-09-30T08:15:00Z"),
  };
  assert.deepEqual(summarise(header), {
    subject: "Test Engineer at Aperture Science",
    sender: "Cave Johnson",
    address: "cave@aperture.example",
    sentAt: "2026-09-30T08:15:00.000Z",
  });
});

test("a message with nothing to say for itself is summed up as nothing, not as an error", () => {
  assert.deepEqual(summarise({}), { subject: "", sender: "", address: "", sentAt: "" });
  assert.deepEqual(summarise(null), { subject: "", sender: "", address: "", sentAt: "" });
  assert.equal(summarise({ author: "jobs@example.org", date: "not a date" }).sender, "jobs@example.org");
});
