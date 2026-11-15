import { ADDRESS_LIMIT, capture, describe, known, newListingUrl } from "./lib/api.js";
import { corrections, formOf } from "./lib/correction.js";
import { explain, localise, t } from "./lib/i18n.js";
import { captureAvailability, linksIn, pageFromMessage, postingLinks, summarise } from "./lib/mail.js";
import { preview } from "./lib/postulo.js";
import { entryOf } from "./lib/sent.js";
import { displayedMessages, ext, keepSentCapture, loadSettings, openInBrowser, openSettings, readMessage } from "./lib/thunderbird.js";

const $ = (id) => document.getElementById(id);

function say(text, isError = false) {
  const status = $("status");
  status.textContent = text;
  status.classList.toggle("error", isError);
}

/** What the person is working on: the message, the page made of it, the address chosen. */
const work = { settings: null, message: null, page: "", url: "", read: null, key: "", reviewUrl: "" };

/** The address chosen among the links, or the one there is. */
function chosenUrl() {
  const picked = document.querySelector('input[name="link"]:checked');
  return picked ? picked.value : work.url;
}

function fillForm(form) {
  $("f-title").value = form.values.title;
  $("f-company").value = form.values.company_name;
  $("f-location").value = form.values.location;
  $("company-guess").hidden = !form.guessed;
}

/** Ask Postulo what it reads for the address chosen and fill the form from it, and whether it
 *  already holds that posting. A failure is said, and the address alone can still be sent. */
async function read() {
  const { instance, token } = work.settings;
  work.url = chosenUrl();
  work.read = null;
  $("send").disabled = true;
  $("known").hidden = true;
  say(t("previewing"));
  try {
    if (work.page) {
      work.read = await preview(instance, token, { url: work.url, html: work.page });
      fillForm(formOf(work.read, work.message));
      $("send").disabled = false;
    }
    say("");
  } catch (error) {
    fillForm(formOf(null, work.message));
    say(explain(error), true);
  }
  try {
    const [seen] = await known(instance, token, [{ url: work.url, title: work.message.subject }]);
    const before = seen && [...seen.captures, ...seen.listings][0];
    if (before) {
      $("known").textContent = t("capturedBefore", [before.title || work.url]);
      $("known").hidden = false;
    }
  } catch {
    // Whether Postulo knows it is a courtesy; sending does not wait on it.
  }
}

function listLinks(links) {
  const list = $("link-list");
  list.replaceChildren();
  links.forEach((link, index) => {
    const row = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "link";
    radio.value = link.url;
    radio.checked = index === 0;
    radio.addEventListener("change", read);
    row.append(radio, ` ${link.text || link.url}`);
    row.title = link.url;
    list.append(row);
  });
  $("links").hidden = links.length < 2;
}

/** The capture button: read the message now, and offer what it holds. */
async function startCapture(header) {
  say(t("reading"));
  $("done").hidden = true;
  work.message = await readMessage(header);
  const links = postingLinks(linksIn(work.message));
  if (!links.length) {
    $("no-address").hidden = false;
    $("review").hidden = true;
    say("");
    return;
  }
  $("no-address").hidden = true;
  work.page = pageFromMessage(work.message);
  work.key = crypto.randomUUID();
  listLinks(links);
  $("review").hidden = false;
  await read();
}

/** Send what the form shows, or only the address. */
async function send(addressOnly) {
  const { instance, token } = work.settings;
  $("send").disabled = true;
  $("send-address").disabled = true;
  say(t("sending"));
  try {
    const typed = {
      title: $("f-title").value,
      company_name: $("f-company").value,
      location: $("f-location").value,
    };
    const url = chosenUrl().slice(0, ADDRESS_LIMIT);
    const answer = addressOnly
      ? await capture(instance, token, { url, key: `${work.key}:address` })
      : await capture(instance, token, { url, html: work.page, data: corrections(work.read, typed), key: work.key });
    await keepSentCapture(entryOf(answer, work.message)).catch(() => {});
    work.reviewUrl = answer.review_url || "";
    $("done-text").textContent = t("sentDone", [describe(answer, t("untitled"))]);
    $("open-review").hidden = !work.reviewUrl;
    $("done").hidden = false;
    $("review").hidden = true;
    say("");
  } catch (error) {
    say(explain(error), true);
    $("send").disabled = !work.read;
  } finally {
    $("send-address").disabled = false;
  }
}

async function main() {
  localise();
  const settings = await loadSettings();
  work.settings = settings;
  const connected = Boolean(settings.instance && settings.token);
  // A fresh number for the toolbar button: the background reads the list, and says nothing back.
  if (connected) {
    ext.runtime.sendMessage({ type: "refresh", fresh: true }).catch(() => {});
  }
  $("open-options").addEventListener("click", openSettings);
  $("options-link").addEventListener("click", openSettings);
  $("open-review").addEventListener("click", () => openInBrowser(work.reviewUrl));

  $("not-connected").hidden = connected;
  if (connected) {
    // Where a capture will go, in the corner: always visible, never in the way.
    const server = $("server");
    server.textContent = settings.instance;
    server.title = settings.instance;
    server.href = settings.instance;
    server.hidden = false;
  }

  // The button that adds a listing by hand opens Postulo's own page, in the person's web
  // browser, where they are signed in; it is shown once there is a Postulo to open.
  if (settings.instance) {
    $("new-listing").hidden = false;
    $("new-listing").addEventListener("click", () => openInBrowser(newListingUrl(settings.instance)));
  }
  $("review").addEventListener("submit", (event) => {
    event.preventDefault();
    send(false);
  });
  $("send-address").addEventListener("click", () => send(true));

  try {
    const shown = await displayedMessages();
    const header = shown.length === 1 ? shown[0] : null;
    const { ok, why } = captureAvailability(shown.length, connected);
    if (header) {
      const { subject, sender } = summarise(header);
      $("subject").textContent = subject || t("noSubject");
      $("sender").textContent = sender ? t("messageFrom", [sender]) : "";
    } else {
      $("message").hidden = true;
    }
    $("capture").disabled = !ok;
    // Why it is off, in words, unless the note about not being set up already says it.
    if (!ok && why !== "notConnected") {
      $("why-not").textContent = why === "severalMessages" ? t("severalMessages") : t("noMessage");
      $("why-not").hidden = false;
    }
    if (ok) {
      $("capture").addEventListener("click", () => startCapture(header).catch((error) => say(explain(error), true)));
    }
  } catch (error) {
    say(explain(error), true);
  }
}

main();
