// Reading a message's header: pure functions, tested without Thunderbird.
//
// This is where reading a posting out of a message will grow. For now it only says what
// the message on screen is: its subject without the marks of a reply or a forward, and who
// it came from.

// What mail clients put before a subject when replying or forwarding, in several
// languages. Matched whole, before a colon, and repeated.
const PREFIXES = ["re", "aw", "sv", "vs", "rv", "res", "rif", "odp", "fwd", "fw", "wg", "tr", "enc", "i", "vb", "pd", "doorst"];
const PREFIX = new RegExp(`^(?:(?:${PREFIXES.join("|")})(?:\\[\\d+\\])?\\s*[:：]\\s*)+`, "i");

const SUBJECT_LIMIT = 500; // a subject line shown in a popup
const AUTHOR_LIMIT = 1000; // a display name and an address; anything longer is not one

/** A subject without "Re:", "Fwd:" and their like in front of it. */
export function cleanSubject(subject) {
  return String(subject || "").slice(0, SUBJECT_LIMIT).trim().replace(PREFIX, "").trim();
}

/** "Ada Lovelace <ada@example.org>" as `{ name, address }`. Either may be empty.
 *
 *  The header is written by whoever sent the message, so it is cut to a length first and
 *  split without an expression whose two parts can both take the same white space. */
export function splitAuthor(author) {
  const text = String(author || "").slice(0, AUTHOR_LIMIT).trim();
  const open = text.lastIndexOf("<");
  const inner = open >= 0 && text.endsWith(">") ? text.slice(open + 1, -1) : "";
  if (inner && !inner.includes(">")) {
    return { name: text.slice(0, open).trim().replace(/^"(.*)"$/, "$1").trim(), address: inner.trim() };
  }
  return text.includes("@") ? { name: "", address: text } : { name: text, address: "" };
}

/** Whether the capture button may be pressed, and when not, the key of the sentence that says
 *  why: Postulo not set up, no message on screen, or several selected (one message is one
 *  posting, so it takes none of them). `shown` is how many messages Thunderbird is showing. */
export function captureAvailability(shown, connected) {
  if (!connected) {
    return { ok: false, why: "notConnected" };
  }
  if (shown < 1) {
    return { ok: false, why: "noMessage" };
  }
  return shown > 1 ? { ok: false, why: "severalMessages" } : { ok: true, why: "" };
}

/** What the popup says about a message: its subject, its sender, and when it was sent. */
export function summarise(header) {
  const { name, address } = splitAuthor(header && header.author);
  const date = header && header.date ? new Date(header.date) : null;
  return {
    subject: cleanSubject(header && header.subject),
    sender: name || address,
    address,
    sentAt: date && !Number.isNaN(date.getTime()) ? date.toISOString() : "",
  };
}

// ---------------------------------------------------------------------------------------
// Reading a posting out of a message (#1). Everything below is pure: the message's parts
// come in, and a page to send, with the addresses it may be about, goes out. Nothing is
// loaded: an image in a message is never fetched, and nothing here is ever rendered.
//
// A message is somebody else's text, so every scan is a single pass over it (no expression
// that can backtrack over what the sender supplies) and every result is cut to a size.

/** The most of a message's body that is read, and the most that is sent, in characters. */
export const BODY_LIMIT = 400_000;
const TAG_LIMIT = 4_000; // a tag longer than this is not one
const LINK_LIMIT = 500; // the longest address Postulo takes
const MOST_LINKS = 12;

/** Tags kept, without their attributes: what gives a posting its shape. */
const KEPT = new Set([
  "a", "p", "br", "div", "span", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "table", "thead",
  "tbody", "tr", "td", "th", "strong", "b", "em", "i", "u", "blockquote", "pre", "hr", "section", "article",
  "header", "footer", "center", "small", "dl", "dt", "dd",
]);

/** Tags dropped with everything inside them: code, styles, frames, forms and pictures that
 *  would be fetched. */
const DROPPED = new Set([
  "script", "style", "iframe", "frame", "frameset", "object", "embed", "noscript", "template", "svg",
  "math", "head", "title", "textarea", "select", "applet", "audio", "video", "canvas",
]);

const escapeHtml = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
/** Text between tags: a `<` left in it was not a tag, and stays from becoming one. */
const asText = (text) => text.replaceAll("<", "&lt;");
const escapeAttribute = (text) => escapeHtml(text).replaceAll('"', "&quot;");

