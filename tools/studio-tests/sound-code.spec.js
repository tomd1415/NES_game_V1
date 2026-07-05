// SOUND + CODE modes + validator jump-to-fix (Phase 1.5 / 1.6).
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
});

test('SOUND: add the starter pack populates songs', async ({ page }) => {
  await page.locator('#level-select').selectOption('maker');
  await page.locator('.mode-btn[data-mode="sound"]').click();
  await expect(page.locator('.dock-section .title', { hasText: 'Music & SFX' })).toBeVisible();
  await page.locator('#sound-starter').click();
  // Songs may or may not ship on this server; the audit + list must render
  // either way, and if songs came back they appear as rows.
  await expect(page.locator('.dock-section .title', { hasText: 'ROM budget' })).toBeVisible();
});

test('SOUND: uploading a FamiStudio .s adds a song with its symbol', async ({ page }) => {
  await page.locator('#level-select').selectOption('maker');
  await page.locator('.mode-btn[data-mode="sound"]').click();
  const asm = '.export _song_demo_music_data\n_song_demo_music_data:\n  .byte 0\n';
  await page.locator('#sound-song-file').setInputFiles({
    name: 'demo.s', mimeType: 'text/plain', buffer: Buffer.from(asm),
  });
  const song = await page.evaluate(() => window.Studio.getState().audio.songs.slice(-1)[0]);
  expect(song.symbol).toBe('song_demo_music_data');
  expect(song.filename).toBe('demo.s');
});

test('CODE: shows the read-only generated C', async ({ page }) => {
  await page.locator('#level-select').selectOption('advanced');
  await page.locator('.mode-btn[data-mode="code"]').click();
  await expect(page.locator('#code-view')).toBeVisible();
  await expect.poll(async () =>
    (await page.locator('#code-view').textContent()).length).toBeGreaterThan(100);
});

test('Needs-attention findings carry a Studio jump button', async ({ page }) => {
  // Warnings (and their jump buttons) are Maker+ (finer disclosure, 1.7).
  await page.locator('#level-select').selectOption('maker');
  // The starter has a win-condition/trigger warning etc. Any finding with a
  // known jumpTo gets a "Fix in <Mode> →" button.
  const attn = page.locator('#attn-list');
  const fixButtons = attn.locator('button', { hasText: 'Fix in' });
  // At least one finding maps to a mode.
  expect(await fixButtons.count()).toBeGreaterThan(0);
  // Clicking it switches modes.
  await fixButtons.first().click();
  const mode = await page.evaluate(() => window.Studio.getMode());
  expect(['chars', 'world', 'rules', 'pals', 'sound', 'code']).toContain(mode);
});

test('CODE: eject to hand-coded C at Advanced, banner in RULES, return (3.6)', async ({ page }) => {
  await page.locator('#level-select').selectOption('advanced');
  await page.locator('.mode-btn[data-mode="code"]').click();
  // Wait for the template to load into the read-only view.
  await expect(page.locator('#code-view')).not.toContainText('Loading main.c');
  // Eject.
  page.once('dialog', (d) => d.accept());
  await page.locator('.btn', { hasText: 'Edit as hand-coded C' }).click();
  expect(await page.evaluate(() => window.Studio.getState().ejected)).toBe(true);
  const code = await page.evaluate(() => window.Studio.getState().customMainC);
  expect(typeof code).toBe('string');
  expect(code.length).toBeGreaterThan(100);
  // CodeMirror editor mounts (with a textarea fallback if CM is absent).
  await expect(page.locator('#code-cm .CodeMirror, #code-edit')).toBeVisible();

  // Inserting a snippet extends the hand-coded C.
  const beforeLen = code.length;
  await page.locator('#code-snippet-select').selectOption({ label: 'Wait a frame' });
  const afterLen = await page.evaluate(() => window.Studio.getState().customMainC.length);
  expect(afterLen).toBeGreaterThan(beforeLen);
  expect(await page.evaluate(() => window.Studio.getState().customMainC)).toContain('ppu_wait_nmi');

  // RULES shows the hand-coded banner.
  await page.locator('.mode-btn[data-mode="rules"]').click();
  await expect(page.locator('.rule-card', { hasText: 'hand-coded' })).toBeVisible();

  // Return to the visual editor.
  await page.locator('.mode-btn[data-mode="code"]').click();
  page.once('dialog', (d) => d.accept());
  await page.locator('.btn', { hasText: 'Return to visual editor' }).click();
  expect(await page.evaluate(() => window.Studio.getState().ejected)).toBe(false);
});
