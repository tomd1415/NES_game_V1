// Regression for the bug-hunt's critical finding: the Code page's "▶ Play in
// NES" was completely broken — play() referenced an undeclared `src` (removed
// in the BR-02 flush refactor), throwing `ReferenceError: src is not defined`
// under 'use strict' BEFORE the build was ever kicked off.  The build pill
// stuck on "compiling…" forever and no ROM was produced.
//
// This drives the real button against a live server, so it exercises the whole
// in-browser Play pipeline end-to-end (assemble → POST /play → cc65 → jsnes),
// which the Node syntax-only guards can't reach.
import { test, expect, open } from './_fixtures.js';

test('Code page "Play in NES" builds and boots the stock engine (no ReferenceError)', async ({ page }) => {
  test.setTimeout(60_000);   // a real cc65 build runs server-side
  // `?stay=1` bypasses code.html's "no custom C → bounce to Builder" redirect,
  // so a fresh project lands on the Code page instead of the Builder.
  await open(page, 'code.html?stay=1');

  // The page seeds the stock Step_Playground main.c into the CodeMirror editor
  // from /default-main-c; wait for it to land so flushSave() has real code to
  // build (Play also flushes the editor on click, so this is best-effort).
  await page.waitForFunction(() => {
    const cm = document.querySelector('.CodeMirror');
    return cm && cm.CodeMirror && cm.CodeMirror.getValue().includes('main');
  }, { timeout: 15_000 }).catch(() => {});

  await page.locator('#btn-play').click();

  // The build pill must leave "compiling…" — with the bug it never did.
  await expect(page.locator('#build-pill')).toHaveText(/built|failed/i, { timeout: 45_000 });
  // The stock engine compiles cleanly, so it must be "built", and the emulator
  // dialog must open with a real ROM.
  await expect(page.locator('#build-pill')).toHaveText(/built/i);
  await expect(page.locator('#emu-dialog')).toBeVisible();

  // The specific symptom must not appear.
  const errs = page.__errors();
  expect(errs.join('\n')).not.toMatch(/src is not defined/);
});
