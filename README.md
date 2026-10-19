# postulo-thunderbird

**The Postulo extension for Thunderbird: job postings from your mail, sent to your own
[Postulo](https://source.tiagoagueda.com/postulo/postulo) for review.**

A posting often arrives by mail before it is anywhere else: an alert from a board, a
recruiter's message, a forward from a friend. The browser extension
([postulo-chromium](https://source.tiagoagueda.com/postulo/postulo-chromium)) captures the
page you are looking at; this one is for the message you are reading.

## A skeleton, for now

This is the frame the extension will be built in, not the extension. What is here:

- **It loads in Thunderbird** (128 or later, Manifest V3), with a button on the toolbar and
  one on the message you are reading. Both open the same popup.
- **Settings**: your Postulo's address and an API token, kept in this Thunderbird profile.
  *Test* asks Postulo who the token is; *Save* asks Thunderbird for permission to reach
  that address.
- **The popup shows the message on screen**: its subject, without "Re:" and "Fwd:", and
  who sent it. That is all it does with a message.
- English, French and European Portuguese.

What is not here yet:

- **Capturing.** The *Capture this posting* button is there and switched off. Nothing is
  read beyond the subject and the sender, and nothing about a message is sent anywhere.
- Everything that follows from it: the list of captures to review, the number on the
  button, filing a message into a listing's history. Each is an
  [issue](https://source.tiagoagueda.com/postulo/postulo-thunderbird/issues).

It was loaded once into Thunderbird 156 as a temporary add-on, which accepted the manifest.
The popup and the settings page have not been clicked through by hand.

## Privacy, as it stands

The extension reads the subject and the sender of the message on screen, when you open its
popup, and shows them to you. It sends them nowhere. The only request it makes is the one
*Test* makes, to the address you typed: it asks your Postulo who the token belongs to.
It has no analytics and contacts nobody else. The address and the token stay in this
Thunderbird profile (`storage.local`).

**The token is stored unencrypted.** No WebExtension API offers encrypted storage, and
Thunderbird's primary password protects the passwords of your mail accounts, not an
extension's storage. Anyone or anything that can read your profile folder (another program of
yours, a backup, a synced folder) can read the token and use it until you revoke it under
*Settings → API tokens* in Postulo. The settings page says so, and has a **Forget token**
button that removes the token from the profile (the address stays); that does not revoke it,
so revoke it in Postulo too.

**Which scopes.** The extension can use two: `captures` (hand a posting to your review queue)
and `listings:bind` (file a message into a listing's history). Make the token with only the
ones you want it to use. *Test* lists what the token may do and warns when it holds anything
else, or neither of the two, because a token that can do more than the extension needs is
worth more to whoever reads it out of the profile. Neither scope is used yet: capturing and
filing are still to be built (#1, #9).

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
(`src/lib/i18n.js`, with `languages.js` and `messages.js`, which it imports), the stylesheet and the icons are postulo-chromium's, copied here.
`shared.json` names the commit they were copied from and each file's SHA-256, and
`npm test` fails when a copy no longer matches. To change one, change it there, then:

```sh
npm run shared:sync    # copies again from ../postulo-chromium and writes the new commit and hashes
```

Everything that touches Thunderbird's own API is in `src/lib/thunderbird.js`, so the shared
files stay free of it.

## Languages

English is the source; French and European Portuguese are drafts no native speaker has
reviewed. A language code here is a BCP 47 tag in its canonical form (`pt-PT`), as
postulo/postulo#337 decided for the whole project. The folders under `src/_locales/` are
named the way Thunderbird demands, with an underscore (`pt_PT`).

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
| `src/popup.*` | The popup: the message on screen, and the capture button to be built |
| `src/options.*` | Address, token, *Test*, *Save* |
| `src/background.js` | Nothing yet; where the number on the button and retries will live |
| `src/lib/thunderbird.js` | Thunderbird's own API: settings, permissions, the message on screen |
| `src/lib/scopes.js` | The two scopes the extension can use, and when a token holds more |
| `src/lib/mail.js` | Reading a message's header: pure functions, tested with `node --test` |
| `src/lib/api.js`, `src/lib/i18n.js`, `languages.js`, `messages.js`, `src/style.css`, `src/icons/` | Shared with postulo-chromium; see `shared.json` |
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
