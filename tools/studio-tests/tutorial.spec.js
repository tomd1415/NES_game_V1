// Guided tutorials (deepened): each style launches a working tutorial, and
// every step advances when the pupil makes the edit its check asks for. Edits
// are applied generically from the current step's declared check via the real
// state path (Studio.getState() + ctx.markDirty()), then Check my work / Play,
// exactly as a pupil's edit + click would drive it.
const { test, expect } = require('@playwright/test');

async function launch(page, pick) {
  await page.locator('#btn-tutorial').click();
  await page.locator('.modal-actions .btn', { hasText: pick }).click();
  await page.waitForFunction(() => window.StudioTutorial && window.StudioTutorial.isActive());
}

// Mutate the live state to satisfy `check` (the current step's requirement).
async function satisfy(page, check, seed) {
  await page.evaluate(({ type, params, seed }) => {
    const S = window.Studio, s = S.getState();
    const p = params || {};
    const beh = (name) => { const t = (s.behaviour_types || []).find((x) => x && x.name === name); return t ? t.id : 1; };
    const bg = s.backgrounds[s.selectedBgIdx] || s.backgrounds[0];
    const paint = (id, count) => {
      let placed = 0;
      for (let r = 0; r < bg.behaviour.length && placed < count; r++)
        for (let c = 0; c < bg.behaviour[r].length && placed < count; c++)
          if ((bg.behaviour[r][c] | 0) === 0) { bg.behaviour[r][c] = id; placed++; }
    };
    if (type === 'spriteRenamed') { const pl = s.sprites.find((x) => x && x.role === 'player'); pl.name = 'Name' + seed; }
    else if (type === 'paletteChanged') { s.bg_palettes[0].slots[1] = (s.bg_palettes[0].slots[1] + 1 + seed) % 64; }
    else if (type === 'tileChanged') { const px = s.bg_tiles[7].pixels; px[0][0] = ((px[0][0] | 0) + 1) % 4 || 1; }
    else if (type === 'groundAdded') { paint(beh('solid_ground'), (p.min || 1) + 1); }
    else if (type === 'behaviourAdded') { paint(1, (p.min || 1) + 1); }
    else if (type === 'behaviourTypePainted') { paint(beh(p.name || 'wall'), (p.min || 1) + 1); }
    else if (type === 'sceneInstanceAdded') { const sc = s.builder.modules.scene.config; sc.instances = sc.instances || []; const n = (p.min || 1) + 1; for (let i = 0; i < n; i++) sc.instances.push({ id: 9000 + seed * 10 + i, spriteIdx: 0, x: 40 + i * 16, y: 100, ai: 'walker', speed: 1 }); }
    else if (type === 'backgroundAdded') { const W = 32, H = 30; s.backgrounds.push({ name: 'room' + seed, dimensions: { screens_x: 1, screens_y: 1 }, nametable: Array.from({ length: H }, () => Array.from({ length: W }, () => ({ tile: 0, palette: 0 }))), behaviour: Array.from({ length: H }, () => Array(W).fill(0)) }); }
    else if (type === 'dialogueChanged') { const d = s.builder.modules.dialogue; d.config = d.config || {}; d.config.text = 'HELLO ' + seed; }
    else if (type === 'moduleEnabledChanged') { const m = s.builder.modules[p.id]; if (m) m.enabled = !m.enabled; }
    else if (type === 'builderChanged') { const c = s.builder.modules.players.submodules.player1.config; c.maxHp = (c.maxHp || 3) + 1 + seed; }
    S.ctx.markDirty();
  }, { type: check.type, params: check.params || null, seed });
}

test('the platformer tutorial walks the pupil through every step to a played game', async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  await launch(page, 'Platformer');
  await expect(page.locator('.studio-main')).toHaveClass(/tutorial-on/);
  await expect(page.locator('#tutorial-region')).toBeVisible();

  const total = await page.evaluate(() => window.StudioTutorial.stepCount());
  expect(total).toBeGreaterThanOrEqual(8);   // deepened

  let seed = 1, guard = 0;
  while (!(await page.evaluate(() => window.StudioTutorial.isComplete()))) {
    if (guard++ > 30) throw new Error('tutorial did not complete');
    const check = await page.evaluate(() => window.StudioTutorial.currentCheck());
    const idx = await page.evaluate(() => window.StudioTutorial.stepIndex());
    if (check.type === 'played') {
      await page.locator('#btn-play').click();
      await page.waitForFunction(() => window.StudioTutorial.isComplete(), null, { timeout: 20000 });
    } else {
      await satisfy(page, check, seed++);
      await page.locator('.tut-card [data-act="check"]').click();
      await page.waitForFunction((n) => window.StudioTutorial.stepIndex() > n, idx);
    }
  }
  await expect(page.locator('.tut-complete')).toBeVisible();
});

