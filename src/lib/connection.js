// Whether Postulo answers, as the toolbar icon shows it.
//
// One record in storage.local says what is known and when and how it was learnt:
//
//   { state, at, how, tokenChecked, ms }
//
// `state` is one of `noPermission`, `tokenRefused`, `unreachable` or `reachable`. Two more
// are not stored because the settings already say them: `unconfigured` (no address or
// token) and `testing` (the switch). `ms` is how long `/healthz` took to answer, when that
// is what was asked: the popup's footer calls an answer slower than a second slow. The popup, the badge and the icon read it; the
// background repaints the icon whenever it changes.
//
// It is learnt from the outcome of a real call that carried the token (a send, the
// popup's question, Test) and, between those, from `GET /healthz`, which needs no token
// and proves the host answers but not that the token is still good. So the token's state
// is the last real call's, and `GET /me` is spent only when it is not known yet.

import { extraScopes, whoAmI, health } from "./api.js";

/** The storage key of the record. */
export const CONNECTION = "connection";

/** The toolbar image for each state: grey in every one but reachable (and in the one
 *  nothing has been learnt yet, which is not a reason to grey a button). */
const GREY = new Set(["unconfigured", "testing", "noPermission", "tokenRefused", "unreachable"]);

/** The message, in `_locales`, that says why the icon is grey. */
const REASON = {
  unconfigured: { key: "notConnected" },
  testing: { key: "offlineOn" },
  noPermission: { key: "noPermission" },
  tokenRefused: { key: "tokenRefused" },
  unreachable: { key: "postuloUnreachable" },
};

/** What the toolbar shows for these settings and this record: `{state, grey, reason, icons}`.
 *  `reason` is a message key, or null while the button is in colour. Nothing known yet is
 *  shown in colour: the first check follows within moments. */
export function toolbarFor(settings, record) {
  let state = "reachable";
  if (!settings.instance || !settings.token) {
    state = "unconfigured";
  } else if (settings.offline) {
    state = "testing";
  } else if (record && record.state in REASON) {
    state = record.state;
  }
  const grey = GREY.has(state);
  return {
    state,
    grey,
    reason: grey ? REASON[state].key : null,
    icons: {
      16: `icons/postulo${grey ? "-grey" : ""}-16.png`,
      32: `icons/postulo${grey ? "-grey" : ""}-32.png`,
    },
  };
}

/** An answer slower than this is slow, to the footer of the popup. It may include setting
 *  up the connection, so the first check after a pause can read slower than the next. */
export const SLOW_MS = 1000;

/** The message that says each footer state in words, for the title and the screen reader. */
const FOOTER = {
  online: { key: "footerOnline" },
  slow: { key: "footerSlow" },
  unreachable: { key: "postuloUnreachable" },
  testing: { key: "offlineOn" },
  noPermission: { key: "noPermission" },
  tokenRefused: { key: "tokenRefused" },
};

/** What the popup's footer shows before the address: `{state, key}`, or null for nothing
 *  (not set up, or nothing learnt yet and no reason to say it is slow). It follows the same
 *  record as the toolbar, so the two agree: the icon is in colour exactly when this is
 *  `online` or `slow`. `live.slow` is a check begun in the popup that has not been answered
 *  after `SLOW_MS`; it makes a Postulo last seen answering, or never seen, slow, and leaves
 *  a red or grey state as it is until the answer comes. */
export function footerFor(settings, record, live = {}) {
  if (!settings.instance || !settings.token) {
    return null;
  }
  let state = null;
  if (settings.offline) {
    state = "testing";
  } else if (record && record.state in REASON) {
    state = record.state;
  } else if (record && record.state === "reachable") {
    state = record.ms > SLOW_MS || live.slow ? "slow" : "online";
  } else if (live.slow) {
    state = "slow";
  }
  return state && { state, key: FOOTER[state].key };
}

/** The tooltip: the reason first, in words (colour is never the only sign), then what
 *  the button does or the count it carries. */
export function toolbarTitle(reasonText, buttonTitle) {
  return reasonText ? `${reasonText} ${buttonTitle}` : buttonTitle;
}

/** What a failed call says about the connection, by its status: Postulo that answered
 *  (even to refuse, or to say it is busy) is reachable; one that did not answer, or
 *  answered that it is failing, is not. `tokenChecked` says whether the answer showed
 *  the token to be good, which only an answer that was not a refusal of it does. */
export function stateOfFailure(error) {
  const status = error && error.status;
  if (status === 401 || status === 403) {
    return { state: "tokenRefused", tokenChecked: true };
  }
  if (!status || status >= 500) {
    return { state: "unreachable" };
  }
  // A 429 is Postulo busy, before it has looked at who asks; the rest looked at the token.
  return status === 429 ? { state: "reachable" } : { state: "reachable", tokenChecked: true };
}

