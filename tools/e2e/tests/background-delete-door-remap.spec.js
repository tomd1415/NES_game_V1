// Deleting a background must remap the Doors module's targetBgIdx so a door
// never points at the wrong (or a now-missing) room — the 2026-06-15 fix
// ("background delete/duplicate didn't remap door targets").  Browser-DOM
// behaviour: the handler mutates the live state via remapDoorTargetBg.
import { test, expect, open, seedAndReload } from './_fixtures.js';

test('Deleting a background before a door target decrements targetBgIdx', async ({ page }) => {
  await open(page, 'index.html');

  // Seed three backgrounds + a door targeting background index 2, selected on
  // background 0.
  await seedAndReload(page, (s) => {
    const cloneNt = (nt) => nt.map((row) => row.map((c) => ({ ...c })));
    while (s.backgrounds.length < 3) {
      s.backgrounds.push({
        name: 'room' + s.backgrounds.length,
        dimensions: { screens_x: 1, screens_y: 1 },
        nametable: cloneNt(s.backgrounds[0].nametable),
      });
    }
    s.selectedBgIdx = 0;
    s.builder = s.builder || {};
    s.builder.modules = s.builder.modules || {};
    s.builder.modules.doors = { enabled: true, config: { targetBgIdx: 2 } };
  });

  // Confirm the seed survived migration before acting.
  await page.waitForFunction(() => {
    const s = window.Storage.loadCurrent();
    return s.backgrounds.length === 3 &&
      s.builder && s.builder.modules && s.builder.modules.doors &&
      s.builder.modules.doors.config.targetBgIdx === 2;
  });

  // Delete background 0 (the selected one). t=2 is after the deleted index, so
  // it must shift down to 1.
  page.once('dialog', (d) => d.accept());
  await page.locator('#btn-bg-del').click();
  await page.waitForFunction(() => window.Storage.loadCurrent().backgrounds.length === 2);

  const target = await page.evaluate(
    () => window.Storage.loadCurrent().builder.modules.doors.config.targetBgIdx);
  expect(target, 'door target should follow the room down to index 1').toBe(1);
});