/** The tags of `source`, in order, as `{start, end, name, closing}` (`end` is past the `>`).
 *  A `<` with no `>` after it, or one too far from it, is text and not yielded. Each `>` is
 *  looked for once, so a message made of nothing but `<` costs no more than its length. */
function* tagsOf(source) {
  // Lower-cased letter by letter, so that it is as long as the source whatever is in it.
  const lower = source.replace(/[A-Z]/g, (letter) => String.fromCharCode(letter.charCodeAt(0) + 32));
  let from = 0;
  let close = -2; // where the next ">" is, once found; -1 when there is none
  while (from < source.length) {
    const start = source.indexOf("<", from);
    if (start < 0) {
      return;
    }
    if (source.startsWith("<!--", start)) {
      const end = source.indexOf("-->", start + 4);
      from = end < 0 ? source.length : end + 3;
      yield { start, end: from, name: "", closing: false, lower }; // dropped by whoever reads
      continue;
    }
    // A "<" that is not followed by a letter, "/", "!" or "?" is a less-than sign.
    if (!/[a-zA-Z/!?]/.test(source[start + 1] || "")) {
      from = start + 1;
      continue;
    }
    if (close !== -1 && close < start) {
      close = source.indexOf(">", start);
    }
    if (close < 0 || close - start > TAG_LIMIT) {
      from = start + 1;
      continue;
    }
    const closing = source[start + 1] === "/";
    const named = /^[a-z][a-z0-9]*/.exec(lower.slice(start + (closing ? 2 : 1), Math.min(close, start + 40)));
    yield { start, end: close + 1, name: named ? named[0] : "", closing, lower };
    from = close + 1;
  }
}

/** The value of `href` in a tag's text: quoted either way or bare, and nothing else. */
function hrefOf(tag) {
  const match = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3] ?? "").trim() : "";
}

