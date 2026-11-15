// The list of captures that need review, in the popup (#4): every capture waiting in Postulo,
// one row for each posting, newest first, with the ones this extension sent marked and able to
// open the message they came from again. The rows themselves are postulo-chromium's
// (`review.js`); what this adds is what only a mail client has.

import { reviewRows, MOST_ROWS } from "./review.js";
import { rowKey } from "./waiting.js";

export { MOST_ROWS };

/** `link` if it is an address on the instance's own origin, else "": only Postulo's own
 *  pages are opened from a row, whatever a copy of its list holds (SEC2-079). */
export function instanceLink(link, instance) {
  try {
    const target = new URL(link);
    const own = new URL(instance);
    return target.origin === own.origin ? target.href : "";
  } catch {
    return "";
  }
}

/** Postulo's page of every capture waiting, to open when the popup shows only the newest few. */
export function allCapturesUrl(instance) {
  return `${instance}/jobs/captures/`;
}

/**
 * The rows to draw: `{rows, total}` as `reviewRows` makes them from Postulo's list `waiting`,
 * each with `link` made safe and `fromMail`: the entry of `sent` for the newest capture of that
 * posting this extension sent, or null. `sent` is the list `sent.js` keeps.
 */
export function listRows(waiting, sent, instance, limit = MOST_ROWS) {
  const mine = new Map();
  const byId = new Map((sent || []).map((entry) => [entry.id, entry]));
  for (const row of waiting || []) {
    const entry = byId.get(row.id);
    const key = rowKey(row);
    if (entry && (!mine.has(key) || entry.at > mine.get(key).at)) {
      mine.set(key, entry);
    }
  }
  const { rows, total } = reviewRows(waiting || [], [], limit);
  return {
    total,
    rows: rows.map((row) => ({ ...row, link: instanceLink(row.link, instance), fromMail: mine.get(row.key) || null })),
  };
}

/** The lines a row says, as plain text, in words: `{title, meta, origin}`. `say` is the
 *  translation function and `day` writes a date in the person's language; each is a parameter
 *  so that this is tested without Thunderbird. */
export function rowLines(row, { t, day }) {
  const where = [row.company_name, row.location].filter(Boolean).join(", ");
  return {
    title: row.title || t("untitled"),
    meta: [[where, day(row.at)].filter(Boolean).join(" · "), t("waitingInPostulo"), row.count > 1 ? t("capturesOfPosting", [String(row.count)]) : ""]
      .filter(Boolean)
      .join(" · "),
    origin: row.fromMail ? t("fromMessage", [row.fromMail.subject || t("noSubject"), row.fromMail.sender || ""]) : "",
  };
}
