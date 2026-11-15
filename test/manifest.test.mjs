// Runs with `node --test`: the manifest names things that exist, and asks for no more than it uses.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SOURCE = "src";
const manifest = JSON.parse(readFileSync(join(SOURCE, "manifest.json"), "utf8"));
const there = (path) => existsSync(join(SOURCE, path));

test("it is a Manifest V3 extension for a Thunderbird that supports one", () => {
  assert.equal(manifest.manifest_version, 3);
  const gecko = manifest.browser_specific_settings.gecko;
  assert.match(gecko.id, /^[\w.-]+@[\w.-]+$/, "an id of its own, so its storage survives an update");
  // Thunderbird 128 is the first release to support Manifest V3.
  assert.ok(Number.parseInt(gecko.strict_min_version, 10) >= 128, gecko.strict_min_version);
});

test("it carries the version of the Postulo it is released beside, in both places", () => {
  const packaged = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(manifest.version, packaged.version);
});

test("every file the manifest names is there", () => {
  const named = [
    ...Object.values(manifest.icons),
    manifest.action.default_popup,
    ...Object.values(manifest.action.default_icon),
    manifest.message_display_action.default_popup,
    ...Object.values(manifest.message_display_action.default_icon),
    manifest.options_ui.page,
    ...manifest.background.scripts,
  ];
  for (const path of named) {
    assert.ok(there(path), `${path} is named in the manifest and missing`);
  }
});

test("every script and stylesheet a page loads is there", () => {
  for (const page of ["popup.html", "options.html"]) {
    const html = readFileSync(join(SOURCE, page), "utf8");
    const loaded = [...html.matchAll(/(?:src|href)="([^"#:]+\.(?:js|css|png|svg))"/g)].map((match) => match[1]);
    assert.ok(loaded.length, `${page} loads something`);
    for (const path of loaded) {
      assert.ok(there(path), `${page} loads ${path}, which is missing`);
    }
  }
});

test("the mark is the vector everywhere, as Thunderbird takes SVG icons (postulo/postulo#1238)", () => {
  const icons = [
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
    ...Object.values(manifest.message_display_action.default_icon),
  ];
  for (const path of icons) assert.equal(path, "icons/postulo.svg");
  const svg = readFileSync(join(SOURCE, "icons", "postulo.svg"), "utf8");
  // What Gecko asks of an SVG icon (MDN, manifest.json `icons`): the namespace and a
  // viewBox; square, so it is not squeezed into the square it is drawn in.
  const [, width, height] = /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(svg);
  assert.equal(width, height);
  assert.doesNotMatch(svg, /<script|foreignObject|href="(?!#)/);
  assert.match(readFileSync(join(SOURCE, "popup.html"), "utf8"), /<img src="icons\/postulo\.svg"/);
});

test("it asks for what it uses and nothing more", () => {
  // Reading the message on screen, keeping the address and the token, and the alarm that reads
  // Postulo's list for the number on the toolbar button. The instance's
  // own origin is asked for when it is saved, never at install.
  assert.deepEqual([...manifest.permissions].sort(), ["alarms", "messagesRead", "storage"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.optional_host_permissions, ["https://*/*", "http://*/*"]);
});

test("no page may run a script that is not the extension's own", () => {
  assert.equal(manifest.content_security_policy.extension_pages, "script-src 'self'; object-src 'none'");
  for (const page of ["popup.html", "options.html"]) {
    const html = readFileSync(join(SOURCE, page), "utf8");
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/, `${page} has an inline script`);
    assert.doesNotMatch(html, /\son\w+="/, `${page} has an inline handler`);
  }
});
