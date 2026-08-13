// The dialog a child sees when their build fails.
//
// It had no test at all, which is how F22 survived: the server has two failure paths and
// only the cc65 one emits the "----- technical details -----" divider that this dialog
// uses to fold internals away. A generate-stage crash therefore rendered a Python
// traceback in the MAIN BODY, under a hard-coded heading telling the child their game was
// too big — advice that would have them delete work that was never the problem.
//
// Both cases are driven by intercepting /play, so the real showBuildError path runs
// against a response we control. Nothing here needs cc65.
const { test, expect } = require('@playwright/test');

async function failBuildWith(page, body) {
  await page.route('**/play', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }));
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  await page.locator('#btn-play').click();
  await expect(page.locator('.modal-backdrop.open')).toBeVisible();
}

test('a cartridge-overflow failure explains the size problem and folds the linker log away', async ({ page }) => {
  await failBuildWith(page, {
    ok: false,
    stage: 'build',
    log:
      'Your game is about 5950 bytes too big to fit on the NES cartridge ' +
      '(they only hold 32KB in total).\n\n' +
      '----- technical details -----\n' +
      "ld65: Error: Segment 'RODATA' overflows memory area 'ROM0' by 5950 bytes",
  });

  const modal = page.locator('.modal-backdrop.open');
  await expect(modal.locator('h2')).toContainText('fit');
  await expect(modal).toContainText('too big to fit');
  // The raw linker line belongs behind the fold, not in the child's face.
  await expect(modal.locator('details')).toHaveCount(1);
  await expect(modal.locator('details')).toContainText('ld65');
});

test('a codegen crash does NOT claim the game is too big, and hides the traceback', async ({ page }) => {
  await failBuildWith(page, {
    ok: false,
    stage: 'generate',
    log: "KeyError: 'sprites'\n\nTraceback (most recent call last):\n  File \"play.py\", line 60\n    raise KeyError('sprites')\n",
  });

  const modal = page.locator('.modal-backdrop.open');

  // The heading must not send the child off shrinking a level that was never the problem.
  await expect(modal.locator('h2')).not.toContainText('fit');

  // And the traceback must not be the body text. Playwright's toContainText walks
  // descendants, so ask the body element specifically rather than the whole modal —
  // otherwise a traceback correctly tucked inside <details> would still match.
  const body = modal.locator('.modal > div').first();
  await expect(body).not.toContainText('Traceback');
});
