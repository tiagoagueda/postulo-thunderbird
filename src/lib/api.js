// Talking to a Postulo instance. Pure functions where possible, so they can be tested
// without a browser: what to send, where, and how to read what comes back.
//
// The token is sent as a bearer token to the instance the person configured, and to
// nothing else. There is no analytics, no third-party request, no cache of pages.

import { languageTag } from "./i18n.js";

const API = "/api/v1";

/** An error with a sentence to show, named by its key in _locales rather than written out.
 *  These functions stay pure and testable outside a browser; the page that catches one says
 *  it in the browser's language. A substitution may itself be `{ key }`, for a phrase that is
 *  translated too. */
export class Refusal extends Error {
  constructor(key, substitutions = []) {
    super(key);
    this.name = "Refusal";
    this.key = key;
    this.substitutions = substitutions;
  }
}

/** A typed instance address, cleaned: scheme, host, optional port and path prefix. */
export function normaliseInstance(raw) {
  let text = (raw || "").trim();
  if (!text) {
    throw new Refusal("enterAddress");
  }
  if (!/^https?:\/\//i.test(text)) {
    text = "https://" + text;
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Refusal("notAnAddress");
  }
  // A user name or password in the address would never connect (fetch refuses such a URL),
  // would stand in the popup and would head the downloadable log (SEC2-076).
  if (url.username || url.password) {
    throw new Refusal("noCredentialsInAddress");
  }
  // Plain http only to this machine. A `.local` name is another machine on the network, and
  // the token and the pages would cross it in clear (SEC2-077).
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !local) {
    throw new Refusal("httpsOnly");
  }
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "").replace(/\/api\/v1$/, "");
  return url.toString().replace(/\/$/, "");
}

/** The origin pattern a host permission is requested for. */
export function originPattern(instance) {
  const url = new URL(instance);
  return `${url.protocol}//${url.host}/*`;
}

/** Postulo's own page for adding a listing by hand. Only opened in a tab: no request is made. */
export function newListingUrl(instance) {
  return `${instance}/listings/new/`;
}

export function endpoint(instance, path) {
  return `${instance}${API}${path}`;
}

function headers(token) {
  // The language the extension is speaking, so that the sentences Postulo writes for a
  // refusal come in it too; the browser's own header may name another.
  const language = languageTag();
  return {
    Authorization: `Bearer ${token}`,
    ...(language ? { "Accept-Language": language } : {}),
    // Postulo answers a refusal as `application/problem+json` (RFC 9457) and everything
    // else as `application/json`. Both are named so that neither is a surprise.
    Accept: "application/json, application/problem+json",
    "Content-Type": "application/json",
  };
}

/** Turn a response into either data or a sentence a person can act on.
 *
 *  What is thrown carries the response's `status`, so a caller that retries can tell a
 *  Postulo that is down or busy from one that refused this particular request. */
export async function readResponse(response) {
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (response.ok) {
    // A sign-in page, a captive portal or another site answers 2xx with something that is
    // not Postulo's JSON. No status, so a capture waits rather than being refused.
    if (!body || typeof body !== "object") {
      throw new Refusal("notPostulo");
    }
    return body;
  }
  throw withStatus(refusalFor(response.status, body), response.status);
}

/** The field errors of a refused request, whichever shape Postulo sent them in.
 *
 *  Since postulo/postulo#296 a refusal is an RFC 9457 problem document, and the per-field
 *  list lives in `errors` while `detail` is a one-line summary. Before it, the list *was*
 *  `detail`. Both are read, because an extension is updated on a different day from the
 *  instance it talks to, and the person capturing a posting that will not go in needs to
 *  be told which field is wrong either way (#1). */
function fieldErrors(body) {
  const list = Array.isArray(body.errors) ? body.errors : Array.isArray(body.detail) ? body.detail : [];
  return list.map(problem).filter(Boolean).join(" ");
}

