import { newListingUrl, originPattern } from "./lib/api.js";
import { CONNECTION, SLOW_MS, checkConnection } from "./lib/connection.js";
import { footerState } from "./lib/footer.js";
import { draftOf, openCaptureWindow } from "./lib/capture-window.js";
import { explain, localise, t } from "./lib/i18n.js";
import { captureAvailability, linksIn, pageFromMessage, postingLinks, summarise } from "./lib/mail.js";
import { waitingCopy } from "./lib/waiting.js";
import { allCapturesUrl, listRows, rowLines } from "./lib/captures-list.js";
import { captureWindowHost, displayedMessages, ext, loadSettings, openInBrowser, openMessage, openSettings, readMessage, sentCaptures } from "./lib/thunderbird.js";

const $ = (id) => document.getElementById(id);

function say(text, isError = false) {
  const status = $("status");
  status.textContent = text;
  status.classList.toggle("error", isError);
}

/** The capture button: read the message now, and when it holds a link that may be the
 *  posting, hand it to the window the posting is corrected in. */
async function startCapture(header) {
  say(t("reading"));
  const message = await readMessage(header);
  const links = postingLinks(linksIn(message));
  if (!links.length) {
    $("no-address").hidden = false;
    say("");
    return;
  }
  $("no-address").hidden = true;
  await openCaptureWindow(captureWindowHost(), draftOf(message, links, pageFromMessage(message), crypto.randomUUID()));
  window.close();
}

/** The captures that need review, drawn from the copy of Postulo's list that is kept, so that
 *  they are there at once and when Postulo is away; drawn again when a fresh read lands.
 *  `outcome` is how that read went: unreachable or refused, and the list says it is the last
 *  one read. */
async function showReviewList(settings, outcome = "") {
  const copy = await waitingCopy(ext.storage.local, settings);
  const { rows, total } = listRows(copy ? copy.rows : [], await sentCaptures(), settings.instance);
  const tag = t("languageTag");
  const day = (iso) => (Number.isFinite(Date.parse(iso)) ? new Date(iso).toLocaleDateString(tag) : "");
  const stale = Boolean(copy) && (outcome === "unreachable" || outcome === "account");
  $("review-stale").hidden = !stale;
  $("review-stale").textContent = stale ? t("lastListed", [new Date(copy.at).toLocaleString(tag, { dateStyle: "long", timeStyle: "short" })]) : "";
  $("review-empty").hidden = total > 0;
  $("review-rows").replaceChildren(
    ...rows.map((row) => {
      const lines = rowLines(row, { t, day });
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = row.link || "#";
      // Opened in the person's web browser, where they are signed in, never inside the popup.
      link.addEventListener("click", (event) => {
        event.preventDefault();
        if (row.link) {
          openInBrowser(row.link);
        }
      });
      for (const [text, className] of [[lines.title, "title"], [lines.meta, "meta"]]) {
        const line = document.createElement("span");
        line.className = className;
        line.textContent = text;
        link.append(line);
      }
      item.append(link);
      if (row.fromMail) {
        const origin = document.createElement("p");
        origin.className = "muted small";
        origin.textContent = `${lines.origin} `;
        const open = document.createElement("button");
        open.type = "button";
        open.className = "link";
        open.textContent = t("openMessage");
        open.addEventListener("click", async () => {
          say((await openMessage(row.fromMail.messageId)) ? "" : t("messageGone"), false);
        });
        origin.append(open);
        item.append(origin);
      }
      return item;
    }),
  );
  $("review-all").hidden = total <= rows.length;
  $("all-captures").textContent = t("seeAllCaptures", [String(total)]);
  $("all-captures").href = allCapturesUrl(settings.instance);
  $("review-list").hidden = false;
}

/** Draw the footer's state before the address, and say it in words for a screen reader and the
 *  tooltip. A shape for each state: colour is never the only sign. */
async function showState(settings, live = {}) {
  const record = (await ext.storage.local.get(CONNECTION))[CONNECTION];
  const shown = footerState(settings, record, live, navigator.onLine);
  const state = $("state");
  state.hidden = !shown;
  if (!shown) {
    return;
  }
  const words = shown.state === "tokenRefused" ? t("tokenRefused", [t("tokenPath")]) : t(shown.key);
  state.dataset.state = shown.state;
  state.title = words;
  state.setAttribute("aria-label", words);
  for (const shape of state.querySelectorAll("svg")) {
    shape.hidden = shape.dataset.state !== shown.state;
  }
}

/** Show what is known of Postulo at once, then ask `/healthz` (timed) and show the answer;
 *  while the answer is slow in coming, say it is slow. Nothing is asked while the testing switch
 *  is on or Thunderbird is working offline. */
async function watchConnection(settings) {
  await showState(settings);
  if (!settings.instance || !settings.token || settings.offline || navigator.onLine === false) {
    return;
  }
  const slow = setTimeout(() => showState(settings, { slow: true }), SLOW_MS);
  try {
    await checkConnection({
      area: ext.storage.local,
      settings,
      allowed: () => ext.permissions.contains({ origins: [originPattern(settings.instance)] }).catch(() => false),
    });
  } finally {
    clearTimeout(slow);
  }
  await showState(settings);
}

async function main() {
  localise();
  const settings = await loadSettings();
  const connected = Boolean(settings.instance && settings.token);
  // A fresh number for the toolbar button: the background reads the list, and says nothing back.
  if (connected) {
    await showReviewList(settings).catch(() => {});
    $("all-captures").addEventListener("click", (event) => {
      event.preventDefault();
      openInBrowser(allCapturesUrl(settings.instance));
    });
    ext.runtime.sendMessage({ type: "refresh", fresh: true }).then(
      (outcome) => showReviewList(settings, outcome),
      () => {},
    ).catch(() => {});
  }
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
    // Opened in the person's web browser, where they are signed in, like every other address of
    // Postulo's: not left to how Thunderbird treats a link in a popup.
    server.addEventListener("click", (event) => {
      event.preventDefault();
      openInBrowser(settings.instance);
    });
  }

  // The button that adds a listing by hand opens Postulo's own page, in the person's web
  // browser, where they are signed in; it is shown once there is a Postulo to open.
  if (settings.instance) {
    $("new-listing").hidden = false;
    $("new-listing").addEventListener("click", () => openInBrowser(newListingUrl(settings.instance)));
  }

  watchConnection(settings).catch(() => {});

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
