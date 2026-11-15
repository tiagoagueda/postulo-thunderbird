# postulo-thunderbird

**The Postulo extension for Thunderbird: job postings from your mail, sent to your own
[Postulo](https://source.tiagoagueda.com/postulo/postulo) for review.**

A posting often arrives by mail before it is anywhere else: an alert from a board, a
recruiter's message, a forward from a friend. The browser extension
([postulo-chromium](https://source.tiagoagueda.com/postulo/postulo-chromium)) captures the
page you are looking at; this one is for the message you are reading.

## What it does

- **It loads in Thunderbird** (128 or later, Manifest V3), with a button on the toolbar and
  one on the message you are reading. Both open the same popup.
- **Settings**: your Postulo's address and an API token, kept in this Thunderbird profile.
  *Test* asks Postulo who the token is; *Save* asks Thunderbird for permission to reach
  that address.
- **Two icon buttons at the top right of the popup** (#3): *Capture this posting*, which is off, with its reason in words, when no message is on screen, several are selected or Postulo is not set up; and *Add a listing from scratch*, which opens Postulo's own page for it in your web browser (where you are signed in; a tab inside Thunderbird would ask you to sign in again) and is hidden until an address is set.
- **Capture this posting** (#1): from the message on screen, the extension finds the link
  that is the posting (leaving out unsubscribe, tracking and social-network links, and asking
  which when there are several), builds a page from the message's text under its subject as
  the title, asks Postulo what it reads in it, shows that as a form (the sender offered as the
  company, marked as a guess), says when Postulo already holds the posting, and sends it for
  review with what you corrected. *Send the address alone* has Postulo fetch the page itself.
  A message with no link to a posting cannot be captured, and says so.
- **The number on the toolbar button** (#2): the postings captured from here that still wait for review in Postulo, once each by posting, read from Postulo's list of captures when Thunderbird starts, every 15 minutes, when the popup opens and when a capture is sent. With Postulo unreachable the last number stays. A capture sent from another Thunderbird profile is not counted: Postulo's list does not say which client sent a capture.
- **The captures that need review, in the popup** (#4): every capture waiting in Postulo, one row per posting (title, company and place, date, where it waits, how many captures of it), newest five and a link to all of them (Postulo's `/jobs/captures/` page). It is drawn from the last list read, so it is there at once and when Postulo is away, and then says when that list was read. A capture sent from here names its message and can open it again by its `Message-ID`; a message since deleted says so. A row, and every other address of Postulo's in the popup, opens in your web browser, where you are signed in (#5): a tab or window inside Thunderbird has cookies of its own and would ask you to sign in again.
- **Postulo's state in the popup's footer** (#6), before the address: a green tick when Postulo answered `/healthz` within a second, an orange clock when it was slower (or has not answered after a second), a red cross when nothing answered, a padlock when Thunderbird has no permission for the address, a key when the token is refused, a grey flask when the testing switch is on (*Settings: Act as if Postulo cannot be reached*; nothing is asked while it is on), and a crossed-out signal while Thunderbird is working offline (nothing is asked then either). Each has its own shape and is named in words for a screen reader and the tooltip.
- English, French and European Portuguese.

What is not here yet is an [issue](https://source.tiagoagueda.com/postulo/postulo-thunderbird/issues)
each: filing a message into
a listing's history, and keeping a capture here until Postulo can be reached (a capture made
- **File this message into a listing's history** (#9): with a token that holds `listings:bind`, the popup offers *File this message into a listing*: it lists your listings (`GET /listings/choices`, narrowed by what you type), the ones that look like the message first (the sender's company, words of the subject), shows what will be sent (the text without the replies quoted under it and the signature, or the subject alone) and adds it to the chosen listing's history (`POST /listings/{id}/events`, kind `email_received`). The message's own `Message-ID` is the entry's `external_id`, so filing one message twice leaves one entry, and the popup says when nothing was added. *Test* says what the token can do, scope by scope; a token without `listings:bind` is not offered filing and the settings say why.
- English, French and European Portuguese.

What is not here yet is an [issue](https://source.tiagoagueda.com/postulo/postulo-thunderbird/issues)
each: the number on the toolbar button, the list of captures to review, and
keeping a capture here until Postulo can be reached (a capture made
while Postulo is away is not kept: the popup says so and nothing is lost but the effort).

It was loaded once into Thunderbird 156 as a temporary add-on, which accepted the manifest.
The popup and the settings page have not been clicked through by hand, and capturing has been
tested on the parts that do not need Thunderbird (reading links, building the page, the form's
corrections) and not on a real message.

## Privacy, as it stands

The full statement is [PRIVACY.md](PRIVACY.md). In short: when you press *Capture this posting*,
the extension reads the message on screen (its subject, sender, date, body and links), builds
a page from its text, and sends that page and the posting's address to **your own Postulo**
and to nobody else. Scripts, styles and remote images are dropped from the page first, and a
remote image in a message is never loaded. Nothing is read until you press the button. It
keeps, in this profile, the subject, sender and `Message-ID` of each message it has sent, and
the address and the token. Besides, the popup asks Postulo's `/healthz` (no token sent) to show the footer's state, and who the token is only when that is not known yet. It has no analytics and contacts nobody else.

**The token is stored unencrypted.** No WebExtension API offers encrypted storage, and
Thunderbird's primary password protects the passwords of your mail accounts, not an
extension's storage. Anyone or anything that can read your profile folder (another program of
yours, a backup, a synced folder) can read the token and use it until you revoke it under
*Settings → API tokens* in Postulo. The settings page says so, and has a **Forget token**
button that removes the token from the profile (the address stays); that does not revoke it,
so revoke it in Postulo too.

**Which scopes.** No scope is needed yet: capturing and filing are still to be built (#1, #9),
and the only request is `GET /me`. The extension will use two: `captures` (hand a posting to your
review queue) and `listings:bind` (file a message into a listing's history); make the token
with only the ones you want it to use. *Test* and *Save* both ask Postulo what the token may do
and warn when it holds anything else, or neither of the two, because a token that can do more
than the extension needs is worth more to whoever reads it out of the profile. Whether the two
scopes belong on one token or two is open (#30, #9).

## Try it

```sh
npm ci
npm test         # the catalogues, the manifest, the shared files, the message reader
npm run build    # dist/postulo-thunderbird-<version>.xpi
```

To load it without installing: *Add-ons and Themes → the gear → Debug Add-ons → Load
Temporary Add-on*, and pick `src/manifest.json`. Or `npm start`, which runs a Thunderbird
with a profile of its own (give `web-ext` the path with `--firefox` if `thunderbird` is not
on your `PATH`).

Then, in Postulo, **Settings → API tokens → New token**, tick only `captures` and/or `listings:bind`, and paste
the address and the token into the extension's settings.

## Shared with the browser extension

Talking to Postulo (`src/lib/api.js`), filling a page from the catalogues
(`src/lib/i18n.js`, with `messages.js`, which it imports; whether Postulo answers, `src/lib/connection.js`; `languages.js` is this extension's own, written by `scripts/languages.py`), the stylesheet, and counting the postings waiting for review (`src/lib/waiting.js`, `review.js`, and `store.js`, which they import) are postulo-chromium's, copied here.
`shared.json` names the commit they were copied from and each file's SHA-256, and
`npm test` fails when a copy no longer matches, and `npm run shared:verify` (CI runs it) fetches
postulo-chromium and fails when a recorded hash is not that file's hash at the recorded commit, or
that commit is not on its `main`. To change one, change it there, then:

```sh
npm run shared:sync    # copies again from ../postulo-chromium (refused unless its origin is postulo-chromium,
                       # the tree is clean and HEAD is on its origin/main) and writes the new commit and hashes
```

The mark is one vector, `src/icons/postulo.svg`, for the popup, the toolbar buttons and the
add-on's icon alike: Thunderbird takes SVG icons ("Thunderbird supports basic image types
like PNG files, but also SVG files",
<https://developer.thunderbird.net/add-ons/mailextensions>), so no raster is kept
(postulo/postulo#1238). It is a byte-for-byte copy of the core's served
`src/postulo/static/brand/logo.svg`, which the core's `scripts/brand.py` makes from
`assets/brand/postulo.svg`; postulo-chromium keeps the same copy in `src/icons/`, and the
file joins `shared.json` once that is released.

Everything that touches Thunderbird's own API is in `src/lib/thunderbird.js`, so the shared
files stay free of it.

## Languages

English is the source; every other language is a draft no native speaker has reviewed. A
language code here is a BCP 47 tag in its canonical form (`pt-PT`), as postulo/postulo#337
decided for the whole project. The folders under `src/_locales/` are named the way
Thunderbird demands, with an underscore (`pt_PT`) and never a script (Serbian's is `sr`, its
tag `sr-Cyrl`).

**Which languages.** The ones the Postulo core, the release this one is released beside,
has a catalogue for: English plus every language in the core's roll-out, whether or not
its catalogue has got far. (postulo-chromium ships only the languages the core has
started; this extension follows the whole roll-out, and Weblate fills each.) The list is
`src/lib/languages.js` (folder, tag, direction, own name), and it is written, not kept by
hand: `python scripts/languages.py` reads the core checked out beside this repository
(`../postulo`, or `POSTULO_CORE`) and rewrites it; `--check` fails on a difference, and
`npm test` runs that check wherever a core is checked out (CI has none, so it is skipped
there). Run it when a new core release starts a language, and let Weblate hand over the
catalogue. `npm test` fails on a folder the list does not name, and the build leaves out a
language whose catalogue is not complete. A language written right to left (Arabic,
Urdu, ...) gets its page's `dir` from the catalogue; the style sheet, which is shared with
the browser extension, names no physical side, and `npm test` holds it to that.

**Translations are made in Weblate, never in a commit** (postulo/postulo#706): in the `postulo`
project at <https://translate.tiagoagueda.com/projects/postulo/>, in this extension's
component, which drafts a new sentence by machine and brings what speakers save back as a
pull request from its `weblate` branch. To add or change a sentence, change `en` and nothing
else. `node scripts/guard.mjs`, in CI, refuses a commit that writes or changes a sentence in
another language unless Weblate made it; `npm test` refuses a sentence English lacks, an
empty one and different placeholders, and a key the code asks for that `en` does not have.
A language Weblate has only part of is left out of the package by the build.

Each shipped catalogue's `languageTag` and `direction` are written by `scripts/build.mjs`
from the folder's name, not kept in the catalogues: they are not sentences, and a machine
would translate `ltr`. `npm run lint`, `npm run build` and `npm start` stage the extension in
`dist/src` first.

## Layout

| Path | What |
| --- | --- |
| `src/manifest.json` | Manifest V3 for Thunderbird 128 and later |
| `src/popup.*` | The popup: the message on screen, the buttons, the list of captures to review |
| `src/capture.*`, `src/lib/capture-window.js` | The window the posting is corrected in and sent from, and the draft the popup hands it |
| `src/options.*` | Address, token, *Test*, *Save* |
| `src/background.js`, `src/lib/badge.js` | The number on the toolbar button: read on a timer, painted from the last list |
| `src/lib/thunderbird.js` | Thunderbird's own API: settings, permissions, the message on screen |
| `src/lib/scopes.js` | The two scopes the extension can use, and when a token holds more |
| `src/lib/mail.js` | Reading a message: its header, its links, the page built from it; pure functions, tested with `node --test` |
| `src/lib/captures-list.js` | The popup's list of captures to review: the browser extension's rows, marked with the message each came from |
| `src/lib/footer.js` | The footer's state: the browser extension's `connection.js` and Thunderbird working offline |
| `src/lib/filing.js` | Filing a message: its text without quotes, the entry, the listings ranked by how they match |
| `src/lib/correction.js`, `sent.js`, `postulo.js` | The form's starting values and corrections; the captures sent from here; the preview call |
| `src/lib/api.js`, `i18n.js`, `messages.js`, `waiting.js`, `review.js`, `store.js`, `connection.js`, `src/style.css` | Shared with postulo-chromium; see `shared.json` |
| `src/icons/postulo.svg` | Postulo's mark, the core's served vector (see above) |
| `src/_locales/` | One `messages.json` per language; `en` is the source |
| `scripts/audit.mjs` | Fails CI on a new high or critical advisory in the development chain |
| `scripts/shared.mjs` | Checks the shared files, and copies them again |
| `scripts/build.mjs` | Stages the extension in `dist/src`, with each catalogue's language and direction |
| `scripts/guard.mjs` | Refuses translations written outside Weblate (a copy of postulo-chromium's) |

```sh
npm run lint     # web-ext lint: it warns about `messagesRead`, Thunderbird's own permission
```

The version is the one of the Postulo this is released beside (postulo/postulo#186).

## Licence

AGPL-3.0-or-later, like Postulo.
