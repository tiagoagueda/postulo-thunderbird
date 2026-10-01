// The background: nothing yet.
//
// It reads no message and sends nothing. What belongs here later is what has to happen
// with no window open: the number on the toolbar button, and trying again to send what
// could not be sent.
//
// It does not open the settings when the extension is installed, as the browser extension
// does: Thunderbird refuses `runtime.openOptionsPage()` at that moment ("An unexpected
// error occurred", seen on Thunderbird 156). The popup's own buttons open them, from a click.
