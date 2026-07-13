// Local "Games" projects menu — must work with NO account, so a signed-out pupil
// (or one who can't sign up) can still reopen and switch between saved games.
// Regression for: #projects-menu was left empty and window.renderProjectsMenu was
// referenced but never defined, so there was no way to switch local projects.
const { test, expect } = require('@playwright/test');

test('signed out: the Games menu lists local projects and can switch between them', async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');

  // Precondition: genuinely signed out.
  const me = await page.evaluate(() => fetch('/auth/me').then(r => r.json()).catch(() => ({})));
  expect(me.username == null).toBeTruthy();

  // The Games dropdown exists in the (previously empty) #projects-menu and lists
  // the current project — without any account.
  await expect(page.locator('#projects-dd > summary')).toContainText('Games (1)');
  await expect(page.locator('#projects-dd')).toContainText('current');

  // Add a second saved game directly in local storage, keep the first active,
  // and re-render the menu (as new/delete do).
  const ids = await page.evaluate(() => {
    const before = window.Storage.getActiveProjectId();
    const st = window.StudioStarter.create();
    st.name = 'Second Game';
    window.Storage.createProject('Second Game', st);
    window.Storage.setActiveProjectId(before);      // keep editing the first
    window.renderProjectsMenu();
    const second = (window.Storage.listProjects() || []).find(p => p.name === 'Second Game');
    return { before, second: second && second.id };
  });
  expect(ids.second).toBeTruthy();
  await expect(page.locator('#projects-dd > summary')).toContainText('Games (2)');

  // Open the dropdown and switch to the second game (click → setActive + reload).
  await page.locator('#projects-dd > summary').click();
  await page.locator('#projects-dd .menu-body button', { hasText: 'Second Game' }).click();
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');

  // The switch took effect — active is now the second game — still with no account.
  const after = await page.evaluate(() => {
    const id = window.Storage.getActiveProjectId();
    const p = (window.Storage.listProjects() || []).find(x => x.id === id);
    return { id, name: p && p.name };
  });
  expect(after.id).toBe(ids.second);
  expect(after.name).toBe('Second Game');
  // and the menu re-rendered with the second game marked current
  await expect(page.locator('#projects-dd')).toContainText('▶ Second Game');
});
