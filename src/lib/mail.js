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
