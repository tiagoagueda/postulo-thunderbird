// Every sentence the extension shows, in the language the browser is set to or, when the
// person has picked one in the settings, in that.
//
// By default the browser chooses: it matches its own language against the folders under
// _locales and falls back to English, the manifest's default_locale, for one nobody has
// translated. No browser lets an extension speak another language than its own, so a
// chosen language is read from its catalogue here and put together by hand (messages.js).
// The languages are the ones Postulo itself is translated into, so the extension and the
// instance it talks to speak alike.

import { LANGUAGES } from "./languages.js";
import { resolveMessage } from "./messages.js";

const api = globalThis.browser ?? globalThis.chrome;

// The catalogue of the chosen language, and its tag; null while the browser's own is used.
let chosen = null;
let chosenTag = "";

/** The sentence for `key`, with `substitutions` in place of its placeholders. */
export function t(key, substitutions = []) {
  // A missing key shows as itself rather than as nothing: an empty button is worse than an
  // odd word, and the tests keep every key present in every language anyway.
  if (chosen) {
    return resolveMessage(chosen, key, substitutions) || key;
  }
  return api?.i18n?.getMessage(key, substitutions) || key;
}

/** The tag of the catalogue in use, or "" when there is none to ask (outside a browser). */
export function languageTag() {
  return (chosen ? chosen.languageTag?.message : api?.i18n?.getMessage("languageTag")) || "";
}

/** Speak `tag` from now on, or the browser's language when it is empty or no longer shipped.
 *  Needs the catalogue read first, so it is asked for before a page is localised. */
export async function useLanguage(tag, fetchImpl = fetch) {
  const language = LANGUAGES.find((one) => one.tag === tag);
  if (!language) {
    chosen = null;
    chosenTag = "";
    return;
  }
  if (tag === chosenTag && chosen) {
    return;
  }
  try {
    const response = await fetchImpl(api.runtime.getURL(`_locales/${language.folder}/messages.json`));
    chosen = await response.json();
    chosenTag = tag;
  } catch {
    // The catalogue is part of the package, so this is not expected; the browser's language
    // is a better page than none.
    chosen = null;
    chosenTag = "";
  }
}

/** Speak the language stored in the settings, as every page and the background start by doing. */
export async function useStoredLanguage() {
  const { language } = await api.storage.local.get("language");
  await useLanguage(language || "");
}

/** Fill every marked element, and say which language and direction the page is in.
 *
 *  `lang` and `dir` come from the translation actually used, not from the browser's setting:
 *  a browser in a language with no translation reads the English one, and marking that page
 *  as Japanese would have a screen reader pronounce English with Japanese rules. */
export function localise(root = document) {
  document.documentElement.lang = t("languageTag");
  document.documentElement.dir = t("direction");
  for (const element of root.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const element of root.querySelectorAll("[data-i18n-label]")) {
    const label = t(element.dataset.i18nLabel);
    element.setAttribute("aria-label", label);
    element.title = label;
  }
}

/** Fill `element` with the sentence for `key`, where each placeholder is an element.
 *
 *  For the sentences that carry markup -- a menu path in <em>, a scope in <code>, a shortcut
 *  in <kbd> -- without handing a translation to innerHTML: each placeholder is given a
 *  private-use character, and the text is split on them and the elements put in their place. */
export function localiseWith(element, key, parts) {
  const markers = parts.map((_, index) => String.fromCharCode(0xe000 + index));
  const text = t(key, markers);
  element.replaceChildren();
  for (const piece of text.split(new RegExp(`([${markers.join("")}])`))) {
    const index = markers.indexOf(piece);
    if (index >= 0) {
      element.append(parts[index]);
    } else if (piece) {
      element.append(piece);
    }
  }
}

/** What an error means, in words: a Refusal carries a key, anything else its own message. */
export function explain(error) {
  if (error && error.key) {
    const substitutions = (error.substitutions || []).map((value) =>
      value && value.key ? t(value.key) : String(value)
    );
    return t(error.key, substitutions);
  }
  if (error && /quota/i.test(error.message || "")) {
    return t("storageFull");
  }
  return (error && error.message) || String(error);
}