function refusalFor(status, body) {
  if (status === 401) {
    return new Refusal("tokenRefused", [{ key: "tokenPath" }]);
  }
  if (status === 403) {
    // Postulo's own sentence when it gives one: it names the scope that is missing. The
    // scope is a member of its own now, kept on the error for a caller that would rather
    // act on it than read a sentence written for a developer.
    const refusal = body && body.detail ? new Error(body.detail) : new Refusal("notAllowed");
    if (body && body.scope) {
      refusal.scope = body.scope;
    }
    return refusal;
  }
  if (status === 422 && body) {
    // What is wrong with each field, and Postulo's own sentence when there are no fields
    // -- "that page yielded nothing" is not about a field.
    const fields = fieldErrors(body);
    if (fields) {
      return new Error(fields);
    }
    if (typeof body.detail === "string" && body.detail) {
      return new Error(body.detail);
    }
  }
  if (status === 429) {
    // The sentence stays as it is; the wait is carried for whatever decides when to try
    // again. `Retry-After` says the same, and both come from the same number.
    const refusal = new Refusal("tooMany");
    if (body && Number.isFinite(body.retry_after)) {
      refusal.retryAfter = body.retry_after;
    }
    return refusal;
  }
  return new Refusal("answered", [String(status)]);
}

function withStatus(error, status) {
  error.status = status;
  return error;
}

function problem(error) {
  if (!error || typeof error.msg !== "string") {
    return "";
  }
  const where = Array.isArray(error.loc) ? error.loc.at(-1) : "";
  return where ? `${where}: ${error.msg}` : error.msg;
}

/** How long to wait for Postulo before counting it as unreachable. */
const TIMEOUT_MS = 20_000;

/** fetch, given up on after a while: a server that never answers is a server that is down.
 *
 *  `read` takes the response and is awaited before the timer is cleared, so a body that
 *  never ends is given up on too, and not only headers that never arrive (SEC3-017). */
async function request(fetchImpl, url, init, read = (response) => response) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // A redirect is an error, not something to follow with the token: the token goes to the
    // address that was configured and to nothing else (SEC2-078).
    return await read(await fetchImpl(url, { ...init, redirect: "error", signal: controller.signal }));
  } finally {
    clearTimeout(timer);
  }
}

/** The scopes a token holds besides `captures` (SEC2-081). The extension keeps its token
 *  unencrypted in the browser's storage, and Postulo's threat model assumes it can capture
 *  and do nothing else. */
export function extraScopes(me) {
  return ((me && me.scopes) || []).filter((scope) => scope !== "captures");
}

/** GET /me: who this token is, and what it may do. */
export async function whoAmI(instance, token, fetchImpl = fetch) {
  return request(fetchImpl, endpoint(instance, "/me"), { headers: headers(token) }, readResponse);
}

/** GET /healthz: the status Postulo answers with, to a request that carries no token and
 *  no cookies. It proves the host and its database answer, and nothing about who asks. A
 *  host that does not answer throws, as with every request here. */