/** Keep what a call showed: `outcome` is `{state, how, tokenChecked?}`. A state that is
 *  not known to have tried the token leaves what was known about the token as it was. */
export async function learn(area, outcome, now = () => Date.now()) {
  const before = (await area.get(CONNECTION))[CONNECTION];
  const record = {
    state: outcome.state,
    at: new Date(now()).toISOString(),
    how: outcome.how,
    tokenChecked: outcome.tokenChecked ?? (outcome.state === "noPermission" ? false : Boolean(before && before.tokenChecked)),
  };
  // The scopes the token holds beyond `captures`, as `GET /me` last said them; kept until the
  // next answer of `/me`, and gone with the record when the token changes (SEC3-011).
  const wide = outcome.wide ?? (before && before.wide) ?? [];
  if (wide.length && outcome.state !== "tokenRefused") {
    record.wide = wide;
  }
  if (Number.isFinite(outcome.ms)) {
    record.ms = outcome.ms;
  }
  await area.set({ [CONNECTION]: record });
  return record;
}

/** What a delivery's outcome (see `deliver`) shows, or null when it shows nothing about
 *  Postulo: nothing was waiting, or it was not to be asked. */
export function outcomeOfDelivery(result) {
  if (result.outcome === "noPermission") {
    return { state: "noPermission", how: "send" };
  }
  if (result.outcome === "account") {
    return { state: "tokenRefused", tokenChecked: true, how: "send" };
  }
  if (result.outcome === "unreachable") {
    return { ...stateOfFailure({ status: result.status }), how: "send" };
  }
  if (result.outcome === "done" && result.sent) {
    return { state: "reachable", tokenChecked: true, how: "send" };
  }
  return null;
}

/**
 * Ask whether Postulo answers, and keep the answer.
 *
 * Nothing is asked in the testing switch, when not set up, or without the permission
 * (which is itself an answer). `GET /healthz` says the host is up; the token's state is
 * the last real call's, and `GET /me` is made only when that is not known (just saved,
 * or the permission just given) or when `/healthz` is blocked on the way (a 4xx).
 * Resolves to the record, or null when nothing was to be asked.
 */
export async function checkConnection({ area, settings, allowed, fetchImpl = fetch, now = () => Date.now() }) {
  if (!settings.instance || !settings.token || settings.offline) {
    return null;
  }
  if (!(await allowed())) {
    return learn(area, { state: "noPermission", how: "permission" }, now);
  }
  const before = (await area.get(CONNECTION))[CONNECTION];
  const known = before && before.state !== "noPermission" && before.tokenChecked;
  let status = 0;
  let ms;
  try {
    const began = now();
    status = await health(settings.instance, fetchImpl);
    ms = Math.max(0, now() - began);
  } catch {
    return learn(area, { state: "unreachable", how: "healthz" }, now);
  }
  if (status >= 500) {
    return learn(area, { state: "unreachable", how: "healthz" }, now);
  }
  if (status >= 200 && status < 300 && known) {
    // The host answers; whether the token still does is not asked again.
    return learn(area, { state: before.state === "tokenRefused" ? "tokenRefused" : "reachable", how: "healthz", ms }, now);
  }
  try {
    const me = await whoAmI(settings.instance, settings.token, fetchImpl);
    return learn(area, { state: "reachable", tokenChecked: true, how: "me", ms, wide: extraScopes(me) }, now);
  } catch (error) {
    return learn(area, { ...stateOfFailure(error), how: "me", ms }, now);
  }
}

/** States in which Postulo's list is not worth asking for straight after: it would fail
 *  as what was just learnt did, and the last list read stays (#53). */
const NOT_ASKED_AFTER = new Set(["unreachable", "noPermission", "tokenRefused"]);

/**
 * The background's beat: send what is waiting, then read Postulo's list unless sending
 * already did. With nothing to send, ask whether Postulo answers: a send that was made
 * showed it already. The list is not asked for when the send or the check has just found
 * Postulo unreachable, the address not allowed or the token refused: one failing request
 * a beat, not two (#53).
 *
 * `deliver` resolves to a delivery's result (see `deliver` in outbox.js), `check` to the
 * connection record learnt (or null), `read` reads the list.
 */
export async function deliverAndRead({ deliver, check, read }) {
  const result = await deliver();
  let learnt = outcomeOfDelivery(result);
  if (result.outcome === "nothing" || (result.outcome === "done" && !result.sent)) {
    learnt = await check();
  }
  if (!result.sent && !(learnt && NOT_ASKED_AFTER.has(learnt.state))) {
    await read();
  }
  return result;
}
