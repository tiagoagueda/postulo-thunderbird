// The list of captures that need review, in the popup: the postings the badge counts.
//
// The same two places and the same rule as the number: what waits in Postulo (the copy of
// its list) and what is here not yet sent, one row for each posting by Postulo's `posting_key`. A row
// stands for the newest capture in Postulo if there is one, else the newest here, and says
// how many captures there are of that posting.

import { UNSENT } from "./store.js";
import { recordKey, rowKey } from "./waiting.js";

/** The most rows the popup draws before it links to the rest. */
export const MOST_ROWS = 5;

const time = (iso) => {
  const at = Date.parse(iso);
  return Number.isFinite(at) ? at : 0;
};

/**
 * The rows, newest first: `{rows, total}`, `rows` cut to `limit` and `total` the postings
 * in all. A row is `{key, kind, id, title, company_name, location, at, count, state, link}`:
 * `kind` is `postulo` (then `link` is Postulo's review address) or `here` (then `state` is
 * kept, waiting or refused, and `link` is empty: the popup opens the capture's form in the review window).
 */
export function reviewRows(waiting, records, limit = MOST_ROWS) {
  const postings = new Map();
  const place = (key, candidate) => {
    const found = postings.get(key);
    if (!found) {
      postings.set(key, { ...candidate, count: 1 });
      return;
    }
    found.count += 1;
    // Postulo's capture stands for the posting; between two of one place the newer does.
    if ((candidate.kind === "postulo" && found.kind === "here") || (candidate.kind === found.kind && candidate.stamp > found.stamp)) {
      Object.assign(found, candidate);
    }
  };
  for (const row of waiting) {
    place(rowKey(row), {
      kind: "postulo",
      id: row.id,
      title: row.title,
      company_name: row.company_name,
      location: row.location,
      at: row.created_at,
      stamp: time(row.created_at),
      state: "",
      link: row.review_url,
    });
  }
  for (const record of records) {
    if (UNSENT.has(record.state)) {
      place(recordKey(record), {
        kind: "here",
        id: record.id,
        title: record.data.title,
        company_name: record.data.company_name,
        location: record.data.location,
        at: record.capturedAt,
        stamp: time(record.capturedAt),
        state: record.state,
        link: "",
      });
    }
  }
  const all = [...postings.entries()]
    .map(([key, row]) => ({ key, ...row }))
    .sort((a, b) => b.stamp - a.stamp);
  return { rows: all.slice(0, Math.max(0, limit)).map(({ stamp, ...row }) => row), total: all.length };
}