/** An address that may stand in a page or be a posting: http or https, and not too long. */
function webAddress(text) {
  const raw = String(text || "").replace(/&amp;/gi, "&").trim();
  if (!raw || raw.length > LINK_LIMIT * 4) {
    return "";
  }
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

/** A message's HTML made safe to hand over as a page, and no longer than `limit`.
 *
 *  Scripts, styles, frames, forms and everything else that runs or loads are dropped with
 *  what they hold; pictures are dropped, so no remote image is ever asked for; of what is
 *  kept, only its tag stays, with no attribute but a link's address, and only a web
 *  address at that. Postulo reads the page and shows none of it, but nothing here counts
 *  on that. */
export function sanitise(html, limit = BODY_LIMIT) {
  const source = String(html || "").slice(0, limit * 2);
  let out = "";
  let at = 0;
  for (const tag of tagsOf(source)) {
    if (tag.start < at) {
      continue; // inside something already dropped
    }
    out += asText(source.slice(at, tag.start));
    at = tag.end;
    if (!tag.name) {
      continue;
    }
    if (DROPPED.has(tag.name)) {
      if (!tag.closing) {
        const end = tag.lower.indexOf(`</${tag.name}`, tag.end);
        const after = end < 0 ? -1 : source.indexOf(">", end);
        at = after < 0 ? source.length : after + 1;
      }
    } else if (KEPT.has(tag.name)) {
      if (tag.closing) {
        out += `</${tag.name}>`;
      } else if (tag.name === "a") {
        const href = webAddress(hrefOf(source.slice(tag.start, tag.end)));
        out += href ? `<a href="${escapeAttribute(href)}">` : "<a>";
      } else {
        out += `<${tag.name}>`;
      }
    }
    if (out.length >= limit) {
      break;
    }
  }
  if (out.length < limit) {
    out += asText(source.slice(at));
  }
  return out.slice(0, limit);
}

/** A message's plain text as the paragraphs of a page. */
export function textToHtml(text, limit = BODY_LIMIT) {
  return String(text || "")
    .slice(0, limit)
    .split(/\r?\n(?:[ \t]*\r?\n)+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\r?\n/g, "<br>")}</p>`)
    .join("\n");
}

/** The text and the HTML of a message, from the tree `messages.getFull` answers: the first
 *  `text/html` and the first `text/plain` part that are not attachments. Either may be empty. */
export function bodiesOf(part) {
  const found = { html: "", text: "" };
  const walk = (node, depth) => {
    if (!node || depth > 20) {
      return;
    }
    const type = String(node.contentType || "").toLowerCase();
    if (!node.name && typeof node.body === "string") {
      if (type.startsWith("text/html") && !found.html) {
        found.html = node.body.slice(0, BODY_LIMIT * 2);
      } else if (type.startsWith("text/plain") && !found.text) {
        found.text = node.body.slice(0, BODY_LIMIT * 2);
      }
    }
    for (const child of node.parts || []) {
      walk(child, depth + 1);
    }
  };
  walk(part, 0);
  return found;
}

/** The text between a link's tags, plain and short: what the reader would click. */
function labelOf(html, from, tag) {
  const end = tag.lower.indexOf("</a", from);
  const inner = html.slice(from, end < 0 ? from + 200 : Math.min(end, from + 200));
  let label = "";
  let at = 0;
  for (const inside of tagsOf(inner)) {
    label += inner.slice(at, inside.start);
    at = inside.end;
  }
  return (label + inner.slice(at)).replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
}

/** The links of a message, as `{url, text}` in the order they are written: those of its HTML
 *  first, then bare addresses in its text. */
export function linksIn({ html = "", text = "" } = {}) {
  const found = [];
  const source = String(html).slice(0, BODY_LIMIT * 2);
  for (const tag of tagsOf(source)) {
    if (tag.name === "a" && !tag.closing) {
      const url = webAddress(hrefOf(source.slice(tag.start, tag.end)));
      if (url) {
        found.push({ url, text: labelOf(source, tag.end, tag) });
      }
    }
  }
  const plain = String(text).slice(0, BODY_LIMIT * 2);
  for (const match of plain.matchAll(/https?:\/\/[^\s<>"'\])]+/gi)) {
    const url = webAddress(match[0].replace(/[.,;:!?]+$/, ""));
    if (url) {
      found.push({ url, text: "" });
    }
  }
  return found;
}

// What a link is plainly not the posting: the sender's own housekeeping, a social network, a
// tracking pixel, the schema a mail's markup names.
const NOT_POSTING_HOSTS = [
  "facebook.com", "twitter.com", "x.com", "instagram.com", "youtube.com", "youtu.be", "tiktok.com",
  "pinterest.com", "t.co", "w3.org", "schemas.microsoft.com", "apple.com", "play.google.com", "gravatar.com",
];
const NOT_POSTING_WORDS = /unsubscri|opt-?out|optout|preferences|manage-?(?:your-)?(?:subscription|alerts?|email)|email-?settings|privacy|terms|view-?in-?browser|web-?version|viewonline|unsub\b|\.(?:gif|png|jpe?g|svg)(?:$|\?)/i;
const POSTING_WORDS = /\b(?:jobs?|careers?|vacanc|apply|posting|position|opening|emploi|offre|vaga|candidat|stellen|bewerb)/i;

/** Which of a message's links may be the posting, best guess first, at most a dozen.
 *  A link counts once however often it is written (its fragment aside); the ones that look
 *  like a job (the address or its words say so) come before the rest. */
export function postingLinks(links) {
  const seen = new Set();
  const kept = [];
  for (const link of links || []) {
    let url;
    try {
      url = new URL(link.url);
    } catch {
      continue;
    }
    url.hash = "";
    const host = url.hostname.replace(/^www\./, "");
    const address = url.href;
    if (address.length > LINK_LIMIT || seen.has(address)) {
      continue;
    }
    if (NOT_POSTING_HOSTS.some((bad) => host === bad || host.endsWith(`.${bad}`))) {
      continue;
    }
    if (NOT_POSTING_WORDS.test(address) || NOT_POSTING_WORDS.test(link.text || "")) {
      continue;
    }
    seen.add(address);
    kept.push({ url: address, text: link.text || "", likely: POSTING_WORDS.test(`${address} ${link.text || ""}`) });
  }
  return [...kept.filter((link) => link.likely), ...kept.filter((link) => !link.likely)].slice(0, MOST_LINKS);
}

/** The page sent for a message: its body under its cleaned subject as the title, and
 *  nothing from the message that runs or loads. A page with no text is "" -- there is
 *  nothing to read, and Postulo is better asked to fetch the address. */
export function pageFromMessage({ subject, html = "", text = "" }) {
  const title = cleanSubject(subject);
  const body = html ? sanitise(html) : textToHtml(text);
  if (!title || !body.replace(/<[^>]*>/g, "").trim()) {
    return "";
  }
  const safe = escapeHtml(title);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${safe}</title></head><body><h1>${safe}</h1>${body}</body></html>`;
}
