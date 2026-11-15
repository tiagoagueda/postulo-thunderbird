// The captures this extension has sent, kept in this Thunderbird profile: which message each
// came from, so that the popup can name it and open it again (#1), and the badge can count the
// ones sent from here (#2). Nothing of the message is kept but its subject and sender.

/** The storage key of the list: newest first. */
export const SENT = "sent";

/** The most remembered. Postulo's own list is the record; this is only what says "from here". */
export const MOST_SENT = 300;

const SHORT = 300;

/** What is kept of one capture sent: Postulo's id for it, the message's `Message-ID`, and the
 *  words that say which message that was. */
export function entryOf(answer, message, now = new Date()) {
  return {
    id: answer.id,
    reviewUrl: answer.review_url || "",
    messageId: String(message.messageId || "").slice(0, SHORT),
    subject: String(message.subject || "").slice(0, SHORT),
    sender: String(message.sender || "").slice(0, SHORT),
    at: now.toISOString(),
  };
}

/** `list` with `entry` first and the same capture, if there, once; cut to `MOST_SENT`. */
export function remember(list, entry) {
  const rest = (Array.isArray(list) ? list : []).filter((one) => one && one.id !== entry.id);
  return [entry, ...rest].slice(0, MOST_SENT);
}

/** The list as kept in a storage area. */
export async function sentList(area) {
  const kept = (await area.get(SENT))[SENT];
  return Array.isArray(kept) ? kept : [];
}

export async function keepSent(area, entry) {
  await area.set({ [SENT]: remember(await sentList(area), entry) });
}
