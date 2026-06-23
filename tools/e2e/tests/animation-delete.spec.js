// Regression for recently-observed-bugs item 32 — "deleting the 2nd sprite
// animation appears to delete the 1st" — open for months as NEEDS-REPRO.
//
// Root cause (sprites.html renderAnimStrip): the inline frame-strip wrote the
// animation of the *selected sprite* back into the global selectedAnimId on
// every render.  So after the pupil clicked animation B in the list, the strip
// re-pointed selectedAnimId at the animation containing the still-selected
// sprite (A) — the list highlighted B while Delete/Rename/Duplicate operated on
// A.  This is a pure browser-DOM bug the Node harness can't see.
import { test, expect, open, seedAndReload } from './_fixtures.js';

test('Delete acts on the animation selected in the list, not the selected sprite\'s (item 32)', async ({ page }) => {
  await open(page, 'sprites.html');

  // Seed: two sprites, two animations. sprite0 → "Anim A", sprite1 → "Anim B".
  await seedAndReload(page, (s) => {
    const cell = () => ({ tile: 0, palette: 0, flipH: false, flipV: false, priority: false, empty: true });
    const mkSprite = (name) => ({
      name, role: 'other', width: 2, height: 2,
      cells: [[cell(), cell()], [cell(), cell()]],
    });
    s.sprites = [mkSprite('hero0'), mkSprite('hero1')];
    s.animations = [
      { id: 1, name: 'Anim A', fps: 8, role: 'any', style: 'custom', frames: [0] },
      { id: 2, name: 'Anim B', fps: 8, role: 'any', style: 'custom', frames: [1] },
    ];
    s.nextAnimationId = 3;
    s.animation_assignments = { walk: null, jump: null, attack: null };
  });

  // The animation list must show both seeded animations.
  const items = page.locator('#anim-list li');
  await expect(items).toHaveCount(2);

  // Select sprite0 (which belongs to Anim A) so the strip has a sprite-anim to
  // (mis)track. This is the precondition that used to corrupt the selection.
  await page.locator('.sprite-list li').first().click();

  // Click "Anim B" in the animation list — this is the pupil's explicit choice.
  await page.locator('#anim-list li', { hasText: 'Anim B' }).click();
  await expect(page.locator('#anim-list li.selected')).toContainText('Anim B');

  // The delete handler's confirm() names the animation it is about to remove —
  // a precise read of what the engine thinks is selected. With the bug it said
  // "Anim A"; fixed, it must say "Anim B".
  let dialogMsg = '';
  page.once('dialog', (d) => { dialogMsg = d.message(); d.accept(); });
  await page.locator('#btn-anim-del').click();

  expect(dialogMsg, 'Delete must target the animation highlighted in the list (Anim B)')
    .toContain('Anim B');

  // And Anim A must survive.
  await expect(page.locator('#anim-list li')).toHaveCount(1);
  await expect(page.locator('#anim-list li')).toContainText('Anim A');
});
