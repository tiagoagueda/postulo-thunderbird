// Thunderbird exposes `messenger`, and `browser` as an alias of it: pick whichever exists.
// Everything that touches Thunderbird's own API is here, so the modules shared with the
// browser extension (`api.js`, `i18n.js`) stay free of it.

import { bodiesOf, splitAuthor, summarise } from "./mail.js";
import { keepSent, sentList } from "./sent.js";

export const ext = globalThis.messenger ?? globalThis.browser;

/** Where the person's Postulo is, and the token to reach it with. */
export async function loadSettings() {
  const stored = await ext.storage.local.get(["instance", "token"]);
  return { instance: stored.instance || "", token: stored.token || "" };
}

export async function saveSettings({ instance, token }) {
  await ext.storage.local.set({ instance, token });
}

/** Remove the token from this profile and leave the address. `storage.local` is the only place
 *  an extension can keep it and it is not encrypted (README, "Privacy"), so the person can
 *  take it out; it keeps working in Postulo until it is revoked there. */
export async function forgetToken() {
  await ext.storage.local.remove("token");
}

/** Open the settings: where Thunderbird keeps an add-on's own, or in a tab if it will not. */
export async function openSettings() {
  try {
    await ext.runtime.openOptionsPage();
  } catch {
    await ext.tabs.create({ url: ext.runtime.getURL("options.html") });
  }
}

/** Ask for the instance's origin. Thunderbird grants nothing at install, so this is asked
 *  from the click that saves or tests the address. */
export async function requestHostPermission(pattern) {
  return ext.permissions.request({ origins: [pattern] });
}

/** The headers of the messages Thunderbird is showing in the current tab: none, one, or the
 *  several that are selected.
 *
 *  In Manifest V3 `getDisplayedMessages` answers a list object with a `messages` array;
 *  older Thunderbirds answered the array itself. Both are read. */
export async function displayedMessages() {
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    return [];
  }
  const shown = await ext.messageDisplay.getDisplayedMessages(tab.id);
  return Array.isArray(shown) ? shown : (shown && shown.messages) || [];
}

/** The message on screen, read whole: its summary, its `Message-ID`, and its HTML and text
 *  (`messages.getFull`, under `messagesRead`). Read when the person presses a button, never
 *  before, and kept nowhere. */
export async function readMessage(header) {
  const summary = summarise(header);
  const { html, text } = bodiesOf(await ext.messages.getFull(header.id));
  return {
    ...summary,
    senderName: splitAuthor(header.author).name,
    id: header.id,
    messageId: header.headerMessageId || "",
    html,
    text,
  };
}

/** Open an address of Postulo's in the person's own web browser, where they are signed in:
 *  a tab or a window inside Thunderbird has cookies of its own and would ask them to sign in
 *  again. Only a web address is opened. */
export async function openInBrowser(url) {
  if (!/^https?:\/\//i.test(String(url || ""))) {
    return;
  }
  await ext.windows.openDefaultBrowser(url);
}

/** The captures sent from this profile, newest first, and the keeping of one. */
export const sentCaptures = () => sentList(ext.storage.local);
export const keepSentCapture = (entry) => keepSent(ext.storage.local, entry);
