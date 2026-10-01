// Runs with `node --test`: the files shared with the browser extension are still its files.
import assert from "node:assert/strict";
import { test } from "node:test";

import { drifted, record } from "../scripts/shared.mjs";

test("the pin is a commit, which cannot move", () => {
  assert.match(record().ref, /^[0-9a-f]{40}$/);
});

test("every shared file is the copy shared.json recorded", () => {
  assert.deepEqual(drifted(), [], "change a shared file in postulo-chromium, then `npm run shared:sync`");
});
