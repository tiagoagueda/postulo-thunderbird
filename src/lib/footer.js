// What the popup's footer shows before the address (#6): whether Postulo answers.
//
// The connection record and the six states are postulo-chromium's (`connection.js`); what a
// mail client adds is that Thunderbird itself can be working offline (File > Offline > Work
// Offline), when Postulo may be up and it is Thunderbird that sends nothing. That is its own
// state, said in words, and not the red cross, which would blame Postulo.

import { footerFor } from "./connection.js";

/** The message that says each state, for the title and the screen reader. The six of
 *  `footerFor` name theirs; this one is ours. */
const MAIL_OFFLINE = { state: "mailOffline", key: "thunderbirdOffline" };

/**
 * `{state, key}` for the footer, or null for nothing (not set up, or nothing learnt yet).
 * The testing switch comes first, since it is the person's own; then Thunderbird working
 * offline, with no check made while it lasts; then what was learnt of Postulo.
 * `online` is `navigator.onLine`: false while Thunderbird is offline.
 */
export function footerState(settings, record, live = {}, online = true) {
  if (!settings.instance || !settings.token) {
    return null;
  }
  if (!settings.offline && online === false) {
    return MAIL_OFFLINE;
  }
  return footerFor(settings, record, live);
}
