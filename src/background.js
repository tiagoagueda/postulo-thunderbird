// The background: the number on the toolbar button, which has to be right with no window open.
//
// It reads Postulo's list of captures waiting for review when Thunderbird starts, on a timer
// (an alarm), when the popup opens and when a capture is sent, and keeps the last list, so
// that a Postulo that cannot be reached leaves the number where it was. It reads no message.
//
// It does not open the settings when the extension is installed, as the browser extension
// does: Thunderbird refuses `runtime.openOptionsPage()` at that moment ("An unexpected
// error occurred", seen on Thunderbird 156). The popup's own buttons open them, from a click.

import { originPattern } from "./lib/api.js";
import { FRESH_MS, PERIOD_MINUTES, makeBadge } from "./lib/badge.js";
import { t } from "./lib/i18n.js";
import { draftArea, ext, loadSettings, sentCaptures } from "./lib/thunderbird.js";
import { windowClosed } from "./lib/capture-window.js";
import { WAITING } from "./lib/waiting.js";
import { SENT } from "./lib/sent.js";

const badge = makeBadge({
  area: ext.storage.local,
  action: ext.action,
  loadSettings,
  sentCaptures,
  allowed: (settings) => ext.permissions.contains({ origins: [originPattern(settings.instance)] }).catch(() => false),
  t,
});

const ALARM = "waiting";
const quietly = (work) => work.catch(() => {});

// Listeners are registered at once, whatever else is awaited: an event page that wakes for one
// must find its listener there.
ext.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) {
    quietly(badge.refresh());
  }
});

ext.runtime.onMessage.addListener((message) => {
  if (message && message.type === "refresh") {
    return badge.refresh({ maxAgeMs: message.fresh ? FRESH_MS : 0 }).then((result) => result.outcome, () => "unreachable");
  }
  return undefined;
});

ext.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") {
    return;
  }
  if ("instance" in changes || "token" in changes) {
    // Another Postulo or another account: the list kept is not its list.
    quietly(ext.storage.local.remove(WAITING).then(() => badge.refresh()));
  } else if (SENT in changes) {
    quietly(badge.refresh());
  }
});

// The capture window closed: forget it and the message's text kept for it.
ext.windows.onRemoved.addListener((id) => quietly(windowClosed(draftArea(), id)));

ext.alarms.create(ALARM, { periodInMinutes: PERIOD_MINUTES });
// Right at once from the copy kept, then from Postulo: the number survives a restart.
quietly(badge.repaint().then(() => badge.refresh()));
