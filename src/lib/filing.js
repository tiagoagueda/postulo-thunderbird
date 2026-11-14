// Filing the message on screen into a listing's history: what is read from it, what is
// sent, and the two calls to Postulo. Pure where it can be, so it is tested without
// Thunderbird.
//
// This extension's own, and not shared with the browser extension: a message has headers
// and parts where a page has a document, and what leaves Thunderbird is the one message the
// person chose, to the address they configured, under a token that may only file things
// (`listings:bind`). No credentials for the mailbox exist here or on Postulo's side.

import { Refusal, endpoint, readResponse } from "./api.js";
import { languageTag } from "./i18n.js";
import { cleanSubject } from "./mail.js";

// Postulo's own bounds, from `jobs/history.py`: it refuses a longer text rather than cut it,
// so the cutting is done here, with a mark saying so.
export const SUMMARY_LIMIT = 250;
export const BODY_LIMIT = 40_000;
export const ID_LIMIT = 250;
const CUT = "\n\n[...cut]";
const TIMEOUT_MS = 20_000;
const CHOICES = 20; // listings offered at once

const first = (headers, name) => {
  const value = headers && headers[name];
  return String(Array.isArray(value) ? value[0] ?? "" : value ?? "").trim();
};

/** The message's `Message-ID` as written, angle brackets included, or "" when it has none.
 *  It is the identity Postulo files the message under, so sending it twice, from two folders
 *  or two machines, is one entry. */
export function messageId(full) {
  const id = first(full && full.headers, "message-id").replace(/\s+/g, "");
  return id.length > ID_LIMIT ? "" : id;
}

/** The text of a message as a person would read it: every text/plain part that is not an
 *  attachment, or, when there is none, the text/html with its tags and scripts taken out.
 *  Never HTML: what is stored is words. */
export function plainText(part) {
  const plain = [];
  const html = [];
  collect(part, plain, html, 0);
  const text = plain.length ? plain.join("\n\n") : html.map(stripTags).join("\n\n");
  return text.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function collect(part, plain, html, depth) {
  if (!part || depth > 20) {
    return;
  }
  const type = String(part.contentType || "").toLowerCase();
  if (part.name || part.fileName || part.isAttachment) {
    return;
  }
  if (type.startsWith("text/plain") && typeof part.body === "string") {
    plain.push(part.body);
  } else if (type.startsWith("text/html") && typeof part.body === "string") {
    html.push(part.body);
  }
  for (const child of part.parts || []) {
    collect(child, plain, html, depth + 1);
  }
}

function stripTags(markup) {
  return markup
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n");
}

function cut(text, limit) {
  return text.length > limit ? text.slice(0, limit - CUT.length).trimEnd() + CUT : text;
}

/** The entry to send for a message: `header` is what `messageDisplay` gave and `full` what
 *  `messages.getFull` gave. The headers that identify it come first in the body as lines, then
 *  the text. A message from a sent folder is a `message` (it was written by the person), any
 *  other an `email_received`. */
export function entryFor(header, full) {
  const headers = (full && full.headers) || {};
  const lines = [
    ["From", first(headers, "from") || String((header && header.author) || "")],
    ["To", [].concat(headers.to || (header && header.recipients) || []).join(", ")],
    ["Date", first(headers, "date")],
    ["Subject", first(headers, "subject") || String((header && header.subject) || "")],
    ["Message-ID", messageId(full)],
  ]
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}: ${value.replace(/\s+/g, " ")}`);
  const subject = cleanSubject(first(headers, "subject") || (header && header.subject));
  const when = header && header.date ? new Date(header.date) : null;
  const entry = {
    kind: header && header.folder && header.folder.type === "sent" ? "message" : "email_received",
    summary: subject.replace(/\s+/g, " ").slice(0, SUMMARY_LIMIT),
    body: cut(`${lines.join("\n")}\n\n${plainText(full)}`.trim(), BODY_LIMIT),
    external_id: messageId(full),
  };
  if (when && !Number.isNaN(when.getTime())) {
    entry.occurred_at = when.toISOString();
  }
  return entry;
}

async function call(fetchImpl, url, token, init) {
  const language = languageTag();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // A redirect is an error: the token goes to the address that was configured and nowhere else.
    return await fetchImpl(url, {
      ...init,
      redirect: "error",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(language ? { "Accept-Language": language } : {}),
        Accept: "application/json, application/problem+json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** GET /listings/choices: a few listings, briefly, newest first. `q` narrows by title or company;
 *  `externalId` makes each say in `filed` whether this message is already in its history. */
export async function chooseListings(instance, token, { q = "", externalId = "" } = {}, fetchImpl = fetch) {
  const query = new URLSearchParams({ limit: String(CHOICES) });
  if (q.trim()) {
    query.set("q", q.trim().slice(0, 200));
  }
  if (externalId) {
    query.set("external_id", externalId);
  }
  const response = await call(fetchImpl, endpoint(instance, `/listings/choices?${query}`), token, { method: "GET" });
  const page = await readResponse(response);
  return { items: Array.isArray(page.items) ? page.items : [], count: Number(page.count) || 0 };
}

/** POST /listings/{id}/events: file the entry. `created` is false when Postulo already had it. */
export async function fileEntry(instance, token, listingId, entry, fetchImpl = fetch) {
  if (!entry.external_id) {
    // Without a Message-ID a second press would file a second entry: refuse before sending.
    throw new Refusal("noMessageId");
  }
  const response = await call(fetchImpl, endpoint(instance, `/listings/${Number(listingId)}/events`), token, {
    method: "POST",
    body: JSON.stringify(entry),
  });
  const body = await readResponse(response);
  return { created: response.status === 201, entry: body };
}
