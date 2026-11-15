// The number on the toolbar button: the postings captured and waiting for review.
//
// Two places hold such captures. Postulo holds the ones it has, and `GET /captures` lists
// them; this browser holds the ones that have not reached it. A posting captured twice is
// two captures, on purpose, and counts once here: two captures with one `posting_key` are one
// posting. The key is Postulo's: it names the posting at an address, however the address was
// spelled, and the extension cannot compute it (it is keyed by the instance's secret). Postulo's list is read whole, because a capture decided there simply leaves it
// and nothing reports a removal; what was read last is kept, so that a Postulo that cannot
// be reached leaves the number where it was instead of dropping it.

import { listCaptures } from "./api.js";
import { UNSENT } from "./store.js";

/** The storage key of the last list read from Postulo: `{at, rows}`. */
export const WAITING = "waiting";

/** Postulo's default page, asked for outright. */
const PAGE = 100;
/** A wait asked for longer than this is left to the next alarm rather than held for. */
const LONGEST_WAIT_S = 60;
/** More pages than this is not an inbox but a loop. */
const MOST_PAGES = 200;

/** What is kept of a row: what the list of captures shows and nothing of the page. */
export function slimRow(row) {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    company_name: row.company_name,
    location: row.location,
    posting_key: row.posting_key,
    created_at: row.created_at,
    review_url: row.review_url,
  };
}

/** The key a row from Postulo groups by: Postulo's `posting_key`, or the row's own id where
 *  it is empty (an address naming no host) or missing (a Postulo older than #711, whose
 *  rows then count one per capture). */
export const rowKey = (row) => row.posting_key || `postulo:${row.id}`;

/** The key a capture held here groups by: the `posting_key` Postulo gave for its address
 *  (kept on the record by `postingKey`), or its own id until Postulo has been asked. */
export const recordKey = (record) => record.postingKey || `here:${record.id}`;

/** Keep, on a capture held here, the `posting_key` Postulo gave for its address, so that
 *  the badge and the list of captures to review can merge it with what Postulo holds of
 *  the same posting. Nothing is kept for an answer without a key (a Postulo older than
 *  #711) or with an empty one (an address naming no host); the capture then counts on its
 *  own. Never an error: a capture deleted meanwhile is simply not updated. */
export async function keepPostingKey(store, id, answer) {
  if (answer && typeof answer.posting_key === "string" && answer.posting_key) {
    await store.update(id, { postingKey: answer.posting_key }).catch(() => {});
  }
}

/** How many postings the captures stand for: those waiting in Postulo (`rows`) and those
 *  here not yet sent (`records`), one per `posting_key`. */
export function countPostings(rows, records) {
  const keys = new Set();
  for (const row of rows) {
    keys.add(rowKey(row));
  }
  for (const record of records) {
    if (UNSENT.has(record.state)) {
      keys.add(recordKey(record));
    }
  }
  return keys.size;
}

/** The text on the badge: nothing for none, and "99+" past what fits. */
export function badgeText(count) {
  return count ? (count > 99 ? "99+" : String(count)) : "";
}

const wait = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

/** Every capture waiting in Postulo, read in pages until `count` is reached.
 *  After a 429 it waits as the refusal says (once, and only for a short while). */
export async function readWaiting({ instance, token, fetchImpl = fetch, sleep = wait }) {
  const rows = new Map();
  let total = Infinity;
  for (let page = 0; page < MOST_PAGES && rows.size < total; page++) {
    let answer;
    try {
      answer = await listCaptures(instance, token, { limit: PAGE, offset: page * PAGE }, fetchImpl);
    } catch (error) {
      if (error.status !== 429 || !(error.retryAfter <= LONGEST_WAIT_S)) {
        throw error;
      }
      await sleep(error.retryAfter);
      answer = await listCaptures(instance, token, { limit: PAGE, offset: page * PAGE }, fetchImpl);
    }
    if (!Array.isArray(answer.items) || !Number.isFinite(answer.count)) {
      break;
    }
    total = answer.count;
    if (!answer.items.length) {
      break;
    }
    // A capture decided while the pages are read shifts the rest up; by id it counts once.
    for (const row of answer.items) {
      rows.set(row.id, slimRow(row));
    }
  }
  return [...rows.values()];
}

/**
 * Read the list from Postulo and keep it, unless it should not be asked.
 *
 * Nothing is asked when Postulo is not set up, when the testing switch is on, when the
 * origin has not been allowed, or (with `maxAgeMs`) when the copy is younger than that.
 * Resolves to `{outcome}`: `skipped`, `read`, `unreachable` or `account` (the token was
 * refused). A failure leaves the last copy where it was.
 */
export async function refreshWaiting({ area, settings, allowed, fetchImpl = fetch, now = () => Date.now(), maxAgeMs = 0, sleep }) {
  if (!settings.instance || !settings.token || settings.offline) {
    return { outcome: "skipped" };
  }
  if (maxAgeMs) {
    const copy = (await area.get(WAITING))[WAITING];
    if (copy && now() - Date.parse(copy.at) < maxAgeMs) {
      return { outcome: "skipped" };
    }
  }
  if (!(await allowed())) {
    return { outcome: "skipped" };
  }
  try {
    const rows = await readWaiting({ instance: settings.instance, token: settings.token, fetchImpl, sleep });
    await area.set({ [WAITING]: { at: new Date(now()).toISOString(), rows } });
    return { outcome: "read" };
  } catch (error) {
    return { outcome: error.status === 401 || error.status === 403 ? "account" : "unreachable" };
  }
}

/** The copy of Postulo's list as kept, `{at, rows}`, or null: none when Postulo is not set
 *  up, and none after the address or token was changed and the old copy dropped. */
export async function waitingCopy(area, settings) {
  if (!settings.instance || !settings.token) {
    return null;
  }
  const copy = (await area.get(WAITING))[WAITING];
  return copy && Array.isArray(copy.rows) ? copy : null;
}

/** The copy of Postulo's list that counts: none when Postulo is not set up, and so none
 *  after the address or token was changed and the old copy dropped. */
export async function lastWaiting(area, settings) {
  if (!settings.instance || !settings.token) {
    return [];
  }
  const copy = (await area.get(WAITING))[WAITING];
  return copy && Array.isArray(copy.rows) ? copy.rows : [];
}

/** `work`, run once for any number of calls made before it starts, and once more for the
 *  calls made while it runs: the last run always starts after the last call, so it sees
 *  the latest state, and a burst of calls costs two runs at most rather than one each.
 *  `gate(run)` decides when a run may start (see `afterDelivery`). For the toolbar number,
 *  recounted on every storage change of a capture, which a delivery makes one or two of per
 *  capture (#53). */
export function coalesce(work, gate = (run) => run()) {
  let pending = null; // a run asked for and not started: later calls join it
  let current = null; // the run under way
  return function call() {
    if (pending) {
      return pending.promise;
    }
    const run = {};
    pending = run;
    run.promise = (async () => {
      try {
        // Never at once: the calls made in the same turn join this run.
        await null;
        while (current) {
          await current.catch(() => {});
        }
        return await gate(async () => {
          if (pending === run) {
            pending = null;
          }
          const working = Promise.resolve().then(work);
          current = working;
          try {
            return await working;
          } finally {
            if (current === working) {
              current = null;
            }
          }
        });
      } finally {
        if (pending === run) {
          pending = null;
        }
      }
    })();
    return run.promise;
  };
}
