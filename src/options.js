import { normaliseInstance, originPattern, whoAmI } from "./lib/api.js";
import { explain, localise, localiseWith, t } from "./lib/i18n.js";
import { BIND, CAPTURES, abilities, judgeScopes } from "./lib/scopes.js";
import { forgetToken, keepScopes, loadSettings, requestHostPermission, saveSettings, setOffline } from "./lib/thunderbird.js";

const $ = (id) => document.getElementById(id);

function say(text, isError = false) {
  const status = $("status");
  status.textContent = text;
  status.classList.toggle("error", isError);
}

function values() {
  return {
    instance: normaliseInstance($("instance").value),
    token: $("token").value.trim(),
  };
}

function element(tag, text) {
  const made = document.createElement(tag);
  made.textContent = text;
  return made;
}

/** Ask Postulo who the token is and what it may do: the sentence that says so, and the warning
 *  when it is wider than the extension's job or useless to it ("" when it is neither). */
async function judgeToken({ instance, token }) {
  const me = await whoAmI(instance, token);
  await keepScopes(me.scopes).catch(() => {});
  const judged = judgeScopes(me);
  const can = abilities(me);
  // What each scope allows, in words: the popup offers only what the token can do.
  const allows = [can.capture ? t("tokenCanCapture") : t("tokenCannotCapture", [CAPTURES]), can.file ? t("tokenCanFile") : t("tokenCannotFile", [BIND])].join(" ");
  const scopes = judged.held.join(", ");
  const who = scopes ? t("tokenIsScoped", [me.name, me.owner, scopes]) : t("tokenIs", [me.name, me.owner]);
  const warning = judged.neither
    ? t("tokenNeither", [CAPTURES, BIND])
    : judged.extra.length
      ? t("tokenTooWide", [judged.extra.join(", ")])
      : "";
  return { who: `${who} ${allows}`, warning };
}

async function main() {
  localise();
  // The sentences that carry markup: a menu path and the scopes' names, which are Postulo's
  // own words and the same in every language.
  localiseWith($("token-hint"), "tokenHintScopes", [element("em", t("tokenPath")), element("code", CAPTURES), element("code", BIND)]);
  localiseWith($("token-stored"), "tokenStored", [element("em", t("tokenPath"))]);
  const settings = await loadSettings();
  $("instance").value = settings.instance;
  $("token").value = settings.token;
  $("offline").checked = settings.offline;
  $("offline").addEventListener("change", async () => {
    try {
      await setOffline($("offline").checked);
      say($("offline").checked ? t("offlineOn") : t("offlineOff"));
    } catch (error) {
      say(explain(error), true);
    }
  });

  $("settings").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const next = values();
      if (!next.token) {
        throw new Error(t("tokenMissing"));
      }
      // The manifest cannot list an address it does not know yet, so the instance's origin
      // is asked for here, from the click that saves it.
      const granted = await requestHostPermission(originPattern(next.instance));
      await saveSettings(next);
      if (!granted) {
        say(t("savedNoPermission"), true);
        return;
      }
      // Saving stores whatever token was typed; ask Postulo what it may do, as Test does, and
      // say so when it is wider than the extension's job (SEC3-004). An instance that cannot be
      // reached now does not undo the save.
      const saved = t("saved", [new URL(next.instance).host]);
      try {
        const judged = await judgeToken(next);
        say(judged.warning ? `${saved} ${judged.who} ${judged.warning}` : saved, Boolean(judged.warning));
      } catch {
        say(saved);
      }
    } catch (error) {
      say(explain(error), true);
    }
  });

  $("forget").addEventListener("click", async () => {
    try {
      await forgetToken();
      $("token").value = "";
      say(t("tokenForgotten", [t("tokenPath")]));
    } catch (error) {
      say(explain(error), true);
    }
  });

  $("test").addEventListener("click", async () => {
    try {
      const next = values();
      say(t("asking"));
      const granted = await requestHostPermission(originPattern(next.instance));
      if (!granted) {
        throw new Error(t("addressRefused"));
      }
      const { who, warning } = await judgeToken(next);
      say(warning ? `${who} ${warning}` : who, Boolean(warning));
    } catch (error) {
      say(explain(error), true);
    }
  });
}

main();
