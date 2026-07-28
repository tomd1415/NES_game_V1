// Fixes for the "Unresolved new bugs" in docs/design/notes.md (1-7).
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
});

// Bug 1 — the sprite section lets you pick a palette.
test('CHARS palette picker sets the character palette', async ({ page }) => {
  await page.locator('.mode-btn[data-mode="chars"]').click();
  await page.locator('[data-char-pal] .btn[data-pal="2"]').click();
  const pals = await page.evaluate(() => {
    const cells = window.Studio.getState().sprites[0].cells;
    return cells.flat().map((c) => c.palette);
  });
  expect(pals.every((p) => p === 2)).toBe(true);
});

// Bug 2 — line + rectangle tools exist and draw (TILES and CHARS).
test('TILES has Line and Rect tools that draw', async ({ page }) => {
  await page.locator('#level-select').selectOption('maker');
  await page.locator('.mode-btn[data-mode="tiles"]').click();
  await page.locator('.tile-grid .tile-cell').nth(40).click(); // a blank tile
  await page.locator('.stage-toolbar .more-tools-btn').click();
  await expect(page.locator('.stage-toolbar .tool[data-tool="line"]')).toBeVisible();
  await page.locator('.stage-toolbar .tool[data-tool="rect"]').click();
  await page.locator('.swatch-row .swatch').nth(1).click();
  const box = await page.locator('#tv-canvas').boundingBox();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 6 });
  await page.mouse.up();
  const nonZero = await page.evaluate(() =>
    window.Studio.getState().bg_tiles[40].pixels.flat().filter((v) => v > 0).length);
  expect(nonZero).toBeGreaterThan(0);
});

test('CHARS has Line and Rect tools', async ({ page }) => {
  await page.locator('.mode-btn[data-mode="chars"]').click();
  await page.locator('.stage-toolbar .more-tools-btn').click();
  await expect(page.locator('.stage-toolbar .tool[data-tool="line"]')).toBeVisible();
  await expect(page.locator('.stage-toolbar .tool[data-tool="rect"]')).toBeVisible();
});

// Bug 3 / 5 — a starter game is always available.  With more than one starter
// on offer, New game opens a picker modal; choose "Platformer basics".
test('New game button creates a fresh playable starter', async ({ page }) => {
  await page.locator('#btn-new-game').click();
  const picker = page.locator('.modal-backdrop.open', { hasText: 'Load a starter game' });
  await expect(picker).toBeVisible();
  await picker.locator('.btn', { hasText: 'Platformer basics' }).click();
  const s = await page.evaluate(() => {
    const st = window.Studio.getState();
    return { bgs: st.backgrounds.length, sprites: st.sprites.length, engine: st.engineVersion };
  });
  expect(s.bgs).toBeGreaterThan(0);
  expect(s.sprites).toBeGreaterThan(0);
  // New projects are stamped with the engine they were authored for (current).
  const cur = await page.evaluate(() => window.NES_ENGINE_VERSION);
  expect(s.engine).toBe(cur);
});

// The picker can load the SMB showcase — the sample game wired for every
// engine v3 + v4 feature (smb game style, Goomba + Koopa AIs).
test('New game picker can load the SMB showcase starter', async ({ page }) => {
  await page.locator('#btn-new-game').click();
  const picker = page.locator('.modal-backdrop.open', { hasText: 'Load a starter game' });
  await expect(picker).toBeVisible();
  await picker.locator('.btn', { hasText: 'SMB showcase' }).click();
  const info = await page.evaluate(() => {
    const st = window.Studio.getState();
    const ais = st.builder.modules.scene.config.instances.map((i) => i.ai);
    return { type: st.builder.modules.game.config.type, ais };
  });
  expect(info.type).toBe('smb');
  expect(info.ais).toContain('goomba');
  expect(info.ais).toContain('koopa');
});

// Engine v6 — the Blocks editor (? / brick / coin) is reachable from the UI:
// load the SMB showcase (smb + engine v6), go to WORLD at Maker, and the Blocks
// section lets the user add a block that lands in state.
test('WORLD exposes the v6 Blocks editor for an SMB project', async ({ page }) => {
  await page.locator('#btn-new-game').click();
  const picker = page.locator('.modal-backdrop.open', { hasText: 'Load a starter game' });
  await expect(picker).toBeVisible();
  await picker.locator('.btn', { hasText: 'SMB showcase' }).click();
  await page.locator('#level-select').selectOption('maker');
  // The Blocks editor renders in the WORLD dock — its "+ Add block" button is
  // unique, so target it directly and confirm it adds a block to state (the
  // showcase already ships with some blocks, so assert the count increments).
  const before = await page.evaluate(() =>
    window.Studio.getState().builder.modules.blocks.config.blockList.length);
  const addBlock = page.locator('.btn', { hasText: '+ Add block' });
  await expect(addBlock).toBeVisible();
  await addBlock.click();
  const after = await page.evaluate(() =>
    window.Studio.getState().builder.modules.blocks.config.blockList.length);
  expect(after).toBe(before + 1);
});

