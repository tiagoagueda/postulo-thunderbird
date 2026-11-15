// The window the posting is corrected in (#5), and the draft that is handed to it.
//
// The popup closes the moment focus leaves it, which is no place to correct a posting. So the
// popup reads the message, keeps what it read as a draft, and opens a window of the extension's
// own that survives a click elsewhere. One window: pressing capture while it is open brings it
// forward with the new draft, and does not open another.
//
// Everything here works over a `host` (Thunderbird's windows and one storage area), so it is
// tested without Thunderbird.

/** The storage keys: the draft, and the id of the window that is open. */
export const DRAFT = "draft";
export const WINDOW = "captureWindow";

/** The window's size, for the form and nothing else. */
export const SIZE = { width: 500, height: 700 };

/** What the window needs of a message: the words that name it, the page built from it, the
 *  links it may be about, and a key that makes a repeated send one capture. */
export function draftOf(message, links, page, key) {
  return {
    message: {
      subject: message.subject || "",
      sender: message.sender || "",
      senderName: message.senderName || "",
      messageId: message.messageId || "",
    },
    page,
    links,
    key,
  };
}

/** Keep the draft and show it: bring the window forward when it is open, else open one.
 *  Resolves to the window's id. `host` is `{area, windows, url}`. */
export async function openCaptureWindow(host, draft) {
  await host.area.set({ [DRAFT]: draft });
  const open = (await host.area.get(WINDOW))[WINDOW];
  if (open !== undefined) {
    try {
      await host.windows.update(open, { focused: true });
      return open;
    } catch {
      // Closed since, without our hearing of it: open another.
    }
  }
  const made = await host.windows.create({ url: host.url, type: "popup", ...SIZE });
  await host.area.set({ [WINDOW]: made.id });
  return made.id;
}

/** The draft kept for the window, or null. */
export async function readDraft(area) {
  const draft = (await area.get(DRAFT))[DRAFT];
  return draft && Array.isArray(draft.links) && typeof draft.page === "string" ? draft : null;
}

/** A window was closed: if it was ours, forget it and the draft. */
export async function windowClosed(area, id) {
  if ((await area.get(WINDOW))[WINDOW] === id) {
    await area.remove([WINDOW, DRAFT]);
    return true;
  }
  return false;
}
