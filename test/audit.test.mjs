// Runs with `node --test`: the audit gate fails closed (SEC3-002). npm exits 1 both for
// "advisories found" and for "could not ask", so only the shape of what it printed decides.
import assert from "node:assert/strict";
import { test } from "node:test";
import { judge, parseReport } from "../scripts/audit.mjs";

const advisory = (severity, name = "pkg") => ({
  name,
  fixAvailable: true,
  via: [{ severity, title: `a ${severity} one`, url: `https://github.com/advisories/GHSA-${severity}` }],
});
const report = (vulnerabilities) => JSON.stringify({ vulnerabilities, metadata: { vulnerabilities: {} } });

test("npm's error document is a refusal, not a pass", () => {
  const document = JSON.stringify({ message: "request to https://registry.npmjs.org/-/npm/v1/security/audits failed", error: { summary: "", detail: "" } });
  assert.throws(() => parseReport(document));
  assert.equal(judge(document).status, 2);
});

test("an empty string and text that is not JSON are refusals", () => {
  assert.equal(judge("").status, 2);
  assert.equal(judge("not json").status, 2);
  assert.equal(judge("null").status, 2);
  assert.equal(judge("[]").status, 2);
});

test("a document without vulnerabilities or metadata is a refusal", () => {
  assert.equal(judge("{}").status, 2);
  assert.equal(judge(JSON.stringify({ vulnerabilities: {} })).status, 2);
});

test("a clean report passes", () => {
  assert.deepEqual(judge(report({})), { status: 0, out: [], err: [] });
});

test("a high advisory fails with 1, a critical one too", () => {
  assert.equal(judge(report({ a: advisory("high", "a") })).status, 1);
  assert.equal(judge(report({ a: advisory("critical", "a") })).status, 1);
});

test("a listed advisory is allowed", () => {
  const result = judge(report({ a: advisory("high", "a") }), { "GHSA-high": "reason; look again 2027-01-01" });
  assert.equal(result.status, 0);
  assert.match(result.out[0], /allowed GHSA-high/);
});

test("a moderate advisory with a fix is printed and does not fail", () => {
  const result = judge(report({ a: advisory("moderate", "a") }));
  assert.equal(result.status, 0);
  assert.match(result.out[0], /moderate with a fix available GHSA-moderate/);
});
