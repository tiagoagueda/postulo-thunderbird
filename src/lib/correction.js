// The form a posting is checked in before it is sent (#1): what Postulo read, what this
// extension can offer where it read nothing, and what the person changed.

/** The fields the form shows: the ones a message most often has wrong or empty. */
export const FIELDS = ["title", "company_name", "location"];

/** The form's starting values. Where Postulo read no title the message's subject stands in;
 *  where it read no company the sender's name is offered, and `guessed` says so, so that the
 *  form can mark it. `senderName` is the name in the From header: a sender with only an address is not offered, for it names nobody. */
export function formOf(read, message) {
  const data = (read && read.data) || {};
  const sender = (message && message.senderName) || "";
  const company = data.company_name || "";
  return {
    values: {
      title: data.title || (message && message.subject) || "",
      company_name: company || sender,
      location: data.location || "",
    },
    guessed: !company && Boolean(sender),
  };
}

/** The corrections to send as `data`: each field whose typed value differs from what Postulo
 *  read (or, where it read nothing, from empty). A typed value that is empty where Postulo read
 *  something is not a correction either: an empty field is "left alone", never "cleared". */
export function corrections(read, typed) {
  const data = (read && read.data) || {};
  const changed = {};
  for (const field of FIELDS) {
    const now = String((typed && typed[field]) || "").trim();
    if (now && now !== String(data[field] || "").trim()) {
      changed[field] = now;
    }
  }
  return changed;
}
