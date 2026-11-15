// What this extension may do with a token, and when a token can do more than that.
//
// Postulo names what a token may do as scopes. This extension has two jobs and so two scopes
// it can use: `captures` (hand a posting to the review queue, #1) and `listings:bind` (file a
// message into a listing's history, #9). Both names are Postulo's, the same in every language.
// A token with any other scope can do more than the extension needs, and the token sits
// unencrypted in the profile (see the README), so the settings say so rather than accept it
// quietly (SEC2-085).

export const CAPTURES = "captures";
export const BIND = "listings:bind";

/** The scopes the extension can use, in the order the settings name them. */
export const SCOPES_USED = [CAPTURES, BIND];

/** What a token's scopes mean for this extension.
 *
 *  `extra`: scopes it holds that the extension never uses (the token is wider than its job).
 *  `usable`: the ones it holds that the extension does use.
 *  `neither`: it holds none of those, so the extension can do nothing with it. */
export function judgeScopes(me) {
  const held = Array.isArray(me && me.scopes) ? me.scopes.map(String) : [];
  const usable = SCOPES_USED.filter((scope) => held.includes(scope));
  const extra = held.filter((scope) => !SCOPES_USED.includes(scope));
  return { held, usable, extra, neither: usable.length === 0 };
}

/** What this extension can do with a token, scope by scope (#9): capture a posting (`captures`)
 *  and file a message into a listing's history (`listings:bind`). The popup offers only what
 *  the token can do, and the settings say what each allows. */
export function abilities(me) {
  const held = Array.isArray(me && me.scopes) ? me.scopes.map(String) : [];
  return { capture: held.includes(CAPTURES), file: held.includes(BIND) };
}
