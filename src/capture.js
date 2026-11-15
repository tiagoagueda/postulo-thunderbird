import { ADDRESS_LIMIT, capture, describe, known } from "./lib/api.js";
import { readDraft, DRAFT } from "./lib/capture-window.js";
import { corrections, formOf } from "./lib/correction.js";
import { explain, localise, t } from "./lib/i18n.js";
import { preview } from "./lib/postulo.js";
import { entryOf } from "./lib/sent.js";
import { draftArea, ext, keepSentCapture, loadSettings, openInBrowser } from "./lib/thunderbird.js";

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

/** Show a draft: the message it came from, its links and the form for the first of them. */
async function begin(draft) {
  $("done").hidden = true;
  $("review").hidden = false;
  $("subject").textContent = draft.message.subject || t("noSubject");
  $("sender").textContent = draft.message.sender ? t("messageFrom", [draft.message.sender]) : "";
  work.message = draft.message;
  work.page = draft.page;
  work.key = draft.key;
  listLinks(draft.links);
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
  work.settings = await loadSettings();
  $("review").addEventListener("submit", (event) => {
    event.preventDefault();
    send(false);
  });
  $("send-address").addEventListener("click", () => send(true));
  $("open-review").addEventListener("click", () => openInBrowser(work.reviewUrl));
  $("close").addEventListener("click", () => window.close());
  if (!(work.settings.instance && work.settings.token)) {
    $("not-connected").hidden = false;
    return;
  }
  const show = async () => {
    const draft = await readDraft(draftArea());
    if (draft) {
      await begin(draft);
    } else {
      say(t("noDraft"), true);
    }
  };
  // A second press of capture, while this window is open, hands it another message.
  ext.storage.onChanged.addListener((changes) => {
    if (DRAFT in changes && changes[DRAFT].newValue) {
      show().catch((error) => say(explain(error), true));
    }
  });
  await show();
}

main().catch((error) => say(explain(error), true));
