// Every sentence the extension shows, in the language the browser is set to.
//
// The browser chooses: it matches its own language against the folders under _locales and
// falls back to English, the manifest's default_locale, for one nobody has translated. There
// is nothing to pick and nothing stored. The languages are the ones Postulo itself is
// translated into, so the extension and the instance it talks to speak alike.

const api = globalThis.browser ?? globalThis.chrome;

/** The sentence for `key`, with `substitutions` in place of its placeholders. */
export function t(key, substitutions = []) {
  // A missing key shows as itself rather than as nothing: an empty button is worse than an
  // odd word, and the tests keep every key present in every language anyway.
  return api?.i18n?.getMessage(key, substitutions) || key;
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
  return (error && error.message) || String(error);
}
