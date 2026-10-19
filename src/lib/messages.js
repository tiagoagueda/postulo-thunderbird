// A sentence out of a catalogue, the way the browser's `i18n.getMessage` would give it.
//
// The browser will not say a sentence in a language other than its own, so when the person
// has chosen one the catalogue is read here and put together by the same rules: a named
// `$placeholder$` is replaced by the `content` its message declares (written in any case),
// that content's `$1` to `$9` by the substitutions, `$$` is a dollar sign, and what is not
// given is nothing. Pure, so a test can hold it against the catalogues.

export function resolveMessage(catalogue, key, substitutions = []) {
  const entry = catalogue && catalogue[key];
  if (!entry || typeof entry.message !== "string") {
    return "";
  }
  const given = Array.isArray(substitutions) ? substitutions : [substitutions];
  const named = new Map(
    Object.entries(entry.placeholders || {}).map(([name, placeholder]) => [name.toLowerCase(), placeholder.content ?? ""])
  );
  const numbered = (text) => text.replace(/\$([1-9])/g, (_, digit) => String(given[Number(digit) - 1] ?? ""));
  // One pass, so that a dollar sign a substitution brings is never read as a token.
  return entry.message.replace(/\$\$|\$([A-Za-z0-9_@]+)\$|\$([1-9])/g, (token, name, digit) => {
    if (token === "$$") {
      return "$";
    }
    return name ? numbered(named.get(name.toLowerCase()) ?? "") : numbered(`$${digit}`);
  });
}
