import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";

/** Phase 7C replaced every native dialog with in-app UI: forms for input, a focus-trapped modal
 * for destructive confirmation. Native prompt()/confirm()/alert() block the event loop, cannot be
 * styled or reached by the e2e selectors, and are what the acceptance session is meant to prove
 * absent — so this test guards the regression instead of a human re-checking it every session. */

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));

const sourceFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = join(dir, entry.name);
  if (entry.isDirectory()) return sourceFiles(path);
  return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [path] : [];
});

// Comments are stripped first: a comment explaining why confirm() is gone must not fail the test.
const stripComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

const nativeDialog = /(?<![A-Za-z0-9_$.])(?:prompt|confirm|alert)\s*\(|\bwindow\s*\.\s*(?:prompt|confirm|alert)\s*\(/;

test("no native prompt/confirm/alert survives in client source", () => {
  const files = sourceFiles(sourceRoot);
  assert.ok(files.length > 10, `expected to scan the client source tree, found ${files.length} files`);
  const offenders = files.filter(file => nativeDialog.test(stripComments(readFileSync(file, "utf8"))));
  assert.deepEqual(offenders.map(file => file.slice(sourceRoot.length)), [], "use an in-app form or the focus-trapped modal instead of a native dialog");
});

test("the guard actually catches a native dialog", () => {
  // Without this the test above would keep passing if the pattern silently stopped matching.
  assert.ok(nativeDialog.test('const ok = confirm("break treaty?");'));
  assert.ok(nativeDialog.test("const name = window.prompt('city name');"));
  assert.ok(nativeDialog.test("alert(message);"));
  // Identifiers that merely end in those words stay legal.
  assert.equal(nativeDialog.test("const value = onConfirm(payload);"), false);
  assert.equal(nativeDialog.test("setPromptState(next);"), false);
  assert.equal(nativeDialog.test("props.confirm(payload);"), false);
});