export async function health(instance, fetchImpl = fetch) {
  const response = await request(fetchImpl, `${instance}/healthz`, {
    credentials: "omit",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  return response.status;
}

/** POST /captures: the page, and the posting as the person reviewed it.
 *
 *  Every field goes, not only the ones changed: what Postulo keeps is then exactly what the
 *  person looked at, whichever of its sources reads the page on its side. The page still
 *  goes too, because Postulo reads it to know which source did. */
export async function capture(instance, token, { url, html, data, batch, key }, fetchImpl = fetch) {
  const payload = { url, html };
  if (data && Object.keys(data).length) {
    payload.data = data;
  }
  // Several from one page: Postulo announces the first with the count and the rest not at
  // all (#177). Only its shape goes; the id that groups them here is the browser's own.
  if (batch && batch.size > 1) {
    payload.batch = { size: batch.size, position: batch.position };
  }
  return request(
    fetchImpl,
    endpoint(instance, "/captures"),
    {
    method: "POST",
    // The same key for the same capture: a request repeated after a lost answer gets the
    // first answer back from Postulo instead of a second capture and notification.
    headers: key ? { ...headers(token), "Idempotency-Key": key } : headers(token),
    body: JSON.stringify(payload),
    },
    async (response) => {
      const result = await readResponse(response);
      // Postulo answers a capture with 201 (200 for one it already held) and the capture's
      // id. Anything else is some other server's JSON, and no status is set on it: the
      // capture waits and keeps its page rather than being counted as delivered.
      if (![200, 201].includes(response.status) || !Number.isInteger(result.id)) {
        throw new Refusal("notPostulo");
      }
      return result;
    },
  );
}

/** PUT the picture of the whole page to the address a capture's answer gave for it: the raw
 *  bytes, their type and length, and not JSON. `blob` is a Blob, whose size the browser sends
 *  as Content-Length. Resolves when Postulo has it (201), or already had these bytes (200);
 *  anything else is thrown with its status, and 409, 413, 415 and 422 are final. */
export async function sendRendering(token, url, blob, fetchImpl = fetch) {
  return request(
    fetchImpl,
    url,
    {
      method: "PUT",
      headers: { ...headers(token), "Content-Type": blob.type },
      body: blob,
    },
    (response) => {
      if (response.status === 200 || response.status === 201) {
        return { kept: response.status === 201 };
      }
      return readResponse(response);
    },
  );
}

/** Whether Postulo refused a picture for good, so that sending it again would not help. */
export function pictureRefused(error) {
  return [409, 413, 415, 422].includes(error && error.status);
}

/** GET /captures: one page of the captures waiting for review, newest first, as `{items, count}`. */
export async function listCaptures(instance, token, { limit = 100, offset = 0 } = {}, fetchImpl = fetch) {
  return request(
    fetchImpl,
    endpoint(instance, `/captures?limit=${limit}&offset=${offset}`),
    { headers: headers(token) },
    readResponse,
  );
}

/** The longest address Postulo takes, for a capture and for /captures/known alike. */
export const ADDRESS_LIMIT = 500;

/** What Postulo's /captures/known takes: this many characters of a title or company, this many postings. */
const KNOWN_TEXT = 250;
const KNOWN_COMPANY = 250;
const KNOWN_POSTINGS = 100;

/** POST /captures/known: what Postulo already holds for these postings -- a listing at the
 *  address however it was spelled, a capture of it still waiting, or a listing with the
 *  title at the company -- so the popup can say so before anything is sent (#178). One
 *  request for one posting or forty. Postulo stores nothing and refuses nothing on it. */
export async function known(instance, token, postings, fetchImpl = fetch) {
  const asked = postings.map((posting) => ({
    url: knownAddress(posting.url),
    title: (posting.title || "").slice(0, KNOWN_TEXT),
    company: (posting.company_name || "").slice(0, KNOWN_COMPANY),
  }));
  // Postulo takes at most KNOWN_POSTINGS in one question, so a longer page is asked in chunks.
  const answers = [];
  for (let from = 0; from < asked.length || from === 0; from += KNOWN_POSTINGS) {
    const answer = await request(
      fetchImpl,
      endpoint(instance, "/captures/known"),
      {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify({ postings: asked.slice(from, from + KNOWN_POSTINGS) }),
      },
      readResponse,
    );
    // One answer for each posting asked, and nothing else is Postulo's.
    if (!Array.isArray(answer) || answer.some((one) => !one || typeof one !== "object")) {
      throw new Refusal("notPostulo");
    }
    answers.push(...answer);
  }
  return answers;
}

/** Whether a failure means "try again later" rather than "this will not do".
 *
 *  No answer at all, a Postulo that is busy (429), still answering an earlier try (409) or
 *  failing (5xx) is later. A token that is refused (401, 403) is the account's problem, not the capture's: later too, once it is
 *  fixed. Anything else Postulo said about this one capture is final until it is changed. */
export function kindOfFailure(error) {
  const status = error && error.status;
  if (!status) {
    return "later";
  }
  if (status === 401 || status === 403) {
    return "account";
  }
  // 409: the first attempt under this key is still being answered.
  if (status === 409 || status === 429 || status >= 500) {
    return "later";
  }
  return "refused";
}

/** What went wrong, in a shape that can be stored and said again in any language. */
export function problemOf(error) {
  if (error && error.key) {
    return { key: error.key, substitutions: error.substitutions || [] };
  }
  return { message: (error && error.message) || String(error) };
}

/** One line for the popup, from what the capture API returned. `untitled` is said when the
 *  page gave no title, in whatever language the caller speaks. */
export function describe(result, untitled = "Untitled posting") {
  const parts = [result.title || untitled];
  const where = [result.company_name, result.location].filter(Boolean).join(", ");
  if (where) {
    parts.push(where);
  }
  return parts.join(" — ");
}

/** An address as /captures/known takes it: without its fragment, and left out when still too long. */
function knownAddress(url) {
  const text = typeof url === "string" ? url.split("#")[0] : "";
  return text.length > ADDRESS_LIMIT ? "" : text;
}
