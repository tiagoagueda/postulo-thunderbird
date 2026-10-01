import { explain, localise, t } from "./lib/i18n.js";
import { summarise } from "./lib/mail.js";
import { displayedMessage, loadSettings, openSettings } from "./lib/thunderbird.js";

const $ = (id) => document.getElementById(id);

function say(text, isError = false) {
  const status = $("status");
  status.textContent = text;
  status.classList.toggle("error", isError);
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
  } catch (error) {
    say(explain(error), true);
  }
}

main();
