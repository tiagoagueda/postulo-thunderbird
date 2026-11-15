// The calls to Postulo that the browser extension does not make, and this one does. The
// shared `api.js` holds the rest; this file leans on its `endpoint`, `readResponse` and
// `Refusal` so that every answer is read, and every refusal said, the same way.

import { endpoint, readResponse } from "./api.js";
import { languageTag } from "./i18n.js";

const TIMEOUT_MS = 20_000;

async function ask(instance, token, path, body, fetchImpl) {
  const language = languageTag();
  const response = await fetchImpl(endpoint(instance, path), {
    method: "POST",
    // A redirect is an error, not something to follow with the token (SEC2-078).
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(language ? { "Accept-Language": language } : {}),
      Accept: "application/json, application/problem+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return readResponse(response);
}

/** POST /captures/preview: what Postulo would read from this page, as `{url, source, data,
 *  hinted}`, and nothing stored or anybody told. */
export function preview(instance, token, { url, html }, fetchImpl = fetch) {
  return ask(instance, token, "/captures/preview", { url, html }, fetchImpl);
}