// Bug 4 — beginner mode is signposted (level hint + locked modes visible).
test('beginner mode is signposted', async ({ page }) => {
  await expect(page.locator('#level-hint')).toContainText('Beginner');
  await expect(page.locator('.mode-btn[data-mode="tiles"].locked')).toBeVisible();
});

// Bug 6 — the starter floor carries the SOLID_GROUND behaviour (id 1) so the
// engine (which reads behaviour_at) stops the player falling through.
test('starter floor is solid ground in the behaviour map', async ({ page }) => {
  const solid = await page.evaluate(() => {
    const bg = window.Studio.getState().backgrounds[0];
    const rows = bg.behaviour.length;
    // bottom rows should be SOLID_GROUND (1)
    return bg.behaviour[rows - 1].some((v) => v === 1);
  });
  expect(solid).toBe(true);
});

// Bug 7 — backgrounds can grow beyond one screen and paint across screens.
test('World can be resized beyond one screen and painted per-screen', async ({ page }) => {
  await page.locator('#level-select').selectOption('maker');
  // Resize to 2x2 screens.
  await page.locator('.dock-section', { hasText: 'World size' }).locator('.btn', { hasText: '2×2' }).click();
  const dims = await page.evaluate(() => {
    const bg = window.Studio.getState().backgrounds[0];
    return { dx: bg.dimensions.screens_x, dy: bg.dimensions.screens_y, cols: bg.nametable[0].length, rows: bg.nametable.length };
  });
  expect(dims).toEqual({ dx: 2, dy: 2, cols: 64, rows: 60 });

  // Navigate to screen (2,1) and stamp a tile → lands at world col >= 32.
  // (Use the view-nav arrow, not the "add a screen" grow arrow, which shares ▶.)
  await page.locator('button[title^="Show the screen to the right"]').click();
  await page.locator('.stage-toolbar .tool[data-tool="stamp"]').click();
  await page.locator('.tile-grid .tile-cell').nth(1).click();
  const box = await page.locator('#tv-canvas').boundingBox();
  await page.mouse.click(box.x + (5.5) * (box.width / 32), box.y + (3.5) * (box.height / 30));
  const t = await page.evaluate(() => window.Studio.getState().backgrounds[0].nametable[3][32 + 5].tile);
  expect(t).toBe(1);
});

// The account/login dropdown offers a starter even when signed out.
test('account menu offers "Load a starter game" when signed out', async ({ page }) => {
  // The account control reveals once the server responds; wait for the menu.
  const summary = page.locator('#account-menu summary');
  await expect(summary).toBeVisible({ timeout: 15000 });
  await summary.click(); // open the <details> dropdown
  await expect(page.locator('#account-menu .menu-body', { hasText: 'Load a starter game' })).toBeVisible();
});

// Tile default-behaviour: placing an auto-typing tile sets its behaviour.
test('placing a tile with a default type auto-sets the behaviour cell', async ({ page }) => {
  await page.locator('#level-select').selectOption('maker');
  await page.evaluate(() => { window.Studio.getState().bg_tiles[5].defaultBehaviour = 1; }); // solid
  await page.locator('.mode-btn[data-mode="world"]').click();
  await page.locator('.stage-toolbar .tool[data-tool="stamp"]').click();
  await page.locator('.tile-grid .tile-cell').nth(5).click();
  const box = await page.locator('#tv-canvas').boundingBox();
  const px = (cx) => box.x + (cx + 0.5) * (box.width / 32);
  const py = (cy) => box.y + (cy + 0.5) * (box.height / 30);
  await page.mouse.click(px(7), py(4));
  expect(await page.evaluate(() => window.Studio.getState().backgrounds[0].behaviour[4][7])).toBe(1);
  // Erasing the tile clears the behaviour again.
  await page.locator('.stage-toolbar .more-tools-btn').click();
  await page.locator('.stage-toolbar .tool[data-tool="erase"]').click();
  await page.mouse.click(px(7), py(4));
  expect(await page.evaluate(() => window.Studio.getState().backgrounds[0].behaviour[4][7])).toBe(0);
});

test('tile-type overlay toggle exists in WORLD', async ({ page }) => {
  await page.locator('#level-select').selectOption('maker');
  const toggle = page.locator('input[data-toggle-types]');
  await expect(toggle).toBeVisible();
  await toggle.check();
  expect(await page.evaluate(() => window.StudioModes.world._get().showTypes)).toBe(true);
});
