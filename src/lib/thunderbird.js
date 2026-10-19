// Thunderbird exposes `messenger`, and `browser` as an alias of it: pick whichever exists.
// Everything that touches Thunderbird's own API is here, so the modules shared with the
// browser extension (`api.js`, `i18n.js`) stay free of it.

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

/** The header of the message Thunderbird is showing in the current tab, or null.
 *
 *  In Manifest V3 `getDisplayedMessages` answers a list object with a `messages` array;
 *  older Thunderbirds answered the array itself. Both are read, and only the first message
 *  counts: several selected at once is not one posting. */
export async function displayedMessage() {
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    return null;
  }
  const shown = await ext.messageDisplay.getDisplayedMessages(tab.id);
  const messages = Array.isArray(shown) ? shown : (shown && shown.messages) || [];
  return messages[0] || null;
}
