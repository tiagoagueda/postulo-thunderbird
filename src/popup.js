import { explain, localise, t } from "./lib/i18n.js";
import { chooseListings, entryFor, fileEntry, messageId } from "./lib/filing.js";
import { summarise } from "./lib/mail.js";
import { displayedMessage, fullMessage, loadSettings, openSettings } from "./lib/thunderbird.js";

const $ = (id) => document.getElementById(id);

function say(text, isError = false) {
  const status = $("status");
  status.textContent = text;
  status.classList.toggle("error", isError);
}

// Filing: read once when the popup opens, with the person's own settings, and sent only from
// the button. Nothing is chosen for the person: a listing is ticked by them or the button does nothing.
async function setUpFiling(settings, header) {
  const section = $("file");
  const full = await fullMessage(header.id);
  const id = messageId(full);
  section.hidden = false;

  async function list(q) {
    const holder = $("file-choices");
    const { items, count } = await chooseListings(settings.instance, settings.token, { q, externalId: id });
    holder.querySelectorAll("label").forEach((label) => label.remove());
    for (const item of items) {
      const label = document.createElement("label");
      label.className = "pick";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "listing";
      radio.value = String(item.id);
      radio.dataset.title = item.title;
      const text = document.createElement("span");
      // Foreign text goes in as text, never as markup.
      text.textContent = [item.title, item.company_name].filter(Boolean).join(" — ");
      label.append(radio, text);
      if (item.filed) {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = t("fileAlready");
        label.append(tag);
      }
      holder.append(label);
    }
    $("file-count").textContent = !items.length ? t("fileNone") : count > items.length ? t("fileMore", [String(items.length), String(count)]) : "";
  }

  $("file-search").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await list($("file-q").value);
    } catch (error) {
      say(explain(error), true);
    }
  });

  $("file-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const chosen = document.querySelector('#file-choices input[name="listing"]:checked');
    if (!chosen) {
      say(t("fileNeedsListing"), true);
      return;
    }
    $("file-button").disabled = true;
    try {
      const { created } = await fileEntry(settings.instance, settings.token, chosen.value, entryFor(header, full));
      say(created ? t("fileDone", [chosen.dataset.title]) : t("fileWasDone", [chosen.dataset.title]));
    } catch (error) {
      say(explain(error), true);
    } finally {
      $("file-button").disabled = false;
    }
  });

  await list("");
}

async function main() {
  localise();
  const settings = await loadSettings();
  const connected = Boolean(settings.instance && settings.token);
  $("open-options").addEventListener("click", openSettings);
  $("options-link").addEventListener("click", openSettings);

  $("not-connected").hidden = connected;
  if (connected) {
    // Where a capture will go, in the corner: always visible, never in the way.
    const server = $("server");
    server.textContent = settings.instance;
    server.title = settings.instance;
    server.href = settings.instance;
    server.hidden = false;
  }

  // What is on screen, read and shown: the one thing the skeleton does with a message.
  try {
    const header = await displayedMessage();
    if (!header) {
      $("subject").textContent = t("noMessage");
      return;
    }
    const message = summarise(header);
    $("subject").textContent = message.subject || t("noSubject");
    $("sender").textContent = message.sender ? t("messageFrom", [message.sender]) : "";
    if (connected) {
      await setUpFiling(settings, header);
    }
  } catch (error) {
    say(explain(error), true);
  }
}

main();
