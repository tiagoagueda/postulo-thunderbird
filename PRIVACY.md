# Privacy

Postulo for Thunderbird sends a job posting from a message to **your own Postulo**, the
instance whose address you type in its settings, and to nobody else.

## What it reads

Only the message on screen, and only when you press **Capture this posting** (the popup shows
its subject and sender when it is opened; that is shown to you and sent nowhere). Pressing the
button reads the message's subject, sender, date, `Message-ID`, body and links
(`messages.getFull`, under Thunderbird's `messagesRead` permission). Nothing is read in the
background, and no other message is looked at.

## What it sends, and where

- To preview and to capture: the posting's address (a link from the message), and a page built
  from the message's body under its subject as the title. Scripts, styles, frames, forms and
  pictures are dropped from the page first; no remote image in a message is ever loaded; the
  body is cut to 400,000 characters.
- With **Send the address alone**: the address only. Postulo then fetches the page itself.
- To ask whether Postulo already holds the posting: the address and the message's subject.
- What you corrected in the form (title, company, place).
- Every request carries the API token and goes to the address you set, over https (plain http
  only to this machine). A redirect is never followed.

Postulo stores a capture for you to review; what it keeps of the page is decided by your
Postulo's own settings.

## What it asks Postulo in the background

For the number on the toolbar button the extension reads your Postulo's list of captures waiting
for review (`GET /api/v1/captures`, the `captures` scope) when Thunderbird starts, every 15
minutes, when the popup opens and when a capture is sent. It keeps the last list (each row's id,
title, company, place, posting key, date and review link) in this profile, to show the number
while Postulo cannot be reached. The popup shows the same list. No message is read for this; a row that came from a message opens it again by its `Message-ID` when you press *Open the message*.

## What it keeps in this profile

- While the capture window is open: the page built from the message and its links, in Thunderbird's session storage (gone when the window closes or Thunderbird quits; in the profile's storage on a Thunderbird that has no session storage, and removed when the window closes).
- The address of your Postulo and the API token. **The token is stored unencrypted** (see the
  README) until you use *Forget token* in the settings, and revoke it in Postulo.
- For each capture sent from here: Postulo's id for it, the review link, and the message's
  subject, sender and `Message-ID`, so that the popup can name the message and open it again.
  At most 300 are kept. Nothing of the message's body is kept.

## What it never does

No analytics, no advertising, no third-party request, no message read before you ask.
