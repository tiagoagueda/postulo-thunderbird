// Runs with `node --test`: the window a posting is corrected in (#5).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { DRAFT, SIZE, WINDOW, draftOf, openCaptureWindow, readDraft, windowClosed } from "../src/lib/capture-window.js";

function host() {
  const store = {};
  const calls = { created: [], updated: [] };
  let next = 100;
  return {
    store,
    calls,
    area: {
      get: async (key) => ({ [key]: store[key] }),
      set: async (items) => Object.assign(store, items),
      remove: async (keys) => [].concat(keys).forEach((key) => delete store[key]),
    },
    windows: {
      create: async (options) => {
        calls.created.push(options);
        return { id: next++ };
      },
      update: async (id, options) => {
        calls.updated.push([id, options]);
        if (id === 404) throw new Error("No window with id 404");
        return { id };
      },
    },
    url: "moz-extension://x/capture.html",
  };
}

const message = { subject: "Engineer", sender: "Cave", senderName: "Cave Johnson", messageId: "<m@x>", html: "<p>big</p>", text: "big" };
const draft = draftOf(message, [{ url: "https://e.org/j", text: "" }], "<html></html>", "key-1");

test("a draft keeps the words that name the message and not its body twice", () => {
  assert.deepEqual(Object.keys(draft.message).sort(), ["messageId", "sender", "senderName", "subject"]);
  assert.equal(draft.page, "<html></html>");
  assert.equal(draft.key, "key-1");
});

test("the first capture opens a window of the extension's own, sized for the form, and keeps the draft", async () => {
  const h = host();
  const id = await openCaptureWindow(h, draft);
  assert.equal(h.calls.created.length, 1);
  assert.deepEqual(h.calls.created[0], { url: h.url, type: "popup", ...SIZE });
  assert.equal(h.store[WINDOW], id);
  assert.deepEqual(await readDraft(h.area), draft);
});

test("a second capture while it is open brings the same window forward with the new draft", async () => {
  const h = host();
  const first = await openCaptureWindow(h, draft);
  const second = await openCaptureWindow(h, { ...draft, key: "key-2" });
  assert.equal(second, first);
  assert.equal(h.calls.created.length, 1, "no second window");
  assert.deepEqual(h.calls.updated, [[first, { focused: true }]]);
  assert.equal((await readDraft(h.area)).key, "key-2");
});

test("a window closed without our hearing of it is replaced, not an error", async () => {
  const h = host();
  h.store[WINDOW] = 404;
  const id = await openCaptureWindow(h, draft);
  assert.notEqual(id, 404);
  assert.equal(h.calls.created.length, 1);
});

test("closing the window forgets it and the message's text; another window's closing does not", async () => {
  const h = host();
  const id = await openCaptureWindow(h, draft);
  assert.equal(await windowClosed(h.area, id + 1), false);
  assert.ok(h.store[DRAFT]);
  assert.equal(await windowClosed(h.area, id), true);
  assert.equal(h.store[DRAFT], undefined);
  assert.equal(h.store[WINDOW], undefined);
});

test("a stored draft that is not one is no draft", async () => {
  const h = host();
  h.store[DRAFT] = { page: 3 };
  assert.equal(await readDraft(h.area), null);
});

test("the popup hands the message over and holds no form; the window holds it; the address opens in the web browser", () => {
  const popup = readFileSync("src/popup.html", "utf8");
  const win = readFileSync("src/capture.html", "utf8");
  assert.doesNotMatch(popup, /id="review"|id="f-title"/);
  assert.match(win, /id="review"[\s\S]*id="f-title"[\s\S]*id="send"/);
  const code = readFileSync("src/popup.js", "utf8");
  assert.match(code, /openCaptureWindow\(/);
  assert.match(code, /server\.addEventListener\("click"[\s\S]*openInBrowser\(settings\.instance\)/);
  assert.match(readFileSync("src/background.js", "utf8"), /windows\.onRemoved\.addListener/);
});
