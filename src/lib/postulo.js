// The calls to Postulo that the browser extension does not make, and this one does. The
// shared `api.js` holds the rest; this file leans on its `endpoint`, `readResponse` and
// `Refusal` so that every answer is read, and every refusal said, the same way.

import { endpoint, readResponse } from "./api.js";
import { languageTag } from "./i18n.js";

const TIMEOUT_MS = 20_000;

/** One request, and its answer read: `{body, status}`. */
async function call(instance, token, path, { method = "GET", body } = {}, fetchImpl) {
  const language = languageTag();
  const response = await fetchImpl(endpoint(instance, path), {
    method,
    // A redirect is an error, not something to follow with the token (SEC2-078).
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(language ? { "Accept-Language": language } : {}),
      Accept: "application/json, application/problem+json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { body: await readResponse(response), status: response.status };
}

const ask = async (instance, token, path, body, fetchImpl) => (await call(instance, token, path, { method: "POST", body }, fetchImpl)).body;

/** POST /captures/preview: what Postulo would read from this page, as `{url, source, data,
 *  hinted}`, and nothing stored or anybody told. */
export function preview(instance, token, { url, html }, fetchImpl = fetch) {
  return ask(instance, token, "/captures/preview", { url, html }, fetchImpl);
}

/** GET /listings/choices: the person's listings, as little of each as recognising it takes
 *  (id, title, company, place, state), newest noted first, narrowed by words in the title or the
 *  company's name. `{items, count}`. */
export async function listingChoices(instance, token, { q = "", limit = 50 } = {}, fetchImpl = fetch) {
  const words = String(q || "").trim().slice(0, 200);
  const query = `?limit=${limit}${words ? `&q=${encodeURIComponent(words)}` : ""}`;
  return (await call(instance, token, `/listings/choices${query}`, {}, fetchImpl)).body;
}

/** POST /listings/{id}/events: an entry in a listing's history. Sent again with the same
 *  `external_id`, Postulo answers 200 with the first entry and adds nothing: `created` says which. */
export async function addListingEvent(instance, token, id, entry, fetchImpl = fetch) {
  const { body, status } = await call(instance, token, `/listings/${Number(id)}/events`, { method: "POST", body: entry }, fetchImpl);
  return { event: body, created: status === 201 };
}
