// The multi-project lifecycle (new / duplicate / delete) on the Backgrounds
// page, driven through the real menu.  These do in-place state swaps via the
// shared storage catalog (`Storage.createProject/duplicateProject/deleteProject`)
// — the audit flagged this path as drifted across pages, so a live check helps.
import { test, expect, open } from './_fixtures.js';

const projectCount = (page) => page.evaluate(() => window.Storage.listProjects().length);
async function openProjectsMenu(page) {
  // The menu is a collapsed <details>; open it so its buttons are clickable.
  await page.evaluate(() => {
    const d = document.getElementById('projects-menu');
    if (d) d.open = true;
  });
}

test('New / Duplicate / Delete project lifecycle', async ({ page }) => {
  await open(page, 'index.html');
  expect(await projectCount(page)).toBe(1);

  // Duplicate the current project → 2.
  await openProjectsMenu(page);
  await page.locator('#btn-project-duplicate').click();
  await expect.poll(() => projectCount(page)).toBe(2);

  // Create a new named project → 3, and it becomes active.
  await openProjectsMenu(page);
  await page.locator('#btn-project-new').click();
  await page.locator('#new-project-name').fill('My Test Game');
  await page.locator('#btn-new-project-yes').click();
  await expect.poll(() => projectCount(page)).toBe(3);
  const activeName = await page.evaluate(() => window.Storage.getActiveProject().name);
  expect(activeName).toBe('My Test Game');

  // Delete the active project → 2.
  await openProjectsMenu(page);
  page.once('dialog', (d) => d.accept());
  await page.locator('#btn-project-delete').click();
  await expect.poll(() => projectCount(page)).toBe(2);
});
