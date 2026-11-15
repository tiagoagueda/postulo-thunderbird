// The number on the toolbar button (#2): the postings captured from mail, here, that are
// still waiting for review in Postulo, once each.
//
// "Captured from mail" is what this extension sent: it remembers each capture's id when it
// sends it (`sent.js`), and counts the ones still in Postulo's list of captures to review. A
// capture sent from another Thunderbird profile is not counted here. Two captures of one
// posting count once, by the `posting_key` Postulo gives them (`waiting.js`).

import { badgeText, countPostings, lastWaiting, refreshWaiting } from "./waiting.js";

/** The rows of Postulo's list that this extension sent. */
export function ours(rows, sent) {
  const ids = new Set((sent || []).map((one) => one.id));
  return (rows || []).filter((row) => ids.has(row.id));
}

/** How many postings sent from here wait for review: one for each posting address. */
export function badgeCount(rows, sent) {
  return countPostings(ours(rows, sent), []);
}

/** The tooltip, in words: the number is said in full (the badge itself shows "99+" past 99). */
export function badgeTitle(count, t) {
  if (!count) {
    return t("actionTitle");
  }
  return count === 1 ? t("badgeWaitingOne") : t("badgeWaiting", [String(count)]);
}

/** How often the list is read with no window open, in minutes. */
export const PERIOD_MINUTES = 15;

/** A popup opening asks for a fresh list; one read this recently is fresh enough. */
export const FRESH_MS = 30_000;

/** The painting and the refreshing, over what Thunderbird supplies, so that both are tested
 *  without it. `host` is `{area, action, loadSettings, sentCaptures, allowed(settings), t}`. */
export function makeBadge(host, fetchImpl = fetch) {
  /** Paint the number from the copy of Postulo's list that was kept last. Never asks Postulo. */
  async function repaint() {
    const settings = await host.loadSettings();
    const rows = await lastWaiting(host.area, settings);
    const count = badgeCount(rows, await host.sentCaptures());
    await host.action.setBadgeText({ text: badgeText(count) });
    await host.action.setTitle({ title: badgeTitle(count, host.t) });
    return count;
  }

  /** Read Postulo's list, unless it should not be asked, and paint. A Postulo that cannot be
   *  reached leaves the number where it was. */
  async function refresh({ maxAgeMs = 0 } = {}) {
    const settings = await host.loadSettings();
    const result = await refreshWaiting({
      area: host.area,
      settings,
      allowed: () => host.allowed(settings),
      fetchImpl,
      maxAgeMs,
    });
    await repaint();
    return result;
  }

  return { repaint, refresh };
}
