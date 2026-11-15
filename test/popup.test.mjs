// Runs with `node --test`: the popup's header and when its capture button may be pressed (#3).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { newListingUrl } from "../src/lib/api.js";
import { captureAvailability } from "../src/lib/mail.js";

const html = readFileSync("src/popup.html", "utf8");
const header = html.slice(html.indexOf("<header>"), html.indexOf("</header>"));

test("the header holds the logo, the title and the two buttons, in that order, at the end", () => {
  const order = ["<img", "<h1>", 'class="header-actions"', 'id="capture"', 'id="new-listing"'].map((mark) => header.indexOf(mark));
  assert.ok(order.every((at) => at >= 0), "all five are there");
  assert.deepEqual(order, [...order].sort((a, b) => a - b), "in that order, so the keyboard reaches capture first");
  assert.equal(html.indexOf('id="capture"'), html.lastIndexOf('id="capture"'), "the capture button is not also in the body");
});

test("each button is named in words, for a screen reader and as a tooltip", () => {
  for (const [id, key] of [["capture", "capture"], ["new-listing", "newListing"]]) {
    const tag = header.match(new RegExp(`<button id="${id}"[^>]*>`))[0];
    assert.match(tag, /aria-label="[^"]+"/);
    assert.match(tag, /title="[^"]+"/);
    assert.match(tag, new RegExp(`data-i18n-label="${key}"`));
  }
  assert.doesNotMatch(header, /<svg(?![^>]*aria-hidden="true")/, "the icons themselves are decoration");
});

test("the add-a-listing button starts hidden, until there is a Postulo to open", () => {
  assert.match(header.match(/<button id="new-listing"[^>]*>/)[0], /\shidden[\s>]/);
});

test("the capture button is off with a reason when it cannot work", () => {
  assert.deepEqual(captureAvailability(1, true), { ok: true, why: "" });
  assert.deepEqual(captureAvailability(0, true), { ok: false, why: "noMessage" });
  assert.deepEqual(captureAvailability(3, true), { ok: false, why: "severalMessages" });
  assert.deepEqual(captureAvailability(1, false), { ok: false, why: "notConnected" });
  assert.deepEqual(captureAvailability(0, false), { ok: false, why: "notConnected" });
  assert.match(header.match(/<button id="capture"[^>]*>/)[0], /\sdisabled[\s>]/, "off until the popup has looked at the message");
});

test("the from-scratch button opens Postulo's own page for adding a listing", () => {
  assert.equal(newListingUrl("https://postulo.example.org"), "https://postulo.example.org/listings/new/");
  const code = readFileSync("src/popup.js", "utf8");
  assert.match(code, /openInBrowser\(newListingUrl\(settings\.instance\)\)/);
});