test('every game style walks through all its steps', async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  const styles = [
    { pick: 'Platformer', type: 'platformer', tut: 'first-game' },
    { pick: 'SMB-style', type: 'smb', tut: 'smb-first' },
    { pick: 'Top-down', type: 'topdown', tut: 'topdown-first' },
    { pick: 'Auto-runner', type: 'runner', tut: 'runner-first' },
    { pick: 'Racing', type: 'racer', tut: 'racer-first' },
  ];
  for (const st of styles) {
    await launch(page, st.pick);
    const info = await page.evaluate(() => {
      const s = window.Studio.getState();
      const errs = (window.BuilderValidators.validate(s) || []).filter((p) => p.severity === 'error');
      return { type: s.builder.modules.game.config.type, tut: s.tutorial.id, steps: window.StudioTutorial.stepCount(), errs: errs.map((e) => e.id) };
    });
    expect(info.type).toBe(st.type);
    expect(info.tut).toBe(st.tut);
    expect(info.steps).toBeGreaterThanOrEqual(7);
    expect(info.errs).toEqual([]);   // no blocking errors → the style fully works

    // Walk every non-Play step: each must advance when its edit is made.
    let seed = 1, guard = 0;
    while (true) {
      if (guard++ > 20) throw new Error(st.pick + ': step walk stuck');
      const check = await page.evaluate(() => window.StudioTutorial.currentCheck());
      if (!check || check.type === 'played') break;
      const idx = await page.evaluate(() => window.StudioTutorial.stepIndex());
      await satisfy(page, check, seed++);
      await page.locator('.tut-card [data-act="check"]').click();
      await page.waitForFunction((n) => window.StudioTutorial.stepIndex() > n, idx);
    }
    // We stopped on the final Play step.
    const last = await page.evaluate(() => ({ i: window.StudioTutorial.stepIndex(), n: window.StudioTutorial.stepCount() }));
    expect(last.i).toBe(last.n - 1);
  }
});

test('teacher settings turn on pair mode + hide hints; pupil can still go solo', async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  await page.locator('#btn-tutorial').click();
  await page.locator('.modal-actions .btn', { hasText: 'Teacher settings' }).click();
  const dlg = page.locator('.modal-backdrop.open');
  await dlg.locator('.dock-note').nth(0).locator('.btn', { hasText: 'Pair' }).click();   // Pairing = Pair
  await dlg.locator('.dock-note').nth(2).locator('.btn', { hasText: 'Off' }).click();     // Hints = Off
  await page.locator('.modal-actions .btn', { hasText: 'Save' }).click();
  // Picker reopens → pick a style.
  await page.locator('.modal-actions .btn', { hasText: 'Platformer' }).click();
  await page.waitForFunction(() => window.StudioTutorial && window.StudioTutorial.isActive());

  await expect(page.locator('.tut-pair')).toHaveClass(/on/);              // pair banner on
  await expect(page.locator('.tut-card [data-act="hint"]')).toHaveCount(0);   // hints hidden
  await expect(page.locator('.tut-card [data-act="showme"]')).toHaveCount(0);

  await page.locator('.tut-pair [data-act="pair"]').click();              // pupil opts out
  await expect(page.locator('.tut-pair')).not.toHaveClass(/on/);

  // Reset the class default so other tests aren't affected.
  await page.evaluate(() => { const p = window.Storage.readPrefs() || {}; p.teacherConfig = { pairing: 'solo', celebration: 'visual', hints: true }; window.Storage.writePrefs(p); });
});

test('teacher step editor writes a step override', async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  const baseCount = await page.evaluate(() => window.STUDIO_TUTORIALS['first-game'].steps.length);
  await page.locator('#btn-tutorial').click();
  await page.locator('.modal-actions .btn', { hasText: 'Teacher settings' }).click();
  await page.locator('.modal-actions .btn', { hasText: 'Edit steps' }).click();
  // Editor defaults to the Platformer tutorial — remove the first step, save.
  await page.locator('.modal-backdrop.open button', { hasText: '✖' }).first().click();
  await page.locator('.modal-actions .btn', { hasText: 'Save' }).click();
  const saved = await page.evaluate(() => { const p = window.Storage.readPrefs() || {}; const o = (p.tutorialOverrides || {})['first-game']; return o ? o.steps.length : -1; });
  expect(saved).toBe(baseCount - 1);
  await page.evaluate(() => { const p = window.Storage.readPrefs() || {}; if (p.tutorialOverrides) delete p.tutorialOverrides['first-game']; window.Storage.writePrefs(p); });
});

test('the runtime applies a step override to the launched tutorial', async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  await page.evaluate(() => {
    const p = window.Storage.readPrefs() || {};
    p.tutorialOverrides = { 'first-game': { steps: [
      { id: 'a', title: 'Change a colour', mode: 'pals', check: { type: 'paletteChanged' } },
      { id: 'b', title: 'Play', mode: null, flashSelector: '#btn-play', check: { type: 'played' } },
    ] } };
    window.Storage.writePrefs(p);
  });
  await page.locator('#btn-tutorial').click();
  await page.locator('.modal-actions .btn', { hasText: 'Platformer' }).click();
  await page.waitForFunction(() => window.StudioTutorial && window.StudioTutorial.isActive());
  expect(await page.evaluate(() => window.StudioTutorial.stepCount())).toBe(2);
  await page.evaluate(() => { const p = window.Storage.readPrefs() || {}; delete p.tutorialOverrides; window.Storage.writePrefs(p); });
});

test('a normal project does not show the tutorial panel', async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  const active = await page.evaluate(() => window.StudioTutorial.isActive());
  expect(active).toBe(false);
  await expect(page.locator('.studio-main')).not.toHaveClass(/tutorial-on/);
  await expect(page.locator('#tutorial-region')).toBeHidden();
});
