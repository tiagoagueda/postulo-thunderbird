// Filing a message into a listing's history (#9): what of the message goes, and which listing
// to offer first. Pure functions, tested without Thunderbird.
//
// A filed message's text leaves Thunderbird for the person's own Postulo and is shown on the
// listing's page, so what goes is what the person sees first: the text without the replies
// quoted under it and the signature, or the subject alone.

import { cleanSubject, sanitise, splitAuthor } from "./mail.js";

/** Postulo's limits on an entry: a summary line, the text, and an external id. */
export const SUMMARY_MAX = 250;
export const BODY_MAX = 40_000;
export const EXTERNAL_ID_MAX = 250;

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

/** A message's text: its plain part, or its HTML read as text (the HTML is made safe first, so
 *  every tag left is a bare one and the text between is what a reader sees). */
export function plainText({ html = "", text = "" } = {}) {
  if (String(text).trim()) {
    return String(text);
  }
  return sanitise(html)
    .replace(/<\/(?:p|div|li|tr|h[1-6]|blockquote|table|ul|ol)>|<br>|<hr>/g, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity]);
}

// Where a reply's own words end and what it quotes begins.
const WROTE = /^(?:on|le|am|el|em|il|op)\b.{0,200}?(?:wrote|a écrit|schrieb|escribió|escreveu|ha scritto|schreef)\s*:?\s*$/i;
const ORIGINAL = /^[-_ ]{2,}\s*(?:original message|forwarded message|message d'origine|message transféré|mensagem original|ursprüngliche nachricht)\b/i;
const HEADER = /^(?:from|de|von)\s*:\s*\S/i;
const SENT = /^(?:sent|date|envoyé|gesendet|enviado)\s*:/i;
const SIGNATURE = /^--\s?$/;

/** A message's text without the replies it quotes and the signature under it: it stops at
 *  "On ... wrote:", an "Original Message" rule, a `From:`/`Sent:` block or a `-- ` line, and
 *  drops every line that starts with `>`. Cut to Postulo's limit. */
export function withoutQuotes(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const kept = [];
  for (let at = 0; at < lines.length; at++) {
    const line = lines[at].trimEnd();
    const next = lines.slice(at + 1, at + 4);
    if (WROTE.test(line.trim()) || ORIGINAL.test(line.trim()) || SIGNATURE.test(line) || (HEADER.test(line.trim()) && next.some((one) => SENT.test(one.trim())))) {
      break;
    }
    if (!line.trimStart().startsWith(">")) {
      kept.push(line);
    }
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, BODY_MAX);
}

/** The entry to file: the subject (without "Re:" and the like) as the summary, when it was
 *  sent, the message's own `Message-ID` as the `external_id` so that filing it twice leaves one
 *  entry, and either the text or, with `subjectOnly`, nothing more. */
export function entryFor(message, { subjectOnly = false } = {}) {
  return {
    kind: "email_received",
    summary: cleanSubject(message.subject).slice(0, SUMMARY_MAX),
    body: subjectOnly ? "" : withoutQuotes(plainText(message)),
    ...(message.sentAt ? { occurred_at: message.sentAt } : {}),
    external_id: String(message.messageId || "").slice(0, EXTERNAL_ID_MAX),
  };
}

const norm = (text) => String(text || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
const words = (text) => norm(text).split(/[^a-z0-9]+/).filter((word) => word.length >= 4);

/** The listings, the ones that look like this message first: the company is the sender's name
 *  or the name of the domain it wrote from (weighted most), then the title's words that the
 *  subject uses. Stable: the rest stay in the order Postulo gave (newest noted first).
 *  Each is `{...listing, suggested}`, `suggested` true for what scored. */
export function rankChoices(choices, message) {
  const sender = norm(splitAuthor(message.author).name || message.senderName || message.sender);
  const domain = norm((message.address || "").split("@")[1] || "").split(".").slice(0, -1).join(" ");
  const subject = new Set(words(message.subject));
  const scored = (choices || []).map((choice, index) => {
    const company = norm(choice.company_name).trim();
    const known = company.length >= 3 && (sender.includes(company) || (sender.length >= 3 && company.includes(sender)) || domain.split(" ").some((part) => part === company.replace(/[^a-z0-9]+/g, "")));
    const score = (known ? 10 : 0) + words(choice.title).filter((word) => subject.has(word)).length;
    return { ...choice, suggested: score > 0, score, index };
  });
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map(({ score, index, ...choice }) => choice);
}
